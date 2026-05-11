export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const query = clean(body.query || body.stationName || body.station || '');
    const trainDate = clean(body.trainDate || body.date || '');
    const trainTime = clean(body.trainTime || body.time || '');
    const apiBase = normalizeBaseUrl(env.PLK_API_BASE || 'https://pdp-api.plk-sa.pl/api/v1');
    const headers = buildHeaders(env, (env.PLK_AUTH_TYPE || 'x-api-key').toLowerCase());

    if (!query) return json({ error: 'Missing query' }, 400);

    const dictionaryData = await fetchStationDictionary(apiBase, headers, query);
    const matchedStation = pickStation(dictionaryData, query);
    if (!matchedStation) return json({ error: 'Station not found', stationQuery: query }, 404);

    const stationId = clean(firstDefined(matchedStation.id, matchedStation.stationId, matchedStation.value, matchedStation.code, matchedStation.uic));
    if (!stationId) return json({ error: 'Matched station has no stationId', matchedStation }, 502);

    const operationsUrl = new URL(`${apiBase}/operations`);
    operationsUrl.searchParams.set('stations', stationId);
    if (trainDate) operationsUrl.searchParams.set('date', normalizeDateForApi(trainDate));

    const upstream = await fetch(operationsUrl.toString(), { method: 'GET', headers });
    const text = await upstream.text();
    const payload = safeJson(text);
    if (!upstream.ok || !payload) return json({ error: `Operations HTTP ${upstream.status}` }, 502);

    const stationMap = buildStationMap(payload, extractStations(dictionaryData));
    let route = parseOperationsForStation(payload, stationId, matchedStation.name || matchedStation.stationName || query, stationMap);
    route = dedupeRows(filterRouteByTime(route, trainTime));

    const delayMinutes = Math.max(0, ...route.map((row) => Number(row.delayMinutes) || 0), 0);
    const matchedStationName = resolveStationName(stationId, stationMap, matchedStation.name || matchedStation.stationName || query);
    const debug = buildDebug(payload, route);

    return json({
      matchedStation: matchedStationName,
      matchedStationId: toMaybeNumber(stationId),
      fullTimetableUrl: `https://portalpasazera.pl/Wyswietlacz?sid=${encodeURIComponent(stationId)}`,
      delayMinutes,
      status: route.length ? (delayMinutes > 0 ? 'DELAYED' : 'ON_TIME') : 'NO_DATA',
      lastStation: route.length ? route[route.length - 1].station : matchedStationName,
      route: route.slice(0, 20),
      totalDepartures: route.length,
      debug
    });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
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
  const trains = extractTrains(payload);
  const rows = [];
  for (const train of trains) {
    const stops = extractStops(train, payload);
    const currentIndex = stops.findIndex((entry) => stationMatch(entry, targetStationId, targetStationName, stationMap));
    if (currentIndex === -1) continue;
    const stop = stops[currentIndex];
    const anchorName = resolveStationName(targetStationId, stationMap, targetStationName);
    const destination = findDestinationName(stops, currentIndex, stationMap, anchorName);
    const via = findViaNames(stops, currentIndex, stationMap, anchorName, destination);
    const scheduled = extractScheduled(stop);
    const actual = extractActual(stop, scheduled);
    const delayMinutes = extractDelay(stop, train, scheduled, actual);
    const station = resolveStationName(firstDefined(stop.stationId, stop.station, stop.id, stop.stationCode), stationMap, anchorName);
    rows.push({
      station,
      scheduled,
      actual,
      delayMinutes,
      status: normalizeStatus(firstDefined(stop.trainStatus, stop.status, train.trainStatus, train.status), delayMinutes),
      trainNumber: extractDisplayTrain(train, stop),
      destination,
      carrier: extractCarrier(train, stop),
      platform: extractPlatform(stop),
      via
    });
  }
  return rows.sort((a, b) => sortableTime(a.scheduled || a.actual) - sortableTime(b.scheduled || b.actual));
}

