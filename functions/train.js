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
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:var(--text);padding:18px}.wrap{max-width:760px;margin:0 auto}.btn{border:0;border-radius:10px;padding:12px 16px;background:var(--blue);color:#fff;font-weight:900;cursor:pointer;text-decoration:none;display:inline-block}.btn.secondary{background:var(--grey)}.btn.green{background:#198754}.btn.small{padding:8px 10px;font-size:12px;background:#374151}.status{text-align:center;color:var(--muted);min-height:28px;margin:12px 0}.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;margin:12px 0}.summary{display:grid;grid-template-columns:1fr 1fr;gap:8px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 11px}.label{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.03em}.big{font-size:19px;font-weight:900;line-height:1.2}.hint{font-size:13px;color:#d8e2ee;line-height:1.35}.hint-cancelled{font-size:19px;font-weight:900;color:var(--red)}.hint-cancelled .station-meta{color:var(--red);opacity:.85;font-weight:700}.disruption-note{border-color:var(--red);background:#2a1414}.disruption-title{font-weight:900;color:var(--red);margin-bottom:6px}.disruption-row{font-size:14px;color:#ffd6d6;line-height:1.4}.disruption-station{opacity:.8;font-weight:700}.route-title{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}h2{margin:0 0 8px;font-size:22px}.route-table{display:block}
.rrow{display:grid;grid-template-columns:92px 60px 1fr 76px;gap:10px;align-items:center;padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.10)}
.rrow-head{display:grid;grid-template-columns:92px 60px 1fr 76px;gap:10px;padding:2px 8px 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);border-bottom:1px solid rgba(255,255,255,.18)}
.rrow-head div:last-child,.rrow-head div:nth-child(2){text-align:center}
.rrow:last-child{border-bottom:0}
/* Kolumna stacji dopasowuje się do najdłuższej nazwy (a nie rozciąga na całą szerokość),
   więc Per./Tor stoi tuż za nazwą. Wiersze są subgridami jednej siatki, żeby kolumny
   były wyrównane między wierszami; ostatnia kolumna 1fr tylko domyka tło wiersza. */
