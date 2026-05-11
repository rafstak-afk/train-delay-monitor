export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};

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

  // przejście przez północ
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
// SCHEDULE METADATA
// =========================

async function fetchScheduleMetadata(
  apiBase,
  headers,
  scheduleId
) {
  try {
    const url = `${apiBase}/schedules/${scheduleId}`;

    const payload = await fetchJson(
      url,
      headers
    );

    return {
      trainNumber: clean(
        payload.trainNumber ||
        payload.commercialNumber ||
        payload.publicTrainNumber
      ) || "—",

      carrier: clean(
        payload.carrier ||
        payload.carrierName ||
        payload.operator
      ) || "—"
    };

  } catch {
    return {
      trainNumber: "—",
      carrier: "—"
    };
  }
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

    const stationsUrl = new URL(
      `${apiBase}/dictionaries/stations`
    );

    const stationsPayload =
      await fetchJson(
        stationsUrl.toString(),
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

    const operationsUrl = new URL(
      `${apiBase}/operations`
    );

    operationsUrl.searchParams.set(
      "stations",
      stationId
    );

    operationsUrl.searchParams.set(
      "withPlanned",
      "true"
    );

    operationsUrl.searchParams.set(
      "pageSize",
      "200"
    );

    const operationsPayload =
      await fetchJson(
        operationsUrl.toString(),
        headers
      );

    const operations =
      extractArray(
        operationsPayload
      );

    // =========================
    // LOAD SCHEDULE CACHE
    // =========================

    const uniqueScheduleIds = [
      ...new Set(
        operations.map(o =>
          clean(o.scheduleId)
        )
      )
    ];

    const scheduleCache = {};

    // limit żeby nie zabić API
    const limitedScheduleIds =
      uniqueScheduleIds.slice(0, 50);

    await Promise.all(
      limitedScheduleIds.map(async id => {
        scheduleCache[id] =
          await fetchScheduleMetadata(
            apiBase,
            headers,
            id
          );
      })
    );

    // =========================
    // BUILD DEPARTURES
    // =========================

    const departures = [];

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

      const metadata =
        scheduleCache[
          clean(operation.scheduleId)
        ] || {};

      const destination =
        getDestination(
          stops,
          stopIndex,
          stationMap
        );

      departures.push({
        station: stationName,

        scheduled: planned,

        actual,

        delayMinutes: delay,

        status: normalizeStatus(
          operation.trainStatus
        ),

        trainNumber:
          metadata.trainNumber || "—",

        destination,

        carrier:
          metadata.carrier || "—",

        platform:
          getPlatform(stop),

        via: getVia(
          stops,
          stopIndex,
          stationMap,
          destination
        ),

        orderId: clean(
          operation.orderId
        ),

        operatingDate: clean(
          operation.operatingDate
        )
      });
    }

    // =========================
    // SORT
    // =========================

    departures.sort((a, b) => {
      return (
        (parseTime(a.actual)
          ?? 999999)
        -
        (parseTime(b.actual)
          ?? 999999)
      );
    });

    // =========================
    // DEDUPE
    // =========================

    const seen = new Set();

    const uniqueDepartures =
      departures.filter(row => {

        const key = [
          row.orderId,
          row.scheduled
        ].join("|");

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      });

    // =========================
    // RESPONSE
    // =========================

    return json({
      ok: true,

      matchedStation:
        stationName,

      matchedStationId:
        stationId,

      totalDepartures:
        uniqueDepartures.length,

      route:
        uniqueDepartures.slice(0, 20),

      debug: {
        operationsCount:
          operations.length,

        scheduleCacheLoaded:
          Object.keys(
            scheduleCache
          ).length,

        sampleOperation:
          operations[0] || null,

        firstRow:
          uniqueDepartures[0] || null
      }
    });

  } catch (error) {

    return json({
      error: error.message,
      stack: error.stack
    }, 500);

  }
}
