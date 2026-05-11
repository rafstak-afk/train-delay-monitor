const STATIONS_URL = 'https://pdp-api.plk-sa.pl/api/v1/dictionaries/stations';
const OPERATIONS_URL = 'https://pdp-api.plk-sa.pl/api/v1/operations';
const SCHEDULES_URL = 'https://pdp-api.plk-sa.pl/api/v1/schedules';

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

// GET /api/stations?search=Katowice
export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const search = clean(url.searchParams.get('search') || '');
    if (!search || search.length < 2) return json({ stations: [] });

    const stations = await fetchStations(search, context.env);
    return json({ stations });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
}

// POST /api/train
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const stationQuery = clean(body.query || body.stationName || body.station || '');
    const trainTime = clean(body.trainTime || body.time || '');
    const trainDate = clean(body.trainDate || body.date || '');

    if (!stationQuery) return json({ error: 'Brak nazwy stacji.' }, 400);

    // 1. Resolve station ID
    const stations = await fetchStations(stationQuery, context.env);
    if (!stations.length) return json({ error: `Nie znaleziono stacji: "${stationQuery}"` }, 404);

    const station = stations[0];
    const stationId = station.id;
    const stationName = station.name;

    // 2. Fetch real-time operations for the station
    const params = new URLSearchParams({
      stations: String(stationId),
      withPlanned: 'true',
      fullRoutes: 'false',
      pageSize: '100',
    });

    const opsRes = await plkFetch(`${OPERATIONS_URL}?${params}`, context.env);
    const opsData = await opsRes.json();

    // 3. Also fetch scheduled departures for today to fill gaps
    const dateParam = trainDate || new Date().toISOString().slice(0, 10);
    const schedParams = new URLSearchParams({
      stations: String(stationId),
      dateFrom: dateParam,
      dateTo: dateParam,
      pageSize: '100',
    });
    let schedData = null;
    try {
      const schedRes = await plkFetch(`${SCHEDULES_URL}?${schedParams}`, context.env);
      if (schedRes.ok) schedData = await schedRes.json();
    } catch { /* optional, don't fail */ }

    // 4. Map operations to route rows
    const rawOps = Array.isArray(opsData?.operations) ? opsData.operations
      : Array.isArray(opsData?.data) ? opsData.data
      : Array.isArray(opsData) ? opsData
      : [];

    let route = rawOps.map(op => mapOperationRow(op, stationId)).filter(Boolean);

    // 5. Merge scheduled data for trains not yet in operations
    if (schedData) {
      const rawSched = Array.isArray(schedData?.schedules) ? schedData.schedules
        : Array.isArray(schedData?.data) ? schedData.data
        : Array.isArray(schedData) ? schedData
        : [];

      const existingKeys = new Set(route.map(r => r._key));
      const schedRows = rawSched.map(s => mapScheduleRow(s, stationId)).filter(Boolean);
      for (const row of schedRows) {
        if (!existingKeys.has(row._key)) route.push(row);
      }
    }

    // 6. Filter by time and dedupe
    route = dedupeRows(filterRouteByTime(route, trainTime));
    route.sort((a, b) => (parseClock(a.scheduled) ?? 9999) - (parseClock(b.scheduled) ?? 9999));

    const delayMinutes = Math.max(0, ...route.map(r => Number(r.delayMinutes) || 0));
    const limited = route.slice(0, 30);

    return json({
      matchedStation: stationName,
      stationId,
      fullTimetableUrl: `https://portalpasazera.pl/Wyswietlacz?sid=${stationId}`,
      delayMinutes,
      status: route.length ? (delayMinutes > 0 ? 'DELAYED' : 'ON_TIME') : 'NO_DATA',
      lastStation: limited.length ? (limited[limited.length - 1].destination || stationName) : stationName,
      route: limited,
      totalDepartures: route.length,
      debug: {
        stationId,
        stationName,
        operationsCount: rawOps.length,
        date: dateParam,
        apiUrl: OPERATIONS_URL,
        rawSample: rawOps[0] || null,
      }
    });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchStations(search, env) {
  const url = `${STATIONS_URL}?search=${encodeURIComponent(search)}&pageSize=10`;
  const res = await plkFetch(url, env);
  if (!res.ok) throw new Error(`Stations API HTTP ${res.status}`);
  const data = await res.json();

  const list = Array.isArray(data?.stations) ? data.stations
    : Array.isArray(data?.data) ? data.data
    : Array.isArray(data) ? data
    : [];

  return list.map(s => ({
    id: s.id ?? s.stationId ?? s.sid,
    name: clean(s.name ?? s.stationName ?? s.label ?? ''),
    shortName: clean(s.shortName ?? ''),
  })).filter(s => s.id && s.name);
}

