const HTML = "<!DOCTYPE html>\n<html lang=\"pl\">\n<head>\n<meta charset=\"UTF-8\" />\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n<title>Bieg pociągu</title>\n<style>\n:root{--bg:#101820;--panel:#1c2833;--panel2:#223244;--border:#34495e;--blue:#0b57d0;--green:#5dd39e;--yellow:#ffcc00;--red:#ff4d4d;--muted:rgba(255,255,255,.65)}\n*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:#fff;padding:24px}.container{max-width:980px;margin:0 auto}h1{text-align:center;margin:8px 0 18px}.top{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;margin-bottom:18px}.top input{padding:12px 14px;border:0;border-radius:10px;font-size:18px;min-width:220px}.btn{border:0;border-radius:10px;padding:12px 16px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer;text-decoration:none;display:inline-block}.btn.secondary{background:#4b5563}.btn.green{background:#198754}.panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px;margin-top:14px}.muted{color:var(--muted)}.status{min-height:22px;text-align:center;color:var(--muted)}.summary{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:14px}.big{font-size:24px;font-weight:900}.ok{color:var(--green);font-weight:800}.warn{color:var(--yellow);font-weight:800}.err{background:#3b1d1d;border-color:#dc3545;color:#ffd6d6}.route{margin-top:12px}.row{display:grid;grid-template-columns:82px 1fr 120px 120px;gap:10px;align-items:start;padding:10px;border-bottom:1px solid rgba(255,255,255,.08)}.row:last-child{border-bottom:0}.station{font-weight:800}.badge{display:inline-block;border-radius:999px;padding:3px 8px;font-size:12px;font-weight:900}.badge.done{background:#14532d;color:#bbf7d0}.badge.next{background:#78350f;color:#fde68a}.badge.plan{background:#374151;color:#e5e7eb}.portal-link{word-break:break-all}.small{font-size:12px}.copy{margin-left:8px;background:#374151;padding:6px 9px;font-size:12px}@media(max-width:700px){body{padding:10px}h1{font-size:24px}.top{display:grid;grid-template-columns:1fr auto}.top input{min-width:0;width:100%;font-size:16px}.summary{grid-template-columns:1fr}.row{grid-template-columns:64px 1fr;gap:4px}.row .times{grid-column:2}.row .state{grid-column:1 / span 2}.btn{padding:10px 12px}}\n</style>\n</head>\n<body>\n<div class=\"container\">\n  <h1>🚆 Bieg pociągu</h1>\n  <div class=\"top\">\n    <input id=\"trainInput\" inputmode=\"numeric\" placeholder=\"Wpisz numer pociągu\" />\n    <button class=\"btn\" onclick=\"loadTrain()\">Pokaż</button>\n    <a class=\"btn secondary\" href=\"/\">← Tablica</a>\n  </div>\n  <div id=\"status\" class=\"status\">Wpisz numer albo kliknij pociąg z tablicy.</div>\n  <div id=\"content\"></div>\n</div>\n<script>\nfunction qs(name){return new URLSearchParams(location.search).get(name)||''}\nfunction esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll(\"'\",'&#039;')}\nfunction shortTime(v){if(!v)return'';const m=String(v).match(/(\\d{2}:\\d{2})/);return m?m[1]:v}\nfunction todayIso(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'})}\nfunction portalUrl(train){return 'https://portalpasazera.pl/ZnajdzPociag'}\nfunction detailsParams(){const p=new URLSearchParams();['date','scheduleId','orderId','trainOrderId','stationId','station'].forEach(k=>{const v=qs(k);if(v)p.set(k,v)});return p}\nfunction setStatus(t){document.getElementById('status').textContent=t}\nfunction stationLabel(s){return s.stationName||s.name||s.stopName||(s.stationId?'stacja ID '+s.stationId:'')}\nfunction timePair(s){return [shortTime(s.actualArrival||s.actualDeparture||s.arrivalTime||s.departureTime||s.plannedArrival||s.plannedDeparture), shortTime(s.plannedArrival||s.plannedDeparture||s.plannedArrivalTime||s.plannedDepartureTime)].filter(Boolean).join(' / ')}\nfunction normalizeStations(data){const route=(data.route&&data.route.stations)||[];const op=(data.operation&&data.operation.stations)||[];const byId={};for(const o of op){byId[o.stationId]=o}return route.map((r,i)=>Object.assign({},r,byId[r.stationId]||{}, {idx:i+1}))}\nfunction lastDone(stations){let last=null;for(const s of stations){if(s.isConfirmed||s.actualArrival||s.actualDeparture)last=s}return last}\nasync function loadTrain(){const train=(document.getElementById('trainInput').value||'').trim();if(!train){setStatus('Wpisz numer pociągu.');return}document.getElementById('trainInput').blur();setStatus('Pobieram dane pociągu '+train+'...');const content=document.getElementById('content');content.innerHTML='';const idp=detailsParams();if((idp.get('scheduleId')&&idp.get('orderId')) || idp.get('stationId')){try{const q=new URLSearchParams();q.set('action','train-route');if(idp.get('scheduleId'))q.set('scheduleId',idp.get('scheduleId'));if(idp.get('orderId'))q.set('orderId',idp.get('orderId'));q.set('train',train);q.set('operatingDate',idp.get('date')||idp.get('operatingDate')||todayIso());if(idp.get('trainOrderId'))q.set('trainOrderId',idp.get('trainOrderId'));if(idp.get('stationId'))q.set('stationId',idp.get('stationId'));if(idp.get('station'))q.set('station',idp.get('station'));const r=await fetch('/api?'+q.toString(),{headers:{Accept:'application/json'}});const data=await r.json();if(!r.ok)throw new Error(data.error||data.details||'HTTP '+r.status);renderDebugTrain(train,data);return}catch(e){content.innerHTML='<div class=\"panel err\">Nie udało się pobrać przebiegu z API PLK: '+esc(e.message)+'</div>';}}\nrenderFallback(train)}\nfunction renderDebugTrain(train,data){const content=document.getElementById('content');const route=data.route||{},op=data.operation||{};const stations=normalizeStations(data);const last=lastDone(stations);setStatus('Gotowe.');const name=[route.commercialCategorySymbol||'',route.nationalNumber||train,route.name||''].filter(Boolean).join(' ');content.innerHTML=`<div class=\"panel\"><div class=\"summary\"><div class=\"card\"><div class=\"muted\">Pociąg</div><div class=\"big\">${esc(name)}</div><div class=\"muted\">Status: ${esc(op.trainStatus||'brak')}</div></div><div class=\"card\"><div class=\"muted\">Ostatnia zaliczona stacja</div><div class=\"big\">${last?esc(stationLabel(last)):'brak potwierdzenia'}</div><div class=\"muted\">${last?esc(timePair(last)):''}</div></div></div><div style=\"margin-top:12px\"><a class=\"btn green\" target=\"_blank\" rel=\"noopener\" href=\"${esc(portalUrl(train))}\">Otwórz Portal Pasażera</a><button class=\"btn copy\" onclick=\"copyTrainSummary()\">Kopiuj podsumowanie</button></div></div><div class=\"panel route\"><h2>Trasa stacja po stacji</h2><div id=\"routeRows\"></div></div>`;const rows=document.getElementById('routeRows');if(!stations.length){rows.innerHTML='<div class=\"muted\">Brak listy stacji w odpowiedzi API.</div>';return}rows.innerHTML=stations.map(s=>{const done=s.isConfirmed||s.actualArrival||s.actualDeparture;return `<div class=\"row\"><div class=\"state\"><span class=\"badge ${done?'done':'plan'}\">${done?'zaliczona':'plan'}</span></div><div><div class=\"station\">${esc(stationLabel(s))}</div><div class=\"muted small\">kolejność: ${esc(s.orderNumber||s.plannedSequenceNumber||s.actualSequenceNumber||s.idx)}</div></div><div class=\"times\"><div class=\"muted small\">plan / real</div>${esc(timePair(s))}</div><div class=\"times\"><div class=\"muted small\">peron / tor</div>${esc([s.departurePlatform||s.arrivalPlatform,s.departureTrack||s.arrivalTrack].filter(Boolean).join(' / '))}</div></div>`}).join('')}\nfunction renderFallback(train){setStatus('Nie mam identyfikatorów kursu z tablicy. Pokazuję bezpieczny fallback.');document.getElementById('content').innerHTML=`<div class=\"panel\"><h2>Pociąg ${esc(train)}</h2><p>Ten widok dostał sam numer pociągu albo niepełne identyfikatory kursu PLK. Pełny przebieg działa najlepiej po kliknięciu numeru bezpośrednio z naszej tablicy odjazdów.</p><p class=\"muted\">Portal Pasażera ma właściwy ekran „Znajdź pociąg po numerze”. Na razie otwieram go jako fallback, żeby nie prowadzić Cię do tablicy stacyjnej. Bo raz już ta kolejka pojechała w krzaki.</p><a class=\"btn green\" target=\"_blank\" rel=\"noopener\" href=\"${esc(portalUrl(train))}\">Otwórz wyszukiwarkę pociągu w Portal Pasażera</a><button class=\"btn copy\" onclick=\"navigator.clipboard.writeText('${esc(train)}')\">Kopiuj numer</button></div>`}\nfunction copyTrainSummary(){const text=document.body.innerText.replace(/\\n{3,}/g,'\\n\\n');navigator.clipboard.writeText(text)}\ndocument.addEventListener('DOMContentLoaded',()=>{const t=qs('train');if(t){trainInput.value=t;loadTrain()}})\n</script>\n</body>\n</html>\n";


