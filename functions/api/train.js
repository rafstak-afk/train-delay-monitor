/**
 * Cloudflare Worker — Tablica odjazdów PLK
 *
 * Potwierdzona struktura API (debug 2026-05-11):
 *
 * SCHEDULES item:
 *   scheduleId, orderId, carrierCode, nationalNumber, commercialCategorySymbol
 *   operatingDates: ["2026-05-11"]
 *   stations: [{
 *     stationId, orderNumber,
 *     arrivalTime, departureTime,           ← HH:MM:SS
 *     arrivalTrainNumber, departureTrainNumber,
 *     arrivalCommercialCategory, departureCommercialCategory,
 *     departurePlatform, departureTrack
 *   }]
 *
 * OPERATIONS item:
 *   scheduleId, orderId (≠ schedules.orderId!), trainOrderId, trainStatus
 *   stations: [{
 *     stationId,
 *     plannedArrival, plannedDeparture,     ← ISO datetime
 *     plannedArrivalTime, plannedDepartureTime, ← HH:MM:SS
 *     actualArrival, actualDeparture,       ← ISO datetime
 *   }]
 *
 * WAŻNE: operations.orderId ≠ schedules.orderId
 * Łączenie po: scheduleId + stacja (plannedDepartureTime ↔ departureTime)
 */

const BASE           = 'https://pdp-api.plk-sa.pl/api/v1';
const CACHE_SCHED_MS = 30 * 60 * 1000;  // 30 min
const CACHE_OPS_MS   = 30 * 1000;       // 30 s
const CACHE_STAT_MS  = 60 * 60 * 1000;  // 1 h

if (!globalThis.__plkCache) globalThis.__plkCache = {};
const C = globalThis.__plkCache;

function cacheGet(key, maxMs) {
  const e = C[key];
  return e && (Date.now() - e.ts) < maxMs ? e.data : null;
}
function cacheSet(key, data) { C[key] = { ts: Date.now(), data }; }

// ─── CORS ─────────────────────────────────────────────────────────────────────
export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

// ─── GET /api/stations?search= ───────────────────────────────────────────────
export async function onRequestGet(context) {
  try {
    const q = clean(new URL(context.request.url).searchParams.get('search') || '');
    if (q.length < 2) return json({ stations: [] });
    return json({ stations: await getStations(q, context.env) });
  } catch (e) { return json({ error: e.message }, 500); }
}

// ─── POST /api/train ─────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  try {
    const body      = await context.request.json();
    const query     = clean(body.query || body.stationName || '');
    const trainTime = clean(body.trainTime || body.time || '');
    const trainDate = clean(body.trainDate || body.date || '') || today();

    if (!query) return json({ error: 'Brak nazwy stacji.' }, 400);

    const stations = await getStations(query, context.env);
    if (!stations.length)
      return json({ error: `Nie znaleziono stacji: "${query}"` }, 404);
    const { id: stationId, name: stationName } = stations[0];

    // Plan (cache 30 min)
    const schedKey = `sched:${stationId}:${trainDate}`;
    let schedFromCache = true;
    let schedJson = cacheGet(schedKey, CACHE_SCHED_MS);
    if (!schedJson) {
      schedFromCache = false;
      const r = await plkGet(
        `${BASE}/schedules?stations=${stationId}&dateFrom=${trainDate}&dateTo=${trainDate}&pageSize=200`,
        context.env
      );
      schedJson = r.ok ? await r.json() : {};
      cacheSet(schedKey, schedJson);
    }

    // Realtime (cache 30 s)
    const opsKey = `ops:${stationId}`;
    let opsFromCache = true;
    let opsJson = cacheGet(opsKey, CACHE_OPS_MS);
    if (!opsJson) {
      opsFromCache = false;
      const r = await plkGet(
        `${BASE}/operations?stations=${stationId}&withPlanned=true&fullRoutes=false&pageSize=500`,
        context.env
      );
      opsJson = r.ok ? await r.json() : {};
      cacheSet(opsKey, opsJson);
    }

    const rawSchedules = getKey(schedJson, 'schedules');
    const rawOps       = getKey(opsJson,   'operations');

    // Indeks opóźnień: scheduleId → { [plannedDepTime_HH:MM]: opData }
    // (operations.orderId ≠ schedules.orderId, ale scheduleId jest wspólny)
    const delayIndex = buildDelayIndex(rawOps, stationId);

    let route = rawSchedules
      .map(s => mapRow(s, stationId, delayIndex))
      .filter(Boolean);

    route = sortByTime(dedup(filterByTime(route, trainTime)));
    const maxDelay = route.length ? Math.max(0, ...route.map(r => r.delayMinutes)) : 0;

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
        schedulesRaw: rawSchedules.length,
        operationsRaw: rawOps.length,
        delayIndexKeys: Object.keys(delayIndex).length,
        cacheHits: { sched: schedFromCache, ops: opsFromCache },
        schedSample: rawSchedules[0] || null,
        opsSample: rawOps[0] || null,
      }
    });

  } catch (e) { return json({ error: e.message || 'Worker error' }, 500); }
}

