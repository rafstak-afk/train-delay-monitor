const BASE = 'https://pdp-api.plk-sa.pl/api/v1';

const CORS_JSON = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS_JSON });
}

function htmlResponse(body) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function getApiKey(context) {
  return context.env.PLK_API_KEY || context.env.PDP_API_KEY || '';
}

async function plkFetch(path, key) {
  const started = Date.now();
  const res = await fetch(BASE + path, {
    headers: { 'X-API-Key': key, 'Accept': 'application/json, text/plain, */*' }
  });
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  let body = null;
  if (contentType.includes('application/json')) {
    try { body = JSON.parse(text); } catch (_) { body = null; }
  }
  return {
    ok: res.ok,
    status: res.status,
    contentType,
    responseMs: Date.now() - started,
    body,
    text,
    preview: text.slice(0, 900)
  };
}

function pickName(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v.name || v.stationName || v.stopName || v.shortName || v.displayName || '';
}

function collectStationNamesFromAny(obj, map = {}) {
  if (!obj || typeof obj !== 'object') return map;

  const dictSources = [
    obj.stationNames,
    obj.stations,
    obj.dictionaries && obj.dictionaries.stations,
    obj.route && obj.route.stationNames,
    obj.operation && obj.operation.stationNames,
    obj.data && obj.data.stationNames,
    obj.data && obj.data.stations,
    obj.data && obj.data.dictionaries && obj.data.dictionaries.stations
  ];

  for (const src of dictSources) {
    if (!src || typeof src !== 'object') continue;
    for (const [k, v] of Object.entries(src)) {
      const name = pickName(v);
      if (name) map[String(k)] = name;
    }
  }

  const arrSources = [
    obj.route && obj.route.stations,
    obj.operation && obj.operation.stations,
    obj.trains,
    obj.routes,
    obj.data && obj.data.route && obj.data.route.stations,
    obj.data && obj.data.operation && obj.data.operation.stations,
    obj.data && obj.data.trains,
    obj.data && obj.data.routes
  ];

  for (const src of arrSources) {
    if (!Array.isArray(src)) continue;
    for (const item of src) {
      if (!item || typeof item !== 'object') continue;
      const id = item.stationId || item.stopId || item.id;
      const name = pickName(item);
      if (id && name) map[String(id)] = name;
      if (Array.isArray(item.stations)) {
        for (const st of item.stations) {
          const sid = st.stationId || st.stopId || st.id;
          const sname = pickName(st);
          if (sid && sname) map[String(sid)] = sname;
        }
      }
    }
  }
  return map;
}

async function resolveStationNames(ids, key) {
  const wanted = [...new Set(ids.map(String).filter(Boolean))];
  const names = {};
  const diagnostics = [];
  if (!wanted.length) return { ok: true, requested: [], names, missing: [], diagnostics };

  const stationParam = encodeURIComponent(wanted.join(','));
  const probes = [
    { source: 'operations', path: '/operations?stations=' + stationParam + '&withPlanned=true&fullRoutes=true&pageSize=500' },
    { source: 'schedules', path: '/schedules?stations=' + stationParam + '&dateFrom=' + new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }) + '&dateTo=' + new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }) + '&pageSize=500' }
  ];

  for (const probe of probes) {
    try {
      const r = await plkFetch(probe.path, key);
      const foundBefore = Object.keys(names).length;
      if (r.body) {
        const tmp = collectStationNamesFromAny(r.body, {});
        for (const id of wanted) if (!names[id] && tmp[id]) names[id] = tmp[id];
      }
      diagnostics.push({
        source: probe.source,
        status: r.status,
        responseMs: r.responseMs,
        found: Object.keys(names).length - foundBefore,
        error: r.ok ? undefined : ('PLK HTTP ' + r.status),
        contentType: r.contentType,
        preview: r.ok ? undefined : r.preview
      });
    } catch (e) {
      diagnostics.push({ source: probe.source, status: 0, error: e.message, responseMs: 0, found: 0 });
    }
  }

  const missing = wanted.filter(id => !names[id]);
  return { ok: true, requested: wanted, names, missing, diagnostics };
}

