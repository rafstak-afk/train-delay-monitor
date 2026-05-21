const HTML = String.raw`<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Bieg pociągu</title>
<style>
:root{--bg:#101820;--panel:#1c2833;--card:#223244;--border:#34495e;--text:#fff;--muted:#b8c3cf;--green:#5dd39e;--yellow:#ffcc00;--red:#ff4d4d;--violet:#c084fc;--blue:#0b57d0;--grey:#4b5563;--future:#9fb0c0}
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:var(--text);padding:22px}.wrap{max-width:1060px;margin:0 auto}.top{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}h1{margin:0;font-size:30px}.back{background:var(--grey);color:#fff;text-decoration:none;border-radius:10px;padding:11px 16px;font-weight:800}.panel{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:16px;margin:14px 0}.search{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.search input{min-width:240px;border:0;border-radius:10px;padding:13px;font-size:18px}.btn{border:0;border-radius:10px;padding:13px 17px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer}.btn2{display:inline-block;border-radius:10px;padding:12px 16px;background:#198754;color:#fff;text-decoration:none;font-weight:800;margin-top:12px}.btn3{display:inline-block;border:0;border-radius:10px;padding:8px 10px;background:var(--grey);color:#fff;text-decoration:none;font-weight:800;margin-left:8px}.muted{opacity:.76}.err{background:#3b1d1d;border:1px solid #dc3545;color:#ffd6d6;border-radius:10px;padding:12px;margin-top:12px}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-top:10px}.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px}.card .label{font-size:14px;color:var(--muted);margin-bottom:4px}.card .value{font-size:22px;font-weight:900}.route{margin-top:12px}.section-title{font-size:24px;margin:0 0 12px}.station{display:grid;grid-template-columns:116px 1fr 178px 94px 92px;gap:12px;padding:12px 4px;border-bottom:1px solid rgba(255,255,255,.12);align-items:center}.station:last-child{border-bottom:0}.station.passed{opacity:.82}.station.current{background:#263b52;border-radius:10px;opacity:1;padding-left:10px;padding-right:10px}.station.next{background:rgba(255,204,0,.08);border-radius:10px;padding-left:10px;padding-right:10px}.station.before .timebox{color:var(--future)}.station.before .time-one{color:var(--future)}.station.before .station-name{color:#e7edf3}.badge{font-size:12px;border-radius:999px;padding:4px 9px;background:var(--grey);display:inline-block;font-weight:900;text-align:center}.badge.passed{background:#198754}.badge.current{background:var(--yellow);color:#102027}.badge.next{background:#0dcaf0;color:#102027}.badge.before{background:#334155;color:#d6e0ea}.badge.unknown{background:#475569;color:#e2e8f0}.station-name{font-size:18px;font-weight:900}.station-id{font-size:12px;color:var(--muted);margin-top:2px}.source{font-size:11px;color:#8da0b2;margin-top:2px}.small{font-size:12px;color:var(--muted)}.timebox{text-align:left}.time-one{font-size:18px;font-weight:900;color:var(--green)}.time-real{font-size:19px;font-weight:900}.time-plan{font-size:13px;color:var(--muted);margin-bottom:2px}.delaybox{font-weight:900}.delay-zero{color:var(--green)}.delay-low{color:var(--yellow)}.delay-mid{color:var(--red)}.delay-high{color:var(--violet)}.platform{font-size:17px;font-weight:800}.status-help{font-size:13px;color:var(--muted);line-height:1.35;margin-top:5px}.legend{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.35}@media(max-width:760px){body{padding:10px}h1{font-size:24px}.top{justify-content:flex-start}.search input,.btn,.back{width:100%;text-align:center}.station{grid-template-columns:88px 1fr;gap:8px}.station .timebox,.station .platform-wrap,.station .delay-wrap{grid-column:2}.station-name{font-size:16px}.panel{padding:12px}.card .value{font-size:19px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top"><h1>🚆 Bieg pociągu</h1></div>
  <div class="search">
    <input id="trainInput" placeholder="Wpisz numer pociągu" inputmode="numeric" />
    <button class="btn" onclick="loadTrain()">Pokaż</button>
    <a class="back" href="/">← Tablica</a>
  </div>
  <div id="status" class="muted" style="text-align:center;margin:14px 0">Kliknij numer pociągu na tablicy albo wpisz numer ręcznie.</div>
  <div id="result"></div>
</div>
<script>
function qs(name){return new URLSearchParams(location.search).get(name)||''}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function short(v){if(!v)return'';const m=String(v).match(/(\d{2}:\d{2})/);return m?m[1]:String(v)}
function setStatus(t){document.getElementById('status').textContent=t}
function portalUrl(n){return 'https://portalpasazera.pl/ZnajdzPociag'}
function copyText(text){navigator.clipboard&&navigator.clipboard.writeText(text).then(function(){setStatus('Skopiowano do schowka.')}).catch(function(){setStatus('Nie udało się skopiować.')})}
const STATUS_MAP={
  P:['Kurs aktywny / w realizacji','Kod PLK: P. Pociąg jest w bieżącej obsłudze systemu. To nie jest komunikat pasażerski, więc pokazujemy opis po ludzku.'],
  S:['Rozkładowy / bez potwierdzenia realizacji','Kod PLK: S. Dane wyglądają na rozkładowe, bez pewnego potwierdzenia bieżącej realizacji.'],
  R:['W ruchu','Kod PLK: R. Pociąg jest w ruchu.'],
  O:['Opóźniony','Kod PLK: O. System oznacza kurs jako opóźniony.'],
  C:['Odwołany','Kod PLK: C. Kurs odwołany.'],
  X:['Odwołany','Kod PLK: X. Kurs odwołany.'],
  Z:['Zakończony','Kod PLK: Z. Bieg zakończony.'],
  T:['Terminowany / zakończony wcześniej','Kod PLK: T. Możliwe skrócenie albo zakończenie biegu.'],
  N:['Nieustalony','Kod PLK: N. Status nieustalony w systemie.']
};
const STATION_FALLBACK={
  '73312':'Katowice','71001':'Tarnowskie Góry','73106':'Chorzów Batory','62653':'Częstochowa','63552':'Lubliniec','69708':'Kalety',
  '69823':'Strzebiń','73502':'Gliwice','74500':'Zabrze','75309':'Tarnowskie Góry','75424':'Kalety','62687':'Częstochowa Stradom',
  '72272':'Katowice Zawodzie','72306':'Sosnowiec Główny','71068':'Miasteczko Śląskie','71050':'Kalety','71043':'Koszęcin',
  '72207':'Katowice Szopienice Południowe','72413':'Sosnowiec Południowy','72900':'Katowice Ligota','72967':'Katowice Piotrowice',
  '69070':'Tychy','69062':'Tychy Zachodnie','69054':'Tychy Żwaków','69047':'Kobiór','69005':'Pszczyna','68148':'Goczałkowice-Zdrój',
  '68122':'Czechowice-Dziedzice','178592':'Bielsko-Biała Główna','68064':'Bielsko-Biała Leszczyny','68098':'Wilkowice Bystra','68205':'Łodygowice','68007':'Pietrzykowice Żywieckie','68056':'Żywiec',
  '265125':'Herby Stare','265126':'Lisów','265127':'Kochanowice','64808':'Pawonków','33506':'Olesno Śląskie','33605':'Kluczbork','38653':'Byczyna Kluczborska','36343':'Kępno','37507':'Ostrzeszów','37911':'Ostrów Wielkopolski','24000':'Opole Główne'
};
function addStationMap(map,src,label){if(!src)return;if(Array.isArray(src)){src.forEach(function(s){const id=s.stationId||s.stopId||s.id;const name=s.stationName||s.name||s.stopName||s.shortName;if(id&&name&&!map[String(id)])map[String(id)]={name:String(name),source:label}});return}Object.entries(src).forEach(function(pair){const k=String(pair[0]),v=pair[1];const name=typeof v==='string'?v:(v&& (v.name||v.stationName||v.stopName||v.shortName));if(k&&name&&!map[k])map[k]={name:String(name),source:label}})}
function makeStationNameMap(data){const map={};const direct=[];direct.push.apply(direct,(data.route&&data.route.stations)||[]);direct.push.apply(direct,(data.operation&&data.operation.stations)||[]);addStationMap(map,direct,'API');const dict=data.dictionaries||data.dictionary||{};addStationMap(map,dict.stations,'słownik API');addStationMap(map,data.stationNames,'słownik API');addStationMap(map,data.stations,'słownik API');addStationMap(map,data.route&&data.route.stationNames,'słownik API');addStationMap(map,data.operation&&data.operation.stationNames,'słownik API');Object.entries(STATION_FALLBACK).forEach(function(pair){if(!map[pair[0]])map[pair[0]]={name:pair[1],source:'fallback lokalny'}});const sid=qs('stationId')||qs('stationid');const sname=qs('station');if(sid&&sname&&!map[String(sid)])map[String(sid)]={name:sname.replaceAll('+',' '),source:'parametr URL'};return map}
function stationInfo(s,map){const id=String(s.stationId||s.stopId||'');const own=s.stationName||s.name||s.stopName||s.station; if(own)return {id:id,name:own,source:'API'}; if(map[id])return {id:id,name:map[id].name,source:map[id].source}; return {id:id,name:'Nieznana stacja',source:'brak nazwy w API'}}
function seqOf(s,i){return Number(s.orderNumber||s.plannedSequenceNumber||s.actualSequenceNumber||i+1)}
function timeToMin(t){const m=short(t).match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function nowMinWarsaw(){const p=new Date().toLocaleTimeString('pl-PL',{timeZone:'Europe/Warsaw',hour12:false,hour:'2-digit',minute:'2-digit'}).split(':').map(Number);return p[0]*60+p[1]}
function getPlanned(o,s){return o.plannedDepartureTime||o.plannedArrivalTime||o.plannedDeparture||o.plannedArrival||s.departureTime||s.arrivalTime||s.plannedDepartureTime||s.plannedArrivalTime||s.plannedDeparture||s.plannedArrival||''}
function getActual(o){return o.actualDepartureTime||o.actualArrivalTime||o.actualDeparture||o.actualArrival||''}
function delayMinutes(planned,actual){const p=timeToMin(planned),a=timeToMin(actual);if(p==null||a==null)return 0;let d=a-p;if(d<-720)d+=1440;if(d>720)d-=1440;return d}
function delayClass(d){return d>=20?'delay-high':d>10?'delay-mid':d>0?'delay-low':'delay-zero'}
function renderTime(planned,actual,state){const p=short(planned),a=short(actual);if(!a||a===p){return '<div class="time-one">'+esc(p||a||'—')+'</div>'}const d=Math.max(0,delayMinutes(p,a));return '<div class="time-plan">plan '+esc(p||'—')+'</div><div class="time-real '+delayClass(d)+'">real '+esc(a||'—')+'</div>'}
function renderDelay(planned,actual){const p=short(planned),a=short(actual);if(!p&&!a)return '<span class="delay-zero">—</span>';const d=actual?delayMinutes(p,a):0;if(d<=0)return '<span class="delay-zero">0 min</span>';return '<span class="'+delayClass(d)+'">+'+d+' min</span>'}
function getRouteStations(data){return (data.route&&Array.isArray(data.route.stations))?data.route.stations:[]}
function getOperationStations(data){return (data.operation&&Array.isArray(data.operation.stations))?data.operation.stations:[]}
function isConfirmedStop(s){return s&&s.isConfirmed===true}
function findLastConfirmed(ops){let last=null;ops.forEach(function(s,i){if(isConfirmedStop(s))last={s:s,seq:seqOf(s,i)}});return last}
function render(data,trainNo){const result=document.getElementById('result');const route=data.route||{};const op=data.operation||{};const map=makeStationNameMap(data);const routeStations=getRouteStations(data);const ops=getOperationStations(data);const opBySeq={};ops.forEach(function(s,i){opBySeq[seqOf(s,i)]=s});const lastConfirmed=findLastConfirmed(ops);const title=[route.commercialCategorySymbol||qs('category'),route.nationalNumber||trainNo,route.name||qs('name')].filter(Boolean).join(' ');const status=STATUS_MAP[op.trainStatus]||[op.trainStatus?'Kod statusu: '+op.trainStatus:'brak danych','Ten kod nie ma jeszcze opisu w słowniku aplikacji.'];let lastText='brak potwierdzonej stacji',lastTime='';if(lastConfirmed){const inf=stationInfo(lastConfirmed.s,map);lastText=inf.name+' · ID '+inf.id;lastTime=short(lastConfirmed.s.actualDeparture||lastConfirmed.s.actualArrival||lastConfirmed.s.plannedDeparture||lastConfirmed.s.plannedArrival)}
let html='<div class="panel"><div class="meta"><div class="card"><div class="label">Pociąg</div><div class="value">'+esc(title||('Pociąg '+trainNo))+'</div><div class="status-help">Status: '+esc(status[0])+'<br>'+esc(status[1])+'</div></div><div class="card"><div class="label">Ostatnia potwierdzona stacja</div><div class="value">'+esc(lastText)+'</div><div class="status-help">'+esc(lastTime)+'</div></div></div><a class="btn2" href="'+esc(portalUrl(trainNo))+'" target="_blank" rel="noopener">Otwórz Portal Pasażera</a><button class="btn3" onclick="copyText(summaryText)">Kopiuj podsumowanie</button></div>';window.summaryText=(title||('Pociąg '+trainNo))+'\nStatus: '+status[0]+'\nOstatnia potwierdzona stacja: '+lastText+(lastTime?' '+lastTime:'');
const base=(routeStations.length?routeStations:ops);if(!base.length){result.innerHTML=html+'<div class="panel"><div class="err">Nie udało się pobrać przebiegu z lokalnego API. Użyj przycisku Portal Pasażera.</div></div>';return}
const all=base.map(function(s,i){return {s:s,seq:seqOf(s,i)}}).sort(function(a,b){return a.seq-b.seq});const nowM=nowMinWarsaw();let firstFutureSeq=null;all.forEach(function(row){if(firstFutureSeq!==null)return;const o=opBySeq[row.seq]||{};const pm=timeToMin(getPlanned(o,row.s));if(pm!=null&&pm>=nowM)firstFutureSeq=row.seq});const lastSeq=lastConfirmed?lastConfirmed.seq:null;
const rows=all.map(function(row){const s=row.s,seq=row.seq,o=opBySeq[seq]||{};const planned=getPlanned(o,s);const actual=getActual(o);let state='before',badge='before',text='przed';if(lastSeq!==null){if(seq<lastSeq){state='passed';badge='passed';text='zaliczona'}else if(seq===lastSeq){state='current';badge='current';text='ostatnia'}else if(seq===lastSeq+1){state='next';badge='next';text='następna'}else{text='przed'}}else if(firstFutureSeq!==null){if(seq===firstFutureSeq){state='next';badge='next';text='następna'}else if(seq<firstFutureSeq){state='before';badge='unknown';text='brak potw.'}else{text='przed'}}else{text='przed'}const inf=stationInfo(s,map);const platform=[s.departurePlatform||s.arrivalPlatform||o.departurePlatform||o.arrivalPlatform||'',s.departureTrack||s.arrivalTrack||o.departureTrack||o.arrivalTrack||''].filter(Boolean).join(' / ');return '<div class="station '+state+'"><div><span class="badge '+badge+'">'+esc(text)+'</span></div><div><div class="station-name">'+esc(inf.name)+'</div><div class="station-id">ID '+esc(inf.id||'')+' · kolejność: '+esc(seq)+'</div><div class="source">nazwa: '+esc(inf.source)+'</div></div><div class="timebox">'+renderTime(planned,actual,state)+'</div><div class="delay-wrap"><div class="small">opóźnienie</div><div class="delaybox">'+renderDelay(planned,actual)+'</div></div><div class="platform-wrap"><div class="small">peron / tor</div><div class="platform">'+esc(platform||'—')+'</div></div></div>'}).join('');html+='<div class="panel"><h2 class="section-title">Trasa stacja po stacji</h2><div class="legend">Stacje bez potwierdzenia realizacji nie są oznaczane jako „zaliczone”. Godziny dla dalszych stacji są wyszarzone, ale pozostają czytelne. Tak, minimum cywilizacji w końcu dotarło.</div><div class="route">'+rows+'</div></div>';result.innerHTML=html}
async function loadTrain(){const n=document.getElementById('trainInput').value.trim();if(!n){setStatus('Wpisz numer pociągu.');return}setStatus('Pobieram bieg pociągu '+n+'...');document.getElementById('trainInput').blur();const p=new URLSearchParams();const date=qs('date'),scheduleId=qs('scheduleId')||qs('scheduledId'),orderId=qs('orderId'),trainOrderId=qs('trainOrderId');if(date)p.set('date',date);if(scheduleId)p.set('scheduleId',scheduleId);if(orderId)p.set('orderId',orderId);if(trainOrderId)p.set('trainOrderId',trainOrderId);try{if(!scheduleId||!orderId||!trainOrderId)throw new Error('Brak identyfikatorów kursu z tablicy. Kliknij numer pociągu na głównej tablicy.');const r=await fetch('/api/debug-train?'+p.toString(),{headers:{Accept:'application/json'}});const data=await r.json();if(!r.ok)throw new Error(data.error||data.details||('HTTP '+r.status));render(data,n);setStatus('Gotowe.')}catch(e){document.getElementById('result').innerHTML='<div class="panel"><h2>Pociąg '+esc(n)+'</h2><div class="err">'+esc(e.message)+'</div><a class="btn2" href="'+esc(portalUrl(n))+'" target="_blank" rel="noopener">Otwórz w Portal Pasażera</a></div>';setStatus('Nie udało się pobrać pełnego biegu lokalnie.')}}
document.addEventListener('DOMContentLoaded',function(){const n=qs('train');if(n){trainInput.value=n;loadTrain()}});
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
