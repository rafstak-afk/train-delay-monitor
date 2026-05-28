const PLK_BASE = 'https://pdp-api.plk-sa.pl/api/v1';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}

function classifyStatus(http, text) {
  const preview = String(text || '').replace(/\s+/g, ' ').slice(0, 700);
  if (http === 401 || http === 403) return { status: 'AUTH', human: 'Problem autoryzacji API', preview };
  if (http === 429) return { status: 'LIMIT', human: 'Limit zapytań przekroczony', preview };
  if (http >= 500) return { status: 'DOWN', human: 'Serwer PLK niedostępny', preview };
  if (http >= 400) return { status: 'ERROR', human: 'Błąd zapytania API', preview };
  return { status: 'OK', human: 'API działa poprawnie', preview };
}

async function probe(path, key) {
  const started = Date.now();
  const url = PLK_BASE + path;
  try {
    const res = await fetch(url, {
      headers: {
        'X-API-Key': key,
        'Accept': 'application/json'
      }
    });

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    const base = classifyStatus(res.status, text);

    let body = null;
    if (contentType.includes('application/json')) {
      try { body = JSON.parse(text); } catch (_) { body = null; }
    }

    return {
      source: path.replace(/^\//, ''),
      url: path,
      http: res.status,
      ok: res.ok,
      status: base.status,
      human: base.human,
      responseMs: Date.now() - started,
      contentType,
      body,
      preview: base.preview
    };
  } catch (e) {
    return {
      source: path.replace(/^\//, ''),
      url: path,
      http: null,
      ok: false,
      status: 'DOWN',
      human: 'Serwer PLK niedostępny',
      responseMs: Date.now() - started,
      error: e.message
    };
  }
}

function pickOverall(checks) {
  if (checks.some(c => c.status === 'AUTH')) return { ok: false, status: 'AUTH', human: 'Problem autoryzacji API' };
  if (checks.some(c => c.status === 'LIMIT')) return { ok: false, status: 'LIMIT', human: 'Limit zapytań przekroczony' };
  if (checks.every(c => c.ok)) return { ok: true, status: 'OK', human: 'Limit API dostępny' };
  if (checks.some(c => c.ok)) return { ok: false, status: 'PARTIAL', human: 'API działa częściowo' };
  return { ok: false, status: 'DOWN', human: 'Serwer PLK niedostępny' };
}

export async function onRequest(context) {
  const key = context.env.PLK_API_KEY || context.env.PDP_API_KEY || '';
  if (!key) {
    return json({
      ok: false,
      status: 'AUTH',
      human: 'Brak klucza API',
      details: 'Brak zmiennej środowiskowej PLK_API_KEY albo PDP_API_KEY w Cloudflare Pages.'
    }, 500);
  }

  const checks = await Promise.all([
    probe('/apikey/info', key),
    probe('/apikey/usage', key)
  ]);

  const overall = pickOverall(checks);

  return json({
    ...overall,
    testedAt: new Date().toISOString(),
    explanation: {
      OK: 'Limit API dostępny',
      PARTIAL: 'API działa częściowo',
      DOWN: 'Serwer PLK niedostępny',
      LIMIT: 'Limit zapytań przekroczony',
      AUTH: 'Problem autoryzacji API'
    }[overall.status] || overall.human,
    checks
  });
}
