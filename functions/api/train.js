export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const stationName = (body.stationName || body.stationQuery || '').toString().trim();
    let stationId = normalizeValue(body.stationId || body.stations || body.stationCode);

    const apiBase = normalizeBaseUrl(env.PLK_API_BASE || 'https://pdp-api.plk-sa.pl/api/v1');
    const authType = (env.PLK_AUTH_TYPE || 'x-api-key').toLowerCase();
    const headers = buildHeaders(env, authType);
    const extraQuery = parseJson(env.PLK_EXTRA_QUERY, {});

    if (!stationId && !stationName) {
      return json({ error: 'Missing stationName or stationId' }, 400);
    }

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
        return json({ error: 'Invalid station dictionary response', raw: lookupText.slice(0, 500) }, 502);
      }

      const stationMatch = pickStation(stationData, stationName);
      if (!stationMatch) {
        return json({
          error: 'Station not found',
          stationQuery: stationName
        }, 404);
      }

      stationId = String(stationMatch.id ?? stationMatch.stationId ?? stationMatch.value ?? '').trim();
      if (!stationId) {
        return json({
          error: 'Station found but no ID returned',
          stationQuery: stationName,
          match: stationMatch
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

    const operationsText = await upstream.text();
    return new Response(operationsText, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
        ...corsHeaders(),
        'X-Resolved-Station-Id': stationId
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
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.data)
        ? data.data
        : [];

  if (!items.length) return null;

  const q = query.toLowerCase();
  const exact = items.find(item => {
    const name = String(item.name ?? item.stationName ?? item.label ?? '').toLowerCase();
    return name === q;
  });
  if (exact) return exact;

  const startsWith = items.find(item => {
    const name = String(item.name ?? item.stationName ?? item.label ?? '').toLowerCase();
    return name.startsWith(q);
  });
  if (startsWith) return startsWith;

  return items[0] || null;
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
