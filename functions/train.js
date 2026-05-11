function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() }
  });
}

function clean(value) {
  return String(value || '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatTime(value) {
  const str = String(value || '').trim();
  const iso = str.match(/T(\d{2}:\d{2})(?::\d{2})?/);
  if (iso) return iso[1];
  const hhmm = str.match(/(\d{1,2}):(\d{2})/);
  return hhmm ? `${hhmm[1].padStart(2, '0')}:${hhmm[2]}` : '';
}

function parseClock(value) {
  const m = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function normalizeDateForApi(value) {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return text;
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.substring(0, 200)}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return data;
}

function extractStations(data) {
