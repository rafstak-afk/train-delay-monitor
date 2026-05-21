const HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bieg pociągu</title>
<style>
:root{--bg:#101820;--panel:#1c2833;--panel2:#223244;--border:#34495e;--blue:#0b57d0;--green:#5dd39e;--yellow:#ffcc00;--red:#ff4d4d;--violet:#c084fc;--muted:rgba(255,255,255,.65);--grey:#4b5563}
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:#fff;padding:24px}.container{max-width:980px;margin:0 auto}h1{text-align:center;margin:8px 0 18px}.top{display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;margin-bottom:18px}.top input{padding:12px 14px;border:0;border-radius:10px;font-size:18px;min-width:220px}.btn{border:0;border-radius:10px;padding:12px 16px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer;text-decoration:none;display:inline-block}.btn.secondary{background:var(--grey)}.btn.green{background:#198754}.panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px;margin-top:14px}.muted{color:var(--muted)}.status{min-height:22px;text-align:center;color:var(--muted)}.summary{display:grid;grid-template-columns:1fr 1fr;gap:12px}.card{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:14px}.label{font-size:14px;color:var(--muted);margin-bottom:4px}.big{font-size:24px;font-weight:900}.status-help{font-size:13px;line-height:1.35;margin-top:5px;color:var(--muted)}.ok{color:var(--green);font-weight:800}.warn{color:var(--yellow);font-weight:800}.err{background:#3b1d1d;border-color:#dc3545;color:#ffd6d6}.route{margin-top:12px}.row{display:grid;grid-template-columns:95px 1fr 150px 120px;gap:10px;align-items:center;padding:10px;border-bottom:1px solid rgba(255,255,255,.08)}.row:last-child{border-bottom:0}.row.current{background:#263b52;border-radius:10px}.row.next{background:rgba(255,204,0,.08);border-radius:10px}.row.passed{opacity:.72}.station{font-weight:900;font-size:18px}.station-id{font-size:12px;color:var(--muted);margin-top:2px}.badge{display:inline-block;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:900;text-align:center}.badge.passed{background:#14532d;color:#bbf7d0}.badge.current{background:var(--yellow);color:#102027}.badge.next{background:#0dcaf0;color:#102027}.badge.plan{background:#374151;color:#e5e7eb}.small{font-size:12px;color:var(--muted)}.copy{margin-left:8px;background:#374151;padding:6px 9px;font-size:12px}.time-one{font-size:18px;font-weight:900;color:var(--green)}.time-plan{font-size:13px;color:var(--muted);margin-bottom:2px}.time-real{font-size:19px;font-weight:900}.delay-low{color:var(--yellow)}.delay-mid{color:var(--red)}.delay-high{color:var(--violet)}.platform{font-size:17px;font-weight:800}@media(max-width:700px){body{padding:10px}h1{font-size:24px}.top{display:grid;grid-template-columns:1fr auto}.top input{min-width:0;width:100%;font-size:16px}.summary{grid-template-columns:1fr}.row{grid-template-columns:82px 1fr;gap:6px}.row .times,.row .platform-wrap{grid-column:2}.row .state{grid-column:1}.btn{padding:10px 12px}.station{font-size:16px}}
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
function shortTime(v){if(!v)return'';const m=String(v).match(/(\\d{2}:\\d{2})/);return m?m[1]:String(v)}
function todayIso(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Warsaw'})}
function portalUrl(train){return 'https://portalpasazera.pl/ZnajdzPociag'}
function detailsParams(){const p=new URLSearchParams();['date','scheduleId','orderId','trainOrderId','stationId','station'].forEach(function(k){const v=qs(k);if(v)p.set(k,v)});return p}
function setStatus(t){document.getElementById('status').textContent=t}
function copyText(text){navigator.clipboard&&navigator.clipboard.writeText(text).then(function(){setStatus('Skopiowano do schowka.')}).catch(function(){setStatus('Nie udało się skopiować.')})}
const STATUS_MAP={
  P:['Kurs aktywny / w realizacji','Kod PLK: P. Pociąg jest w biegu albo w bieżącej obsłudze systemu. To nie jest tekst dla pasażera, więc pokazujemy go po ludzku.'],
  C:['Odwołany','Kod PLK: C. Kurs odwołany.'],
  X:['Odwołany','Kod PLK: X. Kurs odwołany.'],
  S:['Rozkładowy','Kod PLK: S. Dane planowe, bez potwierdzenia bieżącej realizacji.'],
  R:['W ruchu','Kod PLK: R. Pociąg w ruchu.'],
  Z:['Zakończony','Kod PLK: Z. Bieg zakończony.'],
  O:['Opóźniony','Kod PLK: O. Pociąg ma opóźnienie.']
};
const STATION_NAMES={
  '73312':'Katowice','71001':'Tarnowskie Góry','73106':'Chorzów Batory','62653':'Częstochowa','63552':'Lubliniec','69708':'Kalety',
  '69823':'Strzebiń','73502':'Gliwice','74500':'Zabrze','75309':'Tarnowskie Góry','75424':'Kalety','62687':'Częstochowa Stradom',
  '72272':'Katowice Zawodzie','72306':'Sosnowiec Główny','71068':'Miasteczko Śląskie','71050':'Kalety','71043':'Koszęcin',
  '72207':'Katowice Szopienice Południowe','72413':'Sosnowiec Południowy','72900':'Katowice Ligota','72967':'Katowice Piotrowice',
  '69070':'Tychy','69062':'Tychy Zachodnie','69054':'Tychy Żwaków','69047':'Kobiór','69005':'Pszczyna','68148':'Goczałkowice-Zdrój',
  '68122':'Czechowice-Dziedzice','178592':'Bielsko-Biała Główna','68064':'Bielsko-Biała Leszczyny','68098':'Wilkowice Bystra','68205':'Łodygowice','68007':'Pietrzykowice Żywieckie','68056':'Żywiec',
  '265125':'Herby Stare','265126':'Lisów','265127':'Kochanowice','64808':'Pawonków','33506':'Olesno Śląskie','33605':'Kluczbork','38653':'Byczyna Kluczborska','36343':'Kępno','37507':'Ostrzeszów','37911':'Ostrów Wielkopolski',
  '24000':'Opole Główne'
};
function addQueryStationName(map){const sid=qs('stationId'),sname=qs('station');if(sid&&sname)map[String(sid)]=decodeURIComponent(String(sname).replaceAll('+',' '))}
function makeStationNameMap(data){const map=Object.assign({},STATION_NAMES);addQueryStationName(map);const sources=[data.stationNames,data.stations,data.dictionaries&&data.dictionaries.stations,data.route&&data.route.stationNames,data.operation&&data.operation.stationNames];sources.forEach(function(src){if(!src)return;Object.entries(src).forEach(function(pair){const k=pair[0],v=pair[1];map[String(k)]=typeof v==='string'?v:(v&& (v.name||v.stationName||v.shortName))||map[String(k)]})});const all=[].concat((data.route&&data.route.stations)||[],(data.operation&&data.operation.stations)||[]);all.forEach(function(s){const id=s.stationId||s.stopId;if(!id)return;const n=s.stationName||s.name||s.stopName||s.station;if(n)map[String(id)]=n});return map}
function stationTitle(s,map){const id=String(s.stationId||s.stopId||'');return s.stationName||s.name||s.stopName||s.station||map[id]||('stacja ID '+id)}
function stationLabel(s,map){const id=String(s.stationId||s.stopId||'');const n=stationTitle(s,map);return n.indexOf('stacja ID ')===0?n:(n+' · ID '+id)}
function getRouteStations(data){return (data.route&&Array.isArray(data.route.stations))?data.route.stations:[]}
function getOperationStations(data){return (data.operation&&Array.isArray(data.operation.stations))?data.operation.stations:[]}
function seqOf(s,i){return Number(s.orderNumber||s.plannedSequenceNumber||s.actualSequenceNumber||i+1)}
function normalizeStations(data){const route=getRouteStations(data);const op=getOperationStations(data);const bySeq={};op.forEach(function(o,i){bySeq[seqOf(o,i)]=o});const base=(route.length?route:op);return base.map(function(r,i){const seq=seqOf(r,i);return Object.assign({},r,bySeq[seq]||{}, {idx:i+1, seq:seq})}).sort(function(a,b){return a.seq-b.seq})}
function findLastConfirmed(stations){let last=null;stations.forEach(function(s){if(s.isConfirmed===true)last=s});return last}
function timeToMin(t){const m=shortTime(t).match(/^(\\d{2}):(\\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function nowMinWarsaw(){const p=new Date().toLocaleTimeString('pl-PL',{timeZone:'Europe/Warsaw',hour12:false,hour:'2-digit',minute:'2-digit'}).split(':').map(Number);return p[0]*60+p[1]}
function plannedTime(s){return s.plannedDepartureTime||s.plannedArrivalTime||s.departureTime||s.arrivalTime||s.plannedDeparture||s.plannedArrival||''}
function actualTime(s){if(s.isConfirmed!==true)return '';return s.actualDepartureTime||s.actualArrivalTime||s.actualDeparture||s.actualArrival||''}
function delayMinutes(p,a){const pm=timeToMin(p),am=timeToMin(a);if(pm==null||am==null)return 0;return am-pm}
function delayClass(d){return d>=20?'delay-high':d>10?'delay-mid':d>0?'delay-low':''}
function renderTime(s){const p=shortTime(plannedTime(s));const a=shortTime(actualTime(s));if(!a||a===p)return '<div class="time-one">'+esc(p||a||'')+'</div>';const d=Math.max(0,delayMinutes(p,a));return '<div class="time-plan">plan '+esc(p)+'</div><div class="time-real '+delayClass(d)+'">real '+esc(a)+'</div>'}
function stateFor(seq,lastSeq,firstFutureSeq){if(lastSeq!=null){if(seq<lastSeq)return ['passed','passed','zaliczona'];if(seq===lastSeq)return ['current','current','ostatnia'];if(seq===lastSeq+1)return ['next','next','następna'];return ['plan','plan','przed']}if(firstFutureSeq!=null){if(seq===firstFutureSeq)return ['next','next','następna'];if(seq<firstFutureSeq)return ['plan','plan','wg planu minęła'];return ['plan','plan','przed']}return ['plan','plan','plan']}
async function loadTrain(){const train=(document.getElementById('trainInput').value||'').trim();if(!train){setStatus('Wpisz numer pociągu.');return}document.getElementById('trainInput').blur();setStatus('Pobieram bieg pociągu '+train+'...');const content=document.getElementById('content');content.innerHTML='';const idp=detailsParams();if((idp.get('scheduleId')&&idp.get('orderId'))||idp.get('stationId')){try{const q=new URLSearchParams();q.set('action','train-route');if(idp.get('scheduleId'))q.set('scheduleId',idp.get('scheduleId'));if(idp.get('orderId'))q.set('orderId',idp.get('orderId'));q.set('train',train);q.set('operatingDate',idp.get('date')||idp.get('operatingDate')||todayIso());if(idp.get('trainOrderId'))q.set('trainOrderId',idp.get('trainOrderId'));if(idp.get('stationId'))q.set('stationId',idp.get('stationId'));if(idp.get('station'))q.set('station',idp.get('station'));const r=await fetch('/api?'+q.toString(),{headers:{Accept:'application/json'}});const data=await r.json();if(!r.ok)throw new Error(data.error||data.details||'HTTP '+r.status);renderDebugTrain(train,data);return}catch(e){content.innerHTML='<div class="panel err">Nie udało się pobrać przebiegu z API PLK: '+esc(e.message)+'</div>'}}
renderFallback(train)}
function renderDebugTrain(train,data){const content=document.getElementById('content');const route=data.route||{},op=data.operation||{};const stations=normalizeStations(data);const map=makeStationNameMap(data);const last=findLastConfirmed(stations);const lastSeq=last?last.seq:null;setStatus('Gotowe.');const name=[route.commercialCategorySymbol||qs('category')||'',route.nationalNumber||train,route.name||qs('name')||''].filter(Boolean).join(' ');const status=STATUS_MAP[op.trainStatus]||[op.trainStatus?('Kod statusu: '+op.trainStatus):'brak danych','Nie mamy słownika dla tego kodu z API.'];let lastName='brak potwierdzonej stacji',lastT='';if(last){lastName=stationLabel(last,map);lastT=shortTime(actualTime(last)||plannedTime(last))}
let html='<div class="panel"><div class="summary"><div class="card"><div class="label">Pociąg</div><div class="big">'+esc(name||('Pociąg '+train))+'</div><div class="status-help">Status: '+esc(status[0])+'<br>'+esc(status[1])+'</div></div><div class="card"><div class="label">Ostatnia potwierdzona stacja</div><div class="big">'+esc(lastName)+'</div><div class="status-help">'+esc(lastT)+'</div></div></div><div style="margin-top:12px"><a class="btn green" target="_blank" rel="noopener" href="'+esc(portalUrl(train))+'">Otwórz Portal Pasażera</a><button class="btn copy" onclick="copyTrainSummary()">Kopiuj podsumowanie</button></div></div>';
window.summaryText=(name||('Pociąg '+train))+'\\nStatus: '+status[0]+'\\nOstatnia potwierdzona stacja: '+lastName+(lastT?' '+lastT:'');
if(!stations.length){content.innerHTML=html+'<div class="panel"><div class="err">Brak listy stacji w odpowiedzi API.</div></div>';return}
const nMin=nowMinWarsaw();let firstFutureSeq=null;stations.forEach(function(s){const pm=timeToMin(plannedTime(s));if(pm!=null&&pm>=nMin&&firstFutureSeq==null)firstFutureSeq=s.seq});
const rows=stations.map(function(s){const st=stateFor(s.seq,lastSeq,firstFutureSeq);const plat=[s.departurePlatform||s.arrivalPlatform||'',s.departureTrack||s.arrivalTrack||''].filter(Boolean).join(' / ');return '<div class="row '+st[0]+'"><div class="state"><span class="badge '+st[1]+'">'+esc(st[2])+'</span></div><div><div class="station">'+esc(stationTitle(s,map))+'</div><div class="station-id">ID '+esc(s.stationId||s.stopId||'')+' · kolejność: '+esc(s.orderNumber||s.plannedSequenceNumber||s.actualSequenceNumber||s.idx)+'</div></div><div class="times"><div class="small">czas</div>'+renderTime(s)+'</div><div class="platform-wrap"><div class="small">peron / tor</div><div class="platform">'+esc(plat||'—')+'</div></div></div>'}).join('');
content.innerHTML=html+'<div class="panel route"><h2>Trasa stacja po stacji</h2><div id="routeRows">'+rows+'</div></div>'}
function renderFallback(train){setStatus('Nie mam identyfikatorów kursu z tablicy. Pokazuję bezpieczny fallback.');document.getElementById('content').innerHTML='<div class="panel"><h2>Pociąg '+esc(train)+'</h2><p>Ten widok dostał sam numer pociągu albo niepełne identyfikatory kursu PLK. Pełny bieg działa najlepiej po kliknięciu numeru bezpośrednio z naszej tablicy odjazdów.</p><p class="muted">Portal Pasażera ma właściwy ekran „Znajdź pociąg po numerze”.</p><a class="btn green" target="_blank" rel="noopener" href="'+esc(portalUrl(train))+'">Otwórz wyszukiwarkę pociągu w Portal Pasażera</a><button class="btn copy" onclick="copyText(\''+esc(train)+'\')">Kopiuj numer</button></div>'}
function copyTrainSummary(){copyText(window.summaryText||document.body.innerText.replace(/\\n{3,}/g,'\\n\\n'))}
document.addEventListener('DOMContentLoaded',function(){const t=qs('train');if(t){trainInput.value=t;loadTrain()}})
</script>
</body>
</html>`;

export async function onRequest(context) {
  return new Response(HTML, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
