const PLK_BASE = 'https://pdp-api.plk-sa.pl/api/v1';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    }
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function shortTime(v) {
  if (!v) return '';
  const m = String(v).match(/(\d{2}:\d{2})/);
  return m ? m[1] : String(v);
}

function normalizeDate(v) {
  if (!v) return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return v;
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return '';
}

function statusText(code) {
  const map = {
    P: ['Rozkładowy / bez potwierdzenia realizacji', 'Kod PLK: P. Dane wyglądają na rozkładowe albo bez pewnego potwierdzenia bieżącej realizacji.'],
    S: ['Rozkładowy / bez potwierdzenia realizacji', 'Kod PLK: S. Dane bez potwierdzenia przejazdu przez stacje.'],
    R: ['W ruchu', 'Kod PLK: R. Pociąg jest w bieżącej realizacji.'],
    Z: ['Zakończony', 'Kod PLK: Z. Bieg zakończony.'],
    C: ['Odwołany', 'Kod PLK: C. Kurs odwołany.'],
    X: ['Odwołany', 'Kod PLK: X. Kurs odwołany.'],
    O: ['Opóźniony', 'Kod PLK: O. Pociąg opóźniony.']
  };
  return map[code] || [code ? `Kod statusu: ${code}` : 'Brak statusu', 'Brak opisu tego kodu w lokalnym słowniku.'];
}

function apiHeaders(context) {
  const key = context.env.PLK_API_KEY || context.env.PDP_API_KEY || '';
  return key ? { 'X-API-Key': key, Accept: 'application/json' } : { Accept: 'application/json' };
}

async function plkFetch(context, path) {
  const started = Date.now();
  const res = await fetch(PLK_BASE + path, { headers: apiHeaders(context) });
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  let body = null;
  if (contentType.includes('application/json')) {
    try { body = JSON.parse(text); } catch (_) { body = null; }
  }
  if (!res.ok) {
    const err = new Error('PLK HTTP ' + res.status);
    err.status = res.status;
    err.preview = text.slice(0, 800);
    err.responseMs = Date.now() - started;
    throw err;
  }
  return { body: body ?? text, responseMs: Date.now() - started, status: res.status };
}

function collectStationNames(data) {
  const out = {};
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const id = node.stationId ?? node.stopId ?? node.id;
    const name = node.stationName ?? node.name ?? node.stopName;
    if (id && name) out[String(id)] = String(name);
    for (const v of Object.values(node)) visit(v);
  };
  visit(data);
  const dicts = [data?.dictionaries?.stations, data?.stations, data?.stationNames, data?.route?.stationNames, data?.operation?.stationNames];
  for (const dict of dicts) {
    if (!dict || typeof dict !== 'object') continue;
    for (const [k, v] of Object.entries(dict)) {
      if (typeof v === 'string') out[String(k)] = v;
      else if (v && typeof v === 'object') out[String(k)] = v.name || v.stationName || v.stopName || out[String(k)] || '';
    }
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

async function stationNamesAction(context, url) {
  const ids = (url.searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  const names = {};
  const diagnostics = [];
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  const sources = [
    { source: 'operations', path: `/operations?stations=${encodeURIComponent(ids.join(','))}&withPlanned=true&fullRoutes=true&pageSize=200` },
    { source: 'schedules', path: `/schedules?stations=${encodeURIComponent(ids.join(','))}&dateFrom=${today}&dateTo=${today}&pageSize=200` }
  ];
  for (const s of sources) {
    try {
      const r = await plkFetch(context, s.path);
      const m = collectStationNames(r.body);
      let found = 0;
      for (const id of ids) if (m[id]) { names[id] = m[id]; found++; }
      diagnostics.push({ source: s.source, status: r.status, ok: true, responseMs: r.responseMs, found });
    } catch (e) {
      diagnostics.push({ source: s.source, status: e.status || 0, ok: false, responseMs: e.responseMs || 0, error: e.message, preview: e.preview || '' });
    }
  }
  return json({ ok: true, requested: ids, names, missing: ids.filter(id => !names[id]), diagnostics });
}

async function getTrainData(context, params) {
  const scheduleId = params.get('scheduleId') || params.get('scheduledId') || '';
  const orderId = params.get('orderId') || '';
  const date = normalizeDate(params.get('date') || params.get('operatingDate') || '');
  if (!scheduleId || !orderId) throw new Error('Brak scheduleId/orderId. Pełny bieg działa po kliknięciu numeru z tablicy.');

  const opPath = `/operations/train/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}/${encodeURIComponent(date)}`;
  const schPath = `/schedules/${encodeURIComponent(scheduleId)}?dateFrom=${encodeURIComponent(date)}&dateTo=${encodeURIComponent(date)}`;
  const [opRes, schRes] = await Promise.allSettled([plkFetch(context, opPath), plkFetch(context, schPath)]);
  const operation = opRes.status === 'fulfilled' ? opRes.value.body : {};
  const schedule = schRes.status === 'fulfilled' ? schRes.value.body : {};
  if (opRes.status === 'rejected' && schRes.status === 'rejected') throw opRes.reason;
  return { operation, route: schedule, diagnostics: { operation: opRes.status, schedule: schRes.status } };
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.stations)) return v.stations;
  if (v && Array.isArray(v.trains) && v.trains[0]?.stations) return v.trains[0].stations;
  if (v && Array.isArray(v.routes) && v.routes[0]?.stations) return v.routes[0].stations;
  return [];
}

