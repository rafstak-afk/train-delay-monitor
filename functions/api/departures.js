const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const stationName = (url.searchParams.get("station") || "").trim();

  const date =
    url.searchParams.get("date") ||
    localDateYYYYMMDD();

  const time =
    url.searchParams.get("time") ||
    currentTimeHHMM();

  const limit =
    clamp(Number(url.searchParams.get("limit") || 20), 1, 80);

  if (!stationName) {
    return json({ error: "Brak parametru station" }, 400);
  }

  if (!env.PLK_API_KEY) {
    return json({ error: "Brak zmiennej PLK_API_KEY" }, 500);
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

    const fullSchedulesUrl =
      `${PLK_BASE}/schedules?dateFrom=${date}&dateTo=${date}`;

    const operationsUrl =
      `${PLK_BASE}/operations?stations=${station.id}&withPlanned=true&pageSize=10000`;

    const stationsDictionaryUrl =
      `${PLK_BASE}/dictionaries/stations?pageSize=100000`;

    const responses = await Promise.all([
      getJsonWithMeta(stationSchedulesUrl, headers),
      getJsonWithMeta(fullSchedulesUrl, headers),
      getJsonWithMeta(operationsUrl, headers),
      getJsonWithMeta(stationsDictionaryUrl, headers)
    ]);

    const stationSchedulesRaw = responses[0].data;
    const fullSchedulesRaw = responses[1].data;
    const operationsRaw = responses[2].data;
    const stationsDictionaryRaw = responses[3].data;

    const apiLimits = mergeApiLimits(responses.map(r => r.apiLimits));

    const fullRoutesMap = buildFullRoutesMap(fullSchedulesRaw);
    const stationNames = buildStationNameMap(fullSchedulesRaw, stationsDictionaryRaw);

    const allDepartures = buildDepartures({
      stationSchedulesRaw,
      fullRoutesMap,
      operationsRaw,
      stationId: station.id,
      stationNames,
      date
    });

    const departures = getDeparturesFromTime(allDepartures, time, limit);

    return json({
      station,
      generatedAt: new Date().toISOString(),
      date,
      timeFrom: time,
      limit,
      apiLimits,
      departures
    });

  } catch (error) {
    return json({
      error: "Błąd API PLK",
      details: error.message
    }, 500);
  }
}

async function findStation(name, headers) {
  const response = await getJsonWithMeta(
    `${PLK_BASE}/dictionaries/stations?search=${encodeURIComponent(name)}&pageSize=20`,
    headers
  );

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

function buildDepartures({
  stationSchedulesRaw,
  fullRoutesMap,
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
    const fullRoute = fullRoutesMap.get(key) || stationRoute;

    const routeStations =
      Array.isArray(fullRoute.stations) && fullRoute.stations.length
        ? fullRoute.stations
        : stationRoute.stations || [];

    const stationPlan = (stationRoute.stations || []).find(
      s => Number(s.stationId) === Number(stationId)
    );

    if (!stationPlan || !stationPlan.departureTime) continue;

    const currentIndex = routeStations.findIndex(
      s => Number(s.stationId) === Number(stationId)
    );

    const destinationStation =
      routeStations.length
        ? routeStations[routeStations.length - 1]
        : null;

    const destination =
      stationName(destinationStation, stationNames) ||
      fullRoute.destinationStationName ||
      fullRoute.destination ||
      "";

    const via = currentIndex >= 0
      ? routeStations
          .slice(currentIndex + 1, currentIndex + 6)
          .map(s => stationName(s, stationNames))
          .filter(Boolean)
          .filter(name => normalize(name) !== normalize(destination))
          .join(", ")
      : "";

    const operation = operationsMap.get(key);
    const opStation = operation?.station;

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

    rows.push({
      time: shortTime(actualTime || plannedTime),
      plannedTime: shortTime(plannedTime),
      train: stationPlan.departureTrainNumber || fullRoute.nationalNumber || stationRoute.nationalNumber || "",
      category: stationPlan.departureCommercialCategory || fullRoute.commercialCategorySymbol || stationRoute.commercialCategorySymbol || "",
      name: fullRoute.name || stationRoute.name || "",
      carrier: fullRoute.carrierCode || stationRoute.carrierCode || "",
      destination,
      via,
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

function buildFullRoutesMap(fullSchedulesRaw) {
  const map = new Map();
  const routes = fullSchedulesRaw.routes || [];

  for (const route of routes) {
    const key = makeKey(route);

    if (key) {
      map.set(key, route);
    }
  }

  return map;
}

function buildStationNameMap(fullSchedulesRaw, stationsDictionaryRaw) {
  const map = new Map();

  addStationNamesFromSchedules(map, fullSchedulesRaw);
  addStationNamesFromDictionary(map, stationsDictionaryRaw);

  return map;
}

function addStationNamesFromSchedules(map, schedulesRaw) {
  const dictionaries = schedulesRaw?.dictionaries || {};

  const possibleLists = [
    dictionaries.stations,
    dictionaries.station,
    dictionaries.stopPoints,
    schedulesRaw?.stations
  ];

  for (const list of possibleLists) {
    addStationListToMap(map, list);
  }
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
    .map(row => {
      return {
        ...row,
        _effectiveMinutes: effectiveMinutes(row)
      };
    })
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

async function getJsonWithMeta(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return {
    data: JSON.parse(text),
    apiLimits: readApiLimits(res.headers)
  };
}

function readApiLimits(headers) {
  const limit =
    headers.get("x-ratelimit-limit") ||
    headers.get("ratelimit-limit") ||
    headers.get("x-rate-limit-limit");

  const remaining =
    headers.get("x-ratelimit-remaining") ||
    headers.get("ratelimit-remaining") ||
    headers.get("x-rate-limit-remaining");

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
