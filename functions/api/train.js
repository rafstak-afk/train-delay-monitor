export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const stationName = String(body.stationName || body.stationQuery || body.station || '').trim();
    let stationId = String(body.stationId || body.stations || body.stationCode || '').trim();

    const apiBase = String(env.PLK_API_BASE || 'https://pdp-api.plk-sa.pl/api/v1').replace(/\/+$/, '');
    const authType = (env.PLK_AUTH_TYPE || 'x-api-key').toLowerCase();
    const headers = buildHeaders(env, authType);

    let dictionaryPayload = null;
    let matchedStation = null;

    if (!stationId) {
      const dictUrl = new URL(`${apiBase}/dictionaries/stations`);
      dictUrl.searchParams.set('search', stationName);
      const dictRes = await fetch(dictUrl.toString(), { method: 'GET', headers });
      const dictText = await dictRes.text();
      dictionaryPayload = safeJson(dictText) ?? dictText;

      if (!dictRes.ok) {
        return json({ step: 'dictionary', status: dictRes.status, url: dictUrl.toString(), payload: dictionaryPayload }, dictRes.status);
      }

      const items = extractStations(dictionaryPayload);
      matchedStation = items[0] || null;
      stationId = String(matchedStation?.id ?? matchedStation?.stationId ?? matchedStation?.value ?? matchedStation?.code ?? '').trim();

      if (!stationId) {
        return json({
          step: 'dictionary-no-station-id',
          stationQuery: stationName,
          dictionaryPayload
        }, 404);
      }
    }

    const operationsUrl = new URL(`${apiBase}/operations`);
    operationsUrl.searchParams.set('stations', stationId);

    const upstream = await fetch(operationsUrl.toString(), { method: 'GET', headers });
    const text = await upstream.text();
    const payload = safeJson(text) ?? text;

    return json({
      debug: true,
      stationQuery: stationName,
      matchedStation,
      stationId,
      operationsUrl: operationsUrl.toString(),
      operationsStatus: upstream.status,
      operationsPayload: payload,
      dictionaryPayload
    }, upstream.ok ? 200 : upstream.status);
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

function extractStations(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
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