function seqOf(s, i) {
  return Number(s.orderNumber ?? s.plannedSequenceNumber ?? s.actualSequenceNumber ?? s.sequenceNumber ?? s.seq ?? i + 1);
}

function actualTimeOf(s) {
  return pick(s, ['actualDeparture', 'actualArrival', 'actualDepartureTime', 'actualArrivalTime']);
}

function plannedTimeOf(s) {
  return pick(s, ['plannedDeparture', 'plannedArrival', 'plannedDepartureTime', 'plannedArrivalTime', 'departureTime', 'arrivalTime']);
}

function isHardConfirmed(s) {
  if (s.isConfirmed === true || s.confirmed === true || s.wasHere === true) return true;
  if (s.realized === true || s.passed === true) return true;
  return Boolean(actualTimeOf(s));
}

function delayMinutes(s) {
  const direct = Number(s.departureDelayMinutes ?? s.arrivalDelayMinutes ?? s.delayMinutes ?? s.delay ?? 0);
  if (Number.isFinite(direct) && direct !== 0) return direct;
  const p = shortTime(plannedTimeOf(s));
  const a = shortTime(actualTimeOf(s));
  const toMin = (x) => { const m = String(x || '').match(/^(\d{2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const pm = toMin(p), am = toMin(a);
  if (pm === null || am === null) return 0;
  return am - pm;
}

function stationIdOf(s) { return String(s.stationId ?? s.stopId ?? s.id ?? ''); }
function stationNameOf(s, names) {
  return s.stationName || s.name || s.stopName || names[stationIdOf(s)] || '';
}

function mergeStations(routeStations, opStations) {
  const bySeq = new Map();
  routeStations.forEach((s, i) => bySeq.set(seqOf(s, i), { ...s, _src: 'route' }));
  opStations.forEach((s, i) => {
    const seq = seqOf(s, i);
    bySeq.set(seq, { ...(bySeq.get(seq) || {}), ...s, _src: bySeq.has(seq) ? 'route+operation' : 'operation' });
  });
  return [...bySeq.entries()].sort((a, b) => a[0] - b[0]).map(([seq, s]) => ({ ...s, _seq: seq }));
}

function renderPage() {
  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Bieg pociągu</title><style>
:root{--bg:#101820;--panel:#1c2833;--card:#223244;--border:#34495e;--blue:#0b57d0;--green:#5dd39e;--yellow:#ffcc00;--red:#ff4d4d;--violet:#c084fc;--muted:rgba(255,255,255,.68);--grey:#4b5563}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:#fff;font-family:Arial,sans-serif;padding:14px}.wrap{max-width:1100px;margin:0 auto}.top{text-align:center;margin:6px 0 12px}h1{margin:0 0 12px;font-size:30px}.search{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap}.search input{border:0;border-radius:10px;padding:12px 14px;font-size:20px;min-width:260px}.btn{border:0;border-radius:10px;padding:12px 16px;background:var(--blue);color:#fff;font-weight:900;cursor:pointer;text-decoration:none;display:inline-block}.btn.grey{background:var(--grey)}.btn.green{background:#198754}.status{text-align:center;color:var(--muted);min-height:24px;margin:8px 0 10px}.loading{display:none;align-items:center;justify-content:center;gap:10px;color:#dbeafe;font-weight:800}.loading.on{display:flex}.train-anim{width:42px;height:18px;border-radius:10px;background:#0b57d0;position:relative;animation:choo 1.15s ease-in-out infinite}.train-anim:before{content:'🚆';position:absolute;left:-2px;top:-11px;font-size:26px}.train-anim:after{content:'';position:absolute;right:-10px;top:7px;width:8px;height:4px;border-radius:999px;background:#93c5fd;opacity:.8}@keyframes choo{0%{transform:translateX(-8px)}50%{transform:translateX(8px)}100%{transform:translateX(-8px)}}.summary{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:10px;margin:10px 0;display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:center}.box{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px}.label{font-size:12px;color:var(--muted)}.big{font-size:20px;font-weight:900}.hint{font-size:12px;color:var(--muted);line-height:1.35}.route{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:10px}.route h2{margin:0 0 8px;font-size:22px}.row{display:grid;grid-template-columns:82px 1fr 92px 72px 70px;gap:10px;align-items:center;border-bottom:1px solid rgba(255,255,255,.1);padding:8px 4px}.row:last-child{border-bottom:0}.time{font-size:19px;font-weight:900;color:var(--green)}.time.planonly{color:#cbd5e1}.time .plan{font-size:12px;color:#aab7c4}.time .real{font-size:18px}.station{font-size:17px;font-weight:900}.sub{font-size:12px;color:var(--muted);margin-top:2px}.badge{display:inline-block;text-align:center;font-size:12px;font-weight:900;border-radius:999px;padding:4px 8px;background:#374151;color:#e5e7eb}.badge.passed{background:#14532d;color:#bbf7d0}.badge.current{background:#facc15;color:#111827}.badge.next{background:#0891b2;color:#ecfeff}.badge.plan{background:#475569;color:#e2e8f0}.row.current{background:#263b52;border-radius:10px}.row.next{background:rgba(250,204,21,.08);border-radius:10px}.delay{font-weight:900;color:var(--green)}.delay.low{color:var(--yellow)}.delay.mid{color:var(--red)}.delay.high{color:var(--violet)}.err{background:#3b1d1d;border:1px solid #dc3545;color:#ffd6d6;border-radius:10px;padding:12px;margin-top:12px}@media(max-width:720px){body{padding:8px}h1{font-size:25px}.search{display:grid;grid-template-columns:1fr auto auto}.search input{min-width:0;width:100%;font-size:17px}.summary{grid-template-columns:1fr}.row{grid-template-columns:70px 1fr 62px;gap:7px}.row .platform{grid-column:3}.row .delay{grid-column:3}.station{font-size:15px}.time{font-size:18px}.route{padding:8px}.btn{padding:10px 12px}}
</style></head><body><div class="wrap"><div class="top"><h1>🚆 Bieg pociągu</h1><div class="search"><input id="trainInput" placeholder="Wpisz numer pociągu" inputmode="numeric"><button class="btn" id="showBtn">Pokaż</button><a class="btn grey" href="/">← Tablica</a></div></div><div id="status" class="status">Kliknij numer pociągu na tablicy albo wpisz numer ręcznie.</div><div id="loading" class="loading"><span class="train-anim"></span><span>Pobieram bieg pociągu...</span></div><div id="content"></div></div><script>
const qs=n=>new URLSearchParams(location.search).get(n)||'';const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const statusEl=document.getElementById('status'), loading=document.getElementById('loading'), content=document.getElementById('content'), input=document.getElementById('trainInput');
function setStatus(t){statusEl.textContent=t}function showLoading(on){loading.classList.toggle('on',!!on)}function short(v){const m=String(v||'').match(/(\d{2}:\d{2})/);return m?m[1]:''}
function delayCls(d){return d>=20?'high':d>10?'mid':d>0?'low':''}function timeHtml(s){const p=short(s.planned),a=short(s.actual);if(!a||a===p)return '<div class="time '+(!s.confirmed?'planonly':'')+'">'+esc(p||a||'—')+'</div>';return '<div class="time"><div class="plan">plan '+esc(p)+'</div><div class="real '+delayCls(s.delay)+'">real '+esc(a)+'</div></div>'}
async function loadTrain(){const train=input.value.trim();if(!train){setStatus('Wpisz numer pociągu.');return}input.blur();showLoading(true);setStatus('Pobieram dane...');content.innerHTML='';const params=new URLSearchParams(location.search);params.set('action','route-json');params.set('train',train);try{const r=await fetch('/train?'+params.toString(),{headers:{Accept:'application/json'}});const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||'Błąd pobierania');render(data);setStatus('Gotowe.')}catch(e){content.innerHTML='<div class="err">Nie udało się pobrać biegu pociągu: '+esc(e.message)+'<br><br>Pełny bieg działa najlepiej po kliknięciu numeru z tablicy. Sam numer pociągu może oznaczać kilka kursów.</div>';setStatus('Nie udało się pobrać danych.')}finally{showLoading(false)}}
function render(data){const tr=data.train||{};const rows=data.stations||[];const last=rows.find(x=>x.state==='current')||null;let html='<div class="summary"><div class="box"><div class="label">Pociąg</div><div class="big">'+esc(tr.title||tr.number||'')+'</div><div class="hint">'+esc(tr.statusHuman||'')+'<br>'+esc(tr.statusHelp||'')+'</div></div><div class="box"><div class="label">Ostatnia potwierdzona stacja</div><div class="big">'+esc(last?last.name:'brak potwierdzonej stacji')+'</div><div class="hint">'+esc(last?short(last.actual||last.planned):'')+'</div></div><div><a class="btn green" target="_blank" rel="noopener" href="https://portalpasazera.pl/ZnajdzPociag">Portal Pasażera</a></div></div><div class="route"><h2>Trasa stacja po stacji</h2><div class="hint">„Zaliczona” oznacza tylko stację z faktycznym potwierdzeniem czasu rzeczywistego z API PLK. Plan nie jest dowodem przejazdu.</div>';
html+=rows.map(s=>'<div class="row '+esc(s.state)+'" id="st-'+esc(s.seq)+'"><div>'+timeHtml(s)+'</div><div><div class="station">'+esc(s.name)+'</div><div class="sub">ID '+esc(s.id)+' · kolejność '+esc(s.seq)+' · '+esc(s.nameSource||'')+'</div></div><div><span class="badge '+esc(s.state)+'">'+esc(s.stateText)+'</span></div><div class="delay '+delayCls(s.delay)+'">'+(s.delay>0?'+'+esc(s.delay):'0')+' min</div><div class="platform">'+esc(s.platform||'—')+'</div></div>').join('');html+='</div>';content.innerHTML=html;setTimeout(()=>{const target=document.querySelector('.row.current')||document.querySelector('.row.next');if(target)target.scrollIntoView({behavior:'smooth',block:'center'})},150)}
document.getElementById('showBtn').addEventListener('click',loadTrain);input.addEventListener('keydown',e=>{if(e.key==='Enter')loadTrain()});document.addEventListener('DOMContentLoaded',()=>{const t=qs('train');if(t){input.value=t;loadTrain()}});
</script></body></html>`;
}

async function routeJsonAction(context, url) {
  const params = url.searchParams;
  const train = params.get('train') || '';
  const data = await getTrainData(context, params);
  const operation = data.operation || {};
  const route = data.route || {};
  const opStations = asArray(operation.operation || operation);
  const routeStations = asArray(route.route || route);
  const names = { ...collectStationNames(route), ...collectStationNames(operation) };
  const stations = mergeStations(routeStations, opStations);
  const confirmedSeqs = stations.filter(isHardConfirmed).map(s => s._seq);
  const lastConfirmedSeq = confirmedSeqs.length ? Math.max(...confirmedSeqs) : null;
  const nextSeq = lastConfirmedSeq === null ? (stations[0]?._seq ?? null) : (stations.find(s => s._seq > lastConfirmedSeq)?._seq ?? null);
  const stOut = stations.map(s => {
    const id = stationIdOf(s);
    const name = stationNameOf(s, names) || 'Nieznana stacja';
    const confirmed = isHardConfirmed(s);
    let state = 'plan', stateText = 'plan';
    if (confirmed && lastConfirmedSeq !== null && s._seq < lastConfirmedSeq) { state = 'passed'; stateText = 'zaliczona'; }
    else if (confirmed && s._seq === lastConfirmedSeq) { state = 'current'; stateText = 'ostatnia'; }
    else if (!confirmed && s._seq === nextSeq) { state = 'next'; stateText = 'następna'; }
    else { state = 'plan'; stateText = 'plan'; }
    return {
      id, name, nameSource: s.stationName || s.name || s.stopName ? 'API' : (names[id] ? 'słownik API' : 'brak nazwy w API'), seq: s._seq,
      planned: plannedTimeOf(s), actual: actualTimeOf(s), confirmed, state, stateText,
      delay: Math.max(0, delayMinutes(s)),
      platform: [s.departurePlatform || s.arrivalPlatform || '', s.departureTrack || s.arrivalTrack || ''].filter(Boolean).join(' / ')
    };
  });
  const code = operation.trainStatus || operation.operation?.trainStatus || '';
  const st = statusText(code);
  const title = [route.commercialCategorySymbol || params.get('category') || '', route.nationalNumber || train, route.name || params.get('name') || ''].filter(Boolean).join(' ');
  return json({ ok: true, train: { number: train, title, status: code, statusHuman: st[0], statusHelp: st[1] }, stations: stOut, diagnostics: data.diagnostics });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';
  try {
    if (action === 'station-names') return stationNamesAction(context, url);
    if (action === 'route-json' || action === 'debug') return routeJsonAction(context, url);
    return html(renderPage());
  } catch (e) {
    if (action) return json({ ok: false, error: e.message, status: e.status || 500, preview: e.preview || '' }, e.status && e.status < 600 ? e.status : 500);
    return html(renderPage());
  }
}