async function plkFetch(url, env) {
  const apiKey = env.PLK_API_KEY;
  const authType = env.PLK_AUTH_TYPE || 'x-api-key';

  const headers = { 'Accept': 'application/json' };
  if (authType === 'x-api-key') {
    headers['x-api-key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return fetch(url, { headers });
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

function mapOperationRow(op, stationId) {
  if (!op || typeof op !== 'object') return null;

  // Find the stop matching our station
  const stops = Array.isArray(op.stops) ? op.stops
    : Array.isArray(op.route) ? op.route
    : [];

  const stop = stops.find(s =>
    String(s.stationId ?? s.id ?? '') === String(stationId)
  ) || stops[0] || op;

  const scheduled = formatTime(
    stop.plannedDeparture ?? stop.plannedArrival ??
    stop.scheduledDeparture ?? stop.scheduledArrival ??
    op.plannedDeparture ?? op.plannedArrival ?? ''
  );

  const actual = formatTime(
    stop.actualDeparture ?? stop.actualArrival ??
    stop.realDeparture ?? stop.realArrival ??
    op.actualDeparture ?? op.actualArrival ??
    scheduled
  );

  const delayMinutes = Math.max(0,
    Number(stop.delayMinutes ?? stop.delay ?? op.delayMinutes ?? op.delay ?? 0) || calcDelay(scheduled, actual)
  );

  const carrierCode = clean(op.carrierCode ?? op.carrier ?? op.operatorCode ?? '');
  const trainNo = clean(op.trainNumber ?? op.trainNo ?? op.number ?? '');
  const trainName = clean(op.commercialName ?? op.trainName ?? op.name ?? '');
  const destination = clean(
    op.destinationStationName ?? op.destination ?? op.finalStation ??
    (stops.length ? (stops[stops.length - 1].stationName ?? '') : '') ?? ''
  );
  const platform = clean(stop.platform ?? stop.track ?? stop.platformNumber ?? op.platform ?? '');
  const via = buildVia(stops, stationId);
  const cancelled = op.cancelled === true || op.isCancelled === true || String(op.status ?? '').toLowerCase() === 'cancelled';

  const trainParts = [carrierCode, trainNo, trainName].filter(Boolean);
  const key = [scheduled, trainNo, destination].join('|');

  return {
    _key: key,
    station: clean(stop.stationName ?? op.stationName ?? ''),
    scheduled: scheduled || '—',
    actual: actual || scheduled || '—',
    delayMinutes,
    status: cancelled ? 'Odwołany' : (delayMinutes > 0 ? 'Opóźniony' : 'Punktualnie'),
    trainNumber: trainParts.join(' ') || '—',
    destination: destination || '—',
    carrier: expandCarrier(carrierCode),
    platform: platform || '—',
    via: via || '—',
  };
}

function mapScheduleRow(sched, stationId) {
  if (!sched || typeof sched !== 'object') return null;

  const stops = Array.isArray(sched.stops) ? sched.stops
    : Array.isArray(sched.route) ? sched.route
    : [];

  const stop = stops.find(s =>
    String(s.stationId ?? s.id ?? '') === String(stationId)
  ) || stops[0] || sched;

  const scheduled = formatTime(
    stop.plannedDeparture ?? stop.plannedArrival ??
    stop.departure ?? stop.arrival ??
    sched.plannedDeparture ?? ''
  );

  const carrierCode = clean(sched.carrierCode ?? sched.carrier ?? sched.operatorCode ?? '');
  const trainNo = clean(sched.trainNumber ?? sched.trainNo ?? sched.number ?? '');
  const trainName = clean(sched.commercialName ?? sched.trainName ?? sched.name ?? '');
  const destination = clean(
    sched.destinationStationName ?? sched.destination ?? sched.finalStation ??
    (stops.length ? (stops[stops.length - 1].stationName ?? '') : '') ?? ''
  );
  const platform = clean(stop.platform ?? stop.track ?? '');
  const via = buildVia(stops, stationId);

  const trainParts = [carrierCode, trainNo, trainName].filter(Boolean);
  const key = [scheduled, trainNo, destination].join('|');

  return {
    _key: key,
    station: clean(stop.stationName ?? sched.stationName ?? ''),
    scheduled: scheduled || '—',
    actual: scheduled || '—',
    delayMinutes: 0,
    status: 'Planowy',
    trainNumber: trainParts.join(' ') || '—',
    destination: destination || '—',
    carrier: expandCarrier(carrierCode),
    platform: platform || '—',
    via: via || '—',
  };
}

function buildVia(stops, stationId) {
  if (!stops.length) return '';
  const idx = stops.findIndex(s => String(s.stationId ?? s.id ?? '') === String(stationId));
  const after = idx >= 0 ? stops.slice(idx + 1, -1) : stops.slice(0, -1);
  return after.slice(0, 4).map(s => clean(s.stationName ?? '')).filter(Boolean).join(', ');
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function filterRouteByTime(route, trainTime) {
  const pivot = parseClock(trainTime);
  if (pivot === null) return route;
  return route.filter(row => {
    const t = parseClock(row.actual !== '—' ? row.actual : row.scheduled);
    return t === null || t >= pivot;
  });
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = row._key || [row.scheduled, row.trainNumber, row.destination].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function expandCarrier(code) {
  if (!code) return '—';
  const map = {
    IC: 'PKP Intercity', PR: 'Polregio', KM: 'Koleje Mazowieckie',
    KS: 'Koleje Śląskie', KD: 'Koleje Dolnośląskie', SKM: 'SKM Trójmiasto',
    ŁKA: 'Łódź Aglo.', WKD: 'WKD', MK: 'Małopolska', AR: 'Arriva',
  };
  return map[code.toUpperCase()] ?? code;
}

function calcDelay(scheduled, actual) {
  const s = parseClock(scheduled);
  const a = parseClock(actual);
  if (s === null || a === null) return 0;
  return Math.max(0, a - s);
}

function formatTime(value) {
  const str = String(value || '').trim();
  // ISO datetime: 2026-05-11T14:23:00
  const iso = str.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const hhmm = str.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
  return '';
}

function parseClock(value) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function clean(value) {
  return String(value ?? '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  });
}