const HTML = String.raw`<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bieg pociągu</title>
<style>
:root{--bg:#101820;--panel:#1c2833;--card:#223244;--line:#34495e;--text:#fff;--muted:#b8c3cf;--blue:#0b57d0;--green:#5dd39e;--yellow:#ffcc00;--red:#ff4d4d;--violet:#c084fc;--grey:#4b5563;--cyan:#22d3ee}
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:var(--text);padding:18px}.wrap{max-width:1180px;margin:0 auto}h1{text-align:center;font-size:32px;margin:10px 0 14px}.top{display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap}.top input{padding:12px 16px;border:0;border-radius:10px;font-size:18px;min-width:260px}.btn{border:0;border-radius:10px;padding:12px 16px;background:var(--blue);color:#fff;font-weight:900;cursor:pointer;text-decoration:none;display:inline-block}.btn.secondary{background:var(--grey)}.btn.green{background:#198754}.btn.small{padding:8px 10px;font-size:12px;background:#374151}.status{text-align:center;color:var(--muted);min-height:28px;margin:12px 0}.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;margin:12px 0}.summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.label{color:var(--muted);font-size:13px}.big{font-size:24px;font-weight:900}.hint{font-size:13px;color:#d8e2ee;line-height:1.35}.route-title{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}h2{margin:0 0 8px;font-size:22px}.route-table{display:block}.rrow{display:grid;grid-template-columns:86px 1fr 105px 88px 88px;gap:10px;align-items:center;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.10);border-radius:8px}.rrow:last-child{border-bottom:0}.rrow.current{background:rgba(255,204,0,.13);outline:1px solid rgba(255,204,0,.35)}.rrow.next{background:rgba(34,211,238,.10)}.rrow.future{opacity:.82}.time{font-size:18px;font-weight:900}.time.future{color:#cbd5e1}.time.ok{color:var(--green)}.time.delay-low{color:var(--yellow)}.time.delay-mid{color:var(--red)}.time.delay-high{color:var(--violet)}.station-name{font-size:17px;font-weight:900}.station-meta{font-size:12px;color:var(--muted);margin-top:2px}.badge{display:inline-block;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:900;text-align:center;white-space:nowrap}.badge.passed{background:#14532d;color:#bbf7d0}.badge.current{background:var(--yellow);color:#102027}.badge.next{background:#0ea5e9;color:#fff}.badge.future{background:#334155;color:#e5e7eb}.delay{font-weight:900}.delay.zero{color:var(--green)}.delay.low{color:var(--yellow)}.delay.mid{color:var(--red)}.delay.high{color:var(--violet)}.err{background:#3b1d1d;border:1px solid #dc3545;color:#ffd6d6;border-radius:10px;padding:12px}.loader{display:flex;align-items:center;justify-content:center;gap:10px;margin:14px auto;color:#d8e2ee}.train-loader{position:relative;width:120px;height:22px;overflow:hidden}.train-dot{position:absolute;left:-35px;top:1px;font-size:20px;animation:ride 1.35s linear infinite}.track{position:absolute;left:0;right:0;bottom:0;border-bottom:2px dashed #5c6b7a}@keyframes ride{0%{left:-35px}100%{left:125px}}.copy-note{font-size:12px;color:var(--muted);text-align:center;margin-top:6px}
@media(max-width:720px){body{padding:8px}h1{font-size:25px}.top{display:grid;grid-template-columns:1fr auto;align-items:center}.top input{min-width:0;width:100%;font-size:16px}.top .secondary{grid-column:1 / span 2;text-align:center}.summary{grid-template-columns:1fr}.panel{padding:9px}.rrow{grid-template-columns:62px 1fr 70px;gap:6px;padding:8px 6px}.rrow .status-cell{grid-column:1}.rrow .station-cell{grid-column:2}.rrow .delay-cell{grid-column:3;text-align:right}.rrow .platform-cell{grid-column:2 / span 2;font-size:12px;color:var(--muted)}.station-name{font-size:15px}.time{font-size:17px}.badge{font-size:11px;padding:3px 7px}.big{font-size:20px}}
</style>
</head>
<body>
<div class="wrap">
  <h1>🚆 Bieg pociągu</h1>
  <div class="top">
    <input id="trainInput" inputmode="numeric" placeholder="Wpisz numer pociągu" />
    <button class="btn" id="showBtn" onclick="loadTrain()">Pokaż</button>
    <a class="btn secondary" href="/">← Tablica</a>
  </div>
  <div id="status" class="status">Kliknij numer pociągu na tablicy albo wpisz numer ręcznie.</div>
  <div id="content"></div>
</div>
<script>
function qs(name){return new URLSearchParams(location.search).get(name)||''}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function shortTime(v){if(!v)return'';const m=String(v).match(/(\d{2}:\d{2})/);return m?m[1]:String(v)}
function setStatus(t){document.getElementById('status').textContent=t}
function todayIso(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'})}
function nowMin(){const p=new Date().toLocaleTimeString('pl-PL',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit',hour12:false}).split(':').map(Number);return p[0]*60+p[1]}
function toMin(t){const s=shortTime(t);const m=s.match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function delayClass(d){if(d>=20)return'high';if(d>10)return'mid';if(d>0)return'low';return'zero'}
function detailsParams(){const p=new URLSearchParams();['date','scheduleId','scheduledId','orderId','trainOrderId','stationId','station','category','name','destination'].forEach(k=>{const v=qs(k);if(v)p.set(k,v)});return p}
function portalUrl(train){return 'https://portalpasazera.pl/ZnajdzPociag'}
function pickName(v){if(!v)return'';if(typeof v==='string')return v;return v.name||v.stationName||v.stopName||v.shortName||''}
function stationId(s){return String(s.stationId||s.stopId||s.id||'')}
function seqOf(s,i){return Number(s.orderNumber||s.plannedSequenceNumber||s.actualSequenceNumber||s.sequenceNumber||s.idx||i+1)}
function stationDirectName(s){return s.stationName||s.name||s.stopName||s.station||''}
function makeInitialNameMap(data){const map={};const sources=[data.stationNames,data.stations,data.dictionaries&&data.dictionaries.stations,data.route&&data.route.stationNames,data.operation&&data.operation.stationNames];for(const src of sources){if(!src)continue;for(const k in src){const n=pickName(src[k]);if(n)map[String(k)]=n}}return map}
function stationTitle(s,map){const id=stationId(s);return stationDirectName(s)||map[id]||'stacja ID '+id}
function stationSource(s,map){if(stationDirectName(s))return'nazwa: API';if(map[stationId(s)])return'nazwa: słownik PLK / cache';return'nazwa: brak nazwy w API'}
function getRouteStations(data){return data.route&&Array.isArray(data.route.stations)?data.route.stations:[]}
function getOperationStations(data){return data.operation&&Array.isArray(data.operation.stations)?data.operation.stations:[]}
function normalizeStations(data){const route=getRouteStations(data);const ops=getOperationStations(data);const opBySeq={};const opById={};ops.forEach((o,i)=>{opBySeq[seqOf(o,i)]=o;opById[stationId(o)]=o});const base=route.length?route:ops;return base.map((r,i)=>{const seq=seqOf(r,i);const id=stationId(r);return Object.assign({},r,opBySeq[seq]||opById[id]||{}, {idx:i+1,_seq:seq})}).sort((a,b)=>a._seq-b._seq)}
function plannedTime(s){return s.plannedDeparture||s.plannedArrival||s.plannedDepartureTime||s.plannedArrivalTime||s.departureTime||s.arrivalTime||''}
function actualTime(s){return s.actualDeparture||s.actualArrival||s.actualDepartureTime||s.actualArrivalTime||''}
function effectiveTime(s){return actualTime(s)||plannedTime(s)}
function confirmedByApi(s){return s.isConfirmed===true||s.confirmed===true||s.stationStatus==='CONFIRMED'||s.status==='CONFIRMED'}
function isActuallyPassed(s,nm){const a=actualTime(s);if(a&&toMin(a)!==null&&toMin(a)<=nm)return true;if(confirmedByApi(s))return true;return false}
function renderTime(s,state){const p=shortTime(plannedTime(s));const a=shortTime(actualTime(s));const show=a&&a!==p;const d=show?Math.max(0,(toMin(a)||0)-(toMin(p)||0)):0;const main=show?a:(p||a||'');const cls=state==='future'?'future':(show?'delay-'+delayClass(d):'ok');return '<div class="time '+cls+'">'+esc(main)+'</div>'+(show?'<div class="station-meta">plan '+esc(p)+'</div>':'')}
function renderDelay(s){const p=toMin(plannedTime(s));const a=toMin(actualTime(s));const d=(p!=null&&a!=null)?Math.max(0,a-p):0;const cls=delayClass(d);return '<span class="delay '+cls+'">'+d+' min</span>'}
function loading(train){document.getElementById('content').innerHTML='<div class="panel"><div class="loader"><div class="train-loader"><div class="track"></div><div class="train-dot">🚆</div></div><strong>Pobieram bieg pociągu '+esc(train)+'...</strong></div><div class="copy-note">Czekam na dane PLK. Spokojnie, to nie cisza, to informatyka.</div></div>'}
async function resolveNamesForStations(stations,map){const ids=[...new Set(stations.map(stationId).filter(id=>id&&!map[id]))];if(!ids.length)return map;try{const r=await fetch('/train?action=station-names&ids='+encodeURIComponent(ids.join(',')),{headers:{Accept:'application/json'}});const data=await r.json();if(data&&data.names){for(const k in data.names){map[String(k)]=data.names[k]}}}catch(_){}return map}
function summaryName(route,train){return [route.commercialCategorySymbol||qs('category')||'',route.nationalNumber||train,route.name||qs('name')||''].filter(Boolean).join(' ')}
async function loadTrain(){const train=(document.getElementById('trainInput').value||'').trim();if(!train){setStatus('Wpisz numer pociągu.');return}document.getElementById('trainInput').blur();setStatus('Pobieram bieg pociągu...');loading(train);const idp=detailsParams();const schedule=idp.get('scheduleId')||idp.get('scheduledId');const order=idp.get('orderId');try{if(!schedule||!order){renderFallback(train,'Do pełnego biegu potrzebny jest link z tablicy odjazdów z identyfikatorami kursu.');return}const q=new URLSearchParams();q.set('action','train-route');q.set('scheduleId',schedule);q.set('orderId',order);q.set('train',train);q.set('operatingDate',idp.get('date')||todayIso());if(idp.get('trainOrderId'))q.set('trainOrderId',idp.get('trainOrderId'));if(idp.get('stationId'))q.set('stationId',idp.get('stationId'));if(idp.get('station'))q.set('station',idp.get('station'));const r=await fetch('/api?'+q.toString(),{headers:{Accept:'application/json'}});const data=await r.json();if(!r.ok)throw new Error(data.error||data.details||'HTTP '+r.status);await renderTrain(train,data)}catch(e){document.getElementById('content').innerHTML='<div class="panel err">Nie udało się pobrać biegu pociągu: '+esc(e.message)+'</div>';setStatus('Błąd pobierania biegu pociągu.')}}
async function renderTrain(train,data){const route=data.route||{};const op=data.operation||{};const stations=normalizeStations(data);let map=makeInitialNameMap(data);map=await resolveNamesForStations(stations,map);const nm=nowMin();let passedIdx=-1;stations.forEach((s,i)=>{if(isActuallyPassed(s,nm))passedIdx=i});let focusIdx=passedIdx>=0?passedIdx:stations.findIndex(s=>{const t=toMin(effectiveTime(s));return t!=null&&t>=nm});if(focusIdx<0)focusIdx=0;const last=passedIdx>=0?stations[passedIdx]:null;const title=summaryName(route,train);const statusText=op.trainStatus?('Kod PLK: '+op.trainStatus):'brak statusu';setStatus('Gotowe.');let html='<div class="panel"><div class="summary"><div class="card"><div class="label">Pociąg</div><div class="big">'+esc(title||('Pociąg '+train))+'</div><div class="hint">Status: '+esc(statusText)+'</div></div><div class="card"><div class="label">Ostatnia potwierdzona stacja</div><div class="big">'+esc(last?stationTitle(last,map):'brak potwierdzonej stacji')+'</div><div class="hint">'+esc(last?shortTime(effectiveTime(last)):'Brak twardego potwierdzenia z API.')+'</div></div></div><div style="margin-top:10px"><a class="btn green" target="_blank" rel="noopener" href="'+esc(portalUrl(train))+'">Otwórz Portal Pasażera</a> <button class="btn small" onclick="copySummary()">Kopiuj podsumowanie</button></div></div>';
html+='<div class="panel"><div class="route-title"><h2>Trasa stacja po stacji</h2><div class="hint">„Zaliczona” tylko przy potwierdzeniu API albo czasie rzeczywistym nie późniejszym niż teraz.</div></div><div class="route-table">';
stations.forEach((s,i)=>{let state='future',txt='przed';if(i<passedIdx){state='passed';txt='zaliczona'}else if(i===passedIdx){state='current';txt='ostatnia'}else if(i===passedIdx+1|| (passedIdx<0&&i===focusIdx)){state='next';txt='następna'}const plat=[s.departurePlatform||s.arrivalPlatform||'',s.departureTrack||s.arrivalTrack||''].filter(Boolean).join(' / ')||'—';html+='<div id="station-'+i+'" class="rrow '+state+'"><div class="status-cell"><span class="badge '+(state==='passed'?'passed':state==='current'?'current':state==='next'?'next':'future')+'">'+esc(txt)+'</span></div><div class="station-cell"><div class="station-name">'+esc(stationTitle(s,map))+'</div><div class="station-meta">ID '+esc(stationId(s))+' · kolejność: '+esc(s._seq)+'</div><div class="station-meta">'+esc(stationSource(s,map))+'</div></div><div>'+renderTime(s,state)+'</div><div class="delay-cell"><div class="station-meta">opóźnienie</div>'+renderDelay(s)+'</div><div class="platform-cell"><div class="station-meta">peron / tor</div><strong>'+esc(plat)+'</strong></div></div>'});
html+='</div></div>';document.getElementById('content').innerHTML=html;window._trainSummary=document.body.innerText.replace(/\n{3,}/g,'\n\n');setTimeout(()=>{const el=document.getElementById('station-'+focusIdx);if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},150)}
function renderFallback(train,msg){setStatus('Nie mam identyfikatorów kursu z tablicy.');document.getElementById('content').innerHTML='<div class="panel"><h2>Pociąg '+esc(train)+'</h2><div class="err">'+esc(msg||'Brak pełnych identyfikatorów kursu.')+'</div><p class="hint">Kliknij numer pociągu bezpośrednio z naszej tablicy odjazdów. Sam numer może oznaczać więcej niż jeden kurs.</p><a class="btn green" target="_blank" rel="noopener" href="'+esc(portalUrl(train))+'">Otwórz wyszukiwarkę w Portal Pasażera</a></div>'}
function copySummary(){navigator.clipboard&&navigator.clipboard.writeText(window._trainSummary||document.body.innerText)}
document.addEventListener('DOMContentLoaded',function(){const input=document.getElementById('trainInput');const t=qs('train');if(t){input.value=t;loadTrain()}input.addEventListener('keydown',function(e){if(e.key==='Enter')loadTrain()})});
</script>
</body>
</html>`;

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const key = getApiKey(context);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_JSON });

  if (action === 'station-names') {
    if (!key) return json({ ok: false, status: 'AUTH', human: 'Problem autoryzacji API', error: 'Brak PLK_API_KEY/PDP_API_KEY' }, 500);
    const ids = (url.searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
    return json(await resolveStationNames(ids, key));
  }

  if (action === 'debug') {
    return json({ ok: true, path: url.pathname, query: Object.fromEntries(url.searchParams.entries()), message: 'Debug /train działa. HTML jest zwracany tylko bez action.' });
  }

  return htmlResponse(HTML);
}
