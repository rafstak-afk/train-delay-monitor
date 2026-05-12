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
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function absoluteUrl(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `https://portalpasazera.pl${url}`;
  return `https://portalpasazera.pl/${url}`;
}

function catalogUrl(station) {
  return `https://portalpasazera.pl/KatalogStacji?stacja=${encodeURIComponent(station)}`;
}

async function fetchTextCached(url, ttl = 86400) {
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
    throw new Error(`Portal ${response.status}: ${text.slice(0, 160)}`);
  }

  await cache.put(
    key,
    new Response(text, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": `public, max-age=${ttl}`
      }
    })
  );

  return text;
}

async function resolveStationDisplayLink(stationName) {
  const station = clean(stationName);
  const url = catalogUrl(station);
  const html = await fetchTextCached(url, 86400);

  const direct = html.match(
    /<a[^>]+href=["']([^"']*Wyswietlacz[^"']*)["'][^>]*>\s*Wyświetlacz stacyjny\s*<\/a>/i
  );

  if (direct?.[1]) {
    return absoluteUrl(direct[1]);
  }

  const anyDisplay = html.match(/href=["']([^"']*Wyswietlacz\?sid=[^"']*)["']/i);

  if (anyDisplay?.[1]) {
    return absoluteUrl(anyDisplay[1]);
  }

  return url;
}

async function fetchJson(url, headers = {}, ttl = 30) {
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
    throw new Error(`PLK API ${response.status}: ${text.slice(0, 240)}`);
  }

  await cache.put(
    key,
    new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${ttl}`
      }
    })
  );

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
    stations.find(station => normalize(station.name || station.stationName) === needle) ||
    stations.find(station => normalize(station.name || station.stationName).includes(needle)) ||
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

function destinationFromStops(stops, currentIndex, stationMap) {
  const sorted = sortStops(stops);
  const current = stops[currentIndex];
  const currentSeq = stopSeq(current);
  const after = sorted.filter(stop => stopSeq(stop) > currentSeq);

  if (!after.length) return stopName(current, stationMap) || "Kończy bieg";

  return stopName(after[after.length - 1], stationMap) || "—";
}

function viaFromStops(stops, currentIndex, stationMap, destination) {
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

function firstValue(values) {
  for (const value of values) {
    const cleaned = clean(value);

    if (cleaned && cleaned !== "—") return cleaned;
  }

  return "";
}

function carrierFromTrain(value) {
  const text = clean(value).toUpperCase();

  if (!text) return "—";
  if (text.includes("KS")) return "Koleje Śląskie";
  if (text.includes("IC") || text.includes("TLK") || text.includes("EIC") || text.includes("EIP")) return "PKP Intercity";
  if (/\bR\b/.test(text) || text.includes("REGIO")) return "POLREGIO";
  if (text.includes("KM")) return "Koleje Mazowieckie";
  if (text.includes("KD")) return "Koleje Dolnośląskie";
  if (text.includes("KW")) return "Koleje Wielkopolskie";
  if (text.includes("ŁKA") || text.includes("LKA")) return "ŁKA";

  return "—";
}

function getTrainNumber(item) {
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
    item.name
  ]) || "—";
}

function getCarrier(item) {
  const explicit = firstValue([
    item.carrier,
    item.carrierName,
    item.operator,
    item.operatorName,
    item.train?.carrier,
    item.train?.carrierName,
    item.train?.operator,
    item.train?.operatorName
  ]);

  const guessed = carrierFromTrain(getTrainNumber(item));

  return explicit || guessed || "—";
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

function scoreRow(row) {
  let score = 0;

  if (row.trainNumber && row.trainNumber !== "—") score += 5;
  if (row.destination && row.destination !== "—") score += 5;
  if (row.carrier && row.carrier !== "—") score += 3;
  if (row.platform && row.platform !== "—") score += 4;
  if (row.via && row.via !== "—") score += 2;
  if (row.status === "Zrealizowano") score -= 1;

  return score;
}

function dedupeRows(rows) {
  const best = new Map();

  for (const row of rows) {
    const key = [
      row.scheduleId || row.trainNumber || row.destination,
      row.orderId || row.scheduled,
      row.operatingDate || "",
      row.stationId,
      row.scheduled
    ].join("|");

    const fallbackKey = [
      row.scheduled,
      normalize(row.destination),
      normalize(row.via)
    ].join("|");

    const finalKey = key.replace(/\|/g, "") ? key : fallbackKey;
    const current = best.get(finalKey);

    if (!current || scoreRow(row) > scoreRow(current)) {
      best.set(finalKey, row);
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

  const url = new URL(request.url);

  if (method === "GET") {
    const station = clean(url.searchParams.get("station"));

    if (station) {
      const stationLink = await resolveStationDisplayLink(station);

      return json({
        ok: true,
        station,
        stationLink,
        catalogLink: catalogUrl(station)
      });
    }

    return json({
      ok: true,
      endpoint: "/train"
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

    const stationLink = await resolveStationDisplayLink(stationQuery);

    const apiKey = clean(env.PLK_API_KEY);

    if (!apiKey) {
      return json(
        {
          ok: false,
          error: "Brak PLK_API_KEY w zmiennych środowiskowych Cloudflare.",
          stationLink,
          catalogLink: catalogUrl(stationQuery),
          debug: {
            reason: "missing-env",
            stationQuery,
            stationLink
          }
        },
        500
      );
    }

    const apiBase =
      clean(env.PLK_API_BASE) || "https://pdp-api.plk-sa.pl/api/v1";

    const headers = {
      "X-API-Key": apiKey,
      "X-Api-Key": apiKey
    };

    const stationsUrl = new URL(`${apiBase}/dictionaries/stations`);
    stationsUrl.searchParams.set("search", stationQuery);
    stationsUrl.searchParams.set("pageSize", "20");

    const stationsPayload = await fetchJson(stationsUrl.toString(), headers, 86400);
    const stations = extractArray(stationsPayload);
    const matchedStation = findStation(stations, stationQuery);

    if (!matchedStation) {
      return json(
        {
          ok: false,
          error: "Nie znaleziono stacji",
          stationLink
        },
        404
      );
    }

    const stationId = clean(matchedStation.id || matchedStation.stationId);
    const stationName = clean(matchedStation.name || matchedStation.stationName);
    const stationMap = buildStationMap(stations);

    const operationsUrl = new URL(`${apiBase}/operations`);
    operationsUrl.searchParams.set("stations", stationId);
    operationsUrl.searchParams.set("withPlanned", "true");
    operationsUrl.searchParams.set("fullRoutes", "true");
    operationsUrl.searchParams.set("pageSize", "120");

    if (requestDate) {
      operationsUrl.searchParams.set("date", requestDate);
    }

    const operationsPayload = await fetchJson(operationsUrl.toString(), headers, 20);
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
      const destination = destinationFromStops(stops, stopIndex, stationMap);

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
        via: viaFromStops(stops, stopIndex, stationMap, destination),
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
      stationLink,
      totalDepartures: uniqueRows.length,
      route: uniqueRows,
      debug: {
        source: "plk-api",
        stationQuery,
        stationName,
        stationId,
        stationLink,
        operationsCount: operations.length,
        returnedRows: uniqueRows.length,
        sampleStation: matchedStation,
        sampleOperation: operations[0] || null,
        firstRow: uniqueRows[0] || null
      }
    });
  } catch (error) {
    const fallbackStation = "Tarnowskie Góry";
    let stationLink = catalogUrl(fallbackStation);

    try {
      stationLink = await resolveStationDisplayLink(fallbackStation);
    } catch {}

    return json(
      {
        ok: false,
        error: error.message || "Worker error",
        stationLink,
        debug: {
          message: error.message,
          stack: error.stack
        }
      },
      500
    );
  }
}
