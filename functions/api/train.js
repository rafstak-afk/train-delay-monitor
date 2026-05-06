export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const stationId = normalizeStationId(body.stationId || body.stations || body.stationCode);
    const date = (body.date || body.trainDate || '').toString().trim();
    const extraQuery = parseJson(env.PLK_EXTRA_QUERY, {});

    if (!stationId) {
      return json({
        error: 'Missing stationId',
        hint: 'PLK /api/v1/operations wymaga parametru stations (np. 33506), a nie samej nazwy stacji.'
      }, 400);
    }

    const baseUrl = env.PLK_API_URL;
    if (!baseUrl) {
      return json({ error: 'Missing PLK_API_URL' }, 500);
    }

    const authType = (env.PLK_AUTH_TYPE || 'x-api-key').toLowerCase();
    const headers = {};

    if (env.PLK_API_KEY) {
      if (authType === 'bearer') headers['Authorization'] = `Bearer ${env.PLK_API_KEY}`;
      else if (authType === 'x-api-key') headers['X-Api-Key'] = env.PLK_API_KEY;
      else if (authType === 'custom-header' && env.PLK_CUSTOM_HEADER) headers[env.PLK_CUSTOM_HEADER] = env.PLK_API_KEY;
    }

    const url = new URL(baseUrl);
    url.searchParams.set('stations', stationId);

    for (const [key, value] of Object.entries(extraQuery)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    if (date) url.searchParams.set('date', date);

    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
        ...corsHeaders()
      }
    });
  } catch (error) {
    return json({ error: error.message || 'Worker error' }, 500);
  }
}

function normalizeStationId(value) {
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