const BASE = 'https://pdp-api.plk-sa.pl/api/v1';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function html(status = 200) {
  return new Response(HTML, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function getKey(context) {
  return context.env.PLK_API_KEY || context.env.PDP_API_KEY || '';
}

async function plkFetchJson(context, path) {
  const key = getKey(context);
  if (!key) {
    throw new Error('Brak zmiennej środowiskowej PLK_API_KEY/PDP_API_KEY');
  }

  const started = Date.now();
  const res = await fetch(BASE + path, {
    headers: {
      'X-API-Key': key,
      'Accept': 'application/json'
    }
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = {
      nonJson: true,
      preview: text.slice(0, 1200)
    };
  }

  if (!res.ok) {
    const err = new Error('PLK HTTP ' + res.status);
    err.status = res.status;
    err.body = body;
    err.responseMs = Date.now() - started;
    throw err;
  }

  return {
    status: res.status,
    responseMs: Date.now() - started,
    body
  };
}

function extractStationNamesFromAny(value, out = {}) {
  if (!value || typeof value !== 'object') return out;

  if (Array.isArray(value)) {
    for (const item of value) extractStationNamesFromAny(item, out);
    return out;
  }

  for (const [key, item] of Object.entries(value)) {
    if (item && typeof item === 'object') {
      const id = item.stationId || item.stopId || item.id || key;
      const name = item.stationName || item.name || item.stopName || item.shortName;
      if (id && name) out[String(id)] = String(name);
      extractStationNamesFromAny(item, out);
    } else if (/^\d+$/.test(String(key)) && typeof item === 'string') {
      out[String(key)] = item;
    }
  }

  return out;
}

async function resolveStationNames(context, ids) {
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });

  const attempts = [
    {
      label: 'operations',
      path: '/operations?stations=' + encodeURIComponent(uniqueIds.join(',')) + '&withPlanned=true&fullRoutes=true&pageSize=50'
    },
    {
      label: 'schedules',
      path: '/schedules?stations=' + encodeURIComponent(uniqueIds.join(',')) + '&dateFrom=' + today + '&dateTo=' + today + '&pageSize=50'
    }
  ];

  const found = {};
  const diagnostics = [];

  for (const attempt of attempts) {
    try {
      const res = await plkFetchJson(context, attempt.path);
      const names = extractStationNamesFromAny(res.body, {});
      for (const id of uniqueIds) {
        if (names[id]) found[id] = names[id];
      }
      diagnostics.push({
        source: attempt.label,
        status: res.status,
        responseMs: res.responseMs,
        found: Object.keys(found).length
      });
    } catch (e) {
      diagnostics.push({
        source: attempt.label,
        status: e.status || null,
        error: e.message,
        responseMs: e.responseMs || null,
        preview: e.body?.preview || e.body || null
      });
    }
  }

  const filtered = {};
  const missing = [];
  for (const id of uniqueIds) {
    if (found[id]) filtered[id] = found[id];
    else missing.push(id);
  }

  return { requested: uniqueIds, names: filtered, missing, diagnostics };
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || '';

  if (action === 'debug') {
    const train = url.searchParams.get('train') || '';
    const params = Object.fromEntries(url.searchParams.entries());
    const required = ['scheduleId', 'orderId', 'trainOrderId'];
    const missingCourseIds = required.filter(k => !url.searchParams.get(k));
    return json({
      ok: true,
      endpoint: '/train',
      action: 'debug',
      train,
      params,
      canLoadFullRoute: missingCourseIds.length === 0,
      missingCourseIds,
      note: missingCourseIds.length
        ? 'Pełny bieg pociągu wymaga wejścia z głównej tablicy, bo wtedy URL zawiera scheduleId/orderId/trainOrderId.'
        : 'Są identyfikatory kursu. Strona może próbować pobrać pełny bieg przez /api?action=train-route.'
    });
  }

  if (action === 'station-names') {
    const ids = (url.searchParams.get('ids') || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (!ids.length) {
      return json({ ok: false, error: 'Brak parametru ids, np. ?action=station-names&ids=71407,69708' }, 400);
    }

    const result = await resolveStationNames(context, ids);
    return json({
      ok: true,
      ...result
    });
  }

  return html();
}
