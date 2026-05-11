function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Api-Key'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders()
    }
  });
}

function clean(value) {
  return String(value || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalize(value) {
  return stripDiacritics(clean(value)).toLowerCase();
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
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

function buildHeaders(env, authType) {
  const headers = {};
  if (env.PLK_API_KEY) {
    if (authType === 'bearer') headers.Authorization = `Bearer ${env.PLK_API_KEY}`;
    else if (authType === 'x-api-key') headers['X-Api-Key'] = env.PLK_API_KEY;
    else if (authType === 'custom-header' && env.PLK_CUSTOM_HEADER) headers[env.PLK_CUSTOM_HEADER] = env.PLK_API_KEY;
  }
  return headers;
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  const data = safeJson(text);
  if (!res.ok || !data) throw new Error(`HTTP ${res.status} for ${url}`);
  return data;
}

function extractStations(data) {
  if (Array.isArray(data)) return data;
  return toArray(data?.stations).length ? data.stations
    : toArray(data?.items).length ? data.items
    : toArray(data?.data).length ? data.data
    : toArray(data?.results);
}

function pickStation(data, query) {
  const items = extractStations(data);
  const needle = normalize(query);
  return items.find((item) => normalize(firstDefined(item.name, item.stationName, item.label, item.description)) === needle)
    || items.find((item) => normalize(firstDefined(item.name, item.stationName, item.label, item.description)).includes(needle))
    || items[0]
    || null;
}

function extractSchedules(payload) {
  if (Array.isArray(payload?.schedules)) return payload.schedules;
  if (Array.isArray(payload?.data?.schedules)) return payload.data.schedules;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  return [];
}

function extractOperations(payload) {
  if (Array.isArray(payload?.operations)) return payload.operations;
  if (Array.isArray(payload?.trains)) return payload.trains;
  if (Array.isArray(payload?.data?.operations)) return payload.data.operations;
  if (Array.isArray(payload?.data?.trains)) return payload.data.trains;
  if (Array.isArray(payload)) return payload;
  return [];
}

function extractStops(entity) {
  const candidates = [
    entity?.stations,
    entity?.timetable?.stations,
    entity?.timetable,
    entity?.stops,
    entity?.route,
    entity?.locations,
    entity?.events,
    entity?.stationTimes,
    entity?.stationStops,
    entity?.path
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
    if (candidate && Array.isArray(candidate.stations) && candidate.stations.length) return candidate.stations;
  }
  return [];
}

function resolveStationName(stop, fallback) {
  return clean(firstDefined(stop?.stationName, stop?.name, stop?.stationLabel, stop?.station, fallback));
}

function stopMatches(stop, stationId, stationName) {
  const ids = [stop?.stationId, stop?.station, stop?.id, stop?.stationCode, stop?.uic].map((v) => clean(v));
  if (ids.includes(clean(stationId))) return true;
  return normalize(resolveStationName(stop, '')) === normalize(stationName);
}

function getScheduledFromStop(stop) {
  return formatTime(firstDefined(
    stop?.plannedDeparture,
    stop?.scheduledDeparture,
    stop?.advertisedDeparture,
    stop?.departureTime,
    stop?.plannedArrival,
    stop?.scheduledArrival,
    stop?.advertisedArrival,
    stop?.arrivalTime
  ));
}

function getActualFromStop(stop, fallback) {
  return formatTime(firstDefined(
    stop?.actualDeparture,
    stop?.updatedDepartureTime,
    stop?.estimatedDepartureTime,
    stop?.actualArrival,
    stop?.updatedArrivalTime,
    stop?.estimatedArrivalTime,
    stop?.realDeparture,
    stop?.realArrival,
    fallback
  ));
}

function parseDelayValue(value) {
  const text = clean(value);
  if (!text) return null;
  const num = Number(text.replace(/[^\d-]/g, ''));
  return Number.isFinite(num) ? Math.abs(num) : null;
}

function computeDelay(stop, operation, planned, actual) {
  const raw = firstDefined(
    stop?.delayMinutes,
    stop?.delay,
    stop?.departureDelay,
    stop?.arrivalDelay,
    stop?.minutesDelay,
    stop?.delayInMinutes,
    operation?.delayMinutes,
    operation?.delay,
    operation?.minutesDelay
  );
  const direct = parseDelayValue(raw);
  if (direct !== null) return direct;
  const p = parseClock(planned);
  const a = parseClock(actual);
  if (p === null || a === null) return 0;
  return Math.max(0, a - p);
}

function extractTrainDisplay(schedule, operation) {
  const category = clean(firstDefined(
    operation?.commercialOperator,
    operation?.categoryCommercialName,
    operation?.categoryName,
    operation?.category,
    schedule?.commercialOperator,
    schedule?.categoryCommercialName,
    schedule?.categoryName,
    schedule?.category
  ));
  const number = clean(firstDefined(
    operation?.commercialNumber,
    operation?.publicTrainNumber,
    operation?.marketingNumber,
    operation?.trainNumber,
    schedule?.commercialNumber,
    schedule?.publicTrainNumber,
    schedule?.marketingNumber,
    schedule?.trainNumber
  ));
  const name = clean(firstDefined(
    operation?.commercialName,
    operation?.marketingName,
    operation?.trainName,
    schedule?.commercialName,
    schedule?.marketingName,
    schedule?.trainName,
    schedule?.name
  ));
  return [category, number, name].filter(Boolean).join(' ') || '—';
}

function extractCarrier(schedule, operation) {
  const raw = clean(firstDefined(
    operation?.carrierName,
    operation?.carrier,
    operation?.operatorName,
    operation?.operator,
    schedule?.carrierName,
    schedule?.carrier,
    schedule?.operatorName,
    schedule?.operator,
    operation?.commercialOperator,
    schedule?.commercialOperator
  ));
  if (!raw) return '—';
  if (/^IC$/i.test(raw)) return 'PKP Intercity';
  if (/^PR$/i.test(raw)) return 'Polregio';
  if (/^KM$/i.test(raw)) return 'Koleje Mazowieckie';
  if (/^KS$/i.test(raw)) return 'Koleje Śląskie';
  return raw;
}

function extractPlatform(scheduleStop, operationStop) {
  return clean(firstDefined(
    operationStop?.platform,
    operationStop?.platformNumber,
    operationStop?.departurePlatform,
    operationStop?.arrivalPlatform,
    operationStop?.track,
    scheduleStop?.platform,
    scheduleStop?.platformNumber,
    scheduleStop?.departurePlatform,
    scheduleStop?.arrivalPlatform,
    scheduleStop?.track
  )) || '—';
}

function extractDestination(scheduleStops, operationStops, index, stationName) {
  const merged = operationStops.length ? operationStops : scheduleStops;
  for (let i = merged.length - 1; i > index; i--) {
    const name = resolveStationName(merged[i], '');
    if (name && normalize(name) !== normalize(stationName)) return name;
  }
  return '—';
}

function extractVia(scheduleStops, operationStops, index, stationName, destination) {
  const merged = operationStops.length ? operationStops : scheduleStops;
  const names = [];
  for (let i = index + 1; i < merged.length; i++) {
    const name = resolveStationName(merged[i], '');
    if (!name) continue;
    if (normalize(name) === normalize(stationName)) continue;
    if (normalize(name) === normalize(destination)) break;
    if (!names.some((item) => normalize(item) === normalize(name))) names.push(name);
    if (names.length >= 4) break;
  }
  return names.join(' • ') || '—';
}

function normalizeStatus(operation, delayMinutes) {
  const raw = clean(firstDefined(operation?.trainStatus, operation?.status, operation?.operatingStatus));
  const upper = raw.toUpperCase();
  if (['DONE', 'COMPLETED', 'S'].includes(upper)) return 'Zrealizowano';
  if (['IN_PROGRESS', 'RUNNING', 'C'].includes(upper)) return 'W ruchu';
  if (['DELAYED', 'LATE'].includes(upper)) return 'Opóźniony';
  if (['ON_TIME', 'ONTIME'].includes(upper)) return 'Punktualnie';
  return delayMinutes > 0 ? 'Opóźniony' : 'W ruchu';
}

function buildScheduleIndex(schedules) {
  const map = new Map();
  for (const item of schedules) {
    const keys = [
      [clean(item?.scheduleId), clean(item?.orderId), clean(item?.operatingDate)].join('|'),
      [clean(item?.trainNumber), clean(item?.operatingDate)].join('|')
    ];
    for (const key of keys) if (key !== '||' && key !== '|') map.set(key, item);
  }
  return map;
}

function findMatchingSchedule(operation, scheduleIndex) {
  const keys = [
    [clean(operation?.scheduleId), clean(operation?.orderId), clean(operation?.operatingDate)].join('|'),
    [clean(operation?.trainNumber), clean(operation?.operatingDate)].join('|')
  ];
  for (const key of keys) {
    if (scheduleIndex.has(key)) return scheduleIndex.get(key);
  }
  return null;
}

function buildRouteRows(stationId, stationName, schedulesPayload, operationsPayload) {
  const schedules = extractSchedules(schedulesPayload);
  const operations = extractOperations(operationsPayload);
  const scheduleIndex = buildScheduleIndex(schedules);
  const rows = [];

  for (const operation of operations) {
    const schedule = findMatchingSchedule(operation, scheduleIndex);
    const scheduleStops = extractStops(schedule || {});
    const operationStops = extractStops(operation || {});
    const mergedStops = operationStops.length ? operationStops : scheduleStops;
    const index = mergedStops.findIndex((stop) => stopMatches(stop, stationId, stationName));
    if (index === -1) continue;

    const operationStop = operationStops[index] || mergedStops[index] || {};
    const scheduleStop = scheduleStops[index] || mergedStops[index] || {};
    const planned = getScheduledFromStop(scheduleStop) || getScheduledFromStop(operationStop);
    const actual = getActualFromStop(operationStop, planned) || planned;
    const delayMinutes = computeDelay(operationStop, operation, planned, actual);
    const destination = extractDestination(scheduleStops, operationStops, index, stationName);
    const via = extractVia(scheduleStops, operationStops, index, stationName, destination);

    rows.push({
      station: stationName,
      scheduled: planned || '—',
      actual: actual || planned || '—',
      delayMinutes,
      status: normalizeStatus(operation, delayMinutes),
      trainNumber: extractTrainDisplay(schedule || {}, operation || {}),
      destination,
      carrier: extractCarrier(schedule || {}, operation || {}),
      platform: extractPlatform(scheduleStop, operationStop),
      via,
      scheduleId: clean(firstDefined(operation?.scheduleId, schedule?.scheduleId)),
      orderId: clean(firstDefined(operation?.orderId, schedule?.orderId)),
      operatingDate: clean(firstDefined(operation?.operatingDate, schedule?.operatingDate))
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
  return route.filter((row) => {
    const candidate = parseClock(row.actual || row.scheduled);
    return candidate === null || candidate >= pivot;
  });
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [row.scheduleId, row.orderId, row.operatingDate, row.trainNumber, row.scheduled, row.destination].join('|');
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
    const apiBase = normalizeBaseUrl(env.PLK_API_BASE || 'https://pdp-api.plk-sa.pl/api/v1');
    const headers = buildHeaders(env, (env.PLK_AUTH_TYPE || 'x-api-key').toLowerCase());

    const stationsUrl = new URL(`${apiBase}/dictionaries/stations`);
    stationsUrl.searchParams.set('search', query);
    const stationPayload = await fetchJson(stationsUrl.toString(), headers);
    const matchedStation = pickStation(stationPayload, query);
    if (!matchedStation) return json({ error: 'Station not found', stationQuery: query }, 404);

    const stationId = clean(firstDefined(matchedStation.id, matchedStation.stationId, matchedStation.value, matchedStation.code, matchedStation.uic));
    const stationName = clean(firstDefined(matchedStation.name, matchedStation.stationName, matchedStation.label, matchedStation.description, query));

    const schedulesUrl = new URL(`${apiBase}/schedules`);
    schedulesUrl.searchParams.set('stations', stationId);
    if (trainDate) schedulesUrl.searchParams.set('date', normalizeDateForApi(trainDate));

    const operationsUrl = new URL(`${apiBase}/operations`);
    operationsUrl.searchParams.set('stations', stationId);
    operationsUrl.searchParams.set('withPlanned', 'true');
    if (trainDate) operationsUrl.searchParams.set('date', normalizeDateForApi(trainDate));

    const [schedulesPayload, operationsPayload] = await Promise.all([
      fetchJson(schedulesUrl.toString(), headers),
      fetchJson(operationsUrl.toString(), headers)
    ]);

    let route = buildRouteRows(stationId, stationName, schedulesPayload, operationsPayload);
    route = dedupeRows(filterRouteByTime(route, trainTime));

    const delayMinutes = Math.max(0, ...route.map((row) => Number(row.delayMinutes) || 0), 0);

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
        schedulesCount: extractSchedules(schedulesPayload).length,
        operationsCount: extractOperations(operationsPayload).length,
        sampleSchedule: extractSchedules(schedulesPayload)[0] || null,
        sampleOperation: extractOperations(operationsPayload)[0] || null,
        firstRow: route[0] || null
      }
    });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
}