// ─── Stacje ───────────────────────────────────────────────────────────────────
async function getStations(search, env) {
  const key    = `sta:${search.toLowerCase()}`;
  const cached = cacheGet(key, CACHE_STAT_MS);
  if (cached) return cached;

  const res  = await plkGet(`${BASE}/dictionaries/stations?search=${enc(search)}&pageSize=10`, env);
  if (!res.ok) throw new Error(`Stations HTTP ${res.status}`);
  const data = await res.json();
  const list = (getKey(data, 'stations') || [])
    .map(s => ({ id: s.id ?? s.stationId, name: clean(s.name ?? s.stationName ?? '') }))
    .filter(s => s.id && s.name);

  cacheSet(key, list);
  return list;
}

// ─── Indeks opóźnień ─────────────────────────────────────────────────────────
// Klucz: `${scheduleId}:${plannedDepartureTime_HHMM}`
// operations.orderId różni się od schedules.orderId — nie można po nim łączyć.
// Zamiast tego: scheduleId (wspólny) + planowa godzina odjazdu ze stacji (identyczna).
function buildDelayIndex(ops, stationId) {
  const idx = {};
  for (const op of ops) {
    const sid    = String(op.scheduleId ?? '');
    if (!sid) continue;

    const stops  = getStops(op);
    const myStop = stops.find(st => String(st.stationId ?? '') === String(stationId));
    if (!myStop) continue;

    const planned = fmtTime(myStop.plannedDeparture ?? myStop.plannedDepartureTime ?? '');
    const actual  = fmtTime(myStop.actualDeparture  ?? myStop.actualDepartureTime  ?? '');
    if (!planned) continue;

    const delay   = calcDelay(planned, actual);
    const key     = `${sid}:${planned}`;

    idx[key] = {
      delayMins:   delay,
      actualDep:   actual || planned,
      trainStatus: clean(op.trainStatus ?? ''),
    };
  }
  return idx;
}

