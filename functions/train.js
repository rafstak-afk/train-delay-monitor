export async function onRequest(context) {
  return handleRequest(context.request, context.env);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
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
  const response = await fetch(url, { method: "GET", headers });
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from API: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(`PLK API ${response.status}: ${text.slice(0, 300)}`);
  }

  return data;
}

async function tryFetchJson(url, headers = {}) {
  try {
    return await fetchJson(url, headers);
  } catch {
    return null;
  }
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;

  const keys = [
    "data",
    "items",
    "results",
    "stations",
    "operations",
    "trains",
    "schedules",
    "routes",
    "stops"
  ];

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
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

  if (diff < -720) diff += 1440;

  return Math.max(0, diff);
}

function normalizeStatus(status) {
  const s = clean(status).toUpperCase();

  if (["S", "DONE", "COMPLETED"].includes(s)) return "Zrealizowano";
  if (["RUNNING", "C", "IN_PROGRESS"].includes(s)) return "W ruchu";
  if (["DELAYED", "LATE"].includes(s)) return "Opóźniony";

  return "W ruchu";
}

function findStation(stations, query) {
  const needle = normalize(query);

  return (
    stations.find(station =>
      normalize(station.name || station.stationName).includes(needle)
    ) || null
  );
}

function buildStationMap(stations) {
  const map = {};

  for (const station of stations) {
    const id = clean(station.id || station.stationId);
    const name = clean(station.name || station.stationName);

    if (id && name) map[id] = name;
  }

  return map;
}

function getStops(operation) {
  const candidates = [
    operation.stations,
    operation.stops,
    operation.route,
    operation.path,
    operation.timetable,
    operation.timetableEntries
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }

  return [];
}

function stopStationId(stop) {
  return clean(stop.stationId || stop.id || stop.station?.id);
}

function stopName(stop, stationMap) {
  return (
    clean(stop.stationName || stop.name || stop.station?.name) ||
    stationMap[stopStationId(stop)] ||
    ""
  );
}

function sortStopsBySequence(stops) {
  return [...stops].sort((a, b) => {
    const aa = Number(a.plannedSequenceNumber ?? a.actualSequenceNumber ?? 0);
    const bb = Number(b.plannedSequenceNumber ?? b.actualSequenceNumber ?? 0);
    return aa - bb;
  });
}

function getPlannedTime(stop) {
  return (
    formatTime(stop.plannedDeparture) ||
    formatTime(stop.plannedDepartureTime) ||
    formatTime(stop.plannedArrival) ||
    formatTime(stop.plannedArrivalTime) ||
    "—"
  );
}

function getActualTime(stop, planned) {
  return (
    formatTime(stop.actualDeparture) ||
    formatTime(stop.actualDepartureTime) ||
    formatTime(stop.actualArrival) ||
    formatTime(stop.actualArrivalTime) ||
    planned
  );
}

function getPlatform(stop, meta = {}) {
  const values = [
    stop.platform,
    stop.platformNumber,
    stop.departurePlatform,
    stop.arrivalPlatform,
    stop.track,
    stop.trackNumber,
    stop.sector,
    stop.additionalData?.platform,
    stop.additionalData?.track,
    meta.platform,
    meta.platformNumber,
    meta.track
  ];

  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned && cleaned !== "—") return cleaned;
  }

  return "—";
}

function getTrainNumber(operation, meta = {}) {
  const values = [
    operation.trainNumber,
    operation.publicTrainNumber,
    operation.commercialNumber,
    operation.marketingNumber,
    operation.train?.number,
    operation.train?.trainNumber,
    operation.train?.commercialNumber,
    operation.train?.publicTrainNumber,
    operation.trainName,
    operation.name,
    operation.additionalData?.trainNumber,
    meta.trainNumber,
    meta.publicTrainNumber,
    meta.commercialNumber,
    meta.marketingNumber,
    meta.name
  ];

  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned && cleaned !== "—") return cleaned;
  }

  return "—";
}

function getCarrier(operation, meta = {}) {
  const values = [
    operation.carrier,
    operation.carrierName,
    operation.operator,
    operation.operatorName,
    operation.train?.carrier,
    operation.train?.carrierName,
    operation.train?.operator,
    operation.train?.operatorName,
    operation.additionalData?.carrier,
    meta.carrier,
    meta.carrierName,
    meta.operator,
    meta.operatorName
  ];

  let raw = "";

  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned && cleaned !== "—") {
      raw = cleaned;
      break;
    }
  }

  if (!raw) return "—";

  const normalized = raw.toUpperCase();

  if (normalized === "IC") return "PKP Intercity";
  if (normalized === "PR") return "POLREGIO";
  if (normalized === "KS") return "Koleje Śląskie";
  if (normalized === "KM") return "Koleje Mazowieckie";
  if (normalized === "KD") return "Koleje Dolnośląskie";
  if (normalized === "KW") return "Koleje Wielkopolskie";
  if (normalized === "ŁKA" || normalized === "LKA") return "Łódzka Kolej Aglomeracyjna";

  return raw;
}

