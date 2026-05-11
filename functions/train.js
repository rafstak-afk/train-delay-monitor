function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }
  });
}

function clean(value) {
  return String(value || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatTime(value) {
  const str = String(value || '').trim();
  const iso = str.match(/T(\d{2}:\d{2})(?::\d{2})?/);
  if (iso) return iso[1];
  const hhmm = str.match(/(\d{1,2}):(\d{2})/);
  return hhmm ? `${hhmm[1].padStart(2, '0')}:${hhmm[2]}` : '';
}

function parseClock(value) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function normalizeDateForApi(value) {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return text;
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.substring(0, 200)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return data;
}

function extractStations(data) {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.stations) ? data.stations
    : Array.isArray(data?.items) ? data.items
    : Array.isArray(data?.data) ? data.data
    : Array.isArray(data?.results) ? data.results : [];
}

function pickStation(data, query) {
  const items = extractStations(data);
  const needle = normalize(query);
  return items.find(item => normalize(item.name || item.stationName || '') === needle)
    || items.find(item => normalize(item.name || item.stationName || '').includes(needle))
    || items[0] || null;
}

function extractOperations(payload) {
  if (Array.isArray(payload?.operations)) return payload.operations;
  if (Array.isArray(payload?.trains)) return payload.trains;
  if (Array.isArray(payload?.data?.operations)) return payload.data.operations;
  if (Array.isArray(payload?.data?.trains)) return payload.data.trains;
  if (Array.isArray(payload)) return payload;
  return [];
}

function extractStops(operation) {
  const candidates = [
    operation?.stations,
    operation?.timetable?.stations,
    operation?.stops,
    operation?.route,
    operation?.path
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  return [];
}

function resolveStationName(stop) {
  return clean(stop?.stationName || stop?.name || stop?.station || '');
}

function stopMatches(stop, stationId) {
  const ids = [stop?.stationId, stop?.station, stop?.id].map(v => clean(v));
  return ids.includes(clean(stationId));
}

function getScheduledFromStop(stop) {
  return formatTime(
    stop?.plannedDeparture || stop?.plannedDepartureTime ||
    stop?.plannedArrival || stop?.plannedArrivalTime || ''
  );
}

function getActualFromStop(stop, fallback) {
  return formatTime(
    stop?.actualDeparture || stop?.actualDepartureTime ||
    stop?.actualArrival || stop?.actualArrivalTime || fallback
  );
}

function computeDelay(planned, actual) {
  const p = parseClock(planned);
  const a = parseClock(actual);
  if (p === null || a === null) return 0;
  return Math.max(0, a - p);
}

function extractTrainNumber(operation) {
  return clean(
    operation?.trainNumber || operation?.commercialNumber ||
    operation?.publicTrainNumber || operation?.marketingNumber || ''
  );
}

function extractCarrier(operation) {
  const raw = clean(
    operation?.carrier || operation?.carrierName ||
    operation?.operator || operation?.operatorName ||
    operation?.commercialOperator || ''
  );
  if (!raw) return '—';
  if (/^IC$/i.test(raw)) return 'PKP Intercity';
  if (/^PR$/i.test(raw)) return 'Polregio';
  if (/^KM$/i.test(raw)) return 'Koleje Mazowieckie';
  if (/^KS$/i.test(raw)) return 'Koleje Śląskie';
  return raw;
}

function extractPlatform(stop) {
  return clean(
    stop?.platform || stop?.platformNumber ||
    stop?.departurePlatform || stop?.track || ''
  ) || '—';
}

function extractDestination(stops, index) {
  for (let i = stops.length - 1; i > index; i--) {
    const name = resolveStationName(stops[i]);
    if (name) return name;
  }
  return '—';
}

function extractVia(stops, index, destination) {
  const names = [];
  for (let i = index + 1; i < stops.length; i++) {
    const name = resolveStationName(stops[i]);
    if (!name || normalize(name) === normalize(destination)) break;
    if (!names.some(item => normalize(item) === normalize(name))) {
      names.push(name);
    }
    if (names.length >= 4) break;
  }
  return names.join(' • ') || '—';
}

function normalizeStatus(operation) {
  const raw = clean(operation?.trainStatus || operation?.status || '').toUpperCase();
  if (['DONE', 'COMPLETED', 'S'].includes(raw)) return 'Zrealizowano';
  if (['IN_PROGRESS', 'RUNNING', 'C'].includes(raw)) return 'W ruchu';
  if (['DELAYED', 'LATE'].includes(raw)) return 'Opóźniony';
  if (['ON_TIME', 'ONTIME'].includes(raw)) return 'Punktualnie';
  return 'W ruchu';
}

function buildRouteRows(stationId, stationName, operationsPayload) {
  const operations = extractOperations(operationsPayload);
  const rows = [];

  for (const operation of operations) {
    const stops = extractStops(operation);
    const index = stops.findIndex(stop => stopMatches(stop, stationId));
    if (index === -1) continue;

    const stop = stops[index];
    const planned = getScheduledFromStop(stop);
    const actual = getActualFromStop(stop, planned) || planned;
    const delayMinutes = computeDelay(planned, actual);
    const destination = extractDestination(stops, index);
    const via = extractVia(stops, index, destination);
    const trainNumber = extractTrainNumber(operation);

    rows.push({
      station: stationName,
      scheduled: planned || '—',
      actual: actual || planned || '—',
      delayMinutes,
      status: normalizeStatus(operation),
      trainNumber: trainNumber || '—',
      destination,
      carrier: extractCarrier(operation),
      platform: extractPlatform(stop),
      via,
      orderId: clean(operation?.orderId || ''),
      operatingDate: clean(operation?.operatingDate || '')
    });
  }

  rows.sort((a, b) => {
    const aa = parseClock(a.actual || a.scheduled);
    const bb = parseClock(b.actual || b.scheduled);
    return (aa ?? 999999) - (bb ?? 999999);
  });

  return rows;
}

function filterRouteByTime(route, trainTime) {
  const pivot = parseClock(trainTime);
  if (pivot === null) return route;
  return route.filter(row => {
    const candidate = parseClock(row.actual || row.scheduled);
    return candidate === null || candidate >= pivot;
  });
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = [row.orderId, row.operatingDate, row.trainNumber, row.scheduled].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (method === 'GET') return json({ ok: true, message: 'Użyj POST z query, trainDate i trainTime.' });
  if (method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await context.request.json();
    const query = clean(body.query || body.stationName || body.station || '');
    const trainDate = clean(body.trainDate || body.date || '');
    const trainTime = clean(body.trainTime || body.time || '');
    if (!query) return json({ error: 'Missing query' }, 400);

    const env = context.env || {};
    const apiBase = (env.PLK_API_BASE || 'https://pdp-api.plk-sa.pl/api/v1').replace(/\/+$/, '');
    const headers = {};
    if (env.PLK_API_KEY) {
      headers['X-Api-Key'] = env.PLK_API_KEY;
    }

    const stationsUrl = new URL(`${apiBase}/dictionaries/stations`);
    stationsUrl.searchParams.set('search', query);
    const stationPayload = await fetchJson(stationsUrl.toString(), headers);
    const matchedStation = pickStation(stationPayload, query);
    if (!matchedStation) return json({ error: 'Station not found', stationQuery: query }, 404);

    const stationId = clean(matchedStation.id || matchedStation.stationId || matchedStation.value || '');
    const stationName = clean(matchedStation.name || matchedStation.stationName || query);

    const operationsUrl = new URL(`${apiBase}/operations`);
    operationsUrl.searchParams.set('stations', stationId);
    operationsUrl.searchParams.set('withPlanned', 'true');
    if (trainDate) operationsUrl.searchParams.set('date', normalizeDateForApi(trainDate));

    const operationsPayload = await fetchJson(operationsUrl.toString(), headers);

    let route = buildRouteRows(stationId, stationName, operationsPayload);
    route = dedupeRows(filterRouteByTime(route, trainTime));

    const delayMinutes = Math.max(0, ...route.map(row => Number(row.delayMinutes) || 0), 0);

    return json({
      matchedStation: stationName,
      matchedStationId: stationId,
      delayMinutes,
      status: route.length ? (delayMinutes > 0 ? 'DELAYED' : 'ON_TIME') : 'NO_DATA',
      lastStation: route.length ? route[route.length - 1].destination || stationName : stationName,
      route: route.slice(0, 20),
      totalDepartures: route.length,
      debug: {
        stationId,
        stationName,
        operationsCount: extractOperations(operationsPayload).length,
        sampleOperation: extractOperations(operationsPayload)[0] || null,
        firstRow: route[0] || null
      }
    });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
}