function extractTrains(payload) {
  if (Array.isArray(payload?.trains)) return payload.trains;
  if (Array.isArray(payload?.operations)) return payload.operations;
  if (Array.isArray(payload?.data?.trains)) return payload.data.trains;
  if (Array.isArray(payload?.data?.operations)) return payload.data.operations;
  return [];
}

function extractStops(train, payload) {
  const candidates = [
    train?.stations,
    train?.timetable,
    train?.stops,
    train?.route,
    train?.locations,
    train?.events,
    train?.stationTimes,
    train?.stationStops,
    train?.path
  ];
  for (const candidate of candidates) if (Array.isArray(candidate) && candidate.length) return candidate;
  if (Array.isArray(payload?.stationsTimeline)) return payload.stationsTimeline;
  return [];
}

function buildStationMap(payload, dictionaryStations) {
  const map = new Map();
  const candidates = [payload?.stations, payload?.data?.stations, payload?.dictionary?.stations, payload?.stationDictionary];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const id = clean(firstDefined(item?.id, item?.stationId, item?.value, item?.code, item?.uic));
        const name = clean(firstDefined(item?.name, item?.stationName, item?.label, item?.description));
        if (id && name) map.set(id, name);
      }
    } else if (candidate && typeof candidate === 'object') {
      for (const [key, value] of Object.entries(candidate)) {
        if (typeof value === 'string') map.set(clean(key), clean(value));
        else {
          const id = clean(firstDefined(value?.id, value?.stationId, key));
          const name = clean(firstDefined(value?.name, value?.stationName, value?.label, value?.description));
          if (id && name) map.set(id, name);
        }
      }
    }
  }
  for (const item of dictionaryStations || []) {
    const id = clean(firstDefined(item?.id, item?.stationId, item?.value, item?.code, item?.uic));
    const name = clean(firstDefined(item?.name, item?.stationName, item?.label, item?.description));
    if (id && name && !map.has(id)) map.set(id, name);
  }
  return map;
}

function stationMatch(entry, targetStationId, targetStationName, stationMap) {
  const ids = [entry?.stationId, entry?.station, entry?.id, entry?.stationCode, entry?.stationUIC, entry?.stationInternalId].map((value) => clean(value));
  if (ids.includes(clean(targetStationId))) return true;
  const names = [
    entry?.stationName,
    entry?.name,
    entry?.stationLabel,
    resolveStationName(firstDefined(entry?.stationId, entry?.station, entry?.id, entry?.stationCode), stationMap, entry?.station)
  ].map(normalize).filter(Boolean);
  return names.includes(normalize(targetStationName));
}

function resolveStationName(stationId, stationMap, fallback = '') {
  const key = clean(stationId);
  if (key && stationMap?.has(key)) return clean(stationMap.get(key));
  return clean(fallback);
}

function findDestinationName(stops, currentIndex, stationMap, anchorName) {
  const explicit = stops[currentIndex]?.destinationName || stops[currentIndex]?.destination || stops[currentIndex]?.finalStationName || '';
  if (clean(explicit) && normalize(explicit) !== normalize(anchorName)) return clean(explicit);
  for (let i = stops.length - 1; i > currentIndex; i--) {
    const stop = stops[i];
    const name = resolveStationName(firstDefined(stop?.stationId, stop?.station, stop?.id, stop?.stationCode), stationMap, firstDefined(stop?.stationName, stop?.name, stop?.stationLabel));
    if (name && normalize(name) !== normalize(anchorName)) return name;
  }
  return '—';
}

