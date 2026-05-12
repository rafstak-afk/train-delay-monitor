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

    const [schedulesRaw, operationsRaw] = await Promise.all([
      getJson(`${PLK_BASE}/schedules?dateFrom=${date}&dateTo=${date}&stations=${station.id}`, headers),
      getJson(`${PLK_BASE}/operations?stations=${station.id}&withPlanned=true&pageSize=10000`, headers)
    ]);

    const stationNames = buildStationNameMap(schedulesRaw);
    const allDepartures = buildDepartures(schedulesRaw, operationsRaw, station.id, stationNames);
    const departures = getDeparturesFromTime(allDepartures, time, limit);

    return json({
      station,
      generatedAt: new Date().toISOString(),
      date,
      timeFrom: time,
      limit,
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
  const data = await getJson(
    `${PLK_BASE}/dictionaries/stations?search=${encodeURIComponent(name)}&pageSize=20`,
    headers
  );

  const stations =
    data.stations ||
    data.items ||
    data.results ||
    data.data ||
    [];

  const wanted = normalize(name);

  const found =
    stations.find(s => normalize(s.name) === wanted) ||
    stations[0];

  if (!found) return null;

  return {
    id: found.id || found.stationId,
    name: found.name || found.stationName
  };
}

function buildDepartures(schedulesRaw, operationsRaw, stationId, stationNames) {
  const routes = schedulesRaw.routes || [];
  const trains = operationsRaw.trains || [];

  const operationsMap = new Map();

  for (const train of trains) {
    const key = makeKey(train);

    const stationOp = (train.stations || []).find(
      s => Number(s.stationId) === Number(stationId)
    );

    if (key && stationOp) {
      operationsMap.set(key, { train, station: stationOp });
    }
  }

  const rows = [];

  for (const route of routes) {
    const routeStations = route.stations || [];

    const stationPlan = routeStations.find(
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
      route.destinationStationName ||
      route.destination ||
      "";

    const via = currentIndex >= 0
      ? routeStations
          .slice(currentIndex + 1, currentIndex + 5)
          .map(s => stationName(s, stationNames))
          .filter(Boolean)
          .filter(name => normalize(name) !== normalize(destination))
          .join(", ")
      : "";

    const key = makeKey(route);
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
      train: stationPlan.departureTrainNumber || route.nationalNumber || "",
      category: stationPlan.departureCommercialCategory || route.commercialCategorySymbol || "",
      name: route.name || "",
      carrier: route.carrierCode || "",
      destination,
      via,
      platform: stationPlan.departurePlatform || "",
      track: stationPlan.departureTrack || "",
      delay,
      status: operation?.train?.trainStatus || "",
      scheduleId: route.scheduleId,
      orderId: route.orderId,
      trainOrderId: route.trainOrderId
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

function buildStationNameMap(schedulesRaw) {
  const map = new Map();
  const dictionaries = schedulesRaw.dictionaries || {};

  const possibleLists = [
    dictionaries.stations,
    dictionaries.station,
    schedulesRaw.stations
  ];

  for (const list of possibleLists) {
    if (Array.isArray(list)) {
      for (const item of list) {
        const id = item.id || item.stationId;
        const name = item.name || item.stationName;

        if (id && name) {
          map.set(Number(id), name);
        }
      }
    }
  }

  return map;
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

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return JSON.parse(text);
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
