const BASE = 'https://pdp-api.plk-sa.pl/api/v1';

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

function compactPreview(text) {
  return String(text || '').slice(0, 900);
}

async function plkFetch(path, key) {
  const started = Date.now();
  const res = await fetch(BASE + path, { headers: { 'X-API-Key': key, 'Accept': 'application/json' } });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  return { status: res.status, ok: res.ok, responseMs: Date.now() - started, text, data };
}

function addName(names, id, value) {
  const sid = String(id || '').trim();
  if (!sid || !value || names[sid]) return;
  if (typeof value === 'string') names[sid] = value;
  else names[sid] = value.name || value.stationName || value.stopName || value.shortName || '';
  if (!names[sid]) delete names[sid];
}

function collectStationNamesFromObject(obj, names) {
  if (!obj || typeof obj !== 'object') return;

  const dicts = [
    obj.stations,
    obj.stationNames,
    obj.dictionaries && obj.dictionaries.stations,
    obj.route && obj.route.stationNames,
    obj.operation && obj.operation.stationNames
  ];
  for (const dict of dicts) {
    if (!dict || typeof dict !== 'object' || Array.isArray(dict)) continue;
    for (const [k, v] of Object.entries(dict)) addName(names, k, v);
  }

  const arrays = [
    obj.trains,
    obj.routes,
    obj.route && obj.route.stations,
    obj.operation && obj.operation.stations
  ].filter(Boolean);

  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(walk); return; }
    const id = value.stationId || value.stopId || value.id;
    const n = value.stationName || value.name || value.stopName || value.shortName || value.station;
    if (id && n) addName(names, id, n);
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') walk(child);
    }
  }
  arrays.forEach(walk);
}

async function resolveStationNames(ids, key) {
  const requested = [...new Set(String(ids || '').split(',').map(x => x.trim()).filter(Boolean))];
  const names = {};
  const diagnostics = [];
  if (!requested.length) return { ok: true, requested, names, missing: [], diagnostics };
  if (!key) return { ok: false, requested, names, missing: requested, diagnostics: [{ source: 'env', error: 'Brak PLK_API_KEY' }] };

  const idsParam = encodeURIComponent(requested.join(','));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });

  const tests = [
    { source: 'operations', path: '/operations?stations=' + idsParam + '&withPlanned=true&fullRoutes=true&pageSize=500' },
    { source: 'schedules', path: '/schedules?stations=' + idsParam + '&dateFrom=' + today + '&dateTo=' + today + '&pageSize=500' }
  ];

  for (const test of tests) {
    try {
      const r = await plkFetch(test.path, key);
      const before = Object.keys(names).length;
      if (r.ok && r.data) collectStationNamesFromObject(r.data, names);
      diagnostics.push({
        source: test.source,
        status: r.status,
        responseMs: r.responseMs,
        found: Object.keys(names).length - before,
        error: r.ok ? undefined : 'PLK HTTP ' + r.status,
        preview: r.ok ? undefined : compactPreview(r.text)
      });
    } catch (e) {
      diagnostics.push({ source: test.source, error: e.message });
    }
  }

  const filtered = {};
  for (const id of requested) if (names[id]) filtered[id] = names[id];
  return { ok: true, requested, names: filtered, missing: requested.filter(id => !filtered[id]), diagnostics };
}

