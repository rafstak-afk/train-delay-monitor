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
        return new Response(lookupText, {
          status: stationLookup.status,
          headers: {
            'Content-Type': stationLookup.headers.get('Content-Type') || 'application/json; charset=utf-8',
            ...corsHeaders()
          }
        });
      }

      let stationData;
      try {
        stationData = JSON.parse(lookupText);
      } catch {
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
      return new Response(text, {
        status: upstream.status,
        headers: {
          'Content-Type': contentType,
          ...corsHeaders(),
          ...(matchedStation ? {
            'X-Resolved-Station-Id': stationId,
            'X-Resolved-Station-Name': encodeHeaderValue(matchedStation.name || stationName || '')
          } : {
            'X-Resolved-Station-Id': stationId
          })
        }
      });
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return new Response(text, {
        status: upstream.status,
        headers: {
          'Content-Type': contentType,
          ...corsHeaders(),
          'X-Resolved-Station-Id': stationId
        }
      });
    }

    const wrapped = {
      mode: 'station',
      stationQuery: stationName || matchedStation?.name || null,
      stationFound: true,
      matchedStation: matchedStation?.name || stationName || null,
      matchedStationId: Number.isNaN(Number(stationId)) ? stationId : Number(stationId),
      upstream: payload
    };

    return new Response(JSON.stringify(wrapped, null, 2), {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(),
        'X-Resolved-Station-Id': stationId,
        ...(matchedStation?.name ? { 'X-Resolved-Station-Name': encodeHeaderValue(matchedStation.name) } : {})
      }
    });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
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

function encodeHeaderValue(value) {
  return encodeURIComponent(String(value || ''));
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
