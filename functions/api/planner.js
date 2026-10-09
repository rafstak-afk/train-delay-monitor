// ============ Planer podróży ============
// Szuka połączeń bezpośrednich ORAZ z jedną przesiadką między dwiema
// dowolnymi stacjami w kraju, bez żadnej predefiniowanej listy węzłów
// przesiadkowych. Zamiast ściągać rozkład całej sieci, algorytm robi
// "meet in the middle": pyta PLK osobno o wszystko, co dotyka stacji A
// (gdzie da się dojechać jadąc stąd) i osobno o wszystko, co dotyka
// stacji B (skąd da się dojechać do B), a potem szuka części wspólnej
// stacji — to jest kandydat na przesiadkę, gdziekolwiek faktycznie leży.
//
// Celowo POZA v1: 2 przesiadki (kombinatorycznie drogie — każdy kandydat
// z kroku transferowego wymagałby własnego dodatkowego zapytania) oraz
// uwzględnianie bieżących opóźnień (to planer na podstawie ROZKŁADU, nie
// live danych — `operations` zostaje na v2).

const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";

const CACHE_TTL = {
  STATION_SEARCH: 86400,
  STATIONS_DICTIONARY: 86400,
  SCHEDULES_FUTURE: 21600,
  SCHEDULES_TODAY: 1800
};
const COMPOSED_CACHE_TTL = 1800;
const UPSTREAM_TIMEOUT_MS = 9000;
const DEFAULT_TRANSFER_MINUTES = 5;
const DEFAULT_MAX_RESULTS = 20;
// Bez górnego limitu ten sam pierwszy kurs łączył się z KAŻDYM późniejszym
// kursem na drugiej nodze — technicznie ważna przesiadka, praktycznie
// wielogodzinne czekanie na peronie. Realne, sensowne przesiadki mieszczą
// się w tym oknie; dłuższe czekanie to już nie przesiadka, tylko dwa
// osobne przejazdy z przypadkowym odstępem.
const MAX_TRANSFER_WAIT_MINUTES = 120;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const fromName = (url.searchParams.get("from") || "").trim();
  const toName = (url.searchParams.get("to") || "").trim();
  const fromIdParam = (url.searchParams.get("fromId") || "").trim();
  const toIdParam = (url.searchParams.get("toId") || "").trim();
  const date = url.searchParams.get("date") || localDateYYYYMMDD();
  const isToday = date === localDateYYYYMMDD();
  const time = url.searchParams.get("time") || (isToday ? currentTimeHHMM() : "00:00");
  const transferMinutes = clamp(
    Number(url.searchParams.get("transferMinutes") ?? DEFAULT_TRANSFER_MINUTES),
    0,
    60
  );
  const maxResults = clamp(Number(url.searchParams.get("maxResults") || DEFAULT_MAX_RESULTS), 1, 50);

  if (!fromName || !toName) {
    return json({ ok: false, error: "Brak parametru from/to" }, 400);
  }

  const apiKey = env.PLK_API_KEY || env.PDP_API_KEY || "";
  if (!apiKey) {
    return json({ ok: false, error: "Brak klucza PLK_API_KEY/PDP_API_KEY" }, 500);
  }

  const headers = { "X-API-Key": apiKey, Accept: "application/json" };
  const scheduleTtl = isToday ? CACHE_TTL.SCHEDULES_TODAY : CACHE_TTL.SCHEDULES_FUTURE;

  const composedKey = composedCacheKey(
    fromIdParam || fromName,
    toIdParam || toName,
    date,
    time,
    transferMinutes
  );
  const cachedComposed = await caches.default.match(composedKey);
  if (cachedComposed) {
    const payload = await cachedComposed.json();
    payload.cache = { ...payload.cache, composed: "HIT" };
    return json(payload);
  }

  try {
    const [resolvedFrom, resolvedTo] = await Promise.all([
      fromIdParam
        ? Promise.resolve({ id: fromIdParam, name: fromName, ambiguous: false, alternateIds: [], cache: "SKIPPED" })
        : resolveStation(fromName, headers),
      toIdParam
        ? Promise.resolve({ id: toIdParam, name: toName, ambiguous: false, alternateIds: [], cache: "SKIPPED" })
        : resolveStation(toName, headers)
    ]);

    if (!resolvedFrom.id) {
      return json({ ok: false, error: `Nie znaleziono stacji „${fromName}”` }, 404);
    }
    if (!resolvedTo.id) {
      return json({ ok: false, error: `Nie znaleziono stacji „${toName}”` }, 404);
    }
    if (String(resolvedFrom.id) === String(resolvedTo.id)) {
      return json({ ok: false, error: "Stacja początkowa i docelowa są takie same" }, 400);
    }

    const directUrl =
      `${PLK_BASE}/schedules?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}` +
      `&dateFrom=${date}&dateTo=${date}`;
    const fromFullUrl =
      `${PLK_BASE}/schedules/shortened?stations=${resolvedFrom.id}&fullRoute=true&dateFrom=${date}&dateTo=${date}`;
    const toFullUrl =
      `${PLK_BASE}/schedules/shortened?stations=${resolvedTo.id}&fullRoute=true&dateFrom=${date}&dateTo=${date}`;
    // Odpowiedzi "shortened" niosą same ID stacji, bez nazw (tak samo jak
    // pełne /schedules) — żeby móc nazwać stację przesiadki, dociągamy raz
    // (długo cache'owany) cały słownik stacji, dokładnie jak departures.js.
    const stationsDictionaryUrl = `${PLK_BASE}/dictionaries/stations?pageSize=20000`;

    const [directResult, fromFullResult, toFullResult, stationsDictionaryResult] = await Promise.all([
      getJsonCached(directUrl, headers, scheduleTtl),
      getJsonCached(fromFullUrl, headers, scheduleTtl),
      getJsonCached(toFullUrl, headers, scheduleTtl),
      getJsonCached(stationsDictionaryUrl, headers, CACHE_TTL.STATIONS_DICTIONARY)
    ]);

    const stationNames = buildStationNameMap(stationsDictionaryResult.data);

    const directRoutes = directResult.data?.routes || [];
    const directItins = buildDirectItineraries(directRoutes, resolvedFrom, resolvedTo, date);

    const fromRoutes = fromFullResult.data?.rt || [];
    const toRoutes = toFullResult.data?.rt || [];
    const transferItins = buildTransferItineraries(
      fromRoutes,
      toRoutes,
      resolvedFrom,
      resolvedTo,
      transferMinutes,
      stationNames
    );

    const minMinutes = minutesFromTime(time) ?? 0;
    const afterTime = (it) => (minutesFromTime(it.departureTime) ?? 0) >= minMinutes;

    const direct = directItins
      .filter(afterTime)
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
      .slice(0, maxResults);

    const transfer = transferItins
      .filter(afterTime)
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
      .slice(0, maxResults);

    const itineraries = [...direct, ...transfer].sort((a, b) =>
      a.departureTime.localeCompare(b.departureTime)
    );

    const apiLimits = mergeApiLimits([
      directResult.apiLimits,
      fromFullResult.apiLimits,
      toFullResult.apiLimits,
      stationsDictionaryResult.apiLimits
    ]);

    const responsePayload = {
      ok: true,
      query: { from: fromName, to: toName, date, time, transferMinutes },
      resolvedFrom,
      resolvedTo,
      generatedAt: new Date().toISOString(),
      counts: { direct: direct.length, transfer: transfer.length },
      noConnectionFound: direct.length === 0 && transfer.length === 0,
      itineraries,
      apiLimits,
      cache: {
        stationSearchFrom: resolvedFrom.cache || "MISS",
        stationSearchTo: resolvedTo.cache || "MISS",
        direct: directResult.cache,
        fromFullRoute: fromFullResult.cache,
        toFullRoute: toFullResult.cache,
        stationsDictionary: stationsDictionaryResult.cache,
        composed: "MISS"
      }
    };

    context.waitUntil(
      caches.default.put(
        composedKey,
        new Response(JSON.stringify(responsePayload), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": `public, max-age=${COMPOSED_CACHE_TTL}`
          }
        })
      )
    );

    return json(responsePayload);
  } catch (error) {
    return json({ ok: false, error: "Błąd API PLK", details: error.message }, 502);
  }
}

