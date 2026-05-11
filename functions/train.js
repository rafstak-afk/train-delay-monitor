export async function onRequest(context) {
  return handleRequest(
    context.request,
    context.env
  );
}

// =========================
// HELPERS
// =========================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders()
      }
    }
  );
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid JSON from ${url}: ${text.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${text.slice(0, 300)}`
    );
  }

  return data;
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;

  const keys = [
    "data",
    "items",
    "results",
    "stations",
    "operations",
    "trains"
  ];

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  return [];
}

function parseTime(value) {
  const match = clean(value).match(/(\d{2}):(\d{2})/);

  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTime(value) {
  const match = clean(value).match(/(\d{2}:\d{2})/);

  return match ? match[1] : "—";
}

function calculateDelay(planned, actual) {
  const p = parseTime(planned);
  const a = parseTime(actual);

  if (p === null || a === null) return 0;

  let diff = a - p;

  if (diff < -720) {
    diff += 1440;
  }

  return Math.max(0, diff);
}

function normalizeStatus(status) {
  const s = clean(status).toUpperCase();

  if (["S", "DONE", "COMPLETED"].includes(s)) {
    return "Zrealizowano";
  }

  if (["C", "RUNNING", "IN_PROGRESS"].includes(s)) {
    return "W ruchu";
  }

  if (["LATE", "DELAYED"].includes(s)) {
    return "Opóźniony";
  }

  return "W ruchu";
}

// =========================
// STATIONS
// =========================

function findStation(stations, query) {
  const needle = normalize(query);

  return (
    stations.find(s =>
      normalize(
        s.name || s.stationName
      ).includes(needle)
    ) || null
  );
}

function buildStationMap(stations) {
  const map = {};

  for (const station of stations) {
    const id = clean(
      station.id ||
      station.stationId
    );

    const name = clean(
      station.name ||
      station.stationName
    );

    if (id && name) {
      map[id] = name;
    }
  }

  return map;
}

// =========================
// OPERATIONS
// =========================

function getOperationStops(operation) {
  const candidates = [
    operation.stations,
    operation.stops,
    operation.route,
    operation.path,
    operation.timetable
  ];

  for (const candidate of candidates) {
    if (
      Array.isArray(candidate)
      && candidate.length
    ) {
      return candidate;
    }
  }

  return [];
}

function getStopStationId(stop) {
  return clean(
    stop.stationId ||
    stop.id ||
    stop.station?.id
  );
}

function getPlannedTime(stop) {
  return (
    formatTime(stop.plannedDepartureTime) ||
    formatTime(stop.plannedArrivalTime) ||
    formatTime(stop.plannedDeparture) ||
    formatTime(stop.plannedArrival) ||
    "—"
  );
}

function getActualTime(stop, planned) {
  return (
    formatTime(stop.actualDepartureTime) ||
    formatTime(stop.actualArrivalTime) ||
    formatTime(stop.actualDeparture) ||
    formatTime(stop.actualArrival) ||
    planned
  );
}

function getDelay(stop, operation, planned, actual) {
  const explicit =
    stop.delayMinutes ??
    stop.delay ??
    operation.delayMinutes ??
    operation.delay;

  if (explicit !== undefined) {
    return Number(explicit) || 0;
  }

  return calculateDelay(planned, actual);
}

function getPlatform(stop) {
  return clean(
    stop.platform ||
    stop.platformNumber ||
    stop.track
  ) || "—";
}

function getDestination(
  stops,
  currentIndex,
  stationMap
) {
  for (
    let i = stops.length - 1;
    i > currentIndex;
    i--
  ) {
    const id = getStopStationId(stops[i]);

    if (stationMap[id]) {
      return stationMap[id];
    }
  }

  return "—";
}

function getVia(
  stops,
  currentIndex,
  stationMap,
  destination
) {
  const names = [];

  for (
    let i = currentIndex + 1;
    i < stops.length;
    i++
  ) {
    const id = getStopStationId(stops[i]);

    const name = stationMap[id];

    if (!name) continue;

    if (name === destination) {
      break;
    }

    if (!names.includes(name)) {
      names.push(name);
    }

    if (names.length >= 4) {
      break;
    }
  }

  return names.join(" • ") || "—";
}

// =========================
// MAIN
// =========================

async function handleRequest(request, env) {

  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders()
    });
  }

  if (method !== "POST") {
    return json({
      ok: true,
      usage: {
        endpoint: "/train",
        method: "POST",
        body: {
          station: "Tczew"
        }
      }
    });
  }

  try {

    const body = await request.json();

    const stationQuery = clean(
      body.station
    );

    if (!stationQuery) {
      return json({
        error: "Missing station"
      }, 400);
    }

    const apiBase =
      clean(env.PLK_API_BASE)
      || "https://pdp-api.plk-sa.pl/api/v1";

    const headers = {};

    if (env.PLK_API_KEY) {
      headers["X-Api-Key"] =
        env.PLK_API_KEY;
    }

    // =========================
    // LOAD STATIONS
    // =========================

    const stationsPayload =
      await fetchJson(
        `${apiBase}/dictionaries/stations`,
        headers
      );

    const stations =
      extractArray(stationsPayload);

    const stationMap =
      buildStationMap(stations);

    const matchedStation =
      findStation(
        stations,
        stationQuery
      );

    if (!matchedStation) {
      return json({
        error: "Station not found"
      }, 404);
    }

    const stationId = clean(
      matchedStation.id ||
      matchedStation.stationId
    );

    const stationName = clean(
      matchedStation.name ||
      matchedStation.stationName
    );

    // =========================
    // LOAD OPERATIONS
    // =========================

    const operationsUrl =
      `${apiBase}/operations?stations=${stationId}&withPlanned=true&pageSize=200`;

    const operationsPayload =
      await fetchJson(
        operationsUrl,
        headers
      );

    const operations =
      extractArray(
        operationsPayload
      );

    // =========================
    // BUILD ROWS
    // =========================

    const rows = [];

    for (const operation of operations) {

      const stops =
        getOperationStops(operation);

      if (!stops.length) continue;

      const stopIndex =
        stops.findIndex(stop =>
          getStopStationId(stop)
          === stationId
        );

      if (stopIndex === -1) continue;

      const stop = stops[stopIndex];

      const planned =
        getPlannedTime(stop);

      const actual =
        getActualTime(
          stop,
          planned
        );

      const delay =
        getDelay(
          stop,
          operation,
          planned,
          actual
        );

      const destination =
        getDestination(
          stops,
          stopIndex,
          stationMap
        );

      rows.push({
        station: stationName,
        scheduled: planned,
        actual,
        delayMinutes: delay,
        status: normalizeStatus(
          operation.trainStatus
        ),
        trainNumber:
          clean(operation.trainNumber)
          || clean(operation.publicTrainNumber)
          || clean(operation.commercialNumber)
          || "—",
        destination,
        carrier:
          clean(operation.carrier)
          || clean(operation.operator)
          || "—",
        platform:
          getPlatform(stop),
        via: getVia(
          stops,
          stopIndex,
          stationMap,
          destination
        ),
        orderId:
          clean(operation.orderId),
        operatingDate:
          clean(operation.operatingDate)
      });
    }

    rows.sort((a, b) => {
      return (
        (parseTime(a.actual)
          ?? 999999)
        -
        (parseTime(b.actual)
          ?? 999999)
      );
    });

    return json({
      ok: true,
      matchedStation: stationName,
      matchedStationId: stationId,
      totalDepartures: rows.length,
      route: rows.slice(0, 50),

      debug: {
        operationsCount:
          operations.length,
        sampleOperation:
          operations[0] || null,
        firstRow:
          rows[0] || null
      }
    });

  } catch (error) {

    return json({
      error: error.message,
      stack: error.stack
    }, 500);

  }
}
