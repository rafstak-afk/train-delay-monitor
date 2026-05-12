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
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&oacute;/g, "ó")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&lacute;/g, "ł")
    .replace(/&Lacute;/g, "Ł")
    .replace(/&sacute;/g, "ś")
    .replace(/&Sacute;/g, "Ś")
    .replace(/&zacute;/g, "ź")
    .replace(/&Zacute;/g, "Ź")
    .replace(/&zdot;/g, "ż")
    .replace(/&Zdot;/g, "Ż")
    .replace(/&cacute;/g, "ć")
    .replace(/&Cacute;/g, "Ć")
    .replace(/&nacute;/g, "ń")
    .replace(/&Nacute;/g, "Ń")
    .replace(/&aogon;/g, "ą")
    .replace(/&Aogon;/g, "Ą")
    .replace(/&eogon;/g, "ę")
    .replace(/&Eogon;/g, "Ę")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseTime(value) {
  const m = clean(value).match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatTime(value) {
  const m = clean(value).match(/(\d{1,2}):(\d{2})/);
  if (!m) return "—";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function calculateDelay(planned, actual) {
  const p = parseTime(planned);
  const a = parseTime(actual);

  if (p === null || a === null) return 0;

  let diff = a - p;
  if (diff < -720) diff += 1440;

  return Math.max(0, diff);
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

async function fetchText(url) {
  const cache = caches.default;
  const key = new Request(url, { method: "GET" });

  const cached = await cache.match(key);
  if (cached) return cached.text();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} dla ${url}`);
  }

  await cache.put(
    key,
    new Response(text, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=20"
      }
    })
  );

  return text;
}

async function fetchJson(url, headers = {}) {
  const cache = caches.default;
  const key = new Request(url, { method: "GET" });

  const cached = await cache.match(key);
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
    key,
    new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30"
      }
    })
  );

  return data;
}

function normalizeStatus(status) {
  const s = clean(status).toUpperCase();

  if (["S", "DONE", "COMPLETED"].includes(s)) return "Zrealizowano";
  if (["DELAYED", "LATE"].includes(s)) return "Opóźniony";

  return "W ruchu";
}

const STATION_LINKS = {
  "Lubliniec": "https://l.plk-sa.pl/71183",
  "Tarnowskie Góry": "https://l.plk-sa.pl/71001",
  "Bytom": "https://l.plk-sa.pl/71016",
  "Gliwice": "https://l.plk-sa.pl/71026",
  "Chorzów Batory": "https://l.plk-sa.pl/71041",
  "Katowice": "https://l.plk-sa.pl/71000",
  "Kraków Główny": "https://l.plk-sa.pl/73000"
};

function getKnownStationLink(stationName) {
  const needle = normalize(stationName);

  for (const [name, link] of Object.entries(STATION_LINKS)) {
    if (normalize(name) === needle) return link;
  }

  return "";
}

function getKnownStationId(stationName) {
  const link = getKnownStationLink(stationName);
  const m = link.match(/\/(\d+)$/);
  return m ? m[1] : "";
}

function parseDisplayRows(html, stationName, portalStationId) {
  const text = html
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\t/g, " ");

  const rows = [];

  const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gi;
  let match;

  while ((match = rowRegex.exec(text))) {
    const rowHtml = match[1];

    const cells = [];
    const cellRegex = /<t[dh][^>]*>(.*?)<\/t[dh]>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml))) {
      cells.push(clean(cellMatch[1]));
    }

    if (cells.length < 4) continue;

    const joined = cells.join(" ");
    const time = formatTime(joined);

    if (time === "—") continue;

    const platformCandidate = cells.find(c => /^\d+[A-Z]?$/.test(c)) || "—";

    const destination =
      cells.find(c =>
        c.length > 2 &&
        !/^\d/.test(c) &&
        !/odjazdy|departures|godzina|time|pociąg|train|peron|platform/i.test(c)
      ) || "—";

    const train =
      cells.find(c =>
        /\b(IC|TLK|EIC|EIP|R|RE|KS|KM|KD|KW|ŁKA|Os)\b/i.test(c)
      ) || "—";

    const via =
      cells
        .filter(c =>
          c !== time &&
          c !== train &&
          c !== destination &&
          c !== platformCandidate &&
          c.length > 2
        )
        .slice(0, 2)
        .join(", ") || "—";

    rows.push({
      station: stationName,
      scheduled: time,
      actual: time,
      delayMinutes: 0,
      status: "W ruchu",
      trainNumber: train,
      destination,
      carrier: carrierFromTrain(train),
      platform: platformCandidate,
      via,
      source: "display"
    });
  }

  return dedupeRows(rows).slice(0, 20);
}

function carrierFromTrain(value) {
  const text = clean(value).toUpperCase();

  if (text.includes("KS")) return "Koleje Śląskie";
  if (text.includes("IC") || text.includes("TLK") || text.includes("EIC") || text.includes("EIP")) return "PKP Intercity";
  if (text.match(/\bR\b/) || text.includes("REGIO")) return "POLREGIO";
  if (text.includes("KM")) return "Koleje Mazowieckie";
  if (text.includes("KD")) return "Koleje Dolnośląskie";
  if (text.includes("KW")) return "Koleje Wielkopolskie";

  return "—";
}

function dedupeRows(rows) {
  const best = new Map();

  for (const row of rows) {
    const key = [
      row.scheduled,
      normalize(row.destination),
      normalize(row.via),
      row.platform
    ].join("|");

    const current = best.get(key);

    if (!current || scoreRow(row) > scoreRow(current)) {
      best.set(key, row);
    }
  }

  return [...best.values()];
}

function scoreRow(row) {
  let score = 0;

  if (row.trainNumber && row.trainNumber !== "—") score += 5;
  if (row.destination && row.destination !== "—") score += 5;
  if (row.carrier && row.carrier !== "—") score += 3;
  if (row.platform && row.platform !== "—") score += 4;
  if (row.via && row.via !== "—") score += 2;

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

function firstValue(values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned && cleaned !== "—") return cleaned;
  }

  return "";
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

function stopSeq(stop) {
  return Number(stop.plannedSequenceNumber ?? stop.actualSequenceNumber ?? 0);
}

function sortStops(stops) {
  return [...stops].sort((a, b) => stopSeq(a) - stopSeq(b));
}

function stopName(stop, stationMap) {
  return (
    clean(stop.stationName || stop.name || stop.station?.name) ||
    stationMap[stopStationId(stop)] ||
    ""
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

  return names.join(", ") || "—";
}

function getTrainNumber(item) {
  return firstValue([
    item.trainNumber,
    item.publicTrainNumber,
    item.commercialNumber,
    item.marketingNumber,
    item.train?.number,
    item.train?.trainNumber,
    item.trainName,
    item.name
  ]) || "—";
}

function getCarrier(item) {
  const value = firstValue([
    item.carrier,
    item.carrierName,
    item.operator,
    item.operatorName,
    item.train?.carrier,
    item.train?.operator
  ]);

  return carrierFromTrain(value) !== "—" ? carrierFromTrain(value) : clean(value) || "—";
}

function getPlatform(stop) {
  return firstValue([
    stop.platform,
    stop.platformNumber,
    stop.departurePlatform,
    stop.arrivalPlatform,
    stop.track,
    stop.trackNumber,
    stop.sector
  ]) || "—";
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

async function fallbackApiRows(apiBase, headers, stationQuery, requestDate, requestTime) {
  const stationsUrl = new URL(`${apiBase}/dictionaries/stations`);
  stationsUrl.searchParams.set("search", stationQuery);
  stationsUrl.searchParams.set("pageSize", "20");

  const stationsPayload = await fetchJson(stationsUrl.toString(), headers);
  const stations = extractArray(stationsPayload);
  const matchedStation = findStation(stations, stationQuery);

  if (!matchedStation) {
    throw new Error("Nie znaleziono stacji");
  }

  const stationId = clean(matchedStation.id || matchedStation.stationId);
  const stationName = clean(matchedStation.name || matchedStation.stationName);
  const stationMap = buildStationMap(stations);

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
    const planned = formatTime(stop.plannedDeparture || stop.plannedDepartureTime || stop.plannedArrival || stop.plannedArrivalTime);
    const actual = formatTime(stop.actualDeparture || stop.actualDepartureTime || stop.actualArrival || stop.actualArrivalTime) || planned;
    const destination = getDestination(stops, stopIndex, stationMap);

    rows.push({
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
      source: "api"
    });
  }

  return {
    matchedStation: stationName,
    matchedStationId: stationId,
    portalStationId: getKnownStationId(stationQuery),
    stationLink: getKnownStationLink(stationQuery),
    route: dedupeRows(filterByTime(rows, requestTime)).slice(0, 20),
    debug: {
      source: "api-fallback",
      stationId,
      operationsCount: operations.length,
      sampleOperation: operations[0] || null
    }
  };
}

async function handleRequest(request, env) {
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  if (method === "GET") {
    return json({
      ok: true,
      endpoint: "/train",
      knownLinks: STATION_LINKS
    });
  }

  try {
    const body = await request.json();

    const stationQuery = clean(body.station);
    const requestDate = clean(body.date);
    const requestTime = clean(body.time);

    if (!stationQuery) {
      return json({ ok: false, error: "Missing station" }, 400);
    }

    const knownLink = getKnownStationLink(stationQuery);
    const knownId = getKnownStationId(stationQuery);

    if (knownLink) {
      try {
        const html = await fetchText(knownLink);
        let rows = parseDisplayRows(html, stationQuery, knownId);
        rows = filterByTime(rows, requestTime).slice(0, 20);

        if (rows.length) {
          return json({
            ok: true,
            matchedStation: stationQuery,
            matchedStationId: knownId,
            portalStationId: knownId,
            stationLink: knownLink,
            totalDepartures: rows.length,
            route: rows,
            debug: {
              source: "plk-display-html",
              station: stationQuery,
              stationLink: knownLink,
              parsedRows: rows.length
            }
          });
        }
      } catch (error) {
        // idziemy do API fallback
      }
    }

    const apiBase =
      clean(env.PLK_API_BASE) || "https://pdp-api.plk-sa.pl/api/v1";

    const headers = {};

    if (env.PLK_API_KEY) {
      headers["X-API-Key"] = env.PLK_API_KEY;
      headers["X-Api-Key"] = env.PLK_API_KEY;
    }

    const result = await fallbackApiRows(apiBase, headers, stationQuery, requestDate, requestTime);

    return json({
      ok: true,
      matchedStation: result.matchedStation,
      matchedStationId: result.matchedStationId,
      portalStationId: result.portalStationId,
      stationLink: result.stationLink || "https://l.plk-sa.pl/",
      totalDepartures: result.route.length,
      route: result.route,
      debug: result.debug
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