function findViaNames(stops, currentIndex, stationMap, anchorName, destination) {
  const names = [];
  for (let i = currentIndex + 1; i < stops.length; i++) {
    const stop = stops[i];
    const name = resolveStationName(firstDefined(stop?.stationId, stop?.station, stop?.id, stop?.stationCode), stationMap, firstDefined(stop?.stationName, stop?.name, stop?.stationLabel));
    if (!name) continue;
    if (normalize(name) === normalize(anchorName)) continue;
    if (normalize(name) === normalize(destination)) break;
    if (!names.some((item) => normalize(item) === normalize(name))) names.push(name);
    if (names.length >= 4) break;
  }
  return names.join(' • ');
}

function extractDisplayTrain(train, stop) {
  const category = clean(firstDefined(
    train?.commercialOperator,
    train?.categoryCommercialName,
    train?.categoryName,
    train?.category,
    stop?.commercialOperator,
    stop?.trainCategory,
    stop?.category,
    train?.brand,
    train?.carrierCode
  ));
  const number = clean(firstDefined(
    train?.commercialNumber,
    train?.publicTrainNumber,
    train?.marketingNumber,
    train?.displayNumber,
    stop?.commercialNumber,
    stop?.publicTrainNumber,
    stop?.marketingNumber,
    train?.trainNumber,
    stop?.trainNumber
  ));
  const name = clean(firstDefined(
    train?.commercialName,
    train?.marketingName,
    train?.trainName,
    train?.nameCommercial,
    stop?.commercialName,
    stop?.trainName,
    train?.name
  ));
  const shortNumber = normalizeTrainNumber(number);
  const parts = [category, shortNumber, name].filter(Boolean);
  if (parts.length) return parts.join(' ');
  const fallback = clean(firstDefined(train?.trainNumber, stop?.trainNumber, train?.id));
  return /^\d{7,}$/.test(fallback) ? '—' : fallback || '—';
}

function extractCarrier(train, stop) {
  const raw = clean(firstDefined(train?.carrierName, train?.carrier, train?.operatorName, train?.operator, stop?.carrierName, stop?.carrier, stop?.operatorName, train?.commercialOperator, train?.brand));
  if (!raw) return '—';
  if (/^PR$/i.test(raw)) return 'Polregio';
  if (/^IC$/i.test(raw)) return 'PKP Intercity';
  if (/^KM$/i.test(raw)) return 'Koleje Mazowieckie';
  return raw;
}

function extractPlatform(stop) {
  return clean(firstDefined(stop?.platform, stop?.platformNumber, stop?.platformNo, stop?.departurePlatform, stop?.arrivalPlatform, stop?.track, stop?.trackNumber, stop?.peron, stop?.sector)) || '—';
}

function extractScheduled(stop) {
  return formatTime(firstDefined(stop?.plannedDeparture, stop?.plannedArrival, stop?.departureTime, stop?.arrivalTime, stop?.planDeparture, stop?.planArrival, stop?.scheduledDeparture, stop?.scheduledArrival, stop?.advertisedDeparture, stop?.advertisedArrival));
}

function extractActual(stop, fallback) {
  return formatTime(firstDefined(stop?.actualDeparture, stop?.actualArrival, stop?.estimatedDepartureTime, stop?.updatedDepartureTime, stop?.actualDepartureTime, stop?.estimatedArrivalTime, stop?.updatedArrivalTime, stop?.actualArrivalTime, stop?.realDeparture, stop?.realArrival, stop?.predictedDeparture, stop?.predictedArrival, fallback));
}

function extractDelay(stop, train, planned, actual) {
  const raw = firstDefined(stop?.delayMinutes, stop?.delay, stop?.departureDelay, stop?.arrivalDelay, stop?.delayTime, stop?.currentDelay, stop?.minutesDelay, stop?.delayInMinutes, stop?.predictedDelay, stop?.estimatedDelay, train?.delayMinutes, train?.delay, train?.minutesDelay, train?.delayInMinutes);
  const direct = parseDelayValue(raw);
  if (direct !== null) return direct;
  const diffIso = diffMinutesFromIso(
    firstDefined(stop?.plannedDeparture, stop?.plannedArrival, stop?.departureTime, stop?.arrivalTime, stop?.scheduledDeparture, stop?.scheduledArrival),
    firstDefined(stop?.actualDeparture, stop?.actualArrival, stop?.estimatedDepartureTime, stop?.updatedDepartureTime, stop?.actualDepartureTime, stop?.estimatedArrivalTime, stop?.updatedArrivalTime, stop?.actualArrivalTime)
  );
  if (diffIso !== null) return Math.max(0, diffIso);
  const p = parseClock(planned), a = parseClock(actual);
  if (p === null || a === null) return 0;
  return Math.max(0, a - p);
}

