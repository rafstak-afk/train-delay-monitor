export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const stationName = clean(body.stationName || body.stationQuery || body.station || '');
    const trainNumber = clean(body.trainNumber || '');
    const trainDate = clean(body.trainDate || body.date || '');
    const trainTime = clean(body.trainTime || body.time || '');
    const autoQuery = clean(body.query || body.input || '');
    const detectedMode = trainNumber ? 'train' : (stationName ? 'station' : detectQueryType(autoQuery));
    const finalTrainNumber = trainNumber || (detectedMode === 'train' ? autoQuery : '');
    const finalStationName = stationName || (detectedMode === 'station' ? autoQuery : '');
    const mode = finalTrainNumber ? 'train' : 'station';

    const apiBase = normalizeBaseUrl(env.PLK_API_BASE || 'https://pdp-api.plk-sa.pl/api/v1');
    const authType = (env.PLK_AUTH_TYPE || 'x-api-key').toLowerCase();
    const headers = buildHeaders(env, authType);

    if (mode === 'train') {
      return await handleTrainMode({ apiBase, headers, trainNumber: finalTrainNumber, trainDate, trainTime });
    }

    if (!finalStationName) {
      return json({ error: 'Missing stationName' }, 400);
    }

    return await handleStationMode({ apiBase, headers, stationName: finalStationName, trainDate, trainTime });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
}

async function handleStationMode({ apiBase, headers, stationName, trainDate, trainTime }) {
  const dictionaryData = await fetchStationDictionary(apiBase, headers, stationName);
  const matchedStation = pickStation(dictionaryData, stationName);

  if (!matchedStation) {
    return json({ mode: 'station', error: 'Station not found', stationQuery: stationName }, 404);
  }

  const stationId = clean(firstDefined(matchedStation.id, matchedStation.stationId, matchedStation.value, matchedStation.code, matchedStation.uic));
  if (!stationId) {
    return json({ mode: 'station', error: 'Matched station has no stationId', matchedStation }, 502);
  }

  const operationsUrl = new URL(`${apiBase}/operations`);
  operationsUrl.searchParams.set('stations', stationId);
  if (trainDate) operationsUrl.searchParams.set('date', normalizeDateForApi(trainDate));

  const upstream = await fetch(operationsUrl.toString(), { method: 'GET', headers });
  const text = await upstream.text();
  const payload = safeJson(text);

  if (!upstream.ok || !payload) {
    return json({
      mode: 'station',
      error: `Operations HTTP ${upstream.status}`,
      stationQuery: stationName,
      matchedStation: matchedStation.name || stationName,
      matchedStationId: stationId,
      debug: { rawText: text.slice(0, 4000) }
    }, 502);
  }

  const stationMap = buildStationMap(payload?.stations, extractStations(dictionaryData));
  let route = parseOperationsForStation(payload, stationId, matchedStation.name || matchedStation.stationName || stationName, stationMap);
  route = filterRouteByTime(route, trainTime);
  const delayMinutes = Math.max(0, ...route.map((row) => Number(row.delayMinutes) || 0), 0);

  return json({
    mode: 'station',
    matchedStation: resolveStationName(stationId, stationMap, matchedStation.name || matchedStation.stationName || stationName),
    matchedStationId: toMaybeNumber(stationId),
    stationPortalUrl: buildPortalUrl(matchedStation.name || matchedStation.stationName || stationName),
    fullTimetableUrl: `https://l.plk-sa.pl/${stationId}`,
    delayMinutes,
    status: route.length ? (delayMinutes > 0 ? 'DELAYED' : 'ON_TIME') : 'NO_DATA',
    lastStation: resolveStationName(stationId, stationMap, matchedStation.name || stationName),
    trainNumber: route[0]?.trainNumber || '',
    route: route.slice(0, 20),
    totalDepartures: route.length,
    debug: {
      dictionaryCount: extractStations(dictionaryData).length,
      trainsInPayload: Array.isArray(payload?.trains) ? payload.trains.length : 0,
      payloadKeys: Object.keys(payload || {}).slice(0, 30)
    }
  });
}

