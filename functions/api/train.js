export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const stationName = normalizeInputStation(body.stationName || body.stationQuery || body.station);
    let stationId = normalizeValue(body.stationId || body.stations || body.stationCode);

    const apiBase = normalizeBaseUrl(env.PLK_API_BASE || 'https://pdp-api.plk-sa.pl/api/v1');
    const authType = (env.PLK_AUTH_TYPE || 'x-api-key').toLowerCase();
    const headers = buildHeaders(env, authType);

    let matchedStation = null;
    if (!stationId) {
      const stationData = await fetchStationDictionary(apiBase, headers, stationName);
      matchedStation = pickStation(stationData, stationName);
      if (!matchedStation) {
        return json({ error: 'Station not found', stationQuery: stationName, dictionaryPreview: stationData }, 404);
      }
      stationId = normalizeValue(matchedStation.id ?? matchedStation.stationId ?? matchedStation.value ?? matchedStation.code);
      if (!stationId) {
        return json({ error: 'Station found but no ID returned', stationQuery: stationName, match: matchedStation }, 502);
      }
    }

    const operationsUrl = new URL(`${apiBase}/operations`);
    operationsUrl.searchParams.set('stations', stationId);

    const upstream = await fetch(operationsUrl.toString(), { method: 'GET', headers });
    const contentType = upstream.headers.get('Content-Type') || 'application/json; charset=utf-8';
    const text = await upstream.text();
    const payload = safeJson(text);

    if (!upstream.ok || !payload) {
      return passthrough(text, upstream.status, contentType, stationId, matchedStation?.name || stationName);
    }

    const route = extractStationBoardRows(payload, stationId);
    const delayMinutes = Math.max(0, ...route.map((row) => Number(row.delayMinutes) || 0), 0);
    const lastStation = route[0]?.station || matchedStation?.name || stationName || '';
    const status = route.length ? (delayMinutes > 0 ? 'DELAYED' : 'ON_TIME') : 'NO_DATA';
    const stationPassengerUrl = resolvePassengerUrl(stationId, matchedStation?.name || stationName);

    return json({
      mode: 'station',
      trainNumber: 'station',
      delayMinutes,
      status,
      lastStation,
      route,
      matchedStation: matchedStation?.name || stationName || '',
      matchedStationId: toMaybeNumber(stationId),
      stationPassengerUrl,
      sourceCount: route.length
    });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
}

function resolvePassengerUrl(stationId, stationName) {
  const overrides = {
    '7112': 'https://l.plk-sa.pl/71001'
  };

  if (overrides[String(stationId)]) return overrides[String(stationId)];
  return '';
}

async function fetchStationDictionary(apiBase, headers, stationName) {
  const attempts = [
    stationName,
    stripDiacritics(stationName),
    String(stationName || '').replace(/\s+/g, ' ').trim()
  ].filter((value, index, array) => value && array.indexOf(value) === index);

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
    if ((data.totalCount || 0) > 0 || extractStations(data).length > 0) return data;
  }
  return lastData || { stations: [], totalCount: 0 };
}

function extractStationBoardRows(payload, stationId) {
  const trains = Array.isArray(payload?.trains) ? payload.trains : [];
  const stationsMap = payload?.stations && typeof payload.stations === 'object' ? payload.stations : {};
  const targetId = String(stationId);
  const rows = [];

  for (const train of trains) {
    const timetable = Array.isArray(train?.timetable) ? train.timetable : Array.isArray(train?.stations) ? train.stations : [];
    if (!timetable.length) continue;

    const stop = timetable.find((entry) => String(entry.stationId ?? entry.station ?? entry.id) === targetId);
    if (!stop) continue;

    const stationName = stationsMap[targetId]?.name || stop.stationName || stop.name || stop.station || '';
    const destination = resolveDestination(train, timetable, stationsMap);
    const trainNumber = firstDefined(train.number, train.trainNumber, train.name, train.id, '');
    const carrier = firstDefined(train.carrier, train.operator, train.brand, train.category, '');
    const scheduled = formatClock(firstDefined(stop.departureTime, stop.plannedDeparture, stop.time, stop.planTime, stop.scheduledTime));
    const actual = formatClock(firstDefined(stop.actualDepartureTime, stop.estimatedDepartureTime, stop.updatedDepartureTime, stop.realTime, scheduled));
    const delayMinutes = normalizeDelayMinutes(firstDefined(stop.delayMinutes, stop.delay, stop.departureDelay), scheduled, actual);
    const platform = firstDefined(stop.platform, stop.track, stop.peron, '');
    const via = resolveVia(timetable, targetId, stationsMap);

    rows.push({
      station: stationName,
      scheduled,
      actual,
      delayMinutes,
      status: delayMinutes > 0 ? 'DELAYED' : 'ON_TIME',
      trainNumber,
      destination,
      carrier,
      platform,
      via
    });
  }

  return rows
    .filter((row) => row.scheduled || row.actual || row.trainNumber || row.destination)
    .sort((a, b) => timeToSortable(a.scheduled || a.actual) - timeToSortable(b.scheduled || b.actual));
}