// ============ Rozwiązywanie nazwy stacji → ID ============
// PLK potrafi mieć dla jednej nazwy dwa różne ID (np. "Bohumin" — stacja po
// obu stronach granicy w jednym słowniku) — zwracamy pierwsze trafienie, ale
// oznaczamy ambiguous+alternateIds, żeby UI mogło pokazać obie opcje.
async function resolveStation(name, headers) {
  const url = `${PLK_BASE}/dictionaries/stations?search=${encodeURIComponent(name)}&pageSize=20`;
  const result = await getJsonCached(url, headers, CACHE_TTL.STATION_SEARCH);
  const stations = extractArray(result.data);
  const wanted = normalize(name);
  const exact = stations.filter((s) => normalize(s.name || s.stationName) === wanted);
  const list = exact.length ? exact : stations[0] ? [stations[0]] : [];

  if (!list.length) {
    return { id: null, name, ambiguous: false, alternateIds: [], cache: result.cache };
  }

  return {
    id: String(list[0].id ?? list[0].stationId),
    name: list[0].name || list[0].stationName,
    ambiguous: list.length > 1,
    alternateIds: list.slice(1).map((s) => String(s.id ?? s.stationId)),
    cache: result.cache
  };
}

// ============ Połączenia bezpośrednie ============
// PLK już filtruje `from`/`to` po swojej stronie — każda zwrócona trasa ma
// stację A przed stacją B. Wystarczy znaleźć oba indeksy i przeczytać
// godziny na nich.
function buildDirectItineraries(routes, from, to, date) {
  const results = [];

  for (const r of routes) {
    const stations = r.stations || [];
    const fi = stations.findIndex((s) => String(s.stationId) === String(from.id));
    if (fi < 0) continue;
    const ti = stations.findIndex((s, idx) => idx > fi && String(s.stationId) === String(to.id));
    if (ti < 0) continue;

    const boardStop = stations[fi];
    const alightStop = stations[ti];
    const depTime = shortTime(boardStop.departureTime);
    const arrTime = shortTime(alightStop.arrivalTime);
    if (!depTime || !arrTime) continue;

    const depMin = minutesFromTime(depTime);
    let arrMin = minutesFromTime(arrTime);
    let nextDay = false;
    if (arrMin < depMin) {
      arrMin += 1440;
      nextDay = true;
    }

    const train = {
      number: r.nationalNumber || "",
      category: r.commercialCategorySymbol || "",
      name: r.name || "",
      carrier: r.carrierCode || ""
    };

    const leg = {
      train,
      scheduleId: String(r.scheduleId || ""),
      orderId: String(r.orderId || ""),
      trainOrderId: String(r.trainOrderId || ""),
      board: {
        stationId: String(from.id),
        stationName: from.name,
        time: depTime,
        platform: boardStop.departurePlatform || "",
        track: boardStop.departureTrack || ""
      },
      alight: { stationId: String(to.id), stationName: to.name, time: arrTime, nextDay }
    };
    leg.trainUrl = buildTrainUrl(leg, to.name, date);

    results.push({
      type: "direct",
      departureTime: depTime,
      arrivalTime: arrTime,
      arrivalNextDay: nextDay,
      durationMinutes: arrMin - depMin,
      legs: [leg],
      transfer: null
    });
  }

  return results;
}