async function handleTrainMode({ apiBase, headers, trainNumber, trainDate, trainTime }) {
  const url = new URL(`${apiBase}/operations`);
  url.searchParams.set('trainNumber', trainNumber);
  if (trainDate) url.searchParams.set('date', normalizeDateForApi(trainDate));

  const upstream = await fetch(url.toString(), { method: 'GET', headers });
  const text = await upstream.text();
  const payload = safeJson(text);

  if (!upstream.ok || !payload) {
    return json({ mode: 'train', error: `Operations HTTP ${upstream.status}`, trainNumber, trainDate }, 502);
  }

  const stationMap = buildStationMap(payload?.stations, []);
  let route = parseOperationsForTrain(payload, stationMap);
  route = filterRouteByTime(route, trainTime);
  const delayMinutes = Math.max(0, ...route.map((row) => Number(row.delayMinutes) || 0), 0);
  const lastStation = route.length ? route[route.length - 1].station : '';
  const stationForPortal = route[0]?.station || '';

  return json({
    mode: 'train',
    trainNumber,
    trainDate,
    trainTime,
    stationPortalUrl: stationForPortal ? buildPortalUrl(stationForPortal) : '',
    delayMinutes,
    status: route.length ? (delayMinutes > 0 ? 'DELAYED' : 'ON_TIME') : 'NO_DATA',
    lastStation,
    route: route.slice(0, 20),
    totalStops: route.length,
    debug: {
      trainsInPayload: Array.isArray(payload?.trains) ? payload.trains.length : 0,
      payloadKeys: Object.keys(payload || {}).slice(0, 30)
    }
  });
}

async function fetchStationDictionary(apiBase, headers, stationName) {
  const attempts = [stationName, stripDiacritics(stationName)].filter((value, index, array) => value && array.indexOf(value) === index);
  let lastData = null;
  for (const query of attempts) {
    const url = new URL(`${apiBase}/dictionaries/stations`);
    url.searchParams.set('search', query);
    const res = await fetch(url.toString(), { method: 'GET', headers });
    const text = await res.text();
    if (!res.ok) throw new Error(`Station dictionary HTTP ${res.status}: ${text}`);
    const data = safeJson(text);
    if (!data) throw new Error('Invalid station dictionary response');
    lastData = data;
    if (extractStations(data).length) return data;
  }
  return lastData || { stations: [] };
}

function parseOperationsForStation(payload, targetStationId, targetStationName, stationMap) {
  const trains = Array.isArray(payload?.trains) ? payload.trains : [];
  const rows = [];
  for (const train of trains) {
    const stops = extractStops(train);
    const stop = stops.find((entry) => stationMatch(entry, targetStationId, targetStationName, stationMap));
    if (!stop) continue;
    rows.push(buildRow({ train, stop, stops, stationMap }));
  }
  return rows
    .filter((row) => row.station || row.scheduled || row.actual || row.trainNumber || row.destination)
    .sort((a, b) => sortableTime(a.scheduled || a.actual) - sortableTime(b.scheduled || b.actual));
}

function parseOperationsForTrain(payload, stationMap) {
  const trains = Array.isArray(payload?.trains) ? payload.trains : [];
  const rows = [];
  for (const train of trains) {
    const stops = extractStops(train);
    for (const stop of stops) rows.push(buildRow({ train, stop, stops, stationMap }));
  }
  return rows.filter((row) => row.station || row.scheduled || row.actual || row.trainNumber || row.destination);
}