function getDestination(stops, currentIndex, stationMap) {
  const sorted = sortStopsBySequence(stops);
  const current = stops[currentIndex];

  const currentSeq = Number(
    current.plannedSequenceNumber ?? current.actualSequenceNumber ?? 0
  );

  const after = sorted.filter(stop => {
    const seq = Number(stop.plannedSequenceNumber ?? stop.actualSequenceNumber ?? 0);
    return seq > currentSeq;
  });

  if (!after.length) {
    return stopName(current, stationMap) || "—";
  }

  const last = after[after.length - 1];
  return stopName(last, stationMap) || "—";
}

function getVia(stops, currentIndex, stationMap, destination) {
  const sorted = sortStopsBySequence(stops);
  const current = stops[currentIndex];

  const currentSeq = Number(
    current.plannedSequenceNumber ?? current.actualSequenceNumber ?? 0
  );

  const after = sorted.filter(stop => {
    const seq = Number(stop.plannedSequenceNumber ?? stop.actualSequenceNumber ?? 0);
    return seq > currentSeq;
  });

  if (!after.length) return "Kończy bieg";

  const names = [];

  for (const stop of after) {
    const name = stopName(stop, stationMap);

    if (!name) continue;
    if (name === destination) break;

    if (!names.includes(name)) names.push(name);
    if (names.length >= 4) break;
  }

  return names.join(" • ") || "—";
}

function dedupeRows(rows) {
  const seen = new Set();

  return rows.filter(row => {
    const key = [
      row.scheduleId,
      row.orderId,
      row.operatingDate,
      row.stationId,
      row.scheduled,
      row.actual
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);

    return true;
  });
}

function filterByTime(rows, time) {
  if (!time) return rows;

  const pivot = parseTime(time);
  if (pivot === null) return rows;

  return rows.filter(row => {
    const value = parseTime(row.actual || row.scheduled);
    return value !== null && value >= pivot;
  });
}

function buildPortalStationId(stationId) {
  const cleaned = clean(stationId);

  if (cleaned.startsWith("7") && cleaned.length >= 5) return cleaned;

  return `7${cleaned}`;
}

function extractScheduleMeta(payload, stationId) {
  if (!payload) return {};

  const root = Array.isArray(payload) ? payload[0] : payload;
  const stops = getStops(root).length ? getStops(root) : extractArray(root);

  let stationStop = null;

  for (const stop of stops) {
    if (stopStationId(stop) === clean(stationId)) {
      stationStop = stop;
      break;
    }
  }

  return {
    trainNumber:
      clean(root.trainNumber) ||
      clean(root.publicTrainNumber) ||
      clean(root.commercialNumber) ||
      clean(root.marketingNumber),

    carrier:
      clean(root.carrier) ||
      clean(root.carrierName) ||
      clean(root.operator) ||
      clean(root.operatorName),

    platform:
      clean(stationStop?.platform) ||
      clean(stationStop?.platformNumber) ||
      clean(stationStop?.departurePlatform) ||
      clean(stationStop?.arrivalPlatform) ||
      clean(stationStop?.track)
  };
}

async function loadScheduleMeta(apiBase, headers, operation, stationId) {
  const scheduleId = clean(operation.scheduleId);
  const orderId = clean(operation.orderId);
  const operatingDate = clean(operation.operatingDate);

  if (!scheduleId) return {};

  const urls = [];

  if (scheduleId && orderId && operatingDate) {
    urls.push(
      `${apiBase}/operations/train/${scheduleId}/${orderId}/${operatingDate}`
    );
  }

  if (scheduleId && orderId) {
    urls.push(
      `${apiBase}/schedules/route/${scheduleId}/${orderId}`,
      `${apiBase}/schedules/${scheduleId}/${orderId}`
    );
  }

  urls.push(`${apiBase}/schedules/${scheduleId}`);

  for (const url of urls) {
    const payload = await tryFetchJson(url, headers);
    const meta = extractScheduleMeta(payload, stationId);

    if (meta.trainNumber || meta.carrier || meta.platform) {
      return meta;
    }
  }

  return {};
}

