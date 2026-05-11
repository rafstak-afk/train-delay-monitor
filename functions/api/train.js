/**
 * Cloudflare Worker — Tablica odjazdów PLK
 *
 * Strategia:
 *  1. /dictionaries/stations?search=  → ID stacji
 *  2. /schedules?stations=ID          → planowe odjazdy (główne źródło)
 *  3. /operations?stations=ID         → real-time opóźnienia (nakładka)
 *
 * Zmienna środowiskowa: PLK_API_KEY (secret)
 */

const BASE = 'https://pdp-api.plk-sa.pl/api/v1';

// ─── CORS preflight ───────────────────────────────────────────────────────────
export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

// ─── GET /api/stations?search=  (podpowiedzi) ────────────────────────────────
export async function onRequestGet(context) {
  try {
    const url  = new URL(context.request.url);
    const q    = clean(url.searchParams.get('search') || '');
    if (q.length < 2) return json({ stations: [] });
    const stations = await getStations(q, context.env);
    return json({ stations });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── POST /api/train ─────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  try {
    const body        = await context.request.json();
    const query       = clean(body.query || body.stationName || '');
    const trainTime   = clean(body.trainTime || body.time || '');
    const trainDate   = clean(body.trainDate || body.date || '') || today();

    if (!query) return json({ error: 'Brak nazwy stacji.' }, 400);

    // 1. Rozwiąż stację → ID
    const stations = await getStations(query, context.env);
    if (!stations.length)
      return json({ error: `Nie znaleziono stacji: "${query}"` }, 404);

    const { id: stationId, name: stationName } = stations[0];

    // 2. Pobierz rozkład planowy (główne dane)
    const schedRes  = await plkGet(
      `${BASE}/schedules?stations=${stationId}&dateFrom=${trainDate}&dateTo=${trainDate}&pageSize=200`,
      context.env
    );
    const schedJson = await schedRes.json();

    // 3. Pobierz dane real-time (opóźnienia)
    const opsRes  = await plkGet(
      `${BASE}/operations?stations=${stationId}&withPlanned=true&fullRoutes=false&pageSize=500`,
      context.env
    );
    const opsJson = await opsRes.json();

    // 4. Zbuduj indeks opóźnień: trainNumber → delayMinutes
    const delayIndex = buildDelayIndex(opsJson);

    // 5. Mapuj rozkład → wiersze tablicy
    const rawSchedules = extractArray(schedJson, ['schedules', 'data', 'items']);
    let route = rawSchedules
      .map(s => mapScheduleRow(s, stationId, delayIndex))
      .filter(Boolean);

    // 6. Filtruj po godzinie + deduplikuj + sortuj
    route = sortByTime(dedup(filterByTime(route, trainTime)));

    const maxDelay = Math.max(0, ...route.map(r => r.delayMinutes));

    return json({
      matchedStation:   stationName,
      stationId,
      fullTimetableUrl: `https://portalpasazera.pl/Wyswietlacz?sid=${stationId}`,
      delayMinutes:     maxDelay,
      status:           route.length ? (maxDelay > 0 ? 'DELAYED' : 'ON_TIME') : 'NO_DATA',
      lastStation:      route.length ? (route[route.length - 1].destination || stationName) : stationName,
      route:            route.slice(0, 30),
      totalDepartures:  route.length,
      debug: {
        stationId, stationName, date: trainDate,
        schedulesRaw:   rawSchedules.length,
        operationsRaw:  countOps(opsJson),
        delayIndexSize: Object.keys(delayIndex).length,
        schedSample:    rawSchedules[0] || null,
        opsSample:      firstOp(opsJson) || null,
      }
    });

  } catch (e) {
    return json({ error: e.message || 'Worker error' }, 500);
  }
}

// ─── Pobieranie stacji ────────────────────────────────────────────────────────
async function getStations(search, env) {
  const res  = await plkGet(`${BASE}/dictionaries/stations?search=${enc(search)}&pageSize=10`, env);
  if (!res.ok) throw new Error(`Stations HTTP ${res.status}`);
  const data = await res.json();
  return extractArray(data, ['stations', 'data', 'items'])
    .map(s => ({
      id:   s.id   ?? s.stationId ?? s.sid,
      name: clean(s.name ?? s.stationName ?? s.label ?? ''),
    }))
    .filter(s => s.id && s.name);
}

// ─── Indeks opóźnień z /operations ───────────────────────────────────────────
function buildDelayIndex(opsJson) {
  const index = {};
  const ops   = extractArray(opsJson, ['operations', 'data', 'items']);

  for (const op of ops) {
    const keys = [
      clean(op.trainNumber ?? op.trainNo ?? op.number ?? ''),
      clean(op.commercialTrainNumber ?? ''),
    ].filter(Boolean);

    const delay = Number(op.delayMinutes ?? op.delay ?? op.delayInMinutes ?? 0) || 0;
    if (delay === 0) continue;

    for (const k of keys) {
      if (k) index[k] = Math.max(index[k] || 0, delay);
    }
  }
  return index;
}

// ─── Mapowanie wiersza rozkładu ───────────────────────────────────────────────
function mapScheduleRow(s, stationId, delayIndex) {
  if (!s || typeof s !== 'object') return null;

  // Znajdź przystanek dla naszej stacji w trasie pociągu
  const stops  = extractArray(s, ['stops', 'route', 'stations']);
  const myStop = stops.find(st =>
    String(st.stationId ?? st.id ?? '') === String(stationId)
  ) || {};

  // Godzina planowana
  const scheduled = fmtTime(
    myStop.plannedDeparture ?? myStop.departure ??
    myStop.plannedArrival   ?? myStop.arrival   ??
    s.plannedDeparture      ?? s.departure      ??
    s.plannedArrival        ?? s.arrival        ?? ''
  );
  if (!scheduled) return null;

  // Identyfikatory pociągu
  const carrierCode = clean(s.carrierCode ?? s.carrier ?? s.operatorCode ?? '');
  const trainNo     = clean(s.trainNumber ?? s.trainNo ?? s.number ?? '');
  const trainName   = clean(s.commercialName ?? s.trainName ?? s.name ?? '');

  // Opóźnienie z indeksu real-time
  const delayMinutes = delayIndex[trainNo]
    ?? delayIndex[`${carrierCode} ${trainNo}`]
    ?? 0;

  // Rzeczywista godzina = planowa + opóźnienie
  const actualMins = (parseClock(scheduled) ?? 0) + delayMinutes;
  const actual     = delayMinutes > 0 ? minsToTime(actualMins) : scheduled;

  // Stacja docelowa
  const lastStop    = stops.length ? stops[stops.length - 1] : {};
  const destination = clean(
    s.destinationStationName ?? s.destination ?? s.finalStation ??
    lastStop.stationName     ?? lastStop.name ?? ''
  );

  // Stacje pośrednie po naszej stacji (bez docelowej)
  const myIdx  = stops.findIndex(st =>
    String(st.stationId ?? st.id ?? '') === String(stationId)
  );
  const viaStops = myIdx >= 0
    ? stops.slice(myIdx + 1, -1)
    : stops.slice(0, -1);
  const via = viaStops.slice(0, 4)
    .map(st => clean(st.stationName ?? st.name ?? ''))
    .filter(Boolean).join(', ');

  const platform = clean(
    myStop.platform ?? myStop.track ?? myStop.platformNumber ??
    s.platform      ?? s.track     ?? ''
  );

  const cancelled = s.cancelled === true || s.isCancelled === true
    || String(s.status ?? '').toLowerCase().includes('cancel')
    || String(s.status ?? '').toLowerCase().includes('odwoł');

  const parts = [carrierCode, trainNo, trainName].filter(Boolean);
  const key   = `${scheduled}|${trainNo}|${destination}`;

  return {
    _key:        key,
    station:     clean(myStop.stationName ?? myStop.name ?? s.stationName ?? ''),
    scheduled,
    actual,
    delayMinutes,
    status:      cancelled ? 'Odwołany' : (delayMinutes > 0 ? 'Opóźniony' : 'Punktualnie'),
    trainNumber: parts.join(' ') || '—',
    destination: destination || '—',
    carrier:     expandCarrier(carrierCode),
    platform:    platform || '—',
    via:         via || '—',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function filterByTime(route, trainTime) {
  const pivot = parseClock(trainTime);
  if (pivot === null) return route;
  return route.filter(r => {
    const t = parseClock(r.scheduled);
    return t === null || t >= pivot;
  });
}

function dedup(rows) {
  const seen = new Set();
  return rows.filter(r => {
    if (seen.has(r._key)) return false;
    seen.add(r._key);
    return true;
  });
}

function sortByTime(rows) {
  return rows.sort((a, b) =>
    (parseClock(a.scheduled) ?? 9999) - (parseClock(b.scheduled) ?? 9999)
  );
}

function expandCarrier(code) {
  const map = {
    IC:  'PKP Intercity',   PR:  'Polregio',
    KM:  'Koleje Mazowieckie', KS: 'Koleje Śląskie',
    KD:  'Koleje Dolnośląskie', SKM: 'SKM Trójmiasto',
    WKD: 'WKD',             MK:  'Małopolska',
    AR:  'Arriva',
  };
  return map[(code || '').toUpperCase()] ?? code ?? '—';
}

function extractArray(obj, keys) {
  if (Array.isArray(obj)) return obj;
  for (const k of keys) {
    if (k && Array.isArray(obj?.[k])) return obj[k];
  }
  // ostatnia szansa: pierwsza tablica w obiekcie
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) && v.length > 0) return v;
    }
  }
  return [];
}

function countOps(opsJson) {
  return extractArray(opsJson, ['operations', 'data', 'items']).length;
}

function firstOp(opsJson) {
  return extractArray(opsJson, ['operations', 'data', 'items'])[0] || null;
}

async function plkGet(url, env) {
  return fetch(url, {
    headers: {
      'Accept':    'application/json',
      'x-api-key': env.PLK_API_KEY,
    },
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(v) {
  const s = String(v || '').trim();
  const iso = s.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const hm = s.match(/(\d{1,2}):(\d{2})/);
  if (hm) return hm[1].padStart(2, '0') + ':' + hm[2];
  return '';
}

function parseClock(v) {
  const m = String(v || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function clean(v) {
  return String(v ?? '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function enc(v) { return encodeURIComponent(v); }

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors() },
  });
}