function buildRow({ train, stop, stops, stationMap }) {
  const idx = Math.max(0, stops.indexOf(stop));
  const destinationStop = stops[stops.length - 1] || {};
  const stationId = firstDefined(stop.stationId, stop.station, stop.id, stop.stationCode);
  const destinationId = firstDefined(destinationStop.stationId, destinationStop.station, destinationStop.id, destinationStop.stationCode);
  const station = resolveStationName(stationId, stationMap, firstDefined(stop.stationName, stop.name, stop.stationLabel, stop.station));
  const scheduled = extractScheduled(stop);
  const actual = extractActual(stop, scheduled);
  const delayMinutes = extractDelay(stop, scheduled, actual);

  return {
    station,
    scheduled,
    actual,
    delayMinutes,
    status: normalizeStatus(firstDefined(stop.trainStatus, stop.status, train.trainStatus), delayMinutes),
    trainNumber: normalizeTrainNumber(firstDefined(
      train.commercialNumber,
      train.commercialNo,
      train.publicTrainNumber,
      train.displayNumber,
      train.trainNumber,
      stop.trainNumber,
      stop.commercialNumber,
      train.number,
      train.name,
      train.orderId,
      train.trainOrderId
    )),
    destination: resolveStationName(destinationId, stationMap, firstDefined(destinationStop.stationName, destinationStop.name, destinationStop.stationLabel, destinationStop.station)),
    carrier: normalizeCarrier(firstDefined(
      train.carrierName,
      train.carrier,
      train.operatorName,
      train.operator,
      train.brand,
      train.categoryCommercialName,
      train.categoryName,
      train.category,
      stop.carrier,
      stop.operator
    )),
    platform: firstDefined(
      stop.platform,
      stop.platformNumber,
      stop.platformNo,
      stop.departurePlatform,
      stop.arrivalPlatform,
      stop.track,
      stop.trackNumber,
      stop.peron,
      stop.sector
    ),
    via: stops.slice(idx + 1, idx + 4)
      .map((entry) => resolveStationName(firstDefined(entry.stationId, entry.station, entry.id, entry.stationCode), stationMap, firstDefined(entry.stationName, entry.name, entry.stationLabel, entry.station)))
      .filter(Boolean)
      .join(' • ')
  };
}

function buildStationMap(payloadStations, dictionaryStations) {
  const map = new Map();
  if (payloadStations && typeof payloadStations === 'object' && !Array.isArray(payloadStations)) {
    for (const [key, value] of Object.entries(payloadStations)) {
      if (typeof value === 'string') map.set(String(key), value);
      else {
        const id = String(firstDefined(value?.id, value?.stationId, key));
        const name = firstDefined(value?.name, value?.stationName, value?.label, value?.description, key);
        if (id && name) map.set(id, name);
      }
    }
  }
  for (const item of dictionaryStations || []) {
    const id = String(firstDefined(item?.id, item?.stationId, item?.value, item?.code, item?.uic));
    const name = firstDefined(item?.name, item?.stationName, item?.label, item?.description);
    if (id && name && !map.has(id)) map.set(id, name);
  }
  return map;
}

function resolveStationName(stationId, stationMap, fallback = '') {
  const key = clean(stationId);
  if (key && stationMap?.has(key)) return stationMap.get(key);
  return clean(fallback);
}

function extractStops(train) {
  const candidates = [train?.stations, train?.timetable, train?.stops, train?.route, train?.locations, train?.events];
  for (const candidate of candidates) if (Array.isArray(candidate) && candidate.length) return candidate;
  return [];
}

function stationMatch(entry, targetStationId, targetStationName, stationMap) {
  const candidates = [entry?.stationId, entry?.station, entry?.id, entry?.stationCode, entry?.stationUIC, entry?.stationInternalId].map((value) => String(value ?? ''));
  if (candidates.includes(String(targetStationId))) return true;
  const names = [
    entry?.stationName,
    entry?.name,
    entry?.stationLabel,
    resolveStationName(firstDefined(entry?.stationId, entry?.station, entry?.id, entry?.stationCode), stationMap, entry?.station)
  ].map((value) => normalize(value)).filter(Boolean);
  return names.includes(normalize(targetStationName));
}

