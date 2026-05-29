const BASE = 'https://pdp-api.plk-sa.pl/api/v1';

const HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bieg pociągu</title>
<style>
:root{--bg:#101820;--panel:#1c2833;--card:#223244;--border:#34495e;--blue:#0b57d0;--green:#5dd39e;--yellow:#ffcc00;--red:#ff4d4d;--violet:#c084fc;--muted:rgba(255,255,255,.68);--grey:#4b5563}
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:#fff;padding:22px}.wrap{max-width:1120px;margin:0 auto}h1{text-align:center;margin:8px 0 18px;font-size:34px}.top{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;margin-bottom:14px}.top input{padding:13px 16px;border:0;border-radius:10px;font-size:22px;min-width:260px}.btn{border:0;border-radius:10px;padding:13px 18px;background:var(--blue);color:#fff;font-weight:900;cursor:pointer;text-decoration:none;display:inline-block}.btn.secondary{background:var(--grey)}.btn.green{background:#198754}.btn.copy{background:#374151;padding:9px 11px;font-size:13px}.status{text-align:center;min-height:24px;color:var(--muted);font-size:18px;margin:8px 0 16px}.panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px;margin:14px 0}.summary{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:15px}.label{color:var(--muted);font-size:15px;margin-bottom:5px}.big{font-size:27px;font-weight:900}.help{color:#d6e2ef;line-height:1.35;margin-top:6px}.err{background:#3b1d1d;border:1px solid #dc3545;color:#ffd6d6;border-radius:12px;padding:13px}.route-head{font-size:28px;margin:0 0 10px}.note{color:#cfe1f5;margin-bottom:12px}.row{display:grid;grid-template-columns:110px 1fr 155px 120px;gap:12px;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,.10)}.row:last-child{border-bottom:0}.row.current{background:#263b52;border-radius:10px}.row.next{background:rgba(255,204,0,.12);border-radius:10px}.row.future{opacity:.78}.badge{display:inline-block;border-radius:999px;padding:5px 10px;font-size:13px;font-weight:900}.badge.passed{background:#14532d;color:#bbf7d0}.badge.current{background:var(--yellow);color:#102027}.badge.next{background:#0dcaf0;color:#102027}.badge.future,.badge.plan{background:#334155;color:#dbeafe}.station-name{font-size:21px;font-weight:900}.station-id{font-size:13px;color:#b8c3cf;margin-top:3px}.time-one{font-size:21px;font-weight:900;color:var(--green)}.time-muted{font-size:21px;font-weight:900;color:#b9c7d6}.time-plan{font-size:13px;color:#b8c3cf}.time-real{font-size:20px;font-weight:900}.delay{font-size:18px;font-weight:900;color:var(--green)}.delay-low{color:var(--yellow)}.delay-mid{color:var(--red)}.delay-high{color:var(--violet)}.small{font-size:13px;color:#c7d3df}.platform{font-size:18px;font-weight:900}.details{margin-top:10px;color:#b8c3cf;font-size:13px}pre{white-space:pre-wrap;word-break:break-word;background:#0b1118;border:1px solid #34495e;border-radius:10px;padding:10px;color:#dbeafe;max-height:260px;overflow:auto}@media(max-width:720px){body{padding:10px}h1{font-size:26px}.top{display:grid;grid-template-columns:1fr auto}.top input{min-width:0;width:100%;font-size:18px}.summary{grid-template-columns:1fr}.row{grid-template-columns:82px 1fr;gap:8px;padding:10px 6px}.row .timebox,.row .platformbox{grid-column:2}.station-name{font-size:17px}.btn{padding:11px 13px}.panel{padding:12px}}
</style>
</head>
<body>
<div class="wrap">
<h1>🚆 Bieg pociągu</h1>
<div class="top">
<input id="trainInput" inputmode="numeric" placeholder="Wpisz numer pociągu" />
<button class="btn" onclick="loadTrain()">Pokaż</button>
<a class="btn secondary" href="/">← Tablica</a>
</div>
<div id="status" class="status">Kliknij numer pociągu na tablicy albo wpisz numer ręcznie.</div>
<div id="content"></div>
</div>
<script>
function qs(name){return new URLSearchParams(location.search).get(name)||''}
function esc(v){return String(v==null?'':v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function shortTime(v){if(!v)return'';var m=String(v).match(/(\d{2}:\d{2})/);return m?m[1]:String(v)}
function setStatus(t){document.getElementById('status').textContent=t}
function portalUrl(){return 'https://portalpasazera.pl/ZnajdzPociag'}
function todayIso(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'})}
function timeToMin(t){var s=shortTime(t);var m=s.match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function delayMinutes(planned,actual){var p=timeToMin(planned),a=timeToMin(actual);if(p==null||a==null)return 0;return a-p}
function delayClass(d){return d>=20?'delay-high':d>10?'delay-mid':d>0?'delay-low':''}
function statusInfo(code){var map={P:['Kurs aktywny / w realizacji','Kod PLK: P. Pociąg jest w biegu albo w bieżącej obsłudze systemu.'],S:['Rozkładowy / bez potwierdzenia realizacji','Kod PLK: S. Dane wyglądają na rozkładowe, bez pewnego potwierdzenia bieżącej realizacji.'],R:['W ruchu','Kod PLK: R. Pociąg jest w ruchu.'],Z:['Zakończony','Kod PLK: Z. Bieg zakończony.'],C:['Odwołany','Kod PLK: C. Kurs odwołany.'],X:['Odwołany','Kod PLK: X. Kurs odwołany.']};return map[code]||[code?('Kod statusu: '+code):'Brak statusu','Brak opisu tego kodu w naszej warstwie tłumaczenia.']}
function plannedOf(s){return s.plannedDepartureTime||s.plannedArrivalTime||s.plannedDeparture||s.plannedArrival||s.departureTime||s.arrivalTime||''}
function actualOf(s){return s.actualDepartureTime||s.actualArrivalTime||s.actualDeparture||s.actualArrival||''}
function platformOf(s){return [s.departurePlatform||s.arrivalPlatform||'',s.departureTrack||s.arrivalTrack||''].filter(Boolean).join(' / ')}
function seqOf(s,i){return Number(s.orderNumber||s.plannedSequenceNumber||s.actualSequenceNumber||s.sequenceNumber||i+1)}
function ownName(s){return s.stationName||s.name||s.stopName||s.station||''}
function stationTitle(s,nameMap){var id=String(s.stationId||s.stopId||'');return ownName(s)||nameMap[id]||'Nieznana stacja'}
function renderTime(planned,actual,isFuture){var p=shortTime(planned),a=shortTime(actual);if(!a||a===p){return '<div class="'+(isFuture?'time-muted':'time-one')+'">'+esc(p||a||'')+'</div>'}var d=Math.max(0,delayMinutes(p,a));return '<div class="time-plan">plan '+esc(p)+'</div><div class="time-real '+delayClass(d)+'">real '+esc(a)+'</div>'}
function renderDelay(planned,actual){var d=Math.max(0,delayMinutes(planned,actual));return '<div class="delay '+delayClass(d)+'">'+d+' min</div>'}
function makeLocalNameMap(data){var map={};function add(src){if(!src)return;Object.keys(src).forEach(function(k){var v=src[k];var n=typeof v==='string'?v:(v&& (v.name||v.stationName||v.shortName));if(n)map[String(k)]=n})}add(data.stationNames);add(data.stations);add(data.dictionaries&&data.dictionaries.stations);add(data.route&&data.route.stationNames);add(data.operation&&data.operation.stationNames);var arr=[];if(data.route&&Array.isArray(data.route.stations))arr=arr.concat(data.route.stations);if(data.operation&&Array.isArray(data.operation.stations))arr=arr.concat(data.operation.stations);arr.forEach(function(s){var id=s.stationId||s.stopId;var n=ownName(s);if(id&&n)map[String(id)]=n});var sid=qs('stationId'),sn=qs('station');if(sid&&sn)map[String(sid)]=sn.replaceAll('+',' ');return map}
async function resolveStationNames(ids){ids=Array.from(new Set(ids.filter(Boolean).map(String)));if(!ids.length)return{};var cacheKey='plkStationNameCache';var cache={};try{cache=JSON.parse(localStorage.getItem(cacheKey)||'{}')}catch(e){}var missing=ids.filter(function(id){return !cache[id]});if(missing.length){try{var r=await fetch('/train?action=station-names&ids='+encodeURIComponent(missing.join(',')),{headers:{Accept:'application/json'}});var j=await r.json();if(j&&j.names){Object.keys(j.names).forEach(function(id){cache[id]=j.names[id]});localStorage.setItem(cacheKey,JSON.stringify(cache))}}catch(e){}}
var out={};ids.forEach(function(id){if(cache[id])out[id]=cache[id]});return out}
function normalizeStations(data){var route=(data.route&&Array.isArray(data.route.stations))?data.route.stations:[];var ops=(data.operation&&Array.isArray(data.operation.stations))?data.operation.stations:[];var bySeq={};ops.forEach(function(o,i){bySeq[seqOf(o,i)]=o});var base=route.length?route:ops;return base.map(function(s,i){var seq=seqOf(s,i);return Object.assign({},s,bySeq[seq]||{}, {idx:i+1, seq:seq})}).sort(function(a,b){return a.seq-b.seq})}
function findLastConfirmed(stations){var last=null;stations.forEach(function(s){if(s.isConfirmed===true)last=s});return last}
function firstFutureSeq(stations){var nowParts=new Date().toLocaleTimeString('pl-PL',{timeZone:'Europe/Warsaw',hour12:false,hour:'2-digit',minute:'2-digit'}).split(':').map(Number);var now=nowParts[0]*60+nowParts[1];for(var i=0;i<stations.length;i++){var p=timeToMin(plannedOf(stations[i]));if(p!=null&&p>=now)return stations[i].seq}return null}
async function render(data,train){var content=document.getElementById('content');var route=data.route||{},op=data.operation||{};var stations=normalizeStations(data);var local=makeLocalNameMap(data);var ids=stations.map(function(s){return String(s.stationId||s.stopId||'')}).filter(Boolean);var resolved=await resolveStationNames(ids);var names=Object.assign({},resolved,local);var last=findLastConfirmed(stations);var st=statusInfo(op.trainStatus);var title=[route.commercialCategorySymbol||qs('category')||'',route.nationalNumber||train,route.name||qs('name')||''].filter(Boolean).join(' ');var lastLabel=last?stationTitle(last,names):'brak potwierdzonej stacji';var lastTime=last?shortTime(actualOf(last)||plannedOf(last)):'';
var html='<div class="panel"><div class="summary"><div class="card"><div class="label">Pociąg</div><div class="big">'+esc(title||('Pociąg '+train))+'</div><div class="help">Status: '+esc(st[0])+'<br>'+esc(st[1])+'</div></div><div class="card"><div class="label">Ostatnia potwierdzona stacja</div><div class="big">'+esc(lastLabel)+'</div><div class="help">'+esc(lastTime)+'</div></div></div><div style="margin-top:12px"><a class="btn green" target="_blank" rel="noopener" href="'+esc(portalUrl(train))+'">Otwórz Portal Pasażera</a> <button class="btn copy" onclick="copySummary()">Kopiuj podsumowanie</button></div></div>';
html+='<div class="panel"><h2 class="route-head">Trasa stacja po stacji</h2><div class="note">Stacje bez potwierdzenia realizacji nie są oznaczane jako „zaliczone”. Godziny dla dalszych stacji są wyszarzone, ale czytelne.</div>';
if(!stations.length){html+='<div class="err">Brak listy stacji w odpowiedzi API.</div></div>';content.innerHTML=html;return}
var lastSeq=last?last.seq:null;var fut=lastSeq==null?firstFutureSeq(stations):null;
stations.forEach(function(s){var id=String(s.stationId||s.stopId||'');var planned=plannedOf(s),actual=actualOf(s);var state='future',badge='future',txt='przed';if(lastSeq!=null){if(s.seq<lastSeq){state='passed';badge='passed';txt='zaliczona'}else if(s.seq===lastSeq){state='current';badge='current';txt='ostatnia'}else if(s.seq===lastSeq+1){state='next';badge='next';txt='następna'}}else if(fut!=null){if(s.seq===fut){state='next';badge='next';txt='następna'}else if(s.seq<fut){state='future';badge='plan';txt='wg planu'}else{state='future';badge='future';txt='przed'}}var name=stationTitle(s,names);var source=ownName(s)?'API':(resolved[id]?'resolver PLK':(local[id]?'słownik API':'brak nazwy w API'));html+='<div class="row '+state+'"><div><span class="badge '+badge+'">'+esc(txt)+'</span></div><div><div class="station-name">'+esc(name)+'</div><div class="station-id">ID '+esc(id)+' · kolejność: '+esc(s.seq)+' · nazwa: '+esc(source)+'</div></div><div class="timebox"><div class="small">czas</div>'+renderTime(planned,actual,state==='future')+'<div class="small">opóźnienie</div>'+renderDelay(planned,actual)+'</div><div class="platformbox"><div class="small">peron / tor</div><div class="platform">'+esc(platformOf(s)||'—')+'</div></div></div>'});
html+='</div>';content.innerHTML=html;window._summary=(title||('Pociąg '+train))+'\nStatus: '+st[0]+'\nOstatnia potwierdzona stacja: '+lastLabel+' '+lastTime}
function copySummary(){navigator.clipboard&&navigator.clipboard.writeText(window._summary||document.body.innerText)}
function detailsParams(){var p=new URLSearchParams();['date','scheduleId','scheduledId','orderId','trainOrderId','stationId','station','category','name','destination'].forEach(function(k){var v=qs(k);if(v)p.set(k,v)});return p}
async function loadTrain(){var train=(document.getElementById('trainInput').value||'').trim();if(!train){setStatus('Wpisz numer pociągu.');return}document.getElementById('trainInput').blur();setStatus('Pobieram bieg pociągu '+train+'...');var content=document.getElementById('content');content.innerHTML='';var idp=detailsParams();var scheduleId=idp.get('scheduleId')||idp.get('scheduledId');var orderId=idp.get('orderId');var trainOrderId=idp.get('trainOrderId');try{if(!scheduleId||!orderId||!trainOrderId)throw new Error('Brak identyfikatorów kursu z tablicy. Kliknij numer pociągu na głównej tablicy.');var q=new URLSearchParams();q.set('scheduleId',scheduleId);q.set('orderId',orderId);q.set('trainOrderId',trainOrderId);if(idp.get('date'))q.set('date',idp.get('date'));var r=await fetch('/api/debug-train?'+q.toString(),{headers:{Accept:'application/json'}});var data=await r.json();if(!r.ok)throw new Error(data.error||data.details||('HTTP '+r.status));await render(data,train);setStatus('Gotowe.')}catch(e){content.innerHTML='<div class="panel"><h2>Pociąg '+esc(train)+'</h2><div class="err">'+esc(e.message)+'</div><p>Pełny bieg wymaga identyfikatorów kursu z tablicy. Sam numer pociągu to za mało, bo jeden numer może mieć kilka wariantów kursu.</p><a class="btn green" target="_blank" rel="noopener" href="'+esc(portalUrl(train))+'">Otwórz wyszukiwarkę pociągu w Portal Pasażera</a></div>';setStatus('Nie udało się pobrać pełnego biegu lokalnie.')}}
document.addEventListener('DOMContentLoaded',function(){var t=qs('train');if(t){document.getElementById('trainInput').value=t;loadTrain()}})
</script>
</body>
</html>`;

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

function preview(text) {
  return String(text || '').replace(/\s+/g, ' ').slice(0, 700);
}

async function plkFetch(path, key) {
  const started = Date.now();
  const res = await fetch(BASE + path, { headers: { 'X-API-Key': key, 'Accept': 'application/json' } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) {}
  return { path, http: res.status, ok: res.ok, responseMs: Date.now() - started, contentType: res.headers.get('content-type') || '', body, preview: preview(text) };
}

function addStationDict(names, obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const id = String(k);
    let name = '';
    if (typeof v === 'string') name = v;
    else if (v && typeof v === 'object') name = v.name || v.stationName || v.shortName || v.displayName || '';
    if (/^\d+$/.test(id) && name) names[id] = name;
  }
}

function walkForStations(names, value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walkForStations(names, item);
    return;
  }
  const id = value.stationId || value.stopId || value.id;
  const name = value.stationName || value.stopName || value.name || value.shortName;
  if (id && name && /^\d+$/.test(String(id))) names[String(id)] = String(name);
  for (const [k, v] of Object.entries(value)) {
    if (k.toLowerCase().includes('station')) addStationDict(names, v);
    if (typeof v === 'object') walkForStations(names, v);
  }
}

async function resolveStationNames(url, key) {
  const ids = (url.searchParams.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  const requested = Array.from(new Set(ids));
  const names = {};
  const diagnostics = [];
  if (!requested.length) return json({ ok: false, error: 'Brak ids', requested, names, missing: [] }, 400);
  const idsParam = encodeURIComponent(requested.join(','));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  const probes = [
    { source: 'operations', path: '/operations?stations=' + idsParam + '&withPlanned=true&fullRoutes=true&pageSize=20' },
    { source: 'schedules', path: '/schedules?stations=' + idsParam + '&dateFrom=' + today + '&dateTo=' + today + '&pageSize=20' }
  ];
  for (const p of probes) {
    try {
      const r = await plkFetch(p.path, key);
      const before = Object.keys(names).length;
      if (r.body) walkForStations(names, r.body);
      const filteredNames = {};
      for (const id of requested) if (names[id]) filteredNames[id] = names[id];
      Object.keys(names).forEach(id => { if (!requested.includes(id)) delete names[id]; });
      diagnostics.push({ source: p.source, status: r.http, responseMs: r.responseMs, ok: r.ok, found: Object.keys(names).length - before, contentType: r.contentType, preview: r.ok ? undefined : r.preview });
    } catch (e) {
      diagnostics.push({ source: p.source, status: 0, ok: false, error: e.message });
    }
  }
  const missing = requested.filter(id => !names[id]);
  return json({ ok: true, requested, names, missing, diagnostics });
}

async function debug(url, key) {
  const train = url.searchParams.get('train') || '';
  return json({ ok: true, mode: 'debug', train, message: 'Routing działa. Pełny bieg pobierany jest przez /api/debug-train, jeśli URL ma scheduleId/orderId/trainOrderId.' });
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const key = context.env.PLK_API_KEY || context.env.PDP_API_KEY || '';

  if (action === 'station-names') return resolveStationNames(url, key);
  if (action === 'debug') return debug(url, key);

  return new Response(HTML, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