async function buildScheduleMetaMap(apiBase, headers, operations, stationId) {
  const selected = operations
    .filter(operation => {
      const train = getTrainNumber(operation);
      const carrier = getCarrier(operation);
      return train === "—" || carrier === "—";
    })
    .slice(0, 30);

  const map = {};

  await Promise.all(
    selected.map(async operation => {
      const key = [
        clean(operation.scheduleId),
        clean(operation.orderId),
        clean(operation.operatingDate)
      ].join("|");

      map[key] = await loadScheduleMeta(apiBase, headers, operation, stationId);
    })
  );

  return map;
}

function scheduleKey(operation) {
  return [
    clean(operation.scheduleId),
    clean(operation.orderId),
    clean(operation.operatingDate)
  ].join("|");
}

async function handleRequest(request, env) {
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (method === "GET") {
    return json({ ok: true, endpoint: "/train" });
  }

  try {
    const body = await request.json();

    const stationQuery = clean(body.station);
    const requestDate = clean(body.date);
    const requestTime = clean(body.time);

    if (!stationQuery) {
      return json({ error: "Missing station" }, 400);
    }

    const apiBase =
      clean(env.PLK_API_BASE) || "https://pdp-api.plk-sa.pl/api/v1";

    const headers = {};

    if (env.PLK_API_KEY) {
      headers["X-Api-Key"] = env.PLK_API_KEY;
    }

    const stationsUrl = new URL(`${apiBase}/dictionaries/stations`);
    stationsUrl.searchParams.set("search", stationQuery);

    const stationsPayload = await fetchJson(stationsUrl.toString(), headers);
    const stations = extractArray(stationsPayload);
    const matchedStation = findStation(stations, stationQuery);

    if (!matchedStation) {
      return json({ error: "Station not found" }, 404);
    }

    const stationId = clean(matchedStation.id || matchedStation.stationId);
    const stationName = clean(matchedStation.name || matchedStation.stationName);

    let stationMap = buildStationMap(stations);

    const allStationsPayload = await tryFetchJson(
      `${apiBase}/dictionaries/stations`,
      headers
    );

    const allStations = extractArray(allStationsPayload);
    if (allStations.length) {
      stationMap = buildStationMap(allStations);
    }

    const operationsUrl = new URL(`${apiBase}/operations`);
    operationsUrl.searchParams.set("stations", stationId);
    operationsUrl.searchParams.set("withPlanned", "true");
    operationsUrl.searchParams.set("fullRoutes", "true");
    operationsUrl.searchParams.set("pageSize", "200");

    if (requestDate) {
      operationsUrl.searchParams.set("date", requestDate);
    }

    const operationsPayload = await fetchJson(operationsUrl.toString(), headers);
    const operations = extractArray(operationsPayload);

    const scheduleMetaMap = await buildScheduleMetaMap(
      apiBase,
      headers,
      operations,
      stationId
    );

    const rows = [];

    for (const operation of operations) {
      const stops = getStops(operation);
      if (!stops.length) continue;

      const stopIndex = stops.findIndex(stop => stopStationId(stop) === stationId);
      if (stopIndex === -1) continue;

      const stop = stops[stopIndex];
      const planned = getPlannedTime(stop);
      const actual = getActualTime(stop, planned);
      const delay = calculateDelay(planned, actual);
      const destination = getDestination(stops, stopIndex, stationMap);
      const meta = scheduleMetaMap[scheduleKey(operation)] || {};

      rows.push({
        stationId,
        station: stationName,
        scheduled: planned,
        actual,
        delayMinutes: delay,
        status: normalizeStatus(operation.trainStatus),

        trainNumber: getTrainNumber(operation, meta),
        destination,
        carrier: getCarrier(operation, meta),
        platform: getPlatform(stop, meta),
        via: getVia(stops, stopIndex, stationMap, destination),

        scheduleId: clean(operation.scheduleId),
        orderId: clean(operation.orderId),
        operatingDate: clean(operation.operatingDate)
      });
    }

    const uniqueRows = dedupeRows(rows);
    const filteredRows = filterByTime(uniqueRows, requestTime);

    filteredRows.sort((a, b) => {
      return (parseTime(a.actual) ?? 999999) - (parseTime(b.actual) ?? 999999);
    });

    return json({
      ok: true,
      matchedStation: stationName,
      matchedStationId: stationId,
      portalStationId: buildPortalStationId(stationId),
      totalDepartures: filteredRows.length,
      route: filteredRows.slice(0, 20),
      debug: {
        stationId,
        stationName,
        operationsCount: operations.length,
        enrichedSchedules: Object.keys(scheduleMetaMap).length,
        sampleOperation: operations[0] || null,
        firstRow: filteredRows[0] || null
      }
    });
  } catch (error) {
    return json(
      {
        error: error.message || "Unknown error",
        stack: error.stack
      },
      500
    );
  }
}
