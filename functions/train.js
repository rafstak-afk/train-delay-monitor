export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};

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
    throw new Error(`Invalid JSON: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify(data).slice(0, 300)}`
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

function findStation(stations, query) {
  const needle = normalize(query);

  return (
    stations.find(s =>
      normalize(s.name || s.stationName).includes(needle)
    ) || null
  );
}

function getOperationStops(operation) {
  const candidates = [
    operation.stops,
    operation.route,
    operation.stations,
    operation.path,
    operation.timetable,
    operation.timetableEntries
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
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

function getStopStationName(stop) {
  return clean(
    stop.stationName ||
    stop.name ||
    stop.station?.name
  );
}

function getPlannedTime(stop) {
  return (
    formatTime(stop.plannedDepartureTime) ||
    formatTime(stop.plannedArrivalTime) ||
    "—"
  );
}

function getActualTime(stop, planned) {
  return (
    formatTime(stop.actualDepartureTime) ||
    formatTime(stop.actualArrivalTime) ||
    planned
  );
}

function getPlatform(stop) {
  return clean(
    stop.platform ||
    stop.platformNumber ||
    stop.track
  ) || "—";
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

function getTrainNumber(operation) {
  return clean(
    operation.trainNumber ||
    operation.commercialNumber ||
    operation.publicTrainNumber
  ) || "—";
}

function getCarrier(operation) {
  return clean(
    operation.carrier ||
    operation.operator ||
    operation.carrierName
  ) || "—";
}

function getDestination(stops, currentIndex) {
  for (let i = stops.length - 1; i > currentIndex; i--) {
    const name = getStopStationName(stops[i]);

    if (name) return name;
  }

  return "—";
}

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
          station: "Katowice"
        }
      }
    });
  }

  try {
    const body = await request.json();

    const stationQuery = clean(body.station);

    if (!stationQuery) {
      return json({
        error: "Missing station"
      }, 400);
    }

    const apiBase = clean(env.PLK_API_BASE)
      || "https://pdp-api.plk-sa.pl/api/v1";

    const headers = {};

    if (env.PLK_API_KEY) {
      headers["X-Api-Key"] = env.PLK_API_KEY;
    }

    // =========================
    // STATIONS
    // =========================

    const stationsUrl = new URL(
      `${apiBase}/dictionaries/stations`
    );

    stationsUrl.searchParams.set(
      "search",
      stationQuery
    );

    const stationsPayload = await fetchJson(
      stationsUrl.toString(),
      headers
    );

    const stations = extractArray(stationsPayload);

    const matchedStation = findStation(
      stations,
      stationQuery
    );

    if (!matchedStation) {
      return json({
        error: "Station not found",
        stationQuery
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
    // OPERATIONS
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

    const operationsPayload = await fetchJson(
      operationsUrl.toString(),
      headers
    );

    const operations = extractArray(
      operationsPayload
    );

    const departures = [];

    for (const operation of operations) {
      const stops = getOperationStops(operation);

      if (!stops.length) continue;

      const stopIndex = stops.findIndex(stop =>
        getStopStationId(stop) === stationId
      );

      if (stopIndex === -1) continue;

      const stop = stops[stopIndex];

      const planned = getPlannedTime(stop);

      const actual = getActualTime(
        stop,
        planned
      );

      const delay = getDelay(
        stop,
        operation,
        planned,
        actual
      );

      departures.push({
        trainNumber: getTrainNumber(operation),
        carrier: getCarrier(operation),
        destination: getDestination(
          stops,
          stopIndex
        ),
        planned,
        actual,
        delayMinutes: delay,
        platform: getPlatform(stop),
        station: stationName
      });
    }

    departures.sort((a, b) => {
      return (
        (parseTime(a.actual) ?? 999999)
        - (parseTime(b.actual) ?? 999999)
      );
    });

    return json({
      ok: true,
      station: {
        id: stationId,
        name: stationName
      },
      departures,
      total: departures.length,

      // DEBUG
      debug: {
        operationsCount: operations.length,
        firstOperation: operations[0] || null
      }
    });

  } catch (error) {
    return json({
      error: error.message,
      stack: error.stack
    }, 500);
  }
}
