export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const stationName = normalizeValue(body.stationName || body.stationQuery || body.station);
    let stationId = normalizeValue(body.stationId || body.stations || body.stationCode);

    const apiBase = normalizeBaseUrl(env.PLK_API_BASE || 'https://pdp-api.plk-sa.pl/api/v1');
    const authType = (env.PLK_AUTH_TYPE || 'x-api-key').toLowerCase();
    const headers = buildHeaders(env, authType);
    const extraQuery = parseJson(env.PLK_EXTRA_QUERY, {});

    if (!stationId && !stationName) {
      return json({ error: 'Missing stationName or stationId' }, 400);
    }

    let matchedStation = null;

    if (!stationId) {
      const stationLookupUrl = new URL(`${apiBase}/dictionaries/stations`);
      stationLookupUrl.searchParams.set('search', stationName);

      const stationLookup = await fetch(stationLookupUrl.toString(), { method: 'GET', headers });
      const lookupText = await stationLookup.text();
      if (!stationLookup.ok) {
        return passthrough(lookupText, stationLookup.status, stationLookup.headers.get('Content-Type'));
      }

      const stationData = safeJson(lookupText);
      if (!stationData) {
        return json({ error: 'Invalid station dictionary response', raw: lookupText.slice(0, 1000) }, 502);
      }

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
    for (const [key, value] of Object.entries(extraQuery)) {
      if (value !== undefined && value !== null && value !== '') operationsUrl.searchParams.set(key, String(value));
    }

    const upstream = await fetch(operationsUrl.toString(), { method: 'GET', headers });
    const contentType = upstream.headers.get('Content-Type') || 'application/json; charset=utf-8';
    const text = await upstream.text();

    if (!upstream.ok) {
      return passthrough(text, upstream.status, contentType, stationId, matchedStation?.name || stationName);
    }

    const payload = safeJson(text);
    if (!payload) {
      return passthrough(text, upstream.status, contentType, stationId, matchedStation?.name || stationName);
    }

    const operations = extractOperationItems(payload);
    const route = operations.map((item) => mapOperationToRoute(item, matchedStation?.name || stationName));
    const nonEmptyRoute = route.filter((row) => row.station || row.scheduled || row.actual || row.trainNumber);
    const delayMinutes = Math.max(0, ...nonEmptyRoute.map((row) => Number(row.delayMinutes) || 0), 0);
    const lastStation = findLastStation(nonEmptyRoute, matchedStation?.name || stationName);
    const trainNumber = findTrainNumber(operations);
    const status = deriveStatus(nonEmptyRoute, delayMinutes);

    return json({
      mode: 'station',
      trainNumber,
      delayMinutes,
      status,
      lastStation,
      route: nonEmptyRoute,
      matchedStation: matchedStation?.name || stationName || '',
      matchedStationId: toMaybeNumber(stationId),
      sourceCount: operations.length
    });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
}

function mapOperationToRoute(item, fallbackStationName) {
  const scheduled = firstDefined(
    item.plannedTime,
    item.planTime,
    item.scheduledTime,
    item.arrivalDepartureTime,
    item.time,
    item.departureTime?.planned,
    item.times?.planned,
    item.passengerInformation?.time
  );

  const actual = firstDefined(
    item.actualTime,
    item.realTime,
    item.estimatedTime,
    item.updatedTime,
    item.departureTime?.actual,
    item.times?.actual,
    item.passengerInformation?.estimatedTime
  );

  const explicitDelay = firstDefined(
    item.delayMinutes,
    item.delay,
    item.delayInMinutes,
    item.departureTime?.delayMinutes,
    item.times?.delayMinutes,
    item.passengerInformation?.delayMinutes
  );

  const delayMinutes = normalizeDelayMinutes(explicitDelay, scheduled, actual);

  return {
    station: firstDefined(
      item.stationName,
      item.station,
      item.stopName,
      item.locationName,
      item.pointName,
      item.destination,
      item.direction,
      item.destinationName,
      fallbackStationName
    ) || '',
    scheduled: formatClock(scheduled),
    actual: formatClock(actual || scheduled),
    delayMinutes,
    status: normalizeStatus(item.status, delayMinutes, scheduled, actual),
    trainNumber: firstDefined(item.trainNumber, item.number, item.trainNo, item.commercialNumber) || ''
  };
}

function extractOperationItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.operations)) return payload.operations;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.departures)) return payload.departures;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function findLastStation(route, fallback) {
  const actualRow = [...route].reverse().find((row) => row.actual || row.status === 'LAST_REPORTED' || row.status === 'DEPARTED' || row.status === 'PASSED');
  return actualRow?.station || route.at(-1)?.station || fallback || '';
}

function findTrainNumber(operations) {
  const first = operations.find((item) => firstDefined(item.trainNumber, item.number, item.trainNo, item.commercialNumber));
  return firstDefined(first?.trainNumber, first?.number, first?.trainNo, first?.commercialNumber, 'station');
}

function deriveStatus(route, delayMinutes) {
  const statuses = route.map((row) => String(row.status || '').toUpperCase());
  if (statuses.includes('CANCELLED') || statuses.includes('CANCELED')) return 'CANCELLED';
  if (delayMinutes > 0) return 'DELAYED';
  if (route.length === 0) return 'NO_DATA';
  return 'ON_TIME';
}

function normalizeStatus(status, delayMinutes, planned, actual) {
  const normalized = String(status || '').trim();
  if (normalized) return normalized;
  if ((Number(delayMinutes) || 0) > 0) return 'DELAYED';
  if (actual && planned && formatClock(actual) !== formatClock(planned)) return 'UPDATED';
  return 'ON_TIME';
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

function buildHeaders(env, authType) {
  const headers = {};
  if (env.PLK_API_KEY) {
    if (authType === 'bearer') headers['Authorization'] = `Bearer ${env.PLK_API_KEY}`;
    else if (authType === 'x-api-key') headers['X-Api-Key'] = env.PLK_API_KEY;
    else if (authType === 'custom-header' && env.PLK_CUSTOM_HEADER) headers[env.PLK_CUSTOM_HEADER] = env.PLK_API_KEY;
  }
  return headers;
}

function pickStation(data, query) {
  const items = extractStations(data);
  if (!items.length) return null;

  const q = normalizeText(query);
  const exact = items.find((item) => normalizeText(item.name ?? item.stationName ?? item.label ?? item.description) === q);
  if (exact) return exact;
  const startsWith = items.find((item) => normalizeText(item.name ?? item.stationName ?? item.label ?? item.description).startsWith(q));
  if (startsWith) return startsWith;
  return items[0] || null;
}

function extractStations(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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
