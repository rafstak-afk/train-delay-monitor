const BASE = 'https://pdp-api.plk-sa.pl/api/v1';

function htmlEscape(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

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

async function plkFetch(path, env) {
  const key = env.PLK_API_KEY || env.PDP_API_KEY || '';
  if (!key) throw new Error('Brak zmiennej środowiskowej PLK_API_KEY');
  const started = Date.now();
  const res = await fetch(BASE + path, { headers: { 'X-API-Key': key, 'Accept': 'application/json' } });
  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';
  let body = null;
  if (contentType.includes('application/json')) {
    try { body = JSON.parse(text); } catch (_) { body = null; }
  }
  if (!res.ok) {
    const e = new Error('PLK HTTP ' + res.status);
    e.status = res.status;
    e.contentType = contentType;
    e.preview = text.slice(0, 1200);
    e.responseMs = Date.now() - started;
    throw e;
  }
  return { body, text, contentType, responseMs: Date.now() - started, status: res.status };
}

function collectStationNamesFromObject(obj, out) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) collectStationNamesFromObject(item, out);
    return;
  }

  const possibleId = obj.stationId || obj.stopId || obj.id;
  const possibleName = obj.stationName || obj.name || obj.stopName || obj.shortName;
  if (possibleId && possibleName) out[String(possibleId)] = String(possibleName);

  for (const [k, v] of Object.entries(obj)) {
    if ((k === 'stations' || k === 'stationNames') && v && typeof v === 'object') {
      if (Array.isArray(v)) {
        for (const item of v) collectStationNamesFromObject(item, out);
      } else {
        for (const [id, val] of Object.entries(v)) {
          if (typeof val === 'string') out[String(id)] = val;
          else if (val && typeof val === 'object') {
            const n = val.name || val.stationName || val.stopName || val.shortName;
            if (n) out[String(id)] = String(n);
          }
        }
      }
    }
    if (v && typeof v === 'object') collectStationNamesFromObject(v, out);
  }
}