function extractScheduled(stop) {
  return formatTime(firstDefined(stop.plannedDeparture, stop.plannedArrival, stop.departureTime, stop.arrivalTime, stop.planDeparture, stop.planArrival, stop.scheduledDeparture, stop.scheduledArrival, stop.time, stop.planTime, stop.scheduledTime, stop.actualDeparture, stop.actualArrival));
}

function extractActual(stop, fallback) {
  return formatTime(firstDefined(stop.actualDeparture, stop.actualArrival, stop.estimatedDepartureTime, stop.updatedDepartureTime, stop.actualDepartureTime, stop.estimatedArrivalTime, stop.updatedArrivalTime, stop.actualArrivalTime, stop.realDeparture, stop.realArrival, stop.actualTime, stop.realTime, fallback));
}

function extractDelay(stop, planned, actual) {
  const raw = firstDefined(stop.delayMinutes, stop.delay, stop.departureDelay, stop.arrivalDelay, '');
  if (String(raw).trim()) {
    const num = Number(String(raw).replace(/[^\d-]/g, ''));
    if (Number.isFinite(num)) return Math.abs(num);
  }
  const p = parseClock(planned);
  const a = parseClock(actual);
  if (p === null || a === null) return 0;
  return Math.max(0, a - p);
}

function filterRouteByTime(route, trainTime) {
  const pivot = parseClock(trainTime);
  if (pivot === null) return route;
  return route.filter((row) => {
    const candidate = parseClock(row.actual || row.scheduled);
    return candidate === null || candidate >= pivot;
  });
}

function normalizeCarrier(value) {
  const text = clean(value);
  if (!text) return '';
  if (/^IC$/i.test(text)) return 'PKP Intercity';
  if (/^PR$/i.test(text)) return 'Polregio';
  if (/^KM$/i.test(text)) return 'Koleje Mazowieckie';
  return text;
}

function normalizeStatus(rawStatus, delayMinutes) {
  const text = clean(rawStatus).toUpperCase();
  if (text) return text;
  return delayMinutes > 0 ? 'DELAYED' : 'ON_TIME';
}

function pickStation(data, query) {
  const items = extractStations(data);
  if (!items.length) return null;
  const normalizedQuery = normalize(query);
  return items.find((item) => normalize(firstDefined(item.name, item.stationName, item.label, item.description)) === normalizedQuery)
    || items.find((item) => normalize(firstDefined(item.name, item.stationName, item.label, item.description)).includes(normalizedQuery))
    || items[0];
}

function extractStations(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizeTrainNumber(value) {
  const text = clean(value);
  if (!text) return '';
  const match = text.match(/([A-Z]{1,4}\s?\d{1,6}|\d{2,9})/);
  return match ? match[1].replace(/\s+/g, ' ').trim() : text;
}

function normalizeDateForApi(value) {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return text;
}

function buildPortalUrl(stationName) {
  return stationName ? `https://portalpasazera.pl/KatalogiStacji?stacja=${encodeURIComponent(stationName)}` : '';
}

function detectQueryType(value) {
  const text = clean(value);
  if (/^\d{2,10}$/.test(text)) return 'train';
  if (/^[A-Z]{1,4}\d{1,6}$/i.test(text)) return 'train';
  return 'station';
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

function clean(value) {
  return String(value || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalize(value) {
  return stripDiacritics(clean(value)).toLowerCase();
}

function formatTime(value) {
  const str = String(value || '').trim();
  const iso = str.match(/T(\d{2}:\d{2})(?::\d{2})?/);
  if (iso) return iso[1];
  const hhmm = str.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
  return '';
}

function parseClock(value) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function sortableTime(value) {
  const parsed = parseClock(value);
  return parsed === null ? 999999 : parsed;
}

function firstDefined(...values) {
  for (const value of values) if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  return '';
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function toMaybeNumber(value) {
  const num = Number(value);
  return Number.isNaN(num) ? value : num;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
