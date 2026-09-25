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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  let res;
  try {
    res = await fetch(BASE + path, {
      headers: { 'X-API-Key': key, 'Accept': 'application/json, text/plain, */*' },
      signal: controller.signal
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      responseMs: Date.now() - started,
      body: null,
      text: '',
      preview: err.name === 'AbortError' ? 'Upstream timeout po 9000ms' : String(err.message || err)
    };
  } finally {
    clearTimeout(timeout);
  }

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

  // Słownik PLK może być zwrócony bezpośrednio jako tablica.
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (!item || typeof item !== 'object') continue;
      const id = item.id || item.stationId || item.stopPointId || item.stopId;
      const name = pickName(item);
      if (id && name) map[String(id)] = name;
    }
    return map;
  }

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
    Array.isArray(obj.data) ? obj.data : null,
    Array.isArray(obj.items) ? obj.items : null,
    Array.isArray(obj.results) ? obj.results : null,
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
    {
      source: 'stations-dictionary',
      path: '/dictionaries/stations?pageSize=20000'
    },
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
<!-- app-version: 2026-06-01.1 status-human-confirmed-only -->
<style>
:root{--bg:#101820;--panel:#1c2833;--card:#223244;--line:#34495e;--text:#fff;--muted:#b8c3cf;--blue:#0b57d0;--green:#5dd39e;--yellow:#ffcc00;--red:#ff4d4d;--violet:#c084fc;--grey:#4b5563;--cyan:#22d3ee}
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:var(--text);padding:18px}.wrap{max-width:1180px;margin:0 auto}h1{text-align:center;font-size:32px;margin:10px 0 14px}.top{display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap}.btn{border:0;border-radius:10px;padding:12px 16px;background:var(--blue);color:#fff;font-weight:900;cursor:pointer;text-decoration:none;display:inline-block}.btn.secondary{background:var(--grey)}.btn.green{background:#198754}.btn.small{padding:8px 10px;font-size:12px;background:#374151}.status{text-align:center;color:var(--muted);min-height:28px;margin:12px 0}.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;margin:12px 0}.summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.label{color:var(--muted);font-size:13px}.big{font-size:24px;font-weight:900}.hint{font-size:13px;color:#d8e2ee;line-height:1.35}.hint-cancelled{font-size:19px;font-weight:900;color:var(--red)}.hint-cancelled .station-meta{color:var(--red);opacity:.85;font-weight:700}.route-title{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}h2{margin:0 0 8px;font-size:22px}.route-table{display:block}
.rrow{display:grid;grid-template-columns:92px 60px 1fr 76px;gap:10px;align-items:center;padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.10)}
.rrow:last-child{border-bottom:0}
.rrow.current{background:rgba(255,204,0,.13);outline:1px solid rgba(255,204,0,.35);border-radius:8px}
.rrow.next{background:rgba(34,211,238,.10);border-radius:8px}
.rrow.info{background:rgba(255,204,0,.055);border-radius:8px}
.rrow.future{opacity:.82}
.time{font-size:18px;font-weight:900}
.time-rows{display:flex;flex-direction:column;gap:6px}
.plan-small{font-size:12px;color:#8b95a1;line-height:1.1}
.plan-strike{text-decoration:line-through}
.time.future{color:#cbd5e1}
.time.ok{color:var(--green)}
.time.delay-low{color:var(--yellow)}
.time.delay-mid{color:var(--red)}
.time.delay-high{color:var(--violet)}
.station-cell{display:flex;flex-direction:column;gap:3px;min-width:0}
.station-name{font-size:16px;font-weight:900;line-height:1.2}
.station-meta{font-size:12px;color:var(--muted);margin-top:2px}
.badge{display:inline-block;width:fit-content;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:800;text-align:center;white-space:nowrap}
.badge.passed{background:#14532d;color:#bbf7d0}
.badge.current{background:var(--yellow);color:#102027}
.badge.next{background:#0ea5e9;color:#fff}
.badge.future{background:#334155;color:#e5e7eb}
.badge.info{background:#5b4b1f;color:#ffe8a3}
.delay-cell{text-align:center}
.platform-cell{text-align:center}
.mark-btns{display:flex;gap:4px;margin-top:4px}
.mark-btn{border:1px solid var(--line);background:transparent;border-radius:6px;padding:2px 5px;font-size:12px;cursor:pointer;opacity:.5;line-height:1.3}
.mark-btn:hover{opacity:.85}
.mark-btn.active{opacity:1;border-color:var(--blue);background:rgba(11,87,208,.2)}
.journal-bar{margin:8px 0 4px}
.journal-note{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px;color:#d8e2ee;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.journal-note a{color:var(--cyan)}
.journal-note.ok{border-color:rgba(93,211,158,.4);color:var(--green)}
.journal-note.warn{border-color:rgba(255,77,77,.4);color:var(--red)}
.journal-note .hint{color:var(--muted);font-size:12px}
.link-btn{background:transparent;border:0;color:var(--cyan);text-decoration:underline;cursor:pointer;font-size:12px;padding:0}
.float-save-btn{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9997;border:0;border-radius:999px;padding:13px 22px;background:var(--blue);color:#fff;font-weight:900;font-size:14.5px;cursor:pointer;box-shadow:0 10px 28px rgba(0,0,0,.45)}
.float-save-btn:hover{background:#084298}
.float-save-btn.done{background:var(--green);color:#0a2016}
.manual-save-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000;display:none;align-items:center;justify-content:center;padding:16px}
.manual-save-overlay.open{display:flex}
.manual-save-box{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;max-width:340px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.5);text-align:left}
.manual-save-box h3{margin:0 0 12px;font-size:16px;text-align:center}
.manual-save-box label{display:block;font-size:12px;color:var(--muted);margin:0 0 4px}
.manual-save-box input{width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line);background:#1c2833;color:#fff;font-size:14px;margin-bottom:12px}
.manual-save-actions{display:flex;gap:10px}
.manual-save-actions button{flex:1}
.plat-num{font-size:20px;font-weight:800;line-height:1}
.plat-track{font-size:11px;color:var(--muted);margin-top:2px}
.err{background:#3b1d1d;border:1px solid #dc3545;color:#ffd6d6;border-radius:10px;padding:12px}.loader{display:flex;align-items:center;justify-content:center;gap:10px;margin:14px auto;color:#d8e2ee}.train-loader{position:relative;width:120px;height:22px;overflow:hidden}.train-dot{position:absolute;left:-35px;top:1px;font-size:20px;animation:ride 1.35s linear infinite}.track{position:absolute;left:0;right:0;bottom:0;border-bottom:2px dashed #5c6b7a}@keyframes ride{0%{left:-35px}100%{left:125px}}.copy-note{font-size:12px;color:var(--muted);text-align:center;margin-top:6px}
@media(max-width:720px){body{padding:8px}h1{font-size:25px}.summary{grid-template-columns:1fr}.panel{padding:9px}
.rrow{grid-template-columns:70px 40px 1fr 56px;gap:6px;padding:9px 6px}
.time{font-size:20px}
.delay-cell .time{font-size:16px}
.station-name{font-size:15px}
.badge{font-size:10px;padding:2px 6px}
.plat-num{font-size:17px}
.plat-track{font-size:10px}
.big{font-size:20px}}
</style>
</head>
<body>
<div class="wrap">
  <h1>🚆 Bieg pociągu</h1>
  <div class="top">
    <a class="btn secondary" href="/">← Tablica</a>
  </div>
  <div id="status" class="status">Kliknij numer pociągu na tablicy albo na liście Moje Pociągi V2.</div>
  <div id="content"></div>
</div>
<button type="button" id="floatSaveBtn" class="float-save-btn" style="display:none"></button>
<div class="manual-save-overlay" id="manualSaveOverlay">
  <div class="manual-save-box">
    <h3>Zapisz przejazd</h3>
    <label for="manualTripName">Nazwa trasy (opcjonalnie)</label>
    <input type="text" id="manualTripName" placeholder="np. Wycieczka do Krakowa">
    <label for="manualTripKm">Kilometraż (opcjonalnie)</label>
    <input type="number" id="manualTripKm" min="0" placeholder="np. 45">
    <div class="manual-save-actions">
      <button type="button" class="btn small secondary" onclick="closeManualSaveForm()">Anuluj</button>
      <button type="button" class="btn small" onclick="confirmManualSave()">Zapisz</button>
    </div>
  </div>
</div>
<script src="/profile-sync.js"></script>
<script src="/tutorial.js"></script>
<script>
function qs(name){return new URLSearchParams(location.search).get(name)||''}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function shortTime(v){if(!v)return'';const m=String(v).match(/(\d{2}:\d{2})/);return m?m[1]:String(v)}
function setStatus(t){document.getElementById('status').textContent=t}
function todayIso(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'})}
function nowMin(){const p=new Date().toLocaleTimeString('pl-PL',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit',hour12:false}).split(':').map(Number);return p[0]*60+p[1]}
function toMin(t){const s=shortTime(t);const m=s.match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function delayClass(d){if(d>=20)return'high';if(d>10)return'mid';if(d>0)return'low';return'zero'}
function statusHuman(code){
  const c=String(code||'').trim().toUpperCase();
  const map={
    P:['W ruchu / potwierdzony','Kod PLK: P'],
    S:['Rozkładowy / brak potwierdzeń','Kod PLK: S'],
    C:['Zrealizowany / zakończony','Kod PLK: C'],
    X:['Odwołany','Kod PLK: X'],
    O:['Opóźniony','Kod PLK: O'],
    R:['W ruchu','Kod PLK: R'],
    Z:['Zakończony','Kod PLK: Z']
  };
  if(!c) return ['brak statusu',''];
  return map[c] || ['Nieznany status PLK','Kod PLK: '+c];
}
function detailsParams(){const p=new URLSearchParams();['date','scheduleId','scheduledId','orderId','trainOrderId','stationId','station','category','name','destination'].forEach(k=>{const v=qs(k);if(v)p.set(k,v)});return p}
function portalUrl(train){return 'https://portalpasazera.pl/ZnajdzPociag'}
// Opóźnienie/status stacji liczymy WYŁĄCZNIE na podstawie s.status/s.delay
// zwróconych przez /api/train-details — ten sam, jeden serwerowy punkt
// prawdy używany przez moje-pociagi-v2 i tę stronę. Wcześniej ta
// strona liczyła to sama, osobno, bezpośrednio z surowych danych PLK
// (bez sprawdzania isConfirmed, bez uwzględnienia oficjalnego pola
// departureDelayMinutes/arrivalDelayMinutes z PLK) — stąd rozjazdy typu
// "PLK pokazuje punktualnie, u nas +1 min" dla tego samego pociągu.
// Stacja z postojem (np. Zawiercie) ma OSOBNY planowy przyjazd i
// odjazd — pokazujemy oba, jeden pod drugim, każdy z własnym,
// niezależnie przeliczonym opóźnieniem i przekreślonym planem, gdy
// różni się od faktycznego czasu. Stacja początkowa/końcowa ma tylko
// jedno z nich (druga wartość jest wtedy pusta).
// Układ jak w Portalu Pasażera, bez etykiet: dla każdej stacji dwa wiersze —
// przybycie wyżej, odjazd niżej. Bez opóźnienia tylko godzina planowa; z
// opóźnieniem: mała, szara, przekreślona godzina planowa, a pod nią
// godzina aktualna/prognozowana w nawiasie, w kolorze wg gradientu opóźnień.
// Stacja początkowa/końcowa ma tylko jeden wiersz.
function timeRow(real,planned,delay,state){
  if(!planned)return '';
  const d=Math.max(0,Number(delay)||0);
  if(!(real&&real!==planned&&d>0)){
    return '<div class="time '+(state==='future'?'future':'ok')+'">'+esc(planned)+'</div>';
  }
  return '<div class="plan-small plan-strike">'+esc(planned)+'</div><div class="time delay-'+delayClass(d)+'">('+esc(real)+')</div>';
}
function renderTime(s,state){
  const conf=s.status==='confirmed';
  // Stacja zaliczona: fakt. Niezaliczona: prognoza PLK (jeśli jest).
  const arr=conf?timeRow(s.actualArrival||'',s.plannedArrival,s.arrivalDelay,state):timeRow(s.forecastArrival||'',s.plannedArrival,s.forecastArrivalDelay,state);
  const dep=conf?timeRow(s.actualDeparture||'',s.plannedDeparture,s.departureDelay,state):timeRow(s.forecastDeparture||'',s.plannedDeparture,s.forecastDepartureDelay,state);
  if(arr||dep){
    return '<div class="time-rows">'+(arr?'<div class="trow">'+arr+'</div>':'')+(dep?'<div class="trow">'+dep+'</div>':'')+'</div>';
  }
  return '<div class="time-rows"><div class="trow">'+timeRow(conf?(s.actualTime||''):'',s.plannedTime,s.delay,state)+'</div></div>';
}
// Kolumna opóźnień w tym samym układzie dwóch wierszy co kolumna godzin
// (przyjazd nad odjazdem) — dokładnie jak na tablicy głównej, żeby wartość
// stała w linii z godziną, której dotyczy. Puste miejsce zamiast "0" jest
// niewidoczne (nie zajmuje 0px), tylko po to, by wiersze się nie rozjechały.
function delayCell(d){
  const n=Math.max(0,Number(d)||0);
  if(!(n>0))return '<div class="trow"><div class="time" style="visibility:hidden">0</div></div>';
  return '<div class="trow"><div class="plan-small plan-strike" style="visibility:hidden">00:00</div><div class="time delay-'+delayClass(n)+'">+'+n+'</div></div>';
}
function renderDelayCol(s){
  const conf=s.status==='confirmed';
  const ad=conf?s.arrivalDelay:s.forecastArrivalDelay;
  const dd=conf?s.departureDelay:s.forecastDepartureDelay;
  if(s.plannedArrival||s.plannedDeparture){
    return '<div class="time-rows">'+(s.plannedArrival?delayCell(ad):'')+(s.plannedDeparture?delayCell(dd):'')+'</div>';
  }
  return '<div class="time-rows">'+delayCell(conf?s.delay:0)+'</div>';
}
function loading(train){document.getElementById('content').innerHTML='<div class="panel"><div class="loader"><div class="train-loader"><div class="track"></div><div class="train-dot">🚆</div></div><strong>Pobieram bieg pociągu '+esc(train)+'...</strong></div><div class="copy-note">Czekam na dane PLK. Spokojnie, to nie cisza, to informatyka.</div></div>'}

async function findCourseFromOpenedContext(train,idp){
  const station=idp.get('station')||qs('station')||'';
  const stationId=idp.get('stationId')||qs('stationId')||'';
  const date=idp.get('date')||qs('date')||todayIso();
  if(!station&&!stationId)return null;
  const params=new URLSearchParams({station:station||stationId,date:date,time:'00:00',limit:'300'});
  setStatus('Szukam kursu '+train+' w tablicy z dnia '+date+'...');
  const r=await fetch('/api/departures?'+params.toString(),{headers:{Accept:'application/json'}});
  const data=await r.json();
  if(!r.ok)throw new Error(data.error||data.details||'HTTP '+r.status);
  const deps=Array.isArray(data.departures)?data.departures:[];
  const hit=deps.find(d=>String(d.train||d.trainNumber||d.number||'')===String(train));
  if(!hit)return null;
  const schedule=hit.scheduleId||hit.scheduledId||hit.scheduleID||hit.routeId||'';
  const order=hit.orderId||hit.orderID||'';
  if(!schedule||!order)return null;
  return {dep:hit,schedule,order,trainOrderId:hit.trainOrderId||hit.trainOrderID||'',station:station||data.station?.name||'',stationId:stationId||data.station?.id||'',date};
}
const AUTO_REFRESH_MS=5*60*1000;
let autoRefreshTimer=null;
let lastTrainFetchAt=0;
let lastTrainArgs=null;

// ============ Dzienniczek podróży ============
// Wpis = konkretny przejazd (data + kurs + stacja wsiadania/wysiadania).
// Trzymany lokalnie, synchronizowany przez profil (token) jak reszta
// danych w tej aplikacji — ten sam wzorzec co listy pociągów w v2.
const JOURNAL_KEY='dziennikPodrozy';
const TYPICAL_TRIPS_KEY='dziennikTrasyTypowe';
let currentTrainData=null,currentStations=[];
let markBoardIdx=null,markAlightIdx=null;

function getJournalEntries(){try{const v=JSON.parse(localStorage.getItem(JOURNAL_KEY));return Array.isArray(v)?v:[]}catch{return[]}}
function saveJournalEntries(list){localStorage.setItem(JOURNAL_KEY,JSON.stringify(list));if(window.ProfileSync)ProfileSync.push({journalEntries:list})}
function getTypicalTrips(){try{const v=JSON.parse(localStorage.getItem(TYPICAL_TRIPS_KEY));return v&&typeof v==='object'?v:{}}catch{return{}}}
function normStation(s){return String(s||'').trim().toLowerCase()}
function toMinutesJ(t){const m=String(t||'').match(/(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null}
function durationMinJ(fromT,toT){const a=toMinutesJ(fromT),b=toMinutesJ(toT);if(a==null||b==null)return null;let d=b-a;if(d<0)d+=1440;return d}
function journeyKey(date,scheduleId,orderId,boardStation,alightStation){return[date,scheduleId||'',orderId||'',normStation(boardStation),normStation(alightStation)].join('|')}
function findExistingEntry(date,scheduleId,orderId,boardStation,alightStation){
  const key=journeyKey(date,scheduleId,orderId,boardStation,alightStation);
  return getJournalEntries().find(e=>e._key===key)||null;
}
// Wcześniejsze wersje zapisywały płaskie board/alight (jeden odcinek) —
// czytamy taki stary zapis jako sam odcinek 1, żeby nic nie zniknęło.
function normalizeTrip(trip){
  if(!trip)return null;
  if(trip.leg1)return trip;
  if(trip.board&&trip.alight)return Object.assign({},trip,{leg1:{board:trip.board,alight:trip.alight},leg2:null});
  return trip;
}
function matchTypicalTrip(stations){
  const trips=getTypicalTrips();
  for(const id of['domPraca','pracaDom']){
    const trip=normalizeTrip(trips[id]);
    if(!trip)continue;
    for(const legNumber of[1,2]){
      const leg=legNumber===1?trip.leg1:trip.leg2;
      if(!leg||!leg.board||!leg.alight)continue;
      const bi=stations.findIndex(s=>normStation(s.stationName)===normStation(leg.board));
      const ai=stations.findIndex(s=>normStation(s.stationName)===normStation(leg.alight));
      if(bi>=0&&ai>bi)return{id,trip,leg,legNumber,boardIdx:bi,alightIdx:ai};
    }
  }
  return null;
}
function canSaveJourney(stations,alightIdx){return alightIdx!=null&&stations[alightIdx]&&stations[alightIdx].status==='confirmed'}
function buildJournalEntry(data,stations,boardIdx,alightIdx,tripMeta){
  const b=stations[boardIdx],a=stations[alightIdx];
  const plannedDep=b.plannedDeparture||b.plannedTime;
  const actualDep=(b.status==='confirmed'?(b.actualDeparture||b.actualTime):'')||plannedDep;
  const plannedArr=a.plannedArrival||a.plannedTime;
  const actualArr=(a.status==='confirmed'?(a.actualArrival||a.actualTime):'')||plannedArr;
  const delay=a.status==='confirmed'?(typeof a.arrivalDelay==='number'?a.arrivalDelay:(a.delay||0)):0;
  return{
    date:data.operatingDate,
    trainNumber:data.trainNumber||data.train||'',
    category:data.category||'',
    boardStation:b.stationName,
    alightStation:a.stationName,
    plannedDeparture:plannedDep,
    actualDeparture:actualDep,
    plannedArrival:plannedArr,
    actualArrival:actualArr,
    delayMinutes:delay,
    plannedDurationMin:durationMinJ(plannedDep,plannedArr),
    actualDurationMin:durationMinJ(actualDep,actualArr),
    tripType:tripMeta?tripMeta.id:'inna',
    tripLabel:tripMeta?tripMeta.trip.label:'',
    legNumber:tripMeta?tripMeta.legNumber:null,
    distanceKm:tripMeta&&tripMeta.trip.distanceKm?Number(tripMeta.trip.distanceKm):null,
    scheduleId:data.scheduleId,
    orderId:data.orderId,
    _key:journeyKey(data.operatingDate,data.scheduleId,data.orderId,b.stationName,a.stationName),
    createdAt:new Date().toISOString()
  };
}
function updateMarkButtons(){
  document.querySelectorAll('.mark-btn.board').forEach(function(b){b.classList.toggle('active',Number(b.dataset.idx)===markBoardIdx)});
  document.querySelectorAll('.mark-btn.alight').forEach(function(b){b.classList.toggle('active',Number(b.dataset.idx)===markAlightIdx)});
}
// Zaznaczenie wsiadania/wysiadania dla pociągu, który jeszcze nie jedzie,
// trzymamy per kurs w localStorage — PLK po prostu nie ma jeszcze danych
// rzeczywistych (bo nic się jeszcze nie wydarzyło), więc zapis do
// dzienniczka i tak czeka na dotarcie do stacji wysiadania. Bez tego
// zamknięcie karty przed zakończeniem kursu gubiło zaznaczenie — trzeba
// było zaznaczać od nowa, wracając wieczorem sprawdzić, czy już można
// zapisać.
function courseMarkKey(data){return 'dziennikZaznaczenie_'+data.scheduleId+'_'+data.orderId+'_'+data.operatingDate}
function saveMarksToStorage(){
  if(!currentTrainData)return;
  try{
    if(markBoardIdx==null||markAlightIdx==null){
      localStorage.removeItem(courseMarkKey(currentTrainData));
      return;
    }
    localStorage.setItem(courseMarkKey(currentTrainData),JSON.stringify({
      board:currentStations[markBoardIdx].stationName,
      alight:currentStations[markAlightIdx].stationName
    }));
  }catch(e){}
}
function restoreMarksFromStorage(data,stations){
  try{
    const raw=localStorage.getItem(courseMarkKey(data));
    if(!raw)return;
    const saved=JSON.parse(raw);
    const bi=stations.findIndex(function(s){return s.stationName===saved.board});
    const ai=stations.findIndex(function(s){return s.stationName===saved.alight});
    if(bi>=0)markBoardIdx=bi;
    if(ai>=0)markAlightIdx=ai;
  }catch(e){}
}
function markBoard(i){markBoardIdx=(markBoardIdx===i?null:i);saveMarksToStorage();updateMarkButtons();renderJournalBar()}
function markAlight(i){markAlightIdx=(markAlightIdx===i?null:i);saveMarksToStorage();updateMarkButtons();renderJournalBar()}
function renderJournalBar(){
  const bar=document.getElementById('journalBar');
  if(!bar||!currentTrainData)return;
  const data=currentTrainData,stations=currentStations;
  const tripMatch=matchTypicalTrip(stations);
  let html='';
  if(tripMatch){
    const bS=stations[tripMatch.boardIdx].stationName,aS=stations[tripMatch.alightIdx].stationName;
    const existing=findExistingEntry(data.operatingDate,data.scheduleId,data.orderId,bS,aS);
    const legTxt=tripMatch.trip.leg2?(' · odcinek '+tripMatch.legNumber+'/2'):'';
    if(existing){
      html='<div class="journal-note ok">✓ Zapisano w dzienniczku jako „'+esc(tripMatch.trip.label||tripMatch.id)+legTxt+'”. <button type="button" class="link-btn" onclick="removeJournalEntry(\''+existing._key+'\')">Usuń wpis</button></div>';
    }else{
      const canSave=canSaveJourney(stations,tripMatch.alightIdx);
      html='<div class="journal-note">Ten kurs pasuje do trasy „'+esc(tripMatch.trip.label||tripMatch.id)+legTxt+'” ('+esc(bS)+' → '+esc(aS)+'). '+(canSave?'<button type="button" class="btn small" onclick="saveTypicalJourney()">📓 Dodaj do dzienniczka</button>':'<span class="hint">Dostępne po dotarciu do stacji wysiadania.</span>')+'</div>';
    }
  }else if(markBoardIdx!=null&&markAlightIdx!=null&&markAlightIdx>markBoardIdx){
    const bS=stations[markBoardIdx].stationName,aS=stations[markAlightIdx].stationName;
    const existing=findExistingEntry(data.operatingDate,data.scheduleId,data.orderId,bS,aS);
    if(existing){
      html='<div class="journal-note ok">✓ Ten przejazd jest już w dzienniczku. <button type="button" class="link-btn" onclick="removeJournalEntry(\''+existing._key+'\')">Usuń wpis</button></div>';
    }else{
      const canSave=canSaveJourney(stations,markAlightIdx);
      html='<div class="journal-note">🚏 '+esc(bS)+' → 🏁 '+esc(aS)+'. '+(canSave?'<button type="button" class="btn small" onclick="saveManualJourney()">💾 Zapisz do dzienniczka</button>':'<span class="hint">Dostępne po dotarciu do stacji wysiadania.</span>')+'</div>';
    }
  }else if(markBoardIdx!=null&&markAlightIdx!=null){
    html='<div class="journal-note warn">Stacja wysiadania musi być dalej na trasie niż wsiadania.</div>';
  }else{
    html='<div class="journal-note hint">🚏 Zaznacz stację wsiadania i 🏁 wysiadania przy stacjach poniżej, żeby zapisać ten przejazd do <a href="/dziennik/">dzienniczka podróży</a>.</div>';
  }
  bar.innerHTML=html;
  updateFloatSaveBtn(tripMatch);
}
// Pływający przycisk zapisu — widoczny, gdy jest coś gotowego do zapisania
// (oba przystanki zaznaczone albo pasuje trasa typowa), niezależnie od
// tego, gdzie akurat przewinięta jest strona.
function updateFloatSaveBtn(tripMatch){
  const btn=document.getElementById('floatSaveBtn');
  if(!btn||!currentTrainData)return;
  const stations=currentStations,data=currentTrainData;
  let show=false,label='',handler=null,immediate=true;
  if(tripMatch){
    const bS=stations[tripMatch.boardIdx].stationName,aS=stations[tripMatch.alightIdx].stationName;
    const existing=findExistingEntry(data.operatingDate,data.scheduleId,data.orderId,bS,aS);
    if(!existing&&canSaveJourney(stations,tripMatch.alightIdx)){show=true;label='📓 Dodaj do dzienniczka';handler=saveTypicalJourney;immediate=true}
  }else if(markBoardIdx!=null&&markAlightIdx!=null&&markAlightIdx>markBoardIdx){
    const bS=stations[markBoardIdx].stationName,aS=stations[markAlightIdx].stationName;
    const existing=findExistingEntry(data.operatingDate,data.scheduleId,data.orderId,bS,aS);
    // Trasa nietypowa otwiera formularz (nazwa trasy + km) zamiast zapisywać
    // od razu, więc przycisk pływający po kliknięciu tylko się chowa —
    // stan "✓ Zapisano" pokazujemy dopiero po realnym zapisie w formularzu.
    if(!existing&&canSaveJourney(stations,markAlightIdx)){show=true;label='💾 Zapisz do dzienniczka';handler=saveManualJourney;immediate=false}
  }
  if(!show){btn.style.display='none';return}
  btn.style.display='block';
  btn.textContent=label;
  btn.classList.remove('done');
  btn.onclick=function(){
    handler();
    if(immediate){
      btn.textContent='✓ Zapisano';
      btn.classList.add('done');
      setTimeout(function(){btn.style.display='none'},1400);
    }else{
      btn.style.display='none';
    }
  };
}
function saveTypicalJourney(){
  if(!currentTrainData)return;
  const tripMatch=matchTypicalTrip(currentStations);
  if(!tripMatch)return;
  const entry=buildJournalEntry(currentTrainData,currentStations,tripMatch.boardIdx,tripMatch.alightIdx,tripMatch);
  const list=getJournalEntries();
  list.push(entry);
  saveJournalEntries(list);
  renderJournalBar();
}
function saveManualJourney(){
  if(!currentTrainData||markBoardIdx==null||markAlightIdx==null||markAlightIdx<=markBoardIdx)return;
  openManualSaveForm();
}
function openManualSaveForm(){
  const overlay=document.getElementById('manualSaveOverlay');
  if(!overlay)return;
  document.getElementById('manualTripName').value='';
  document.getElementById('manualTripKm').value='';
  overlay.classList.add('open');
  setTimeout(function(){document.getElementById('manualTripName').focus()},50);
}
function closeManualSaveForm(){
  const overlay=document.getElementById('manualSaveOverlay');
  if(overlay)overlay.classList.remove('open');
  renderJournalBar();
}
function confirmManualSave(){
  if(!currentTrainData||markBoardIdx==null||markAlightIdx==null){closeManualSaveForm();return}
  const name=(document.getElementById('manualTripName').value||'').trim();
  const kmRaw=document.getElementById('manualTripKm').value;
  const km=kmRaw?Number(kmRaw):null;
  closeManualSaveForm();
  const entry=buildJournalEntry(currentTrainData,currentStations,markBoardIdx,markAlightIdx,null);
  entry.distanceKm=km;
  if(name)entry.tripLabel=name;
  const list=getJournalEntries();
  list.push(entry);
  saveJournalEntries(list);
  markBoardIdx=null;markAlightIdx=null;
  saveMarksToStorage();
  updateMarkButtons();
  renderJournalBar();
}
function removeJournalEntry(key){
  saveJournalEntries(getJournalEntries().filter(function(e){return e._key!==key}));
  renderJournalBar();
}
// /train nigdy dotąd nie pobierało profilu (tylko wysyłało lastTrain) — bez
// tego trasy typowe zdefiniowane na innym urządzeniu (np. na /dziennik/ na
// telefonie) nie byłyby tu widoczne, dopóki ktoś nie odwiedziłby /dziennik/
// też na tym urządzeniu. Dociągamy je w tle i odświeżamy pasek, jeśli akurat
// już renderujemy jakiś kurs.
async function syncTypicalTripsFromProfile(){
  if(!(window.ProfileSync&&ProfileSync.getToken()))return;
  try{
    const profile=await ProfileSync.pull();
    if(profile&&profile.typicalTrips&&typeof profile.typicalTrips==='object'){
      localStorage.setItem(TYPICAL_TRIPS_KEY,JSON.stringify(profile.typicalTrips));
      renderJournalBar();
    }
  }catch(e){}
}

// Dopóki użytkownik stoi na biegu konkretnego pociągu, dociągamy świeże
// dane co 5 minut — bez tego opóźnienie/ostatnia potwierdzona stacja
// zamrażały się na moment otwarcia strony, mimo że pociąg jechał dalej.
function scheduleAutoRefresh(train,opts){
  if(autoRefreshTimer)clearInterval(autoRefreshTimer);
  autoRefreshTimer=setInterval(()=>{
    fetchAndRenderTrain(train,opts).catch(()=>{});
  },AUTO_REFRESH_MS);
}

async function fetchAndRenderTrain(train,opts){
  const q=new URLSearchParams();
  q.set('scheduleId',opts.schedule);
  q.set('orderId',opts.order);
  q.set('train',train);
  q.set('operatingDate',opts.date||todayIso());

  if(opts.trainOrderId)q.set('trainOrderId',opts.trainOrderId);
  if(opts.station)q.set('station',opts.station);

  const delays=[0,700,1600];

  for(let attempt=0;attempt<delays.length;attempt++){
    if(delays[attempt]){
      setStatus('Pierwsza próba nie powiodła się. Ponawiam pobieranie...');
      await new Promise(resolve=>setTimeout(resolve,delays[attempt]));
    }

    try{
      const url='/api/train-details?'+q.toString()+'&_retry='+attempt;
      const r=await fetch(url,{
        headers:{Accept:'application/json'},
        cache:'no-store'
      });

      const text=await r.text();
      let data=null;

      try{
        data=JSON.parse(text);
      }catch(_){
        data=null;
      }

      if(r.ok && data && !data.error){
        renderTrain(train,data);
        scheduleAutoRefresh(train,opts);
        saveLastTrainContext(train,data);
        lastTrainFetchAt=Date.now();
        lastTrainArgs=[train,opts];
        return;
      }

      const message=
        data?.error ||
        data?.details ||
        ('HTTP '+r.status);

      if(attempt===delays.length-1){
        throw new Error(message);
      }
    }catch(e){
      if(attempt===delays.length-1)throw e;
    }
  }
}

async function loadTrain(){const train=qs('train');if(!train){setStatus('Otwórz bieg pociągu, klikając jego numer na tablicy albo na liście Moje Pociągi V2.');return}setStatus('Pobieram bieg pociągu...');loading(train);const idp=detailsParams();let schedule=idp.get('scheduleId')||idp.get('scheduledId');let order=idp.get('orderId');try{if(!schedule||!order){const found=await findCourseFromOpenedContext(train,idp);if(found){await fetchAndRenderTrain(train,found);return}renderFallback(train,'Do pełnego biegu potrzebny jest link z tablicy odjazdów z identyfikatorami kursu. Kliknij numer pociągu bezpośrednio z tablicy albo z listy Moje Pociągi V2.');return}await fetchAndRenderTrain(train,{schedule,order,trainOrderId:idp.get('trainOrderId'),station:idp.get('station'),date:idp.get('date')||todayIso()})}catch(e){document.getElementById('content').innerHTML='<div class="panel err">Nie udało się pobrać biegu pociągu: '+esc(e.message)+'</div>';setStatus('Błąd pobierania biegu pociągu.')}}
function renderTrain(train,data){
  const stations=Array.isArray(data.route)?data.route:[];
  // Zaznaczenia wsiadania/wysiadania resetujemy tylko przy faktycznie
  // NOWYM kursie — auto-odświeżenie co 5 min ładuje ten sam kurs od nowa
  // i nie powinno kasować tego, co użytkownik już zaznaczył.
  const isSameCourse=currentTrainData&&String(currentTrainData.scheduleId)===String(data.scheduleId)&&String(currentTrainData.orderId)===String(data.orderId);
  if(!isSameCourse){markBoardIdx=null;markAlightIdx=null;restoreMarksFromStorage(data,stations)}
  currentTrainData=data;currentStations=stations;
  const nm=nowMin();
  let passedIdx=-1;
  stations.forEach((s,i)=>{if(s.status==='confirmed')passedIdx=i});
  let focusIdx=passedIdx>=0?passedIdx:stations.findIndex(s=>{const t=toMin(s.actualTime||s.plannedTime);return t!=null&&t>=nm});
  if(focusIdx<0)focusIdx=0;
  const title=[data.category||qs('category')||'',data.trainNumber||train,data.name||qs('name')||''].filter(Boolean).join(' ');
  const st=statusHuman(data.status);
  const isCancelledTrain=String(data.status||'').trim().toUpperCase()==='X';
  setStatus('Gotowe.');
  const lastStationText=data.lastConfirmedStation||'brak potwierdzonej stacji';
  const lastTimeText=data.lastConfirmedStation?(data.lastConfirmedTime||''):'Brak twardego potwierdzenia realizacji z API PLK.';

  let html='<div class="panel"><div class="summary"><div class="card"><div class="label">Pociąg</div><div class="big">'+esc(title||('Pociąg '+train))+'</div><div class="hint'+(isCancelledTrain?' hint-cancelled':'')+'">Status: '+esc(st[0])+(st[1]?' <span class="station-meta">('+esc(st[1])+')</span>':'')+'</div></div><div class="card"><div class="label">Ostatnia potwierdzona stacja</div><div class="big">'+esc(lastStationText)+'</div><div class="hint">'+esc(lastTimeText)+'</div></div></div><div style="margin-top:10px"><a class="btn green" target="_blank" rel="noopener" href="'+esc(portalUrl(train))+'">Otwórz Portal Pasażera</a> <button class="btn small" onclick="copySummary()">Kopiuj podsumowanie</button></div></div>';
  html+='<div class="panel"><div class="route-title"><h2>Trasa stacja po stacji</h2><div class="hint">„Zaliczona” tylko przy potwierdzeniu API. Gdy czas już minął, a API nie potwierdza stacji, pokazujemy „BRAK INFO Z API”.</div></div><div id="journalBar" class="journal-bar"></div><div class="route-table">';

  stations.forEach((s,i)=>{
    let state='future',txt='przed',badge='future';
    if(s.status==='confirmed'){
      state=(i===passedIdx?'current':'passed');txt=(i===passedIdx?'ostatnia':'zaliczona');badge=state;
    }else{
      const t=toMin(s.actualTime||s.plannedTime);
      if(t!=null&&t>=nm){
        if(i===passedIdx+1||(passedIdx<0&&i===focusIdx)){state='next';txt='następna';badge='next'}
      }else{
        state='info';txt='BRAK INFO Z API';badge='info';
      }
    }
    const hasPlatform=s.platform&&s.platform!=='-';
    const hasTrack=s.track&&s.track!=='-';
    html+='<div id="station-'+i+'" class="rrow '+state+'">'
      +'<div class="time-cell">'+renderTime(s,state==='future'||state==='next'?'future':state)+'</div>'
      +'<div class="delay-cell">'+renderDelayCol(s)+'</div>'
      +'<div class="station-cell"><span class="badge '+badge+'">'+esc(txt)+'</span><div class="station-name">'+esc(s.stationName)+'</div><div class="mark-btns"><button type="button" class="mark-btn board" data-idx="'+i+'" title="Tu wsiadam" onclick="markBoard('+i+')">🚏</button><button type="button" class="mark-btn alight" data-idx="'+i+'" title="Tu wysiadam" onclick="markAlight('+i+')">🏁</button></div></div>'
      +'<div class="platform-cell"><div class="plat-num">'+(hasPlatform?esc(s.platform):'—')+'</div>'+(hasTrack?'<div class="plat-track">tor '+esc(s.track)+'</div>':'')+'</div>'
    +'</div>';
  });

  html+='</div></div>';document.getElementById('content').innerHTML=html;window._trainSummary=document.body.innerText.replace(/\n{3,}/g,'\n\n');updateMarkButtons();renderJournalBar();setTimeout(()=>{const el=document.getElementById('station-'+focusIdx);if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},150);
}
function saveLastTrainContext(train,data){
  try{
    const label=[data.category||qs('category')||'',data.trainNumber||train,data.name||qs('name')||''].filter(Boolean).join(' ');
    const ctx={
      url:location.pathname+location.search,
      label:label||('Pociąg '+train),
      savedAt:Date.now()
    };
    localStorage.setItem('plkLastTrain',JSON.stringify(ctx));
    if(window.ProfileSync&&ProfileSync.getToken())ProfileSync.push({lastTrain:ctx});
  }catch(e){}
}
function renderFallback(train,msg){setStatus('Nie mam identyfikatorów kursu z tablicy.');document.getElementById('content').innerHTML='<div class="panel"><h2>Pociąg '+esc(train)+'</h2><div class="err">'+esc(msg||'Brak pełnych identyfikatorów kursu.')+'</div><p class="hint">Kliknij numer pociągu bezpośrednio z naszej tablicy odjazdów. Sam numer może oznaczać więcej niż jeden kurs.</p><a class="btn green" target="_blank" rel="noopener" href="'+esc(portalUrl(train))+'">Otwórz wyszukiwarkę w Portal Pasażera</a></div>'}
function copySummary(){navigator.clipboard&&navigator.clipboard.writeText(window._trainSummary||document.body.innerText)}
document.addEventListener('DOMContentLoaded',function(){
  syncTypicalTripsFromProfile();
  if(qs('train'))loadTrain();
  const overlay=document.getElementById('manualSaveOverlay');
  if(overlay){
    overlay.addEventListener('click',function(e){if(e.target===overlay)closeManualSaveForm()});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&overlay.classList.contains('open'))closeManualSaveForm()});
  }
});
// Timery (scheduleAutoRefresh) bywają wstrzymywane, gdy strona trafia do
// bfcache — po powrocie wznawiają się, ale mogły przespać kawałek 5-minutowego
// okna. Gdy dane są starsze niż AUTO_REFRESH_MS, dociągamy je od razu.
window.addEventListener('pageshow',function(e){if(e.persisted&&lastTrainArgs&&Date.now()-lastTrainFetchAt>AUTO_REFRESH_MS){fetchAndRenderTrain(...lastTrainArgs).catch(()=>{})}});
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