// ============ Połączenia z jedną przesiadką (meet in the middle) ============
// Uwaga o granicy doby: jeśli pierwsza noga sama w sobie przekracza północ
// (jej czas przyjazdu, liczbowo, jest wcześniejszy niż czas odjazdu), taki
// przystanek świadomie NIE trafia do kandydatów na przesiadkę w v1 — dane
// dla drugiej nogi są pobierane tylko dla jednego dnia, więc nie da się
// bezpiecznie rozstrzygnąć, czy jej odjazd przypada przed czy po takim
// przejściu przez północ. Loty w obrębie jednej doby działają poprawnie.

function routeKeyOf(r) {
  return `${r.sid}|${r.oid}`;
}

function trainInfoFromShort(r) {
  return {
    number: r.nn || "",
    category: r.ccs || "",
    name: r.nm || "",
    carrier: r.cc || ""
  };
}

// Mapa: ID stacji osiągalnej PO stacji `stationId` → lista kandydujących
// pierwszych nóg (kurs, godzina wejścia na pokład w `stationId`, godzina
// przyjazdu na stację-kandydata).
function buildReachableAfter(routes, stationId) {
  const map = new Map();

  for (const r of routes) {
    const stops = r.st || [];
    const idx = stops.findIndex((s) => String(s.id) === String(stationId));
    if (idx < 0) continue;

    const originStop = stops[idx];
    const boardTime = shortTime(originStop.dtm);
    if (!boardTime) continue; // to jest ostatni przystanek tego kursu — nie da się tu wsiąść dalej
    const boardMin = minutesFromTime(boardTime);

    for (let j = idx + 1; j < stops.length; j++) {
      const stop = stops[j];
      const arrTime = shortTime(stop.atm);
      if (!arrTime) continue;
      if (minutesFromTime(arrTime) < boardMin) continue; // przejście przez północ — pomijamy w v1

      const key = String(stop.id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ routeKey: routeKeyOf(r), route: r, boardTime, arrTime });
    }
  }

  return map;
}

