const BASE = 'https://pdp-api.plk-sa.pl/api/v1';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS });
}
function todayWarsaw() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
}
function preview(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 420);
}
function classifyHttp(status, bodyPreview) {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'LIMIT';
  if (status >= 500 || /500\.30|ASP\.NET Core app failed to start|Nie można uruchomić aplikacji ASP\.NET Core/i.test(bodyPreview || '')) return 'DOWN';
  if (status >= 400) return 'DOWN';
  return 'OK';
}
async function probe(name, path, key) {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), 8000);
  try {
    const res = await fetch(BASE + path, {
      headers: { 'X-API-Key': key, 'Accept': 'application/json, text/plain, */*' },
      signal: controller.signal
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}
    const bodyPreview = preview(text);
    const statusType = classifyHttp(res.status, bodyPreview);
    return {
      source: name,
      http: res.status,
      ok: res.ok && !!parsed,
      status: statusType,
      responseMs: Date.now() - start,
      contentType: res.headers.get('content-type') || '',
      preview: bodyPreview
    };
  } catch (e) {
    return {
      source: name,
      http: 0,
      ok: false,
      status: 'DOWN',
      responseMs: Date.now() - start,
      error: String(e && e.message || e || 'timeout')
    };
  } finally {
    clearTimeout(timeout);
  }
}
function overall(checks, keyPresent) {
  if (!keyPresent) return 'AUTH';
  if (checks.some(c => c.status === 'AUTH')) return 'AUTH';
  if (checks.some(c => c.status === 'LIMIT')) return 'LIMIT';
  const okCount = checks.filter(c => c.ok).length;
  if (okCount === checks.length) return 'OK';
  if (okCount > 0) return 'PARTIAL';
  return 'DOWN';
}
function human(status) {
  return ({
    OK: 'API działa poprawnie',
    PARTIAL: 'API działa częściowo',
    DOWN: 'Serwer PLK niedostępny',
    LIMIT: 'Limit zapytań przekroczony',
    AUTH: 'Problem autoryzacji API',
    UNKNOWN: 'Nie sprawdzono API'
  })[status] || 'Nie sprawdzono API';
}
export async function onRequest(context) {
  const key = context.env.PLK_API_KEY || context.env.PDP_API_KEY || '';
  if (!key) {
    return json({
      ok: false,
      status: 'AUTH',
      human: human('AUTH'),
      testedAt: new Date().toISOString(),
      checks: [],
      details: 'Brak zmiennej środowiskowej PLK_API_KEY / PDP_API_KEY.'
    });
  }
  const today = todayWarsaw();
  const checks = await Promise.all([
    probe('operations', '/operations?stations=73312&pageSize=1&withPlanned=false', key),
    probe('schedules', '/schedules?stations=73312&dateFrom=' + today + '&dateTo=' + today + '&pageSize=1', key)
  ]);
  const status = overall(checks, !!key);
  return json({
    ok: status === 'OK',
    status,
    human: human(status),
    testedAt: new Date().toISOString(),
    stationProbe: 'Katowice / 73312',
    checks
  });
}
