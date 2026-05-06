export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const stationName = normalizeValue(body.stationName || body.stationQuery);
    let stationId = normalizeValue(body.stationId || body.stations || body.stationCode);

    const apiBase = normalizeBaseUrl(env.PLK_API_BASE || 'https://pdp-api.plk-sa.pl/api/v1');
    const authType = (env.PLK_AUTH_TYPE || 'x-api-key').toLowerCase();
    const headers = buildHeaders(env, authType);
    const extraQuery = parseJson(env.PLK_EXTRA_QUERY, {});

    if (!stationId && !stationName) {
      return json({ error: 'Missing stationName or stationId' }, 400);
    }

    let matchedStation = null;

    if (!stationId && stationName) {
      const stationLookupUrl = new URL(`${apiBase}/dictionaries/stations`);
      stationLookupUrl.searchParams.set('search', stationName);

      const stationLookup = await fetch(stationLookupUrl.toString(), {
        method: 'GET',
        headers
      });

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
        return json({
          error: 'Station not found',
          stationQuery: stationName,
          dictionaryPreview: stationData
        }, 404);
      }

      stationId = normalizeValue(
        matchedStation.id ??
        matchedStation.stationId ??
        matchedStation.value ??
        matchedStation.code
      );

      if (!stationId) {
        return json({
          error: 'Station found but no ID returned',
          stationQuery: stationName,
          match: matchedStation
        }, 502);
      }
    }

    const operationsUrl = new URL(`${apiBase}/operations`);
    operationsUrl.searchParams.set('stations', stationId);

    for (const [key, value] of Object.entries(extraQuery)) {
      if (value !== undefined && value !== null && value !== '') {
        operationsUrl.searchParams.set(key, String(value));
      }
    }

    const upstream = await fetch(operationsUrl.toString(), {
      method: 'GET',
      headers
    });

    const contentType = upstream.headers.get('Content-Type') || 'application/json; charset=utf-8';
    const text = await upstream.text();

    if (!upstream.ok) {
      return passthrough(text, upstream.status, contentType, stationId, matchedStation?.name || stationName);
    }

    const payload = safeJson(text);
    if (!payload) {
      return passthrough(text, upstream.status, contentType, stationId, matchedStation?.name || stationName);
    }

    const departures = mapOperationsToDepartures(payload, stationId);
    const maxDelayMinutes = departures.reduce((max, item) => Math.max(max, Number(item.delayMinutes) || 0), 0);

    const response = {
      mode: 'station',
      stationFound: true,
      stationQuery: stationName || matchedStation?.name || null,
      matchedStation: matchedStation?.name || stationName || null,
      matchedStationId: toMaybeNumber(stationId),
      status: departures.length ? (maxDelayMinutes > 0 ? 'DELAYED' : 'ON_TIME') : 'NO_DATA',
      maxDelayMinutes,
      departures,
      rawCount: departures.length,
      upstreamMeta: extractMeta(payload)
    };

    return new Response(JSON.stringify(response, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(),
        'X-Resolved-Station-Id': stationId,
        ...(matchedStation?.name ? { 'X-Resolved-Station-Name': encodeURIComponent(matchedStation.name) } : {})
      }
    });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
}

function mapOperationsToDepartures(payload, stationId) {
  const items = extractOperationItems(payload);

  return items.map((item) => {
    const planned = firstDefined(
      item.plannedTime,
      item.planTime,
      item.scheduledTime,
      item.departureTime?.planned,
      item.times?.planned,
      item.arrivalDepartureTime,
      item.time
    );

    const actual = firstDefined(
      item.actualTime,
      item.realTime,
      item.estimatedTime,
      item.departureTime?.actual,
      item.times?.actual,
      item.updatedTime
    );

    const explicitDelay = firstDefined(
      item.delayMinutes,
      item.delay,
      item.delayInMinutes,
      item.departureTime?.delayMinutes,
      item.times?.delayMinutes
    );

    const delayMinutes = normalizeDelayMinutes(explicitDelay, planned, actual);

    return {
      station: firstDefined(item.stationName, item.station, item.stopName, item.locationName, item.pointName) || '',
      destination: firstDefined(item.destination, item.direction, item.destinationName, item.toStation, item.headsign) || '',
      plannedTime: formatClock(planned),
      actualTime: formatClock(actual || planned),
      delayMinutes,
      status: normalizeStatus(item.status, delayMinutes, planned, actual),
      trainNumber: firstDefined(item.trainNumber, item.number, item.trainNo, item.commercialNumber) || '',
      raw: item,
      stationId: toMaybeNumber(stationId)
    };
  }).filter(item => item.destination || item.trainNumber || item.plannedTime || item.actualTime);
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

function extractMeta(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const meta = { ...payload };
  delete meta.operations;
  delete meta.items;
  delete meta.data;
  delete meta.departures;
  delete meta.results;
  return meta;
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

  const exact = items.find(item => normalizeText(item.name ?? item.stationName ?? item.label ?? item.description) === q);
  if (exact) return exact;

  const startsWith = items.find(item => normalizeText(item.name ?? item.stationName ?? item.label ?? item.description).startsWith(q));
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

function normalizeStatus(status, delayMinutes, planned, actual) {
  const normalized = String(status || '').trim();
  if (normalized) return normalized;
  if ((Number(delayMinutes) || 0) > 0) return 'DELAYED';
  if (actual && planned && formatClock(actual) !== formatClock(planned)) return 'UPDATED';
  return 'ON_TIME';
}

function normalizeDelayMinutes(delay, planned, actual) {
  const parsed = Number(String(delay ?? '').replace(/[^\d-]/g, ''));
  if (Number.isFinite(parsed)) return parsed;

  const plannedMinutes = parseClockToMinutes(planned);
  const actualMinutes = parseClockToMinutes(actual);
  if (plannedMinutes === null || actualMinutes === null) return 0;
  return actualMinutes - plannedMinutes;
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

function toMaybeNumber(value) {
  const num = Number(value);
  return Number.isNaN(num) ? value : num;
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