// Mapa: ID stacji, z której da się dojechać DO stacji `stationId` → lista
// kandydujących drugich nóg (kurs, godzina odjazdu ze stacji-kandydata,
// godzina przyjazdu do `stationId`).
function buildReachableBefore(routes, stationId) {
  const map = new Map();

  for (const r of routes) {
    const stops = r.st || [];
    const idx = stops.findIndex((s) => String(s.id) === String(stationId));
    if (idx < 0) continue;

    const destStop = stops[idx];
    const arrAtDest = shortTime(destStop.atm);
    if (!arrAtDest) continue; // to jest pierwszy przystanek tego kursu — nikt tu nie przyjeżdża

    for (let j = 0; j < idx; j++) {
      const stop = stops[j];
      const depTime = shortTime(stop.dtm);
      if (!depTime) continue;

      const key = String(stop.id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ routeKey: routeKeyOf(r), route: r, boardTime: depTime, arrTime: arrAtDest });
    }
  }

  return map;
}

function buildTransferItineraries(fromRoutes, toRoutes, from, to, transferMinutes, stationNames) {
  const reachableAfterA = buildReachableAfter(fromRoutes, from.id);
  const reachableBeforeB = buildReachableBefore(toRoutes, to.id);
  const results = [];

  for (const [transferStationId, leg1List] of reachableAfterA) {
    const leg2List = reachableBeforeB.get(transferStationId);
    if (!leg2List) continue;

    for (const leg1 of leg1List) {
      const dep1 = minutesFromTime(leg1.boardTime);
      const arr1 = minutesFromTime(leg1.arrTime);

      for (const leg2 of leg2List) {
        if (leg1.routeKey === leg2.routeKey) continue; // ten sam kurs — to już jest "bezpośrednio"

        const dep2 = minutesFromTime(leg2.boardTime);
        const bufferMinutes = dep2 - arr1;
        if (bufferMinutes < transferMinutes || bufferMinutes > MAX_TRANSFER_WAIT_MINUTES) continue;

        let arr2 = minutesFromTime(leg2.arrTime);
        let nextDay = false;
        if (arr2 < dep2) {
          arr2 += 1440;
          nextDay = true;
        }

        const transferStationName =
          stationNames.get(Number(transferStationId)) || `Stacja ${transferStationId}`;

        const leg1Info = {
          train: trainInfoFromShort(leg1.route),
          scheduleId: String(leg1.route.sid || ""),
          orderId: String(leg1.route.oid || ""),
          trainOrderId: String(leg1.route.toid || ""),
          board: { stationId: String(from.id), stationName: from.name, time: leg1.boardTime },
          alight: {
            stationId: transferStationId,
            stationName: transferStationName,
            time: leg1.arrTime,
            nextDay: false
          }
        };
        leg1Info.trainUrl = buildTrainUrl(leg1Info, transferStationName, null);

        const leg2Info = {
          train: trainInfoFromShort(leg2.route),
          scheduleId: String(leg2.route.sid || ""),
          orderId: String(leg2.route.oid || ""),
          trainOrderId: String(leg2.route.toid || ""),
          board: { stationId: transferStationId, stationName: transferStationName, time: leg2.boardTime },
          alight: { stationId: String(to.id), stationName: to.name, time: leg2.arrTime, nextDay }
        };
        leg2Info.trainUrl = buildTrainUrl(leg2Info, to.name, null);

        results.push({
          type: "transfer",
          departureTime: leg1.boardTime,
          arrivalTime: leg2.arrTime,
          arrivalNextDay: nextDay,
          durationMinutes: arr2 - dep1,
          legs: [leg1Info, leg2Info],
          transfer: {
            stationId: transferStationId,
            stationName: transferStationName,
            bufferMinutes,
            ok: true
          }
        });
      }
    }
  }

  // Ta sama para kursów (leg1+leg2) potrafi mieć KILKA wspólnych przystanków
  // z rzędu (pociągi jadą przez kilka stacji, zanim się rozjadą) — bez tego
  // ta sama, w istocie jedna, przesiadka powielałaby się kilkanaście razy,
  // tylko z inną stacją zmiany. dep1 i arrivalTime (przyjazd leg2 do celu)
  // są identyczne dla każdego wariantu tej samej pary kursów — jedyne, co
  // się różni, to bufor. Zostaje jeden reprezentant na parę kursów: ten z
  // najciaśniejszym, ale wciąż ważnym buforem (najmniej czasu traconego na
  // peronie).
  const bestPerRoutePair = new Map();
  for (const it of results) {
    const key =
      it.legs[0].scheduleId + "|" + it.legs[0].orderId + ">" + it.legs[1].scheduleId + "|" + it.legs[1].orderId;
    const existing = bestPerRoutePair.get(key);
    if (!existing || it.transfer.bufferMinutes < existing.transfer.bufferMinutes) {
      bestPerRoutePair.set(key, it);
    }
  }

  return [...bestPerRoutePair.values()];
}

