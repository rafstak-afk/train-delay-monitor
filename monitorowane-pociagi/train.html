<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>Szczegóły pociągu</title>

<style>

*{
  box-sizing:border-box;
}

body{
  margin:0;
  padding:12px;
  background:#101820;
  color:#fff;
  font-family:Segoe UI,Arial,sans-serif;
}

a{
  color:#8ec5ff;
  text-decoration:none;
}

.card{
  background:#1c2833;
  border:1px solid #34495e;
  border-radius:16px;
  padding:16px;
  margin-bottom:12px;
}

.trainNumber{
  font-size:30px;
  font-weight:700;
}

.trainName{
  font-size:22px;
  margin-top:4px;
}

.destination{
  color:#9ecfff;
  margin-top:4px;
}

.delay{
  margin-top:12px;
  font-size:38px;
  font-weight:700;
}

.delay.good{
  color:#2ecc71;
}

.delay.medium{
  color:#f1c40f;
}

.delay.bad{
  color:#e74c3c;
}

.label{
  font-size:12px;
  letter-spacing:.5px;
  text-transform:uppercase;
  color:#95a5a6;
  margin-bottom:6px;
}

.value{
  font-size:24px;
  font-weight:700;
}

.meta{
  margin-top:10px;
  line-height:1.7;
}

.route{
  display:flex;
  flex-direction:column;
  gap:8px;
}

.routeItem{
  background:#16222d;
  border-radius:12px;
  padding:12px;
  border:1px solid transparent;
}

.routePast{
  opacity:.75;
}

.routeCurrent{
  border-color:#2ecc71;
  background:#1d4f31;
}

.routeFuture{
  opacity:1;
}

.routeHeader{
  font-size:18px;
  font-weight:700;
}

.routeSub{
  margin-top:4px;
  font-size:13px;
  opacity:.8;
}

.loadingOverlay{
  position:fixed;
  inset:0;
  background:#101820;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  z-index:9999;
}

.spinner{
  width:60px;
  height:60px;

  border:5px solid #34495e;
  border-top:5px solid #2ecc71;

  border-radius:50%;

  animation:spin 1s linear infinite;
}

.loadingText{
  margin-top:18px;
  font-size:18px;
}

@keyframes spin{
  from{transform:rotate(0deg);}
  to{transform:rotate(360deg);}
}

</style>
</head>

<body>

<div id="loading" class="loadingOverlay">
  <div class="spinner"></div>
  <div class="loadingText">
    Pobieranie danych pociągu...
  </div>
</div>

<p>
  /monitorowane-pociagi/
    ← Powrót do monitora
  </a>
</p>

<div class="card">

  <div id="trainNumber" class="trainNumber">
    ...
  </div>

  <div id="trainName" class="trainName">
  </div>

  <div id="destination" class="destination">
  </div>

  <div id="delay" class="delay">
    ...
  </div>

  <div class="meta">
    <div id="status"></div>
    <div id="platform"></div>
    <div id="track"></div>
  </div>

</div>

<div class="card">

  <div class="label">
    Ostatnia potwierdzona stacja
  </div>

  <div
    id="lastConfirmedStation"
    class="value">
    -
  </div>

  <div id="lastConfirmedTime">
    -
  </div>

</div>

<div class="card">

  <div class="label">
    Trasa przejazdu
  </div>

  <div id="route" class="route">
    Ładowanie...
  </div>

</div>

<script>

const params =
  new URLSearchParams(location.search);

const train =
  params.get('train') || '';

fetch(
  `/api/train-details?train=${encodeURIComponent(train)}`
)
.then(r => r.json())
.then(data => {

  document
    .getElementById('loading')
    .remove();

  document.getElementById('trainNumber').textContent =
    `${data.category || ''} ${data.train || ''}`;

  document.getElementById('trainName').textContent =
    data.name || '';

  document.getElementById('destination').textContent =
    `→ ${data.destination || '-'}`;

  const delay =
    Number(data.delay || 0);

  const delayElement =
    document.getElementById('delay');

  delayElement.textContent =
    `${delay > 0 ? '+' : ''}${delay} min`;

  delayElement.classList.remove(
    'good',
    'medium',
    'bad'
  );

  if (delay <= 5) {
    delayElement.classList.add('good');
  }
  else if (delay <= 15) {
    delayElement.classList.add('medium');
  }
  else {
    delayElement.classList.add('bad');
  }

  document.getElementById('status').textContent =
    `Status: ${data.status || '-'} (${data.trainStatus || '-'})`;

  document.getElementById('platform').textContent =
    `Peron: ${data.platform || '-'}`;

  document.getElementById('track').textContent =
    `Tor: ${data.track || '-'}`;

  document.getElementById('lastConfirmedStation').textContent =
    data.lastConfirmedStation || '-';

  document.getElementById('lastConfirmedTime').textContent =
    data.lastConfirmedTime || '-';

  const current =
    data.lastConfirmedStation;

  let currentReached = false;

  document.getElementById('route').innerHTML =
    (data.route || [])
      .map(station => {

        let cls = 'routeFuture';
        let icon = '○';

        if (!currentReached) {
          cls = 'routePast';
          icon = '●';
        }

        if (
          station.stationName === current
        ) {
          cls = 'routeCurrent';
          icon = '▶';
          currentReached = true;
        }

        return `
          <div class="routeItem ${cls}">
            <div class="routeHeader">
              ${icon}
              ${station.stationName || station.stationId}
            </div>

            <div class="routeSub">
              ID: ${station.stationId}
            </div>
          </div>
        `;
      })
      .join('');

})
.catch(err => {

  document
    .getElementById('loading')
    .remove();

  alert(
    'Nie udało się pobrać danych pociągu.'
  );

  console.error(err);
});

</script>

</body>
</html>
