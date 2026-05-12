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

async function fetchJson(url, headers = {}) {
  const cache = caches.default;
  const cacheKey = new Request(url, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const response = await fetch(url, { method: "GET", headers });
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Niepoprawna odpowiedź API: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(`PLK API ${response.status}: ${text.slice(0, 200)}`);
  }

  const ttl = url.includes("/operations") ? 30 : 3600;

  await cache.put(
    cacheKey,
    new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${ttl}`
      }
    })
  );

  return data;
}

async function tryFetchJson(url, headers = {}) {
  try {
    return await fetchJson(url, headers);
  } catch {
    return null;
  }
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
      normalize(station.name || station.stationName) === needle
    ) ||
    stations.find(station =>
      normalize(station.name || station.stationName).includes(needle)
    ) ||
    stations[0] ||
    null
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

function getPortalStationId(station, stationId) {
  const candidates = [
    station.portalStationId,
    station.portalId,
    station.passengerStationId,
    station.stationNumber,
    station.stationCode,
    station.externalId,
    station.uicCode,
    station.uic,
    station.displayId
  ];

  for (const value of candidates) {
    const cleaned = clean(value);
    if (/^\d{5,}$/.test(cleaned)) return cleaned;
  }

  const cleanedStationId = clean(stationId);

  if (/^\d{5,}$/.test(cleanedStationId)) return cleanedStationId;

  return cleanedStationId;
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

function stopSeq(stop) {
  return Number(stop.plannedSequenceNumber ?? stop.actualSequenceNumber ?? 0);
}

function sortStops(stops) {
  return [...stops].sort((a, b) => stopSeq(a) - stopSeq(b));
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

function getDestination(stops, currentIndex, stationMap) {
  const sorted = sortStops(stops);
  const current = stops[currentIndex];
  const currentSeq = stopSeq(current);

  const after = sorted.filter(stop => stopSeq(stop) > currentSeq);

  if (!after.length) {
    return stopName(current, stationMap) || "Kończy bieg";
  }

  const last = after[after.length - 1];

  return stopName(last, stationMap) || "—";
}

function getVia(stops, currentIndex, stationMap, destination) {
  const sorted = sortStops(stops);
  const current = stops[currentIndex];
  const currentSeq = stopSeq(current);

  const after = sorted.filter(stop => stopSeq(stop) > currentSeq);

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

function normalizeCarrier(raw) {
  const value = clean(raw);
  const upper = value.toUpperCase();

  if (!value) return "—";
  if (upper === "IC") return "PKP Intercity";
  if (upper === "PR") return "POLREGIO";
  if (upper === "KS") return "Koleje Śląskie";
  if (upper === "KM") return "Koleje Mazowieckie";
  if (upper === "KD") return "Koleje Dolnośląskie";
  if (upper === "KW") return "Koleje Wielkopolskie";
  if (upper === "ŁKA" || upper === "LKA") return "Łódzka Kolej Aglomeracyjna";

  return value;
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

  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned && cleaned !== "—") return normalizeCarrier(cleaned);
  }

  return "—";
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
    meta.track,
    meta.trackNumber
  ];

  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned && cleaned !== "—") return cleaned;
  }

  return "—";
}

function scheduleKey(operation) {
  return [
    clean(operation.scheduleId),
    clean(operation.orderId),
    clean(operation.operatingDate)
  ].join("|");
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
      clean(root.marketingNumber) ||
      clean(root.train?.number) ||
      clean(root.train?.trainNumber),

    carrier:
      clean(root.carrier) ||
      clean(root.carrierName) ||
      clean(root.operator) ||
      clean(root.operatorName) ||
      clean(root.train?.carrier) ||
      clean(root.train?.operator),

    platform:
      clean(stationStop?.platform) ||
      clean(stationStop?.platformNumber) ||
      clean(stationStop?.departurePlatform) ||
      clean(stationStop?.arrivalPlatform) ||
      clean(stationStop?.track) ||
      clean(stationStop?.trackNumber)
  };
}

async function loadScheduleMeta(apiBase, headers, operation, stationId) {
  const scheduleId = clean(operation.scheduleId);
  const orderId = clean(operation.orderId);
  const operatingDate = clean(operation.operatingDate);

  if (!scheduleId) return {};

  const urls = [];

  if (scheduleId && orderId && operatingDate) {
    urls.push(`${apiBase}/operations/train/${scheduleId}/${orderId}/${operatingDate}`);
  }

  if (scheduleId && orderId) {
    urls.push(`${apiBase}/schedules/route/${scheduleId}/${orderId}`);
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

function dedupeRows(rows) {
  const best = new Map();

  for (const row of rows) {
    const key = [
      row.scheduleId || row.destination,
      row.orderId || row.scheduled,
      row.operatingDate || "",
      row.stationId,
      row.scheduled
    ].join("|");

    const current = best.get(key);

    if (!current) {
      best.set(key, row);
      continue;
    }

    const currentScore = scoreRow(current);
    const newScore = scoreRow(row);

    if (newScore > currentScore) {
      best.set(key, row);
    }
  }

  return [...best.values()];
}

function scoreRow(row) {
  let score = 0;

  if (row.trainNumber && row.trainNumber !== "—") score += 3;
  if (row.destination && row.destination !== "—") score += 3;
  if (row.carrier && row.carrier !== "—") score += 2;
  if (row.platform && row.platform !== "—") score += 2;
  if (row.via && row.via !== "—") score += 1;
  if (row.status === "Zrealizowano") score -= 1;

  return score;
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

async function enrichRows(apiBase, headers, rows, stationId) {
  const needsMeta = rows
    .filter(row =>
      row.trainNumber === "—" ||
      row.carrier === "—" ||
      row.platform === "—"
    )
    .slice(0, 8);

  const metaMap = {};

  for (const row of needsMeta) {
    const key = [
      row.scheduleId,
      row.orderId,
      row.operatingDate
    ].join("|");

    if (metaMap[key]) continue;

    metaMap[key] = await loadScheduleMeta(apiBase, headers, row._operation, stationId);
  }

  return rows.map(row => {
    const key = [
      row.scheduleId,
      row.orderId,
      row.operatingDate
    ].join("|");

    const meta = metaMap[key] || {};

    return {
      ...row,
      trainNumber: row.trainNumber !== "—" ? row.trainNumber : getTrainNumber(row._operation, meta),
      carrier: row.carrier !== "—" ? row.carrier : getCarrier(row._operation, meta),
      platform: row.platform !== "—" ? row.platform : getPlatform(row._stop, meta),
      _operation: undefined,
      _stop: undefined
    };
  });
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
      return json({ error: "Nie znaleziono stacji" }, 404);
    }

    const stationId = clean(matchedStation.id || matchedStation.stationId);
    const stationName = clean(matchedStation.name || matchedStation.stationName);
    const portalStationId = getPortalStationId(matchedStation, stationId);

    let stationMap = buildStationMap(stations);

    const allStationsPayload = await tryFetchJson(`${apiBase}/dictionaries/stations`, headers);
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

    const rows = [];

    for (const operation of operations) {
      const stops = getStops(operation);
      if (!stops.length) continue;

      const stopIndex = stops.findIndex(stop => stopStationId(stop) === stationId);
      if (stopIndex === -1) continue;

      const stop = stops[stopIndex];
      const planned = getPlannedTime(stop);
      const actual = getActualTime(stop, planned);
      const destination = getDestination(stops, stopIndex, stationMap);

      rows.push({
        stationId,
        station: stationName,
        scheduled: planned,
        actual,
        delayMinutes: calculateDelay(planned, actual),
        status: normalizeStatus(operation.trainStatus),
        trainNumber: getTrainNumber(operation),
        destination,
        carrier: getCarrier(operation),
        platform: getPlatform(stop),
        via: getVia(stops, stopIndex, stationMap, destination),
        scheduleId: clean(operation.scheduleId),
        orderId: clean(operation.orderId),
        operatingDate: clean(operation.operatingDate),
        _operation: operation,
        _stop: stop
      });
    }

    const filteredRows = filterByTime(rows, requestTime);
    const sortedRows = filteredRows.sort(
      (a, b) => (parseTime(a.actual) ?? 999999) - (parseTime(b.actual) ?? 999999)
    );

    const firstRows = sortedRows.slice(0, 30);
    const enrichedRows = await enrichRows(apiBase, headers, firstRows, stationId);
    const uniqueRows = dedupeRows(enrichedRows).slice(0, 20);

    return json({
      ok: true,
      matchedStation: stationName,
      matchedStationId: stationId,
      portalStationId,
      stationLink: `https://l.plk-sa.pl/${portalStationId}`,
      totalDepartures: uniqueRows.length,
      route: uniqueRows,
      debug: {
        stationId,
        stationName,
        portalStationId,
        stationLink: `https://l.plk-sa.pl/${portalStationId}`,
        operationsCount: operations.length,
        rawRows: rows.length,
        filteredRows: filteredRows.length,
        returnedRows: uniqueRows.length,
        sampleStation: matchedStation,
        sampleOperation: operations[0] || null,
        firstRow: uniqueRows[0] || null
      }
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error.message || "Worker error",
        debug: {
          message: error.message,
          stack: error.stack
        }
      },
      500
    );
  }
}