// ============ Słownik ID stacji → nazwa (ten sam wzorzec co departures.js) ============
function buildStationNameMap(dictionaryRaw) {
  const map = new Map();
  const possibleLists = [
    dictionaryRaw?.stations,
    dictionaryRaw?.items,
    dictionaryRaw?.results,
    dictionaryRaw?.data,
    dictionaryRaw
  ];

  for (const list of possibleLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const id = item.id || item.stationId || item.stopPointId;
      const name = item.name || item.stationName || item.stopPointName;
      if (id && name) map.set(Number(id), name);
    }
  }

  return map;
}

// ============ Budowa linku do /train (te same parametry co buildTrainUrl w index.html) ============
function buildTrainUrl(leg, destinationName, date) {
  const p = new URLSearchParams();
  p.set("train", leg.train.number || "");
  if (leg.train.category) p.set("category", leg.train.category);
  if (leg.train.name) p.set("name", leg.train.name);
  if (destinationName) p.set("destination", destinationName);
  if (date) p.set("date", date);
  if (leg.scheduleId) {
    p.set("scheduleId", leg.scheduleId);
    p.set("scheduledId", leg.scheduleId);
  }
  if (leg.orderId) p.set("orderId", leg.orderId);
  if (leg.trainOrderId) p.set("trainOrderId", leg.trainOrderId);
  if (leg.board.stationId) p.set("stationId", leg.board.stationId);
  if (leg.board.stationName) p.set("station", leg.board.stationName);
  return "/train?" + p.toString();
}

// ============ Cache (caches.default, ten sam wzorzec co departures.js/stations.js) ============
function composedCacheKey(fromKey, toKey, date, time, transferMinutes) {
  const raw = `${normalize(String(fromKey))}|${normalize(String(toKey))}|${date}|${time}|${transferMinutes}`;
  return new Request("https://cache.local/composed-planner/" + btoa(encodeURIComponent(raw)), {
    method: "GET"
  });
}

async function getJsonCached(url, headers, ttlSeconds) {
  const cache = caches.default;
  const cacheKey = new Request("https://cache.local/" + btoa(url), { method: "GET" });
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const cachedData = await cachedResponse.json();
    return {
      data: cachedData,
      apiLimits: { available: false, limit: null, remaining: null, reset: null },
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

  return { ...result, cache: "MISS" };
}

async function getJsonWithMeta(url, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    return { data: JSON.parse(text), apiLimits: readApiLimits(res.headers) };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Upstream timeout po ${UPSTREAM_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
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
  const availableItems = items.filter((item) => item && item.available);
  if (!availableItems.length) {
    return { available: false, limit: null, remaining: null, reset: null };
  }

  const remainingValues = availableItems.map((item) => Number(item.remaining)).filter(Number.isFinite);
  const limitValues = availableItems.map((item) => Number(item.limit)).filter(Number.isFinite);

  return {
    available: true,
    limit: limitValues.length ? String(Math.max(...limitValues)) : availableItems[0].limit,
    remaining: remainingValues.length ? String(Math.min(...remainingValues)) : availableItems[0].remaining,
    reset: availableItems.find((item) => item.reset)?.reset ?? null
  };
}

// ============ Małe pomocniki ============
function localDateYYYYMMDD() {
  const now = new Date();
  return (
    String(now.getFullYear()).padStart(4, "0") +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0")
  );
}

function currentTimeHHMM() {
  const now = new Date();
  return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
}

function shortTime(value) {
  if (!value) return "";
  const match = String(value).match(/(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function minutesFromTime(time) {
  const match = String(time || "").match(/(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function extractArray(data) {
  if (Array.isArray(data)) return data;
  return data?.stations || data?.items || data?.results || data?.data || [];
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
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
  });
}