function parseDelayValue(value) {
  const text = clean(value);
  if (!text) return null;
  const num = Number(text.replace(/[^\d-]/g, ''));
  return Number.isFinite(num) ? Math.abs(num) : null;
}

function normalizeStatus(rawStatus, delayMinutes) {
  const status = clean(rawStatus).toUpperCase();
  if (['DONE', 'S', 'COMPLETED'].includes(status)) return 'DONE';
  if (['C', 'IN_PROGRESS', 'RUNNING'].includes(status)) return 'IN_PROGRESS';
  if (['DELAYED', 'LATE'].includes(status)) return 'DELAYED';
  if (['ON_TIME', 'ONTIME'].includes(status)) return 'ON_TIME';
  return delayMinutes > 0 ? 'DELAYED' : 'ON_TIME';
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
    const key = [row.scheduled, row.trainNumber, row.destination, row.platform].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickStation(data, query) {
  const items = extractStations(data);
  const normalizedQuery = normalize(query);
  return items.find((item) => normalize(firstDefined(item.name, item.stationName, item.label, item.description)) === normalizedQuery)
    || items.find((item) => normalize(firstDefined(item.name, item.stationName, item.label, item.description)).includes(normalizedQuery))
    || items[0]
    || null;
}

function extractStations(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function buildDebug(payload, route) {
  const trains = extractTrains(payload);
  const sampleTrain = trains[0] || {};
  const sampleStops = extractStops(sampleTrain, payload);
  const sampleStop = sampleStops[0] || {};
  return {
    trainCount: trains.length,
    sampleTrainKeys: Object.keys(sampleTrain).slice(0, 40),
    sampleStopKeys: Object.keys(sampleStop).slice(0, 40),
    firstRow: route[0] || null
  };
}

function normalizeTrainNumber(value) {
  const text = clean(value);
  if (!text) return '';
  const match = text.match(/([A-Z]{1,4}\s?\d{1,6}|\d{2,6})/);
  return match ? match[1].replace(/\s+/g, ' ').trim() : (/^\d{7,}$/.test(text) ? '' : text);
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

function normalizeBaseUrl(value) { return String(value || '').replace(/\/+$/, ''); }
function clean(value) { return String(value || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim(); }
function stripDiacritics(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function normalize(value) { return stripDiacritics(clean(value)).toLowerCase(); }
function formatTime(value) {
  const str = String(value || '').trim();
  const iso = str.match(/T(\d{2}:\d{2})(?::\d{2})?/);
  if (iso) return iso[1];
  const hhmm = str.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
  return '';
}
function parseClock(value) { const m = String(value || '').match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
function diffMinutesFromIso(planned, actual) {
  if (!planned || !actual) return null;
  const p = Date.parse(planned), a = Date.parse(actual);
  if (!Number.isFinite(p) || !Number.isFinite(a)) return null;
  return Math.round((a - p) / 60000);
}
function sortableTime(value) { const parsed = parseClock(value); return parsed === null ? 999999 : parsed; }
function firstDefined(...values) { for (const value of values) if (value !== undefined && value !== null && String(value).trim() !== '') return value; return ''; }
function safeJson(text) { try { return JSON.parse(text); } catch { return null; } }
function toMaybeNumber(value) { const num = Number(value); return Number.isNaN(num) ? value : num; }
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Api-Key'
  };
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() } });
}
