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

function ttlFor(url) {
  if (url.includes("/operations")) return 20;
  if (url.includes("/schedules")) return 300;
  if (url.includes("/dictionaries")) return 86400;
  return 300;
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

  await cache.put(
    cacheKey,
    new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${ttlFor(url)}`
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
  const match = clean(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTime(value) {
  const match = clean(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return "—";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
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

  const id = clean(stationId);

  if (/^\d{5,}$/.test(id)) return id;
  if (/^\d{4}$/.test(id)) return `7${id}`;

  return id;
}

function getStops(item) {
  const candidates = [
    item.stations,
    item.stops,
    item.route,
    item.path,
    item.timetable,
    item.timetableEntries
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

function getDestinationFromStops(stops, currentIndex, stationMap) {
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

function getViaFromStops(stops, currentIndex, stationMap, destination) {
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

  return names.join(", ") || "—";
}

function normalizeCarrier(value) {
  const raw = clean(value);
  const upper = raw.toUpperCase();

  if (!raw) return "—";
  if (upper === "IC") return "PKP Intercity";
  if (upper === "PR") return "POLREGIO";
  if (upper === "KS") return "Koleje Śląskie";
  if (upper === "KM") return "Koleje Mazowieckie";
  if (upper === "KD") return "Koleje Dolnośląskie";
  if (upper === "KW") return "Koleje Wielkopolskie";
  if (upper === "ŁKA" || upper === "LKA") return "ŁKA";

  return raw;
}

function firstValue(values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned && cleaned !== "—") return cleaned;
  }

  return "";
}

function getTrainNumber(item, meta = {}) {
  return firstValue([
    item.trainNumber,
    item.publicTrainNumber,
    item.commercialNumber,
    item.marketingNumber,
    item.train?.number,
    item.train?.trainNumber,
    item.train?.commercialNumber,
    item.train?.publicTrainNumber,
    item.trainName,
    item.name,
    item.additionalData?.trainNumber,
    meta.trainNumber,
    meta.publicTrainNumber,
    meta.commercialNumber,
    meta.marketingNumber,
    meta.name
  ]) || "—";
}

function getCarrier(item, meta = {}) {
  const value = firstValue([
    item.carrier,
    item.carrierName,
    item.operator,
    item.operatorName,
    item.train?.carrier,
    item.train?.carrierName,
    item.train?.operator,
    item.train?.operatorName,
    item.additionalData?.carrier,
    meta.carrier,
    meta.carrierName,
    meta.operator,
    meta.operatorName
  ]);

  return normalizeCarrier(value);
}

function getPlatform(stop, meta = {}) {
  return firstValue([
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
  ]) || "—";
}

function scheduleKey(item) {
  return [
    clean(item.scheduleId),
    clean(item.orderId),
    clean(item.operatingDate)
  ].join("|");
}

function scheduleLooseKey(item, planned, destination) {
  return [
    clean(item.scheduleId),
    clean(item.orderId),
    clean(planned),
    normalize(destination)
  ].join("|");
}

function extractScheduleMeta(schedule, stationId, stationMap) {
  const stops = getStops(schedule);
  let stationStop = null;
  let stationIndex = -1;

  for (let i = 0; i < stops.length; i++) {
    if (stopStationId(stops[i]) === clean(stationId)) {
      stationStop = stops[i];
      stationIndex = i;
      break;
    }
  }

  const destination =
    stationStop && stationIndex >= 0
      ? getDestinationFromStops(stops, stationIndex, stationMap)
      : firstValue([
          schedule.destination,
          schedule.destinationStation,
          schedule.to,
          schedule.endStation,
          schedule.lastStation
        ]);

  const via =
    stationStop && stationIndex >= 0
      ? getViaFromStops(stops, stationIndex, stationMap, destination)
      : "—";

  return {
    trainNumber: getTrainNumber(schedule),
    carrier: getCarrier(schedule),
    platform: getPlatform(stationStop || {}, {}),
    destination: destination || "—",
    via,
    planned: stationStop ? getPlannedTime(stationStop) : "—"
  };
}

function buildScheduleMap(schedules, stationId, stationMap) {
  const byExact = {};
  const byLoose = {};

  for (const schedule of schedules) {
    const meta = extractScheduleMeta(schedule, stationId, stationMap);

    const exact = scheduleKey(schedule);
    byExact[exact] = meta;

    const loose = scheduleLooseKey(schedule, meta.planned, meta.destination);
    byLoose[loose] = meta;
  }

  return { byExact, byLoose };
}

function scoreRow(row) {
  let score = 0;

  if (row.trainNumber && row.trainNumber !== "—") score += 5;
  if (row.destination && row.destination !== "—") score += 5;
  if (row.carrier && row.carrier !== "—") score += 3;
  if (row.platform && row.platform !== "—") score += 3;
  if (row.via && row.via !== "—") score += 2;
  if (row.status === "Zrealizowano") score -= 1;

  return score;
}

function dedupeRows(rows) {
  const best = new Map();

  for (const row of rows) {
    const stableKey = [
      row.scheduleId || row.trainNumber || row.destination,
      row.orderId || row.scheduled,
      row.operatingDate || "",
      row.stationId,
      row.scheduled
    ].join("|");

    const fallbackKey = [
      row.scheduled,
      row.destination,
      row.via
    ].join("|");

    const key =
      stableKey.replace(/\|/g, "") ? stableKey : fallbackKey;

    const current = best.get(key);

    if (!current || scoreRow(row) > scoreRow(current)) {
      best.set(key, row);
    }
  }

  return [...best.values()];
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
      headers["X-API-Key"] = env.PLK_API_KEY;
    }

    const stationsUrl = new URL(`${apiBase}/dictionaries/stations`);
    stationsUrl.searchParams.set("search", stationQuery);
    stationsUrl.searchParams.set("pageSize", "20");

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

    const allStationsUrl = new URL(`${apiBase}/dictionaries/stations`);
    allStationsUrl.searchParams.set("pageSize", "5000");

    const allStationsPayload = await tryFetchJson(allStationsUrl.toString(), headers);
    const allStations = extractArray(allStationsPayload);

    if (allStations.length) {
      stationMap = buildStationMap(allStations);
    }

    const operationsUrl = new URL(`${apiBase}/operations`);
    operationsUrl.searchParams.set("stations", stationId);
    operationsUrl.searchParams.set("withPlanned", "true");
    operationsUrl.searchParams.set("fullRoutes", "true");
    operationsUrl.searchParams.set("pageSize", "500");

    if (requestDate) {
      operationsUrl.searchParams.set("date", requestDate);
    }

    const schedulesUrl = new URL(`${apiBase}/schedules`);
    schedulesUrl.searchParams.set("stations", stationId);
    schedulesUrl.searchParams.set("pageSize", "5000");

    if (requestDate) {
      schedulesUrl.searchParams.set("dateFrom", requestDate);
      schedulesUrl.searchParams.set("dateTo", requestDate);
    }

    const [operationsPayload, schedulesPayload] = await Promise.all([
      fetchJson(operationsUrl.toString(), headers),
      tryFetchJson(schedulesUrl.toString(), headers)
    ]);

    const operations = extractArray(operationsPayload);
    const schedules = extractArray(schedulesPayload);

    const scheduleMap = buildScheduleMap(schedules, stationId, stationMap);

    const rows = [];

    for (const operation of operations) {
      const stops = getStops(operation);
      if (!stops.length) continue;

      const stopIndex = stops.findIndex(stop => stopStationId(stop) === stationId);
      if (stopIndex === -1) continue;

      const stop = stops[stopIndex];
      const planned = getPlannedTime(stop);
      const actual = getActualTime(stop, planned);

      const opDestination = getDestinationFromStops(stops, stopIndex, stationMap);
      const exactMeta = scheduleMap.byExact[scheduleKey(operation)] || {};
      const looseMeta =
        scheduleMap.byLoose[scheduleLooseKey(operation, planned, opDestination)] || {};

      const meta = {
        ...looseMeta,
        ...exactMeta
      };

      const destination =
        meta.destination && meta.destination !== "—"
          ? meta.destination
          : opDestination;

      const via =
        meta.via && meta.via !== "—"
          ? meta.via
          : getViaFromStops(stops, stopIndex, stationMap, destination);

      rows.push({
        stationId,
        station: stationName,
        scheduled: planned,
        actual,
        delayMinutes: calculateDelay(planned, actual),
        status: normalizeStatus(operation.trainStatus),
        trainNumber: getTrainNumber(operation, meta),
        destination,
        carrier: getCarrier(operation, meta),
        platform: getPlatform(stop, meta),
        via,
        scheduleId: clean(operation.scheduleId),
        orderId: clean(operation.orderId),
        operatingDate: clean(operation.operatingDate)
      });
    }

    const filteredRows = filterByTime(rows, requestTime);

    filteredRows.sort(
      (a, b) => (parseTime(a.actual) ?? 999999) - (parseTime(b.actual) ?? 999999)
    );

    const uniqueRows = dedupeRows(filteredRows).slice(0, 20);

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
        schedulesCount: schedules.length,
        returnedRows: uniqueRows.length,
        sampleStation: matchedStation,
        sampleOperation: operations[0] || null,
        sampleSchedule: schedules[0] || null,
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
