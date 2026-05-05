export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const trainNumber = (body.trainNumber || '').toString().trim();
    const trainDate = body.trainDate;
    const stationName = (body.stationName || body.stationQuery || '').toString().trim();
    const extraBody = parseJson(env.PLK_EXTRA_BODY, {});

    if (!trainNumber && !stationName) {
      return json({ error: 'Missing trainNumber or stationName' }, 400);
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
      ...extraBody,
      ...body
    };

    if (trainNumber) upstreamBody.trainNumber = trainNumber;
    if (trainDate) upstreamBody.trainDate = trainDate;
    if (stationName) {
      upstreamBody.stationName = stationName;
      if (!upstreamBody.mode) upstreamBody.mode = 'station';
    }

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