const HTML = String.raw`<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bieg pociągu</title>
<style>
:root{--bg:#101820;--panel:#1c2833;--panel2:#223244;--border:#34495e;--blue:#0b57d0;--green:#5dd39e;--yellow:#ffcc00;--red:#ff4d4d;--violet:#c084fc;--muted:rgba(255,255,255,.68);--grey:#4b5563;--future:#aeb8c4}
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:#fff;padding:24px}.container{max-width:1100px;margin:0 auto}h1{text-align:center;margin:8px 0 18px;font-size:34px}.top{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;margin-bottom:18px}.top input{padding:12px 14px;border:0;border-radius:10px;font-size:18px;min-width:260px}.btn{border:0;border-radius:10px;padding:12px 16px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer;text-decoration:none;display:inline-block}.btn.secondary{background:#4b5563}.btn.green{background:#198754}.panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px;margin-top:14px}.muted{color:var(--muted)}.status{min-height:22px;text-align:center;color:var(--muted)}.summary{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:14px}.big{font-size:24px;font-weight:900}.err{background:#3b1d1d;border-color:#dc3545;color:#ffd6d6}.route{margin-top:12px}.hint{font-size:14px;color:#d6e2ef;margin:4px 0 14px}.row{display:grid;grid-template-columns:110px 1fr 150px 110px 110px;gap:12px;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,.10)}.row:last-child{border-bottom:0}.row.future{color:var(--future)}.row.current{background:rgba(255,204,0,.08);border-radius:10px}.station{font-weight:900;font-size:18px}.station-source{font-size:12px;color:var(--muted);margin-top:2px}.badge{display:inline-block;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:900}.badge.done{background:#14532d;color:#bbf7d0}.badge.current{background:var(--yellow);color:#18202a}.badge.next{background:#0dcaf0;color:#102027}.badge.plan{background:#374151;color:#e5e7eb}.small{font-size:12px;color:var(--muted)}.copy{margin-left:8px;background:#374151;padding:8px 10px;font-size:12px}.time-main{font-size:18px;font-weight:900;color:var(--green)}.time-future{font-size:18px;font-weight:900;color:#d7dde5}.time-plan{font-size:13px;color:var(--muted)}.time-real{font-size:19px;font-weight:900}.delay0{color:var(--green);font-weight:900}.delay1{color:var(--yellow);font-weight:900}.delay2{color:var(--red);font-weight:900}.delay3{color:var(--violet);font-weight:900}.platform{font-weight:900;font-size:17px}@media(max-width:760px){body{padding:10px}h1{font-size:26px}.top{display:grid;grid-template-columns:1fr auto}.top input{min-width:0;width:100%;font-size:16px}.summary{grid-template-columns:1fr}.row{grid-template-columns:86px 1fr;gap:6px;padding:10px}.row .times,.row .delaybox,.row .platformbox{grid-column:2}.station{font-size:16px}.btn{padding:10px 12px}}
</style>
</head>
<body>
<div class="container">
  <h1>🚆 Bieg pociągu</h1>
  <div class="top">
    <input id="trainInput" inputmode="numeric" placeholder="Wpisz numer pociągu" />
    <button class="btn" onclick="loadTrain()">Pokaż</button>
    <a class="btn secondary" href="/">← Tablica</a>
  </div>
  <div id="status" class="status">Wpisz numer albo kliknij pociąg z tablicy.</div>
  <div id="content"></div>
</div>
<script>
function qs(name){return new URLSearchParams(location.search).get(name)||''}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function shortTime(v){if(!v)return'';const m=String(v).match(/(\d{2}:\d{2})/);return m?m[1]:String(v)}
function todayIso(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'})}
function portalUrl(){return 'https://portalpasazera.pl/ZnajdzPociag'}
function detailsParams(){const p=new URLSearchParams();['date','scheduleId','scheduledId','orderId','trainOrderId','stationId','station'].forEach(k=>{const v=qs(k);if(v)p.set(k,v)});return p}
function setStatus(t){document.getElementById('status').textContent=t}
function statusText(code){const m={P:['Planowy / aktywny','Kod PLK: P. Kurs jest w systemie jako planowy lub aktywny.'],S:['Rozkładowy','Kod PLK: S. Dane wyglądają na rozkładowe, bez pewnego potwierdzenia bieżącej realizacji.'],R:['W ruchu','Kod PLK: R. Pociąg jest w ruchu.'],Z:['Zakończony','Kod PLK: Z. Bieg zakończony.'],C:['Odwołany','Kod PLK: C. Kurs odwołany.'],X:['Odwołany','Kod PLK: X. Kurs odwołany.']};return m[code]||[code?'Kod statusu: '+code:'brak danych','Brak opisu tego kodu w lokalnym słowniku.']}
function seqOf(s,i){return Number(s.orderNumber||s.plannedSequenceNumber||s.actualSequenceNumber||s.idx||i+1)}
function timeMin(v){const m=shortTime(v).match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function nowMin(){const p=new Date().toLocaleTimeString('pl-PL',{timeZone:'Europe/Warsaw',hour12:false,hour:'2-digit',minute:'2-digit'}).split(':').map(Number);return p[0]*60+p[1]}
function directName(s){return s.stationName||s.name||s.stopName||s.shortName||s.station||''}
function stationId(s){return String(s.stationId||s.stopId||'')}
function stationLabel(s,names){const id=stationId(s);const dn=directName(s);if(dn)return {name:dn,source:'API'};if(id&&names[id])return {name:names[id],source:'słownik PLK'};return {name:'Nieznana stacja',source:'brak nazwy w API'}}
function plannedTime(s){return shortTime(s.plannedDeparture||s.plannedArrival||s.plannedDepartureTime||s.plannedArrivalTime||s.departureTime||s.arrivalTime)}
function actualTime(s){return shortTime(s.actualDeparture||s.actualArrival||s.actualDepartureTime||s.actualArrivalTime)}
function delayMinutes(s){const p=timeMin(plannedTime(s)),a=timeMin(actualTime(s));if(p==null||a==null)return Number(s.departureDelayMinutes||s.arrivalDelayMinutes||0)||0;return a-p}
function delayClass(d){return d>=20?'delay3':d>10?'delay2':d>0?'delay1':'delay0'}
function renderTime(s,isFuture){const p=plannedTime(s),a=actualTime(s);if(!a||a===p){return '<div class="'+(isFuture?'time-future':'time-main')+'">'+esc(p||a||'—')+'</div>'}return '<div class="time-plan">plan '+esc(p||'—')+'</div><div class="time-real '+delayClass(delayMinutes(s))+'">real '+esc(a)+'</div>'}
function normalizeStations(data){const route=(data.route&&data.route.stations)||[];const op=(data.operation&&data.operation.stations)||[];const byId={};for(const o of op){if(o.stationId)byId[String(o.stationId)]=o}const src=route.length?route:op;return src.map((r,i)=>Object.assign({},r,byId[String(r.stationId)]||{}, {idx:i+1}))}
function lastConfirmed(stations){let last=null;for(const s of stations){if(s.isConfirmed===true)last=s}return last}
async function resolveNames(stations){const ids=[...new Set(stations.map(stationId).filter(Boolean))];if(!ids.length)return {};try{const r=await fetch('/train?action=station-names&ids='+encodeURIComponent(ids.join(',')),{headers:{Accept:'application/json'}});const data=await r.json();return data.names||{}}catch(e){return {}}}
async function loadTrain(){const train=(document.getElementById('trainInput').value||'').trim();if(!train){setStatus('Wpisz numer pociągu.');return}document.getElementById('trainInput').blur();setStatus('Pobieram dane pociągu '+train+'...');const content=document.getElementById('content');content.innerHTML='';const idp=detailsParams();if((idp.get('scheduleId')||idp.get('scheduledId')||idp.get('orderId')) || idp.get('stationId')){try{const q=new URLSearchParams();q.set('action','train-route');const sid=idp.get('scheduleId')||idp.get('scheduledId');if(sid)q.set('scheduleId',sid);if(idp.get('orderId'))q.set('orderId',idp.get('orderId'));q.set('train',train);q.set('operatingDate',idp.get('date')||idp.get('operatingDate')||todayIso());if(idp.get('trainOrderId'))q.set('trainOrderId',idp.get('trainOrderId'));if(idp.get('stationId'))q.set('stationId',idp.get('stationId'));if(idp.get('station'))q.set('station',idp.get('station'));const r=await fetch('/api?'+q.toString(),{headers:{Accept:'application/json'}});const data=await r.json();if(!r.ok)throw new Error(data.error||data.details||'HTTP '+r.status);await renderTrain(train,data);return}catch(e){content.innerHTML='<div class="panel err">Nie udało się pobrać przebiegu z API PLK: '+esc(e.message)+'</div>';}}
renderFallback(train)}
async function renderTrain(train,data){const content=document.getElementById('content');const route=data.route||{},op=data.operation||{};const stations=normalizeStations(data);const names=await resolveNames(stations);const last=lastConfirmed(stations);const lastSeq=last?seqOf(last,0):null;const nMin=nowMin();let firstFutureSeq=null;for(let i=0;i<stations.length;i++){const s=stations[i],pm=timeMin(plannedTime(s));if(pm!=null&&pm>=nMin&&firstFutureSeq==null)firstFutureSeq=seqOf(s,i)}setStatus('Gotowe.');const title=[route.commercialCategorySymbol||qs('category'),route.nationalNumber||train,route.name||qs('name')].filter(Boolean).join(' ');const st=statusText(op.trainStatus);let lastLabel='brak potwierdzonej stacji',lastTime='';if(last){const l=stationLabel(last,names);lastLabel=l.name+' · ID '+stationId(last);lastTime=actualTime(last)||plannedTime(last)}content.innerHTML='<div class="panel"><div class="summary"><div class="card"><div class="muted">Pociąg</div><div class="big">'+esc(title||('Pociąg '+train))+'</div><div class="muted">Status: '+esc(st[0])+'<br>'+esc(st[1])+'</div></div><div class="card"><div class="muted">Ostatnia potwierdzona stacja</div><div class="big">'+esc(lastLabel)+'</div><div class="muted">'+esc(lastTime)+'</div></div></div><div style="margin-top:12px"><a class="btn green" target="_blank" rel="noopener" href="'+esc(portalUrl())+'">Otwórz Portal Pasażera</a><button class="btn copy" onclick="copyTrainSummary()">Kopiuj podsumowanie</button></div></div><div class="panel route"><h2>Trasa stacja po stacji</h2><p class="hint">Nazwy stacji: najpierw API, potem słownik PLK, a gdy oba milczą, zostawiamy ID techniczne. Zero zgadywania.</p><div id="routeRows"></div></div>';const rows=document.getElementById('routeRows');if(!stations.length){rows.innerHTML='<div class="muted">Brak listy stacji w odpowiedzi API.</div>';return}rows.innerHTML=stations.map((s,i)=>{const seq=seqOf(s,i);let state='future',badge='plan',txt='przed';if(lastSeq!==null){if(seq<lastSeq){state='passed';badge='done';txt='zaliczona'}else if(seq===lastSeq){state='current';badge='current';txt='ostatnia'}else if(seq===lastSeq+1){state='current';badge='next';txt='następna'}}else if(firstFutureSeq!==null){if(seq===firstFutureSeq){state='current';badge='next';txt='następna'}else if(seq<firstFutureSeq){state='future';badge='plan';txt='wg planu'}else{state='future';badge='plan';txt='przed'}}const l=stationLabel(s,names);const id=stationId(s);const d=Math.max(0,delayMinutes(s));const platform=[s.departurePlatform||s.arrivalPlatform,s.departureTrack||s.arrivalTrack].filter(Boolean).join(' / ');return '<div class="row '+(state==='future'?'future':state==='current'?'current':'')+'"><div><span class="badge '+badge+'">'+esc(txt)+'</span></div><div><div class="station">'+esc(l.name)+'</div><div class="station-source">ID '+esc(id||'—')+' · kolejność: '+esc(seq)+' · nazwa: '+esc(l.source)+'</div></div><div class="times"><div class="small">czas</div>'+renderTime(s,state==='future')+'</div><div class="delaybox"><div class="small">opóźnienie</div><div class="'+delayClass(d)+'">'+esc(d)+' min</div></div><div class="platformbox"><div class="small">peron / tor</div><div class="platform">'+esc(platform||'—')+'</div></div></div>'}).join('')}
function renderFallback(train){setStatus('Nie mam identyfikatorów kursu z tablicy. Pokazuję bezpieczny fallback.');document.getElementById('content').innerHTML='<div class="panel"><h2>Pociąg '+esc(train)+'</h2><p>Ten widok dostał sam numer pociągu albo niepełne identyfikatory kursu PLK. Pełny bieg działa najlepiej po kliknięciu numeru bezpośrednio z naszej tablicy odjazdów.</p><a class="btn green" target="_blank" rel="noopener" href="'+esc(portalUrl())+'">Otwórz wyszukiwarkę pociągu w Portal Pasażera</a><button class="btn copy" onclick="navigator.clipboard.writeText(\''+esc(train)+'\')">Kopiuj numer</button></div>'}
function copyTrainSummary(){const text=document.body.innerText.replace(/\n{3,}/g,'\n\n');navigator.clipboard.writeText(text)}
document.addEventListener('DOMContentLoaded',()=>{const t=qs('train');if(t){trainInput.value=t;loadTrain()}})
</script>
</body>
</html>`;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';
  const key = context.env.PLK_API_KEY || context.env.PDP_API_KEY || '';

  if (action === 'station-names') {
    return json(await resolveStationNames(url.searchParams.get('ids') || '', key));
  }

  if (action === 'debug') {
    return json({
      ok: true,
      mode: 'train-function',
      train: url.searchParams.get('train') || '',
      hasKey: !!key,
      message: 'Endpoint /train działa. Do pełnego biegu potrzebne są identyfikatory kursu z tablicy.'
    });
  }

  return new Response(HTML, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
