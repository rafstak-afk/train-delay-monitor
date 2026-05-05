export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Use POST' }, 405);
    }

    try {
      const body = await request.json();
      const trainNumber = body.trainNumber;
      const trainDate = body.trainDate;
      const extraBody = parseJson(env.PLK_EXTRA_BODY, {});

      if (!trainNumber) {
        return json({ error: 'Missing trainNumber' }, 400);
      }

      const targetUrl = env.PLK_API_URL;
      if (!targetUrl) {
        return json({ error: 'Missing PLK_API_URL' }, 500);
      }

      const authType = (env.PLK_AUTH_TYPE || 'bearer').toLowerCase();
      const headers = {
        'Content-Type': 'application/json'
      };

      if (env.PLK_API_KEY) {
        if (authType === 'bearer') headers['Authorization'] = `Bearer ${env.PLK_API_KEY}`;
        else if (authType === 'x-api-key') headers['X-API-Key'] = env.PLK_API_KEY;
        else if (authType === 'custom-header' && env.PLK_CUSTOM_HEADER) headers[env.PLK_CUSTOM_HEADER] = env.PLK_API_KEY;
      }

      const upstreamBody = {
        trainNumber,
        trainDate,
        ...extraBody,
        ...body
      };

      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(upstreamBody)
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
};

function parseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
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