@supports (grid-template-columns:subgrid){
.route-table{display:grid;grid-template-columns:92px 60px minmax(0,max-content) 76px minmax(0,1fr);column-gap:10px}
.route-table>.rrow,.route-table>.rrow-head{grid-column:1/-1;grid-template-columns:subgrid;column-gap:10px}
}
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
.toast{position:fixed;left:50%;top:14px;transform:translate(-50%,-20px);background:#1c2833;color:#fff;border:1px solid #0b57d0;border-radius:999px;padding:13px 22px;font-size:17px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.45);z-index:10000;opacity:0;pointer-events:none;transition:opacity .2s ease;max-width:calc(100vw - 24px);text-align:center}
.toast.show{opacity:1}
.mt-star{font-size:18px}
.mt-star.star-filled{color:#ffd400;text-shadow:0 0 6px rgba(255,212,0,.5)}
button.mt-star{background:transparent;border:0;color:#8fa6bf;cursor:pointer;padding:0 0 0 4px;vertical-align:middle;line-height:1}
.mark-btn{border:1.5px solid #8fa6bf;background:rgba(255,255,255,.08);border-radius:7px;padding:5px 8px;font-size:16px;cursor:pointer;opacity:1;line-height:1.2}
.mark-btn:hover{background:rgba(255,255,255,.16);border-color:#c3d3e5}
.mark-btn.active{border-color:#fff;background:var(--blue);box-shadow:0 0 0 2px rgba(11,87,208,.55),0 2px 10px rgba(11,87,208,.7);transform:scale(1.1)}
.last-station{margin-top:8px;padding-top:7px;border-top:1px solid var(--line)}
.last-line{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.journal-bar{margin:6px 0 4px}
.legend{margin:8px 0 0;font-size:12px;color:var(--muted)}
.legend summary{display:inline-block;cursor:pointer;list-style:none;padding:2px 9px;border:1px solid var(--line);border-radius:999px;user-select:none}
.legend summary::-webkit-details-marker{display:none}
.legend[open] summary{border-color:var(--cyan);color:var(--cyan)}
.legend .hint{margin-top:6px;font-size:12px}
.journal-note.hint{display:block;background:transparent;border:0;padding:2px 2px;font-size:12px;color:var(--muted)}
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
@media(max-width:720px){body{padding:8px}.summary{grid-template-columns:1fr 1fr;gap:6px}.card{padding:7px 9px}.panel{padding:9px}
.rrow{grid-template-columns:70px 40px 1fr 56px;gap:6px;padding:9px 6px}
.rrow-head{grid-template-columns:70px 40px 1fr 56px;gap:6px;padding:0 6px 6px;font-size:10px}
@supports (grid-template-columns:subgrid){
.route-table{grid-template-columns:70px 40px minmax(0,max-content) 56px minmax(0,1fr);column-gap:6px}
.route-table>.rrow,.route-table>.rrow-head{grid-template-columns:subgrid;column-gap:6px}
}
.time{font-size:20px}
.delay-cell .time{font-size:16px}
.station-name{font-size:15px}
.badge{font-size:10px;padding:2px 6px}
.plat-num{font-size:17px}
.plat-track{font-size:10px}
.big{font-size:16px}.hint-cancelled{font-size:15px}}
</style>
<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "a3663c820f4e414ab15c7a64a8aa36ec"}'></script><!-- End Cloudflare Web Analytics -->
</head>
<body>
<div class="wrap">
  <div id="status" class="status">Kliknij numer pociągu na tablicy albo na liście Moje pociągi.</div>
  <div id="content"></div>
</div>
<button type="button" id="floatSaveBtn" class="float-save-btn" style="display:none"></button>
<div class="manual-save-overlay" id="manualSaveOverlay">
  <div class="manual-save-box">
    <h3>Zapisz przejazd</h3>
    <label for="manualTripName">Nazwa trasy (opcjonalnie)</label>
    <input type="text" id="manualTripName" placeholder="np. Wycieczka do Krakowa">
    <label for="manualTripKm">Kilometraż (opcjonalnie)</label>
    <input type="text" inputmode="decimal" id="manualTripKm" placeholder="np. 45">
    <div class="manual-save-actions">
      <button type="button" class="btn small secondary" onclick="closeManualSaveForm()">Anuluj</button>
      <button type="button" class="btn small" onclick="confirmManualSave()">Zapisz</button>
    </div>
  </div>
</div>
<script src="/profile-sync.js"></script>
<script src="/tutorial.js"></script>
<script src="/survey.js"></script>
<script>
function qs(name){return new URLSearchParams(location.search).get(name)||''}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function shortTime(v){if(!v)return'';const m=String(v).match(/(\d{2}:\d{2})/);return m?m[1]:String(v)}
function setStatus(t){document.getElementById('status').textContent=t}
// Krótki dymek na środku ekranu — linijka statusu bywa latwa do przeoczenia.
let toastTimer=null;
function showToastNear(anchorEl,t){
  let el=document.getElementById('toast');
  if(!el){el=document.createElement('div');el.id='toast';el.className='toast';document.body.appendChild(el)}
  el.textContent=t;
  el.classList.remove('show');
  void el.offsetWidth;
  const vw=window.innerWidth;
  if(anchorEl&&anchorEl.getBoundingClientRect){
    const r=anchorEl.getBoundingClientRect();
    const left=Math.max(90,Math.min(vw-90,Math.round(r.left+r.width/2)));
    el.style.left=left+'px';
    if(r.top>70){el.style.top=Math.round(r.top-10)+'px';el.style.transform='translate(-50%,-100%)'}
    else{el.style.top=Math.round(r.bottom+10)+'px';el.style.transform='translate(-50%,0)'}
  }else{
    el.style.left='50%';el.style.top='14px';el.style.transform='translate(-50%,-20px)';
  }
  el.classList.add('show');
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.classList.remove('show')},2600);
}
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
// prawdy używany przez moje-pociagi i tę stronę. Wcześniej ta
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
let markBoardIdx=null,markAlightIdx=null,markMode=null;

function getJournalEntries(){try{const v=JSON.parse(localStorage.getItem(JOURNAL_KEY));return Array.isArray(v)?v:[]}catch{return[]}}
// Zwraca true/false zamiast po cichu wywalać się w localStorage.setItem
// (pełny magazyn, tryb prywatny w niektórych przeglądarkach) — bez tego
// przycisk "Dodaj do dzienniczka" po prostu nic nie robił i wpis ginął,
// a użytkownik nie miał jak się o tym dowiedzieć.
function saveJournalEntries(list){
  try{
    localStorage.setItem(JOURNAL_KEY,JSON.stringify(list));
  }catch(e){
    return false;
  }
  // pushBeacon (nie zwykły push) — użytkownik często zaraz po zapisie
  // przechodzi na tablicę sprawdzić wynik; sendBeacon dostarcza zapis do
  // profilu nawet wtedy, gdy zwykłe zapytanie zostałoby przerwane nawigacją.
  if(window.ProfileSync){
    if(ProfileSync.pushBeacon)ProfileSync.pushBeacon({journalEntries:list});
    else ProfileSync.push({journalEntries:list});
    // sendBeacon NIE daje żadnego potwierdzenia dostarczenia — tylko "udało
    // się zakolejkować", nie "serwer to dostał". Niektóre przeglądarki (np.
    // Firefox z ochroną przed śledzeniem) potrafią go po cichu zablokować,
    // więc "✓ Zapisano" widoczne od razu po zapisie lokalnym może się mijać
    // z prawdą. Kilka sekund później sprawdzamy naprawdę i w razie potrzeby
    // próbujemy ponownie zwykłym zapytaniem (to jedyny sposób na realne
    // potwierdzenie — sendBeacon go nie daje).
    scheduleJournalSyncVerification(list);
  }
  return true;
}
let journalVerifyTimer=null;
function scheduleJournalSyncVerification(expectedList){
  if(!(window.ProfileSync&&ProfileSync.getToken()))return;
  if(journalVerifyTimer)clearTimeout(journalVerifyTimer);
  journalVerifyTimer=setTimeout(async function(){
    journalVerifyTimer=null;
    try{
      const profile=await ProfileSync.pull();
      const remoteKeys=new Set(((profile&&profile.journalEntries)||[]).map(function(e){return e._key}));
      const missing=expectedList.filter(function(e){return !remoteKeys.has(e._key)});
      if(!missing.length)return;
      const ok=await ProfileSync.push({journalEntries:getJournalEntries()});
      if(!ok){
        showJournalSaveError('Wpis zapisał się tylko lokalnie w tej przeglądarce — synchronizacja z profilem nie powiodła się. Sprawdź połączenie i spróbuj ponownie (np. odśwież stronę).');
      }
    }catch(e){}
  },4000);
}
function showJournalSaveError(msg){
  const el=document.getElementById('journalSaveError');
  if(!el)return;
  if(msg){el.textContent='⚠️ '+msg;el.style.display='block'}else{el.style.display='none';el.textContent=''}
}
function getTypicalTrips(){
  let v;
  try{v=JSON.parse(localStorage.getItem(TYPICAL_TRIPS_KEY))}catch(e){v=null}
  if(Array.isArray(v))return v;
  if(v&&typeof v==='object')return['domPraca','pracaDom'].filter(id=>v[id]).map(id=>Object.assign({id},v[id]));
  return[];
}
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
  for(const raw of trips){
    const trip=normalizeTrip(raw);
    if(!trip)continue;
    for(const legNumber of[1,2]){
      const leg=legNumber===1?trip.leg1:trip.leg2;
      if(!leg||!leg.board||!leg.alight)continue;
      const bi=stations.findIndex(s=>normStation(s.stationName)===normStation(leg.board));
      const ai=stations.findIndex(s=>normStation(s.stationName)===normStation(leg.alight));
      if(bi>=0&&ai>bi)return{id:trip.id,trip,leg,legNumber,boardIdx:bi,alightIdx:ai};
    }
  }
  return null;
}
function canSaveJourney(stations,alightIdx){return alightIdx!=null&&stations[alightIdx]&&stations[alightIdx].status==='confirmed'}
// Nazwa i kilometraż wpisu z trasy typowej — każdy odcinek przesiadki ma
// własne km (leg.distanceKm), a nazwa (np. "do pracy") jest wspólna dla
// odcinków. Starsze trasy miały jeden kilometraż całości, który ma sens
// tylko bez przesiadki — przy przesiadce lepiej zostawić pusto niż wpisać
// pełną trasę przy każdym odcinku.
function tripMetaName(tripMeta){
  return tripMeta.trip.name||'trasa';
}
function tripMetaKm(tripMeta){
  const leg=tripMeta.leg;
  if(leg&&leg.distanceKm!=null&&leg.distanceKm!=='')return Number(leg.distanceKm);
  if(!tripMeta.trip.leg2&&tripMeta.trip.distanceKm)return Number(tripMeta.trip.distanceKm);
  return null;
}
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
    tripLabel:tripMeta?tripMetaName(tripMeta):'',
    legNumber:tripMeta?tripMeta.legNumber:null,
    distanceKm:tripMeta?tripMetaKm(tripMeta):null,
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
    const markKey=courseMarkKey(currentTrainData);
    if(markBoardIdx==null||markAlightIdx==null){
      if(window.JournalMarks)JournalMarks.remove(markKey);else localStorage.removeItem(markKey);
      return;
    }
    const alight=currentStations[markAlightIdx];
    const markObj={
      board:currentStations[markBoardIdx].stationName,
      alight:alight.stationName,
      plannedArrival:alight.plannedArrival||alight.plannedTime||'',
      date:currentTrainData.operatingDate,
      scheduleId:currentTrainData.scheduleId,
      orderId:currentTrainData.orderId,
      trainLabel:[currentTrainData.category,currentTrainData.trainNumber||currentTrainData.train].filter(Boolean).join(' '),
      // Zapisujemy dokładny adres do tego kursu — przypomnienie na tablicy
      // głównej (patrz index.html) prowadzi jednym klikiem z powrotem tutaj.
      url:location.pathname+location.search,
      mode:markMode||''
    };
    // JournalMarks (profile-sync.js) zapisuje lokalnie i, gdy jest profil,
    // synchronizuje zaznaczenie z innymi urządzeniami.
    if(window.JournalMarks)JournalMarks.set(markKey,markObj);else localStorage.setItem(markKey,JSON.stringify(markObj));
  }catch(e){}
}
// Zaznaczenia zrobione na innym urządzeniu dociągamy z profilu i, jeśli
// jest otwarty kurs, którego dotyczą, odtwarzamy je na ekranie. Niepełnego
// (tylko wsiadanie) zaznaczenia w pamięci nie ruszamy — nie trafia do
// localStorage, więc synchronizacja skasowałaby je użytkownikowi sprzed nosa.
async function syncMarksFromProfile(){
  if(!(window.JournalMarks&&window.ProfileSync&&ProfileSync.getToken()))return;
  try{
    await JournalMarks.sync();
    if(!currentTrainData)return;
    if((markBoardIdx==null)!==(markAlightIdx==null))return;
    markBoardIdx=null;markAlightIdx=null;markMode=null;
    restoreMarksFromStorage(currentTrainData,currentStations);
    updateMarkButtons();
    renderJournalBar();
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
    markMode=saved.mode||null;
  }catch(e){}
}
function markBoard(i){markBoardIdx=(markBoardIdx===i?null:i);if(markBoardIdx==null)markMode=null;saveMarksToStorage();updateMarkButtons();renderJournalBar()}
function markAlight(i){markAlightIdx=(markAlightIdx===i?null:i);if(markAlightIdx==null)markMode=null;saveMarksToStorage();updateMarkButtons();renderJournalBar()}
// Trasa typowa a godzina: godzina odjazdu ze stacji wsiadania mieści się
// w oknie "Odjazd od–do" trasy (z zapasem 20 min). Bez ustawionych godzin
// nie umiemy ocenić, więc uznajemy ją za typową.
function isTypicalTime(trip,depTime){
  const from=toMinutesJ(trip.timeFrom),to=toMinutesJ(trip.timeTo),d=toMinutesJ(depTime);
  if(from==null||to==null||d==null)return true;
  return d>=from-20&&d<=to+20;
}
// Czy ręcznie zaznaczone stacje są dokładnie jednym z odcinków trasy typowej
// — wtedy zapis podstawia jej nazwę i km, bez pytania o nie za każdym razem.
function typicalMetaForMarks(){
  if(markBoardIdx==null||markAlightIdx==null||!currentStations[markBoardIdx]||!currentStations[markAlightIdx])return null;
  const b=normStation(currentStations[markBoardIdx].stationName),a=normStation(currentStations[markAlightIdx].stationName);
  const trips=getTypicalTrips();
  for(const raw of trips){
    const trip=normalizeTrip(raw);
    if(!trip)continue;
    for(const legNumber of[1,2]){
      const leg=legNumber===1?trip.leg1:trip.leg2;
      if(leg&&normStation(leg.board)===b&&normStation(leg.alight)===a)return{id:trip.id,trip,leg,legNumber};
    }
  }
  return null;
}
function promptDismissKey(){return currentTrainData?('dziennikPytanieNie_'+currentTrainData.scheduleId+'_'+currentTrainData.orderId+'_'+currentTrainData.operatingDate):null}
function isPromptDismissed(){try{const k=promptDismissKey();return !!k&&localStorage.getItem(k)==='1'}catch(e){return false}}
function dismissTypicalPrompt(){try{const k=promptDismissKey();if(k)localStorage.setItem(k,'1')}catch(e){}renderJournalBar()}
// Zaznacza 🚏/🏁 na stacjach odcinka trasy typowej, do którego pasuje kurs.
// mode 'edit' = przy zapisie pokaż formularz (nazwa, km) zamiast zapisu od razu.
function markTypical(mode){
  const m=matchTypicalTrip(currentStations);
  if(!m)return;
  markBoardIdx=m.boardIdx;markAlightIdx=m.alightIdx;markMode=mode||null;
  saveMarksToStorage();updateMarkButtons();renderJournalBar();
}
function markTypicalNormal(){markTypical('typical')}
function saveTypicalNow(){
  const m=matchTypicalTrip(currentStations);
  if(!m)return;
  if(canSaveJourney(currentStations,m.alightIdx))saveTypicalJourney();else markTypical('typical');
}
function editTypicalNow(){
  markTypical('edit');
  if(markAlightIdx!=null&&canSaveJourney(currentStations,markAlightIdx))openManualSaveForm();
}
function renderJournalBar(){
  const bar=document.getElementById('journalBar');
  if(!bar||!currentTrainData)return;
  const data=currentTrainData,stations=currentStations;
  const tripMatch=matchTypicalTrip(stations);
  // Ręczne zaznaczenie ma pierwszeństwo przed automatycznym dopasowaniem
  // trasy typowej — inaczej kurs pasujący JEDNOCZEŚNIE do trasy typowej
  // (np. krótszy jej odcinek) i do dalszego ręcznego zaznaczenia zapisywał
  // po cichu ten krótszy, typowy wariant, a ręczne zaznaczenie zostawało
  // osierocone (i wiecznie "niezapisane" w przypomnieniu na tablicy).
  const hasManualMark=markBoardIdx!=null&&markAlightIdx!=null;
  let html='';
  if(hasManualMark&&markAlightIdx>markBoardIdx){
    const bS=stations[markBoardIdx].stationName,aS=stations[markAlightIdx].stationName;
    const existing=findExistingEntry(data.operatingDate,data.scheduleId,data.orderId,bS,aS);
    if(existing){
      html='<div class="journal-note ok">✓ Ten przejazd jest już w dzienniczku. <button type="button" class="link-btn" onclick="removeJournalEntry(\''+existing._key+'\')">Usuń wpis</button></div>';
    }else{
      const canSave=canSaveJourney(stations,markAlightIdx);
      const meta=typicalMetaForMarks();
      const direct=!!meta&&markMode!=='edit';
      const metaTxt=meta?(' · trasa „'+esc(tripMetaName(meta))+'”'+(meta.trip.leg2?(' · odcinek '+meta.legNumber+'/2'):'')+(markMode==='edit'?' · do modyfikacji':'')):'';
      html='<div class="journal-note">🚏 '+esc(bS)+' → 🏁 '+esc(aS)+metaTxt+'. '+(canSave?'<button type="button" class="btn small" onclick="saveManualJourney()">'+(direct?'📓 Dodaj do dzienniczka':'💾 Zapisz do dzienniczka')+'</button>':'<span class="hint">Dostępne po dotarciu do stacji wysiadania.</span>')+'</div>';
    }
  }else if(hasManualMark){
    html='<div class="journal-note warn">Stacja wysiadania musi być dalej na trasie niż wsiadania.</div>';
  }else if(tripMatch){
    const bS=stations[tripMatch.boardIdx].stationName,aS=stations[tripMatch.alightIdx].stationName;
    const existing=findExistingEntry(data.operatingDate,data.scheduleId,data.orderId,bS,aS);
    const legTxt=tripMatch.trip.leg2?(' · odcinek '+tripMatch.legNumber+'/2'):'';
    const name=tripMetaName(tripMatch);
    const depT=stations[tripMatch.boardIdx].plannedDeparture||stations[tripMatch.boardIdx].plannedTime||'';
    const typicalTime=isTypicalTime(tripMatch.trip,depT);
    const canSave=canSaveJourney(stations,tripMatch.alightIdx);
    if(existing){
      html='<div class="journal-note ok">✓ Zapisano w dzienniczku jako „'+esc(name)+legTxt+'”. <button type="button" class="link-btn" onclick="removeJournalEntry(\''+existing._key+'\')">Usuń wpis</button></div>';
    }else if(isPromptDismissed()){
      html='<div class="journal-note hint">🚏🏁 Zaznacz przy stacjach, gdzie wsiadasz i wysiadasz — zapiszę przejazd w <a href="/dziennik/">dzienniczku</a>.</div>';
    }else if(typicalTime){
      if(canSave){
        html='<div class="journal-note">Ten kurs pasuje do trasy „'+esc(name)+legTxt+'” ('+esc(bS)+' → '+esc(aS)+'). <button type="button" class="btn small" onclick="saveTypicalJourney()">📓 Dodaj do dzienniczka</button></div>';
      }else{
        html='<div class="journal-note">🛤️ Kurs pasuje do trasy „'+esc(name)+legTxt+'” ('+esc(bS)+' → '+esc(aS)+') i mieści się w typowych godzinach. Zaznaczyć typowe przystanki? <button type="button" class="btn small" onclick="markTypicalNormal()">🚏🏁 Zaznacz</button><button type="button" class="link-btn" onclick="dismissTypicalPrompt()">Nie</button></div>';
      }
    }else{
      html='<div class="journal-note warn">🛤️ Moja trasa „'+esc(name)+legTxt+'” ('+esc(bS)+' → '+esc(aS)+'), ale godzina odjazdu ('+esc(depT||'?')+') jest poza typową ('+esc(tripMatch.trip.timeFrom||'?')+'–'+esc(tripMatch.trip.timeTo||'?')+'). Zapisać typowo czy zmodyfikować? <button type="button" class="btn small" onclick="saveTypicalNow()">💾 Zapisz typowo</button><button type="button" class="btn small" onclick="editTypicalNow()">✏️ Zmodyfikuj</button><button type="button" class="link-btn" onclick="dismissTypicalPrompt()">Pomiń</button></div>';
    }
  }else{
    html='<div class="journal-note hint">🚏🏁 Zaznacz przy stacjach, gdzie wsiadasz i wysiadasz — zapiszę przejazd w <a href="/dziennik/">dzienniczku</a>.</div>';
  }
  bar.innerHTML=html;
  updateFloatSaveBtn(tripMatch);
}
// Pływający przycisk zapisu — widoczny, gdy jest coś gotowego do zapisania
// (oba przystanki zaznaczone albo pasuje trasa typowa w typowych godzinach),
// niezależnie od tego, gdzie akurat przewinięta jest strona.
function updateFloatSaveBtn(tripMatch){
  const btn=document.getElementById('floatSaveBtn');
  if(!btn||!currentTrainData)return;
  const stations=currentStations,data=currentTrainData;
  let show=false,label='',handler=null,immediate=true;
  if(markBoardIdx!=null&&markAlightIdx!=null&&markAlightIdx>markBoardIdx){
    const bS=stations[markBoardIdx].stationName,aS=stations[markAlightIdx].stationName;
    const existing=findExistingEntry(data.operatingDate,data.scheduleId,data.orderId,bS,aS);
    // Trasa nietypowa (albo oznaczona do modyfikacji) otwiera formularz
    // (nazwa trasy + km) zamiast zapisywać od razu, więc przycisk pływający
    // po kliknięciu tylko się chowa — stan "✓ Zapisano" pokazujemy dopiero
    // po realnym zapisie w formularzu.
    if(!existing&&canSaveJourney(stations,markAlightIdx)){
      const direct=!!typicalMetaForMarks()&&markMode!=='edit';
      show=true;label=direct?'📓 Dodaj do dzienniczka':'💾 Zapisz do dzienniczka';handler=saveManualJourney;immediate=direct;
    }
  }else if(tripMatch&&!isPromptDismissed()){
    const bS=stations[tripMatch.boardIdx].stationName,aS=stations[tripMatch.alightIdx].stationName;
    const existing=findExistingEntry(data.operatingDate,data.scheduleId,data.orderId,bS,aS);
    const b=stations[tripMatch.boardIdx];
    const typicalTime=isTypicalTime(tripMatch.trip,b.plannedDeparture||b.plannedTime||'');
    if(!existing&&typicalTime&&canSaveJourney(stations,tripMatch.alightIdx)){show=true;label='📓 Dodaj do dzienniczka';handler=saveTypicalJourney;immediate=true}
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
  showJournalSaveError(null);
  try{
    const entry=buildJournalEntry(currentTrainData,currentStations,tripMatch.boardIdx,tripMatch.alightIdx,tripMatch);
    const list=getJournalEntries();
    list.push(entry);
    const ok=saveJournalEntries(list)&&getJournalEntries().some(e=>e._key===entry._key);
    if(!ok)throw new Error('not persisted');
  }catch(e){
    const msg='Nie udało się zapisać przejazdu w tej przeglądarce. Spróbuj ponownie albo odśwież stronę.';
    showJournalSaveError(msg);
    // Mały czerwony tekst pod paskiem łatwo przeoczyć — alert() jest
    // niemożliwy do pominięcia, a to jedyny sygnał, że coś nie wyszło.
    alert('⚠️ '+msg);
  }
  renderJournalBar();
}
function clearMarksAfterSave(){
  markBoardIdx=null;markAlightIdx=null;markMode=null;
  saveMarksToStorage();
  updateMarkButtons();
  renderJournalBar();
}
function saveManualJourney(){
  if(!currentTrainData||markBoardIdx==null||markAlightIdx==null||markAlightIdx<=markBoardIdx)return;
  // Zaznaczone stacje = odcinek trasy typowej (i nie prosiłeś o modyfikację)
  // — zapisujemy od razu z jej nazwą i km.
  const meta=typicalMetaForMarks();
  if(meta&&markMode!=='edit'){
    const entry=buildJournalEntry(currentTrainData,currentStations,markBoardIdx,markAlightIdx,meta);
    const list=getJournalEntries();
    list.push(entry);
    saveJournalEntries(list);
    clearMarksAfterSave();
    return;
  }
  openManualSaveForm();
}
function parseKmJ(v){
  const s=String(v==null?'':v).trim().replace(',','.');
  if(!s)return null;
  const n=Number(s);
  return isFinite(n)&&n>=0?n:null;
}
function openManualSaveForm(){
  const overlay=document.getElementById('manualSaveOverlay');
  if(!overlay)return;
  // Odcinek trasy typowej podstawia swoją nazwę i km jako punkt wyjścia do zmian.
  const meta=typicalMetaForMarks();
  const km=meta?tripMetaKm(meta):null;
  document.getElementById('manualTripName').value=meta?tripMetaName(meta):'';
  document.getElementById('manualTripKm').value=km!=null?String(km).replace('.',','):'';
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
  const km=parseKmJ(document.getElementById('manualTripKm').value);
  const meta=typicalMetaForMarks();
  closeManualSaveForm();
  showJournalSaveError(null);
  try{
    const entry=buildJournalEntry(currentTrainData,currentStations,markBoardIdx,markAlightIdx,meta);
    entry.distanceKm=km;
    if(name)entry.tripLabel=name;
    const list=getJournalEntries();
    list.push(entry);
    const ok=saveJournalEntries(list)&&getJournalEntries().some(e=>e._key===entry._key);
    if(!ok)throw new Error('not persisted');
    // Zaznaczenie czyścimy TYLKO po potwierdzonym sukcesie — przy błędzie
    // zostaje, żeby dało się kliknąć "Zapisz" jeszcze raz bez ponownego
    // szukania i zaznaczania tych samych dwóch stacji.
    clearMarksAfterSave();
  }catch(e){
    const msg='Nie udało się zapisać przejazdu w tej przeglądarce. Spróbuj ponownie albo odśwież stronę.';
    showJournalSaveError(msg);
    alert('⚠️ '+msg);
    renderJournalBar();
  }
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
    if(profile&&profile.typicalTrips&&typeof profile.typicalTrips==='object'&&(Date.parse(profile.updatedAt||'')||0)>=Number(localStorage.getItem('dziennikTrasyTypoweLocalAt')||0)){
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
        try{if(window.Survey)Survey.action()}catch(e){}
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

async function loadTrain(){const train=qs('train');if(!train){setStatus('Otwórz bieg pociągu, klikając jego numer na tablicy albo na liście Moje pociągi.');return}setStatus('Pobieram bieg pociągu...');loading(train);const idp=detailsParams();let schedule=idp.get('scheduleId')||idp.get('scheduledId');let order=idp.get('orderId');try{if(!schedule||!order){const found=await findCourseFromOpenedContext(train,idp);if(found){await fetchAndRenderTrain(train,found);return}renderFallback(train,'Do pełnego biegu potrzebny jest link z tablicy odjazdów z identyfikatorami kursu. Kliknij numer pociągu bezpośrednio z tablicy albo z listy Moje pociągi.');return}await fetchAndRenderTrain(train,{schedule,order,trainOrderId:idp.get('trainOrderId'),station:idp.get('station'),date:idp.get('date')||todayIso()})}catch(e){document.getElementById('content').innerHTML='<div class="panel err">Nie udało się pobrać biegu pociągu: '+esc(e.message)+'</div>';setStatus('Błąd pobierania biegu pociągu.')}}
function renderTrain(train,data){
  const stations=Array.isArray(data.route)?data.route:[];
  // Zaznaczenia wsiadania/wysiadania resetujemy tylko przy faktycznie
  // NOWYM kursie — auto-odświeżenie co 5 min ładuje ten sam kurs od nowa
  // i nie powinno kasować tego, co użytkownik już zaznaczył.
  const isSameCourse=currentTrainData&&String(currentTrainData.scheduleId)===String(data.scheduleId)&&String(currentTrainData.orderId)===String(data.orderId);
  if(!isSameCourse){markBoardIdx=null;markAlightIdx=null;markMode=null;restoreMarksFromStorage(data,stations)}
  currentTrainData=data;currentStations=stations;
  const nm=nowMin();
  let passedIdx=-1;
  stations.forEach((s,i)=>{if(s.status==='confirmed')passedIdx=i});
  let focusIdx=passedIdx>=0?passedIdx:stations.findIndex(s=>{const t=toMin(s.actualTime||s.plannedTime);return t!=null&&t>=nm});
  if(focusIdx<0)focusIdx=0;
  const title=[data.category||qs('category')||'',data.trainNumber||train,data.name||qs('name')||''].filter(Boolean).join(' ');
  const st=statusHuman(data.status);
  const isCancelledTrain=String(data.status||'').trim().toUpperCase()==='X';
  setStatus('');
  const lastStationText=data.lastConfirmedStation||'brak potwierdzonej stacji';
  const lastTimeText=data.lastConfirmedStation?(data.lastConfirmedTime||''):'Brak twardego potwierdzenia realizacji z API PLK.';

  const mtCtxStation=qs('station');
  let mtIdx=mtCtxStation?stations.findIndex(s=>normStation(s.stationName)===normStation(mtCtxStation)):-1;
  if(mtIdx<0)mtIdx=0;
  const mtStation=stations[mtIdx].stationName;
  const mtTrainNum=String(data.trainNumber||train||'').trim();
  const mtFilled=isInMyTrains(mtStation,mtTrainNum);
  let html='<div class="panel"><div class="card"><div class="label">Pociąg</div><div class="big">'+esc(title||('Pociąg '+train))+' <button type="button" id="mtStarBtn" class="mt-star'+(mtFilled?' star-filled':'')+'" title="'+(mtFilled?'Usuń z Moich pociągów':'Dodaj do Moich pociągów')+'" onclick="addToMyTrains(this)">'+(mtFilled?'★':'☆')+'</button></div><div class="hint'+(isCancelledTrain?' hint-cancelled':'')+'">Status: '+esc(st[0])+(st[1]?' <span class="station-meta">('+esc(st[1])+')</span>':'')+'</div><div class="last-station"><div class="label">Ostatnia potwierdzona stacja</div><div class="last-line"><span class="big">'+esc(lastStationText)+'</span><span class="hint">'+esc(lastTimeText)+'</span></div></div></div>';
  if(Array.isArray(data.disruptions)&&data.disruptions.length){
    html+='<div class="panel disruption-note"><div class="disruption-title">⚠️ Przyczyna opóźnienia / odwołania</div>'+data.disruptions.map(function(d){
      return '<div class="disruption-row">'+esc(d.message)+(d.stationName?' <span class="disruption-station">('+esc(d.stationName)+')</span>':'')+'</div>';
    }).join('')+'</div>';
  }
  html+='<details class="legend"><summary>ⓘ Jak czytać statusy stacji</summary><div class="hint">„Zaliczona” tylko przy potwierdzeniu API. Gdy czas już minął, a API nie potwierdza stacji, pokazujemy „BRAK INFO Z API”.</div></details><div id="journalBar" class="journal-bar"></div><div id="journalSaveError" class="journal-note warn" style="display:none"></div><div class="route-table"><div class="rrow-head"><div>Godz.</div><div>Opóźn.</div><div>Stacja</div><div>Per./Tor</div></div>';

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

  html+='</div></div>';document.getElementById('content').innerHTML=html;updateMarkButtons();renderJournalBar();setTimeout(()=>{const el=document.getElementById('station-'+focusIdx);if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},150);
}
// "Moje pociągi" trzyma prostą listę {station,trainNum,planTime} pod tym
// samym kluczem co moje-pociagi/index.html. Stacją jest ta, z której ktoś
// przyszedł na ten bieg (qs('station') — z tablicy albo z listy Moich
// pociągów), a w braku takiego kontekstu pierwsza stacja trasy.
const MY_TRAINS_KEY='rafstakMojePociagiV4';
function isInMyTrains(station,trainNum){
  let list=[];
  try{list=JSON.parse(localStorage.getItem(MY_TRAINS_KEY));if(!Array.isArray(list))list=[]}catch(e){list=[]}
  const norm=s=>String(s).replace(/\D/g,'');
  return list.some(x=>x.station===station&&norm(x.trainNum)===norm(trainNum));
}
function markStarState(filled){
  const btn=document.getElementById('mtStarBtn');
  if(!btn)return;
  if(filled){btn.classList.add('star-filled');btn.textContent='★';btn.title='Usuń z Moich pociągów'}
  else{btn.classList.remove('star-filled');btn.textContent='☆';btn.title='Dodaj do Moich pociągów'}
}
function addToMyTrains(btnEl){
  if(!currentTrainData||!currentStations.length)return;
  const data=currentTrainData,stations=currentStations;
  const ctxStation=qs('station');
  let idx=ctxStation?stations.findIndex(s=>normStation(s.stationName)===normStation(ctxStation)):-1;
  if(idx<0)idx=0;
  const anchor=stations[idx];
  const station=anchor.stationName;
  const trainNum=String(data.trainNumber||qs('train')||'').trim();
  const planTime=(String(anchor.plannedDeparture||anchor.plannedTime||'').match(/\d{1,2}:\d{2}/)||[])[0]||'';
  if(!station||!trainNum){setStatus('Brak danych, żeby dodać ten pociąg do Moich pociągów.');showToastNear(btnEl,'⚠️ Brak danych do dodania pociągu.');return}
  let list=[];
  try{list=JSON.parse(localStorage.getItem(MY_TRAINS_KEY));if(!Array.isArray(list))list=[]}catch(e){list=[]}
  const norm=s=>String(s).replace(/\D/g,'');
  const existingIdx=list.findIndex(x=>x.station===station&&norm(x.trainNum)===norm(trainNum));
  if(existingIdx>=0){
    list.splice(existingIdx,1);
    try{localStorage.setItem(MY_TRAINS_KEY,JSON.stringify(list))}catch(e){}
    if(window.ProfileSync){
      if(ProfileSync.pushBeacon)ProfileSync.pushBeacon({trains:list});
      else ProfileSync.push({trains:list});
    }
    setStatus('Usunięto „'+trainNum+'” (stacja: '+station+') z Moich pociągów.');
    markStarState(false);
    showToastNear(btnEl,'🗑️ Usunięto „'+trainNum+'” z Moich pociągów');
    return;
  }
  list.push({station,trainNum,planTime:planTime||'--:--'});
  try{localStorage.setItem(MY_TRAINS_KEY,JSON.stringify(list))}catch(e){}
  if(window.ProfileSync){
    if(ProfileSync.pushBeacon)ProfileSync.pushBeacon({trains:list});
    else ProfileSync.push({trains:list});
  }
  setStatus('Dodano „'+trainNum+'” (stacja: '+station+') do Moich pociągów.');
  markStarState(true);
  showToastNear(btnEl,'✓ Dodano „'+trainNum+'” do Moich pociągów');
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
document.addEventListener('DOMContentLoaded',function(){
  syncTypicalTripsFromProfile();
  syncMarksFromProfile();
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