// ─── Mapowanie wiersza ────────────────────────────────────────────────────────
function mapRow(s, stationId, delayIndex) {
  if (!s || typeof s !== 'object') return null;

  // TYLKO pole "stations" — nie używamy heurystyki tablic
  const stops = Array.isArray(s.stations) ? s.stations : [];
  const myStop = stops.find(st => String(st.stationId ?? '') === String(stationId));
  if (!myStop) return null;

  // Godzina planowanego odjazdu
  const scheduled = fmtTime(myStop.departureTime ?? myStop.arrivalTime ?? '');
  if (!scheduled) return null;

  // Łączenie z operations: scheduleId + planowa godzina
  const opKey  = `${s.scheduleId}:${scheduled}`;
  const opData = delayIndex[opKey];

  const delayMinutes = opData?.delayMins ?? 0;
  const actual = delayMinutes > 0
    ? (opData?.actualDep ? fmtTime(opData.actualDep) : addMins(scheduled, delayMinutes))
    : scheduled;

  // Status
  const ts        = opData?.trainStatus ?? '';
  const cancelled = ts.toUpperCase() === 'C'
    || s.cancelled === true || s.isCancelled === true;

  // Dane pociągu
  const carrierCode = clean(s.carrierCode ?? '');
  const trainNo     = clean(myStop.departureTrainNumber ?? myStop.arrivalTrainNumber ?? s.nationalNumber ?? '');
  const category    = clean(myStop.departureCommercialCategory ?? s.commercialCategorySymbol ?? '');
  const platform    = clean(myStop.departurePlatform ?? myStop.arrivalPlatform ?? '');
  const track       = clean(myStop.departureTrack    ?? myStop.arrivalTrack    ?? '');
  const platformLabel = [platform && `peron ${platform}`, track && `tor ${track}`].filter(Boolean).join(' / ') || '—';

  // Stacja docelowa
  const lastStop    = stops[stops.length - 1] ?? {};
  const destination = clean(s.destinationStationName ?? lastStop.stationName ?? '');

  // Stacje pośrednie po naszym przystanku (bez końcowej)
  const myIdx    = stops.indexOf(myStop);
  const via = stops
    .slice(myIdx + 1, -1)
    .slice(0, 5)
    .map(st => clean(st.stationName ?? ''))
    .filter(Boolean).join(', ');

  const trainLabel = [category, carrierCode, trainNo].filter(Boolean).join(' ') || '—';
  const key        = `${scheduled}|${trainNo}|${destination}`;

  return {
    _key: key,
    station:     clean(myStop.stationName ?? ''),
    scheduled,
    actual,
    delayMinutes,
    status: cancelled ? 'Odwołany'
      : opData ? (delayMinutes > 0 ? 'Opóźniony' : 'Punktualnie')
      : 'Planowy',
    trainNumber: trainLabel,
    destination: destination || '—',
    carrier:     expandCarrier(carrierCode),
    platform:    platformLabel,
    via:         via || '—',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Pobiera tablicę z konkretnego klucza (bez heurystyki)
function getKey(obj, key) {
  return Array.isArray(obj?.[key]) ? obj[key] : [];
}

// Pobiera stops/stations z obiektu operacji (sprawdza tylko znane klucze)
function getStops(op) {
  if (Array.isArray(op?.stations)) return op.stations;
  if (Array.isArray(op?.stops))    return op.stops;
  return [];
}

function filterByTime(route, trainTime) {
  const pivot = parseClock(trainTime);
  if (pivot === null) return route;
  return route.filter(r => (parseClock(r.scheduled) ?? 9999) >= pivot);
}

function dedup(rows) {
  const seen = new Set();
  return rows.filter(r => { if (seen.has(r._key)) return false; seen.add(r._key); return true; });
}

function sortByTime(rows) {
  return rows.sort((a, b) => (parseClock(a.scheduled) ?? 9999) - (parseClock(b.scheduled) ?? 9999));
}

function calcDelay(planned, actual) {
  const p = parseClock(planned), a = parseClock(actual);
  if (p === null || a === null) return 0;
  const d = a - p;
  return d < -120 ? d + 1440 : Math.max(0, d);
}

function addMins(time, mins) {
  const b = parseClock(time);
  return b === null ? time : minsToTime(b + mins);
}

function expandCarrier(code) {
  const map = { IC:'PKP Intercity', PR:'Polregio', KM:'Koleje Mazowieckie',
    KS:'Koleje Śląskie', KD:'Koleje Dolnośląskie', SKM:'SKM Trójmiasto',
    WKD:'WKD', MK:'Małopolska', AR:'Arriva', ŁKA:'Łódź Aglomeracyjna' };
  return map[(code||'').toUpperCase()] ?? code ?? '—';
}

async function plkGet(url, env) {
  return fetch(url, { headers: { 'Accept':'application/json', 'x-api-key': env.PLK_API_KEY } });
}

function today() { return new Date().toISOString().slice(0, 10); }

function fmtTime(v) {
  const s = String(v || '').trim();
  const iso = s.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm)  return hm[1].padStart(2, '0') + ':' + hm[2];
  return '';
}

function parseClock(v) {
  const m = String(v || '').match(/(\d{1,2}):(\d{2})/);
  return m ? +m[1] * 60 + +m[2] : null;
}

function minsToTime(mins) {
  const n = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}

function clean(v) {
  return String(v ?? '').replace(/[\u0000-\u001F]/g,' ').replace(/\s+/g,' ').trim();
}

function enc(v) { return encodeURIComponent(v); }

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
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