function resolveDestination(train, timetable, stationsMap) {
  const last = timetable[timetable.length - 1] || {};
  const lastId = String(last.stationId ?? last.station ?? last.id ?? '');
  return firstDefined(train.destination, train.destinationName, stationsMap[lastId]?.name, last.stationName, last.name, '');
}

function resolveVia(timetable, stationId, stationsMap) {
  const idx = timetable.findIndex((entry) => String(entry.stationId ?? entry.station ?? entry.id) === String(stationId));
  if (idx === -1) return '';
  return timetable.slice(idx + 1, idx + 5)
    .map((entry) => {
      const id = String(entry.stationId ?? entry.station ?? entry.id ?? '');
      return stationsMap[id]?.name || entry.stationName || entry.name || '';
    })
    .filter(Boolean)
    .join(', ');
}

function pickStation(data, query) {
  const items = extractStations(data);
  if (!items.length) return null;
  const q = normalizeText(query);
  return items.find((item) => normalizeText(item.name ?? item.stationName ?? item.label ?? item.description) === q)
    || items.find((item) => normalizeText(item.name ?? item.stationName ?? item.label ?? item.description).includes(q))
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

function buildHeaders(env, authType) {
  const headers = {};
  if (env.PLK_API_KEY) {
    if (authType === 'bearer') headers['Authorization'] = `Bearer ${env.PLK_API_KEY}`;
    else if (authType === 'x-api-key') headers['X-Api-Key'] = env.PLK_API_KEY;
    else if (authType === 'custom-header' && env.PLK_CUSTOM_HEADER) headers[env.PLK_CUSTOM_HEADER] = env.PLK_API_KEY;
  }
  return headers;
}

function normalizeDelayMinutes(delay, planned, actual) {
  const str = String(delay ?? '').trim();
  if (str) {
    const parsed = Number(str.replace(/[^\d-]/g, ''));
    if (Number.isFinite(parsed)) return Math.abs(parsed);
  }
  const plannedMinutes = parseClockToMinutes(planned);
  const actualMinutes = parseClockToMinutes(actual);
  if (plannedMinutes === null || actualMinutes === null) return 0;
  return Math.max(0, actualMinutes - plannedMinutes);
}

function parseClockToMinutes(value) {
  const str = String(value || '').trim();
  const match = str.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function timeToSortable(value) {
  const minutes = parseClockToMinutes(value);
  return minutes === null ? 999999 : minutes;
}

function formatClock(value) {
  const str = String(value || '').trim();
  const match = str.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  return str;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function passthrough(text, status, contentType, stationId, stationName) {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': contentType || 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...(stationId ? { 'X-Resolved-Station-Id': String(stationId) } : {}),
      ...(stationName ? { 'X-Resolved-Station-Name': encodeURIComponent(String(stationName)) } : {})
    }
  });
}

function toMaybeNumber(value) {
  const num = Number(value);
  return Number.isNaN(num) ? value : num;
}

function stripDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeText(value) {
  return stripDiacritics(String(value || '')).toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeInputStation(value) {
  return String(value || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
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
