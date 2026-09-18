const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";

const CACHE_TTL = {
  STATION_SEARCH: 86400,
  STATIONS_DICTIONARY: 86400,
  FULL_SCHEDULES: 21600,
  STATION_SCHEDULES: 300,
  OPERATIONS: 30
};

// Cache całej złożonej odpowiedzi (nie tylko pojedynczych zapytań do PLK).
// Krótki TTL — nie dłuższy niż świeżość operations (30s) — żeby nie
// pogorszyć aktualności danych, ale wystarczający, by bliskie w czasie
// zapytania o tę samą stację (kilku użytkowników na popularnej stacji,
// albo auto-odświeżanie kilku otwartych zakładek) dostawały gotową
// odpowiedź od razu, bez ponownego składania jej z 3 źródeł PLK + do
// 30 osobnych zapytań o pełne trasy pociągów.
const COMPOSED_CACHE_TTL = 25;

function composedCacheKey(stationName, date, time, limit) {
  const raw = `${stationName.trim().toLowerCase()}|${date}|${time}|${limit}`;
  return new Request("https://cache.local/composed-departures/" + btoa(raw), { method: "GET" });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const stationName = (url.searchParams.get("station") || "").trim();
  const date = url.searchParams.get("date") || localDateYYYYMMDD();
  const time = url.searchParams.get("time") || currentTimeHHMM();
  const limit = clamp(Number(url.searchParams.get("limit") || 20), 1, 80);

  if (!stationName) {
    return json({ error: "Brak parametru station" }, 400);
  }

  if (!env.PLK_API_KEY) {
    return json({ error: "Brak zmiennej PLK_API_KEY" }, 500);
  }

  const cacheKey = composedCacheKey(stationName, date, time, limit);
  const cachedComposed = await caches.default.match(cacheKey);

  if (cachedComposed) {
    const payload = await cachedComposed.json();
    payload.cache = { ...payload.cache, composed: "HIT" };
    return json(payload);
  }

  const headers = {
    "X-API-Key": env.PLK_API_KEY,
    "Accept": "application/json"
  };

  try {
    const station = await findStation(stationName, headers);

    if (!station) {
      return json({ error: "Nie znaleziono stacji", stationName }, 404);
    }

    const stationSchedulesUrl =
      `${PLK_BASE}/schedules?dateFrom=${date}&dateTo=${date}&stations=${station.id}`;

    // Filtrujemy operations po stacji (tak jak health.js i train.js) —
    // bez tego endpoint ściągał i parsował operacje WSZYSTKICH pociągów
    // w Polsce (pageSize=10000) tylko po to, żeby policzyć odjazdy z
    // jednej stacji, co regularnie przekraczało limit czasu CPU workera
    // Cloudflare (błąd 1102) niezależnie od jakichkolwiek timeoutów.
    //
    // UWAGA: celowo BEZ fullRoutes=true. Z tym parametrem odpowiedź dla
    // jednej stacji potrafi ważyć ~8,4 MB (pełna trasa każdego pociągu)
    // i samo to przekracza limit CPU. Bez niego to ~0,5 MB, kosztem tego,
    // że getLastConfirmedStation widzi tylko tę jedną stację (nie całą
    // trasę pociągu) — "ostatnia potwierdzona stacja" pokazuje więc co
    // najwyżej status na TEJ stacji, a nie postęp pociągu w drodze.
    const operationsUrl =
      `${PLK_BASE}/operations?withPlanned=true&pageSize=1500&stations=${station.id}`;

    const stationsDictionaryUrl =
      `${PLK_BASE}/dictionaries/stations?pageSize=20000`;

    // stationSchedules i operations są niezbędne do zbudowania tablicy
    // odjazdów — ich błąd/timeout ma przerwać cały request (obsłużone
    // przez zewnętrzny try/catch). stationsDictionary służy tylko do
    // uzupełniania nazw stacji — jeśli PLK odpowiada na nie wolno,
    // wolimy zwrócić odjazdy z gorszymi nazwami niż wywrócić cały
    // endpoint.
    const emptyResult = (data) => ({
      data,
      apiLimits: { available: false, limit: null, remaining: null, reset: null },
      cache: "SKIPPED"
    });

    const [
      stationSchedulesResult,
      operationsResult,
      stationsDictionaryResult
    ] = await Promise.all([
      getJsonCached(stationSchedulesUrl, headers, CACHE_TTL.STATION_SCHEDULES),
      getJsonCached(operationsUrl, headers, CACHE_TTL.OPERATIONS),
      getJsonCached(stationsDictionaryUrl, headers, CACHE_TTL.STATIONS_DICTIONARY)
        .catch(() => emptyResult({ stations: [] }))
    ]);

    const stationSchedulesRaw = stationSchedulesResult.data;
    const operationsRaw = operationsResult.data;
    const stationsDictionaryRaw = stationsDictionaryResult.data;

    const apiLimits = mergeApiLimits([
      stationSchedulesResult.apiLimits,
      operationsResult.apiLimits,
      stationsDictionaryResult.apiLimits
    ]);

    const cache = {
      stationSchedules: stationSchedulesResult.cache,
      operations: operationsResult.cache,
      stationsDictionary: stationsDictionaryResult.cache
    };

    const stationNames = buildStationNameMap(stationsDictionaryRaw);

    const allDepartures = buildDepartures({
      stationSchedulesRaw,
      operationsRaw,
      stationId: station.id,
      stationNames,
      date
    });

    const departures = getDeparturesFromTime(allDepartures, time, limit);

    // Kierunek/stacje pośrednie wymagają PEŁNEJ trasy pociągu (nie tylko
    // naszej stacji). Zamiast ściągać rozkład całej Polski na cały dzień
    // (potrafiło to ważyć ~35 MB i konsekwentnie wywalało limit czasu CPU
    // workera Cloudflare — błąd 1102/503), dociągamy pełną trasę osobno,
    // pojedynczo dla każdego już wybranego do wyświetlenia odjazdu.
    await enrichWithFullRoutes(departures, headers, stationNames, station.id);

    const responsePayload = {
      station,
      generatedAt: new Date().toISOString(),
      date,
      timeFrom: time,
      limit,
      apiLimits,
      cache: { ...cache, composed: "MISS" },
      departures
    };

    context.waitUntil(
      caches.default.put(cacheKey, new Response(JSON.stringify(responsePayload), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${COMPOSED_CACHE_TTL}`
        }
      }))
    );

    return json(responsePayload);

  } catch (error) {
    return json({
      error: "Błąd API PLK",
      details: error.message
    }, 500);
  }
}

async function findStation(name, headers) {
  const url =
    `${PLK_BASE}/dictionaries/stations?search=${encodeURIComponent(name)}&pageSize=20`;

  const response = await getJsonCached(url, headers, CACHE_TTL.STATION_SEARCH);

  const data = response.data;
  const stations = extractArray(data);
  const wanted = normalize(name);

  const found =
    stations.find(s => normalize(s.name || s.stationName) === wanted) ||
    stations[0];

  if (!found) return null;

  return {
    id: found.id || found.stationId,
    name: found.name || found.stationName
  };
}

async function getJsonCached(url, headers, ttlSeconds) {
  const cache = caches.default;
  const cacheKey = new Request("https://cache.local/" + btoa(url), {
    method: "GET"
  });

  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const cachedData = await cachedResponse.json();

    return {
      data: cachedData,
      apiLimits: {
        available: false,
        limit: null,
        remaining: null,
        reset: null
      },
      cache: "HIT"
    };
  }

  const result = await getJsonWithMeta(url, headers);

  const responseForCache = new Response(JSON.stringify(result.data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${ttlSeconds}`
    }
  });

  await cache.put(cacheKey, responseForCache);

  return {
    ...result,
    cache: "MISS"
  };
}

const UPSTREAM_TIMEOUT_MS = 9000;

async function getJsonWithMeta(url, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    return {
      data: JSON.parse(text),
      apiLimits: readApiLimits(res.headers)
    };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Upstream timeout po ${UPSTREAM_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function getLastConfirmedStation(train, stationNames) {
  const stations = Array.isArray(train?.stations)
    ? train.stations
    : [];

  let last = null;

  for (const station of stations) {
    if (station.isConfirmed !== true) continue;

    const actual =
      station.actualArrival ||
      station.actualDeparture ||
      station.actualArrivalTime ||
      station.actualDepartureTime ||
      "";

    if (!actual) continue;

    const name = stationName(station, stationNames);

    if (!name) continue;

    last = {
      station: name,
      time: shortTime(actual)
    };
  }

  return last;
}

function buildDepartures({
  stationSchedulesRaw,
  operationsRaw,
  stationId,
  stationNames,
  date
}) {
  const stationRoutes = stationSchedulesRaw.routes || [];
  const trains = operationsRaw.trains || [];

  const operationsMap = new Map();

  for (const train of trains) {
    if (train.operatingDate && train.operatingDate !== date) {
      continue;
    }

    const key = makeKey(train);

    const stationOp = (train.stations || []).find(
      s => Number(s.stationId) === Number(stationId)
    );

    if (key && stationOp) {
      operationsMap.set(key, { train, station: stationOp });
    }
  }

  const rows = [];

  for (const stationRoute of stationRoutes) {
    const key = makeKey(stationRoute);

    const stationPlan = (stationRoute.stations || []).find(
      s => Number(s.stationId) === Number(stationId)
    );

    if (!stationPlan || !stationPlan.departureTime) continue;

    const operation = operationsMap.get(key);
    const opStation = operation?.station;
    const lastConfirmed = getLastConfirmedStation(
      operation?.train,
      stationNames
    );

    const plannedTime =
      stationPlan.departureTime ||
      opStation?.plannedDepartureTime ||
      "";

    const actualTime =
      timeOnly(opStation?.actualDeparture) ||
      timeOnly(opStation?.estimatedDeparture) ||
      opStation?.plannedDepartureTime ||
      plannedTime;

    const delay =
      typeof opStation?.departureDelayMinutes === "number"
        ? opStation.departureDelayMinutes
        : calculateDelay(plannedTime, actualTime);

    // Stacja może mieć też planowy przyjazd (postój przed odjazdem, np.
    // dłuższy postój w trasie) — jeśli PLK go podaje, prezentujemy obok
    // odjazdu. Brak arrivalTime oznacza zwykle stację początkową, gdzie
    // przyjazd nie istnieje.
    const plannedArrival = stationPlan.arrivalTime || opStation?.plannedArrivalTime || "";

    const actualArrival = plannedArrival
      ? (timeOnly(opStation?.actualArrival) ||
         timeOnly(opStation?.estimatedArrival) ||
         opStation?.plannedArrivalTime ||
         plannedArrival)
      : "";

    const arrivalDelay = plannedArrival
      ? (typeof opStation?.arrivalDelayMinutes === "number"
          ? opStation.arrivalDelayMinutes
          : calculateDelay(plannedArrival, actualArrival))
      : null;

    rows.push({
      time: shortTime(actualTime || plannedTime),
      plannedTime: shortTime(plannedTime),
      arrivalTime: plannedArrival ? shortTime(actualArrival || plannedArrival) : "",
      plannedArrivalTime: plannedArrival ? shortTime(plannedArrival) : "",
      arrivalDelay,
      train: stationPlan.departureTrainNumber || stationRoute.nationalNumber || "",
      category: stationPlan.departureCommercialCategory || stationRoute.commercialCategorySymbol || "",
      name: stationRoute.name || "",
      carrier: stationRoute.carrierCode || "",
      // Uzupełniane później przez enrichWithFullRoutes() — stationRoute
      // z /schedules?stations=X niesie tylko NASZĄ stację, nie całą trasę.
      destination: "",
      via: "",
      lastConfirmedStation: lastConfirmed?.station || "",
      lastConfirmedTime: lastConfirmed?.time || "",
      platform: stationPlan.departurePlatform || "",
      track: stationPlan.departureTrack || "",
      delay,
      status: operation?.train?.trainStatus || "",
      scheduleId: stationRoute.scheduleId,
      orderId: stationRoute.orderId,
      trainOrderId: stationRoute.trainOrderId
    });
  }

  return rows
    .filter(r => r.time)
    .sort((a, b) => {
      const am = effectiveMinutes(a);
      const bm = effectiveMinutes(b);

      if (am === null && bm === null) return 0;
      if (am === null) return 1;
      if (bm === null) return -1;

      return am - bm;
    });
}

// Dociąga pełną trasę (destination/via) tylko dla odjazdów, które faktycznie
// trafiają do odpowiedzi — pojedynczo, po scheduleId/orderId, zamiast
// ściągać rozkład całej Polski na cały dzień (patrz komentarz w
// onRequestGet). Limitujemy liczbę równoległych zapytań do PLK, żeby nie
// trafić w limit liczby subrequestów Cloudflare Workera.
const MAX_ROUTE_ENRICHMENTS = 30;
const ROUTE_CACHE_TTL = 21600;

async function enrichWithFullRoutes(departures, headers, stationNames, stationId) {
  const targets = departures
    .filter(row => row.scheduleId && row.orderId)
    .slice(0, MAX_ROUTE_ENRICHMENTS);

  await Promise.allSettled(
    targets.map(async row => {
      const routeUrl =
        `${PLK_BASE}/schedules/route/${encodeURIComponent(row.scheduleId)}/${encodeURIComponent(row.orderId)}`;

      const result = await getJsonCached(routeUrl, headers, ROUTE_CACHE_TTL);
      const route = result.data?.route || result.data || {};
      const routeStations = Array.isArray(route.stations) ? route.stations : [];

      if (!routeStations.length) return;

      const currentIndex = routeStations.findIndex(
        s => Number(s.stationId) === Number(stationId)
      );

      const destinationStation = routeStations[routeStations.length - 1];

      const destination =
        stationName(destinationStation, stationNames) ||
        route.destinationStationName ||
        route.destination ||
        "";

      const via = currentIndex >= 0
        ? routeStations
            .slice(currentIndex + 1, currentIndex + 6)
            .map(s => stationName(s, stationNames))
            .filter(Boolean)
            .filter(name => normalize(name) !== normalize(destination))
            .join(", ")
        : "";

      row.destination = destination;
      row.via = via;
    })
  );
}

function buildStationNameMap(stationsDictionaryRaw) {
  const map = new Map();

  addStationNamesFromDictionary(map, stationsDictionaryRaw);

  return map;
}

function addStationNamesFromDictionary(map, dictionaryRaw) {
  const possibleLists = [
    dictionaryRaw?.stations,
    dictionaryRaw?.items,
    dictionaryRaw?.results,
    dictionaryRaw?.data,
    dictionaryRaw
  ];

  for (const list of possibleLists) {
    addStationListToMap(map, list);
  }
}

function addStationListToMap(map, list) {
  if (!Array.isArray(list)) return;

  for (const item of list) {
    const id =
      item.id ||
      item.stationId ||
      item.stopPointId;

    const name =
      item.name ||
      item.stationName ||
      item.stopPointName;

    if (id && name) {
      map.set(Number(id), name);
    }
  }
}

function stationName(station, stationNames) {
  if (!station) return "";

  return (
    station.name ||
    station.stationName ||
    station.station ||
    stationNames.get(Number(station.stationId)) ||
    stationNames.get(Number(station.id)) ||
    ""
  );
}

function getDeparturesFromTime(rows, time, limit) {
  const fromMinutes = minutesFromTime(time);

  if (fromMinutes === null) {
    return rows.slice(0, limit);
  }

  return rows
    .map(row => ({ ...row, _effectiveMinutes: effectiveMinutes(row) }))
    .filter(row => {
      if (row._effectiveMinutes === null) return false;
      return row._effectiveMinutes >= fromMinutes - 5;
    })
    .sort((a, b) => a._effectiveMinutes - b._effectiveMinutes)
    .slice(0, limit)
    .map(({ _effectiveMinutes, ...row }) => row);
}

function effectiveMinutes(row) {
  const plannedMinutes = minutesFromTime(row.plannedTime || row.time);
  const displayedMinutes = minutesFromTime(row.time);
  const delay = Number(row.delay || 0);

  if (plannedMinutes !== null) {
    return plannedMinutes + Math.max(delay, 0);
  }

  return displayedMinutes;
}

function readApiLimits(headers) {
  const limit =
    headers.get("x-ratelimit-limit") ||
    headers.get("ratelimit-limit") ||
    headers.get("x-rate-limit-limit") ||
    headers.get("x-ratelimit-hourly-limit") ||
    headers.get("x-ratelimit-daily-limit");

  const remaining =
    headers.get("x-ratelimit-remaining") ||
    headers.get("ratelimit-remaining") ||
    headers.get("x-rate-limit-remaining") ||
    headers.get("x-ratelimit-hourly-remaining") ||
    headers.get("x-ratelimit-daily-remaining");

  const reset =
    headers.get("x-ratelimit-reset") ||
    headers.get("ratelimit-reset") ||
    headers.get("x-rate-limit-reset");

  return {
    available: Boolean(limit || remaining || reset),
    limit: limit ?? null,
    remaining: remaining ?? null,
    reset: reset ?? null
  };
}

function mergeApiLimits(items) {
  const availableItems = items.filter(item => item && item.available);

  if (!availableItems.length) {
    return {
      available: false,
      limit: null,
      remaining: null,
      reset: null
    };
  }

  const remainingValues = availableItems
    .map(item => Number(item.remaining))
    .filter(Number.isFinite);

  const limitValues = availableItems
    .map(item => Number(item.limit))
    .filter(Number.isFinite);

  return {
    available: true,
    limit: limitValues.length ? String(Math.max(...limitValues)) : availableItems[0].limit,
    remaining: remainingValues.length ? String(Math.min(...remainingValues)) : availableItems[0].remaining,
    reset: availableItems.find(item => item.reset)?.reset ?? null
  };
}

function makeKey(x) {
  return [
    x.scheduleId || "",
    x.orderId || "",
    x.trainOrderId || ""
  ].join("|");
}

function localDateYYYYMMDD() {
  const now = new Date();

  return String(now.getFullYear()).padStart(4, "0") +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0");
}

function currentTimeHHMM() {
  const now = new Date();

  return String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0");
}

function timeOnly(value) {
  if (!value) return "";

  const str = String(value);
  const match = str.match(/T(\d{2}:\d{2})/);
  if (match) return match[1];

  const short = str.match(/^(\d{2}:\d{2})/);
  return short ? short[1] : "";
}

function shortTime(value) {
  if (!value) return "";

  const match = String(value).match(/(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function calculateDelay(planned, actual) {
  const p = minutesFromTime(planned);
  const a = minutesFromTime(actual);

  if (p === null || a === null) return 0;

  return a - p;
}

function minutesFromTime(time) {
  const match = String(time || "").match(/(\d{2}):(\d{2})/);

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

function extractArray(data) {
  if (Array.isArray(data)) return data;

  return (
    data?.stations ||
    data?.items ||
    data?.results ||
    data?.data ||
    []
  );
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