async function stationNamesAction(url, env) {
  const ids = (url.searchParams.get('ids') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const requested = [...new Set(ids)];
  const names = {};
  const diagnostics = [];

  async function trySource(source, path) {
    const started = Date.now();
    try {
      const { body, contentType, responseMs, status } = await plkFetch(path, env);
      collectStationNamesFromObject(body, names);
      const found = requested.filter(id => names[id]).length;
      diagnostics.push({ source, status, responseMs, found, contentType });
    } catch (e) {
      diagnostics.push({
        source,
        status: e.status || 0,
        responseMs: e.responseMs || (Date.now() - started),
        found: requested.filter(id => names[id]).length,
        error: e.message,
        contentType: e.contentType || '',
        preview: e.preview || ''
      });
    }
  }

  if (requested.length) {
    const stationParam = encodeURIComponent(requested.join(','));
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
    await trySource('operations', `/operations?stations=${stationParam}&withPlanned=true&fullRoutes=true&pageSize=500`);
    await trySource('schedules', `/schedules?stations=${stationParam}&dateFrom=${today}&dateTo=${today}&pageSize=500`);
  }

  const filtered = {};
  for (const id of requested) if (names[id]) filtered[id] = names[id];
  return json({
    ok: true,
    requested,
    names: filtered,
    missing: requested.filter(id => !filtered[id]),
    diagnostics
  });
}

async function debugAction(url, env) {
  return json({
    ok: true,
    message: 'Endpoint /train działa. Do pełnego biegu potrzebne są scheduleId/scheduledId, orderId, trainOrderId i date z linku tablicy.',
    received: Object.fromEntries(url.searchParams.entries())
  });
}

const HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bieg pociągu</title>
<style>
:root{--bg:#101820;--panel:#1c2833;--card:#223244;--border:#34495e;--text:#fff;--muted:#b8c3cf;--green:#5dd39e;--yellow:#ffcc00;--red:#ff4d4d;--violet:#c084fc;--blue:#0b57d0;--grey:#4b5563;--cyan:#22d3ee}
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:var(--text);padding:14px}.wrap{max-width:1180px;margin:0 auto}.top{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}h1{margin:0;font-size:30px}.back{background:var(--grey);color:#fff;text-decoration:none;border-radius:10px;padding:10px 14px;font-weight:800}.panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:10px;margin:10px 0}.search{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.search input{min-width:260px;border:0;border-radius:10px;padding:10px 13px;font-size:18px}.btn{border:0;border-radius:10px;padding:10px 14px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer}.btn2{display:inline-block;border-radius:10px;padding:13px 18px;background:#198754;color:#fff;text-decoration:none;font-weight:800;margin-top:12px}.btn3{display:inline-block;border:0;border-radius:10px;padding:9px 11px;background:var(--grey);color:#fff;text-decoration:none;font-weight:800;margin-left:8px}.muted{opacity:.76}.err{background:#3b1d1d;border:1px solid #dc3545;color:#ffd6d6;border-radius:10px;padding:12px;margin-top:12px}.loading{background:#1f3042;border:1px solid #42607c;border-radius:12px;padding:12px;margin:12px auto;text-align:center;color:#dbeafe;max-width:620px}.train-loader{height:30px;position:relative;overflow:hidden;margin:2px auto 8px;max-width:320px}.train-mini{position:absolute;left:-60px;top:2px;font-size:24px;animation:trainIn 1.7s ease-in-out infinite}.track-mini{position:absolute;left:0;right:0;bottom:3px;border-bottom:2px dashed rgba(255,255,255,.35)}@keyframes trainIn{0%{transform:translateX(0);opacity:.25}45%{opacity:1}100%{transform:translateX(390px);opacity:.25}}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:8px}.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px}.card .label{font-size:16px;color:var(--muted);margin-bottom:4px}.card .value{font-size:22px;font-weight:900}.route{margin-top:12px}.section-title{font-size:22px;margin:0 0 8px}.section-note{font-size:14px;color:#d6e4f0;margin:0 0 14px;line-height:1.35}.station{display:grid;grid-template-columns:92px 1fr 96px 90px 76px;gap:10px;padding:7px 9px;border-bottom:1px solid rgba(255,255,255,.12);align-items:center}.station:last-child{border-bottom:0}.station.passed{opacity:.82}.station.current{background:#263b52;border-radius:10px;opacity:1}.station.next{background:rgba(255,204,0,.10);border-radius:10px}.station.future .timebox,.station.plan .timebox{opacity:.72}.badge{font-size:11px;border-radius:999px;padding:5px 10px;background:var(--grey);display:inline-block;font-weight:900;text-align:center}.badge.passed{background:#198754}.badge.current{background:var(--yellow);color:#102027}.badge.next{background:#0dcaf0;color:#102027}.badge.plan{background:#334155;color:#cbd5e1}.station-name{font-size:16px;font-weight:900}.station-id{font-size:11px;color:var(--muted);margin-top:2px;line-height:1.2}.small{font-size:11px;color:var(--muted)}.time-one{font-size:17px;font-weight:900;color:var(--green)}.time-real{font-size:17px;font-weight:900}.time-plan{font-size:13px;color:var(--muted);margin-bottom:2px}.delay-zero{color:var(--green);font-weight:900}.delay-low{color:var(--yellow);font-weight:900}.delay-mid{color:var(--red);font-weight:900}.delay-high{color:var(--violet);font-weight:900}.platform{font-size:15px;font-weight:800}.status-help{font-size:15px;color:#d7e2ee;line-height:1.35;margin-top:6px}.source{font-size:10px;color:#8fa4b7;margin-top:1px}.route-head{display:grid;grid-template-columns:92px 1fr 96px 90px 76px;gap:10px;padding:4px 9px;color:var(--muted);font-size:11px;border-bottom:1px solid rgba(255,255,255,.14);text-transform:uppercase;letter-spacing:.04em}@media(max-width:760px){body{padding:8px}h1{font-size:24px}.top{justify-content:flex-start}.search{display:grid;grid-template-columns:1fr 78px 96px;gap:7px}.search input{min-width:0;width:100%;font-size:16px}.btn,.back{width:auto;text-align:center;padding:9px 10px}.station{grid-template-columns:70px 1fr 62px;gap:6px;padding:7px 6px}.route-head{display:none}.station .platform-wrap{grid-column:3;grid-row:1 / span 2}.station .timebox,.station .delaybox{grid-column:auto}.station-name{font-size:15px}.panel{padding:8px}.card .value{font-size:19px}.source{display:none}.station-id{font-size:10px}.badge{padding:4px 6px}.section-note{font-size:12px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top"><h1>🚆 Bieg pociągu</h1></div>
  <div class="search">
    <input id="trainInput" placeholder="Wpisz numer pociągu" inputmode="numeric" />
    <button id="showBtn" class="btn" type="button">Pokaż</button>
    <a class="back" href="/">← Tablica</a>
  </div>
  <div id="status" class="muted" style="text-align:center;margin:14px 0">Kliknij numer pociągu na tablicy albo wpisz numer ręcznie.</div>
  <div id="result"></div>
</div>
<script>
function qs(name){return new URLSearchParams(location.search).get(name)||''}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function short(v){if(!v)return'';const m=String(v).match(/(\\d{2}:\\d{2})/);return m?m[1]:String(v)}
function setStatus(t){document.getElementById('status').textContent=t}
function setLoading(t){document.getElementById('result').innerHTML='<div class="loading"><div class="train-loader"><span class="track-mini"></span><span class="train-mini">🚆</span></div><b>'+esc(t)+'</b><div class="small" style="margin-top:4px">Czekam na odpowiedź API PLK...</div></div>'}
function portalUrl(){return 'https://portalpasazera.pl/ZnajdzPociag'}
function copyText(text){navigator.clipboard?.writeText(text).then(()=>setStatus('Skopiowano do schowka.')).catch(()=>setStatus('Nie udało się skopiować.'))}
const STATUS_MAP={P:['Kurs aktywny / w realizacji','Kod PLK: P. Dane wykonania są dostępne, ale status nie jest komunikatem dla pasażera.'],S:['Rozkładowy / bez potwierdzenia realizacji','Kod PLK: S. Dane wyglądają na rozkładowe, bez pewnego potwierdzenia bieżącej realizacji.'],C:['Odwołany','Kod PLK: C. Kurs odwołany.'],X:['Odwołany','Kod PLK: X. Kurs odwołany.'],R:['W ruchu','Kod PLK: R. Pociąg w ruchu.'],Z:['Zakończony','Kod PLK: Z. Bieg zakończony.']};
function statusText(code){return STATUS_MAP[code]||[code?('Kod statusu: '+code):'brak danych','Brak opisu tego kodu w lokalnym słowniku.']}
function extractInlineName(s){return s.stationName||s.name||s.stopName||s.station||s.shortName||''}
function collectIds(data){const ids=new Set();for(const s of [...(data.route?.stations||[]),...(data.operation?.stations||[])]){const id=s.stationId||s.stopId;if(id)ids.add(String(id))}return [...ids]}
async function resolveNames(ids){if(!ids.length)return{};const cacheKey='plkStationNameCache';let cache={};try{cache=JSON.parse(localStorage.getItem(cacheKey)||'{}')}catch(_){cache={}}const missing=ids.filter(id=>!cache[id]);if(missing.length){try{const r=await fetch('/train?action=station-names&ids='+encodeURIComponent(missing.join(',')),{headers:{Accept:'application/json'}});const j=await r.json();if(j&&j.names){Object.assign(cache,j.names);localStorage.setItem(cacheKey,JSON.stringify(cache));}}catch(_){}}
const out={};ids.forEach(id=>{if(cache[id])out[id]=cache[id]});return out}
function stationTitle(s,map){const id=String(s.stationId||s.stopId||'');const inline=extractInlineName(s);if(inline)return {name:inline,source:'API'};if(map[id])return {name:map[id],source:'słownik PLK / cache'};return {name:'Nieznana stacja',source:'brak nazwy w API'}}
function seqOf(s,i){return Number(s.orderNumber||s.plannedSequenceNumber||s.actualSequenceNumber||s.sequenceNumber||i+1)}
function timeToMin(t){const m=short(t).match(/^(\\d{2}):(\\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function getPlanned(o,s){return o.plannedDepartureTime||o.plannedArrivalTime||o.plannedDeparture||o.plannedArrival||s.plannedDepartureTime||s.plannedArrivalTime||s.plannedDeparture||s.plannedArrival||s.departureTime||s.arrivalTime||''}
function getActual(o,s){return o.actualDepartureTime||o.actualArrivalTime||o.actualDeparture||o.actualArrival||s.actualDepartureTime||s.actualArrivalTime||s.actualDeparture||s.actualArrival||''}
function isConfirmedStop(s){return s.isConfirmed===true||s.confirmed===true||!!(s.actualArrival||s.actualDeparture||s.actualArrivalTime||s.actualDepartureTime)}
function delayMinutes(planned,actual){const p=timeToMin(planned),a=timeToMin(actual);if(p==null||a==null)return 0;return a-p}
function delayClass(d){return d>=20?'delay-high':d>10?'delay-mid':d>0?'delay-low':'delay-zero'}
function renderTime(planned,actual,isFuture){const p=short(planned),a=short(actual);if(!a||a===p)return '<div class="time-one">'+esc(p||a||'—')+'</div>';const d=Math.max(0,delayMinutes(p,a));return '<div class="time-plan">plan '+esc(p)+'</div><div class="time-real '+delayClass(d)+'">real '+esc(a)+'</div>'}
function renderDelay(planned,actual){const d=Math.max(0,delayMinutes(short(planned),short(actual)));return '<div class="'+delayClass(d)+'">'+d+' min</div>'}
function buildStations(data){const route=data.route?.stations||[];const ops=data.operation?.stations||[];const opBySeq={};ops.forEach((s,i)=>{opBySeq[seqOf(s,i)]=s});return (route.length?route:ops).map((s,i)=>{const seq=seqOf(s,i);return {s:Object.assign({},s,opBySeq[seq]||{}),seq}}).sort((a,b)=>a.seq-b.seq)}
function findLastConfirmed(rows){let last=null;for(const row of rows){if(isConfirmedStop(row.s))last=row}return last}
async function render(data, trainNo){
  const result=document.getElementById('result');const route=data.route||{};const op=data.operation||{};const rowsData=buildStations(data);const stationNames=await resolveNames(collectIds(data));
  const title=[route.commercialCategorySymbol||qs('category'),route.nationalNumber||trainNo,route.name||qs('name')].filter(Boolean).join(' ');
  const st=statusText(op.trainStatus);
  const last=findLastConfirmed(rowsData);
  let lastLabel='brak potwierdzonej stacji', lastTime='';
  if(last){const info=stationTitle(last.s,stationNames);lastLabel=info.name+' · ID '+(last.s.stationId||last.s.stopId||'');lastTime=short(getActual(last.s,last.s)||getPlanned(last.s,last.s));}
  let html='<div class="panel"><div class="meta"><div class="card"><div class="label">Pociąg</div><div class="value">'+esc(title||('Pociąg '+trainNo))+'</div><div class="status-help">Status: '+esc(st[0])+'<br>'+esc(st[1])+'</div></div><div class="card"><div class="label">Ostatnia potwierdzona stacja</div><div class="value">'+esc(lastLabel)+'</div><div class="status-help">'+esc(lastTime)+'</div></div></div><a class="btn2" href="'+esc(portalUrl())+'" target="_blank" rel="noopener">Otwórz Portal Pasażera</a><button class="btn3" onclick="copyText(window.summaryText||document.body.innerText)">Kopiuj podsumowanie</button></div>';
  window.summaryText=(title||('Pociąg '+trainNo))+'\\nStatus: '+st[0]+'\\nOstatnia potwierdzona stacja: '+lastLabel+(lastTime?' '+lastTime:'');
  if(!rowsData.length){result.innerHTML=html+'<div class="panel"><div class="err">Brak listy stacji w odpowiedzi API.</div></div>';return}
  const lastSeq=last?last.seq:null;
  const rows=rowsData.map((row,idx)=>{const s=row.s,seq=row.seq;const planned=getPlanned(s,s);const actual=getActual(s,s);let state='future',badge='plan',text='przed';
    if(lastSeq!==null){if(seq<lastSeq){state='passed';badge='passed';text='zaliczona'}else if(seq===lastSeq){state='current';badge='current';text='ostatnia'}else if(seq===lastSeq+1){state='next';badge='next';text='następna'}else{text='przed'}}
    else {state='plan';badge='plan';text='plan'}
    const id=s.stationId||s.stopId||'';const nameInfo=stationTitle(s,stationNames);const platform=[s.departurePlatform||s.arrivalPlatform||'',s.departureTrack||s.arrivalTrack||''].filter(Boolean).join(' / ');
    return '<div class="station '+state+'"><div><span class="badge '+badge+'">'+esc(text)+'</span></div><div><div class="station-name">'+esc(nameInfo.name)+'</div><div class="station-id">ID '+esc(id)+' · kolejność: '+esc(seq)+'</div><div class="source">nazwa: '+esc(nameInfo.source)+'</div></div><div class="timebox"><div class="small">czas</div>'+renderTime(planned,actual,state==='future')+'</div><div class="delaybox"><div class="small">opóźnienie</div>'+renderDelay(planned,actual)+'</div><div class="platform-wrap"><div class="small">peron / tor</div><div class="platform">'+esc(platform||'—')+'</div></div></div>'}).join('');
  html+='<div class="panel"><h2 class="section-title">Trasa stacja po stacji</h2><p class="section-note">Status „zaliczona” pokazujemy tylko dla stacji z potwierdzeniem realizacji. Same godziny planowe nie oznaczają, że pociąg już tam był.</p><div class="route-head"><div>Status</div><div>Stacja</div><div>Czas</div><div>Opóźn.</div><div>Per/tor</div></div><div class="route">'+rows+'</div></div>';result.innerHTML=html;setTimeout(()=>{const el=document.querySelector('.station.current')||document.querySelector('.station.next');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});},250);
}
async function loadTrain(){const n=document.getElementById('trainInput').value.trim();if(!n){setStatus('Wpisz numer pociągu.');return}document.getElementById('trainInput').blur();setStatus('Pobieram dane o biegu pociągu '+n+'...');setLoading('Pobieram bieg pociągu...');const p=new URLSearchParams();const date=qs('date'),scheduleId=qs('scheduleId')||qs('scheduledId'),orderId=qs('orderId'),trainOrderId=qs('trainOrderId'),stationId=qs('stationId'),station=qs('station');if(date)p.set('date',date);if(scheduleId)p.set('scheduleId',scheduleId);if(orderId)p.set('orderId',orderId);if(trainOrderId)p.set('trainOrderId',trainOrderId);if(stationId)p.set('stationId',stationId);if(station)p.set('station',station);try{if(!scheduleId||!orderId){throw new Error('Do pełnego biegu potrzebny jest link z tablicy z identyfikatorami kursu. Sam numer pociągu może oznaczać kilka kursów.');}const r=await fetch('/api/debug-train?'+p.toString(),{headers:{Accept:'application/json'}});const data=await r.json();if(!r.ok)throw new Error(data.error||data.details||('HTTP '+r.status));await render(data,n);setStatus('Gotowe.')}catch(e){document.getElementById('result').innerHTML='<div class="panel"><h2>Pociąg '+esc(n)+'</h2><div class="err">'+esc(e.message)+'</div><a class="btn2" href="'+esc(portalUrl())+'" target="_blank" rel="noopener">Otwórz w Portal Pasażera</a></div>';setStatus('Nie udało się pobrać pełnego biegu lokalnie.');}}
function init(){const n=qs('train');if(n){document.getElementById('trainInput').value=n;loadTrain()}document.getElementById('showBtn').addEventListener('click',loadTrain);document.getElementById('trainInput').addEventListener('keydown',e=>{if(e.key==='Enter')loadTrain()});}
document.addEventListener('DOMContentLoaded',init);
</script>
</body>
</html>`;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';

  if (action === 'station-names') return stationNamesAction(url, context.env || {});
  if (action === 'debug') return debugAction(url, context.env || {});

  return new Response(HTML, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
