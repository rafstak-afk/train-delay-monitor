/**
 * Cloudflare Worker — Tablica odjazdów PLK
 * ─────────────────────────────────────────
 * Architektura:
 *   /schedules  → pobierany co ~30 min (dane planowe, wolno się zmieniają)
 *   /operations → pobierany co ~30 s   (realtime, opóźnienia)
 *
 * Cache in-memory (globalThis) — żyje przez czas życia instancji workera.
 * Chroni limit API (Basic: 100 req/h).
 *
 * Łączenie danych: scheduleId + orderId (nie numer pociągu — może być nieunikalny).
 *
 * Potwierdzona struktura API (z debug 2026-05-11):
 *   schedules[].stations[].departureTime          (HH:MM:SS)
 *   schedules[].stations[].departurePlatform
 *   schedules[].stations[].departureTrack
 *   schedules[].stations[].departureTrainNumber
 *   schedules[].stations[].departureCommercialCategory
 *   operations[].stations[].plannedDeparture       (ISO)
 *   operations[].stations[].plannedDepartureTime   (HH:MM:SS)
 *   operations[].stations[].actualDeparture        (ISO)
 *   operations[].stations[].actualDepartureTime    (HH:MM:SS)
 */

const BASE            = 'https://pdp-api.plk-sa.pl/api/v1';
const CACHE_SCHED_MS  = 30 * 60 * 1000;   // 30 min — plan
const CACHE_OPS_MS    = 30 * 1000;        // 30 s  — realtime
const CACHE_STAT_MS   = 60 * 60 * 1000;   // 1 h   — słownik stacji

// ─── Cache in-memory ──────────────────────────────────────────────────────────
// Struktura: { [cacheKey]: { ts: number, data: any } }
if (!globalThis.__plkCache) globalThis.__plkCache = {};

function cacheGet(key) {
  const entry = globalThis.__plkCache[key];
  return entry ? entry : null;
}

function cacheSet(key, data) {
  globalThis.__plkCache[key] = { ts: Date.now(), data };
}

function cacheFresh(key, maxAgeMs) {
  const entry = cacheGet(key);
  return entry && (Date.now() - entry.ts) < maxAgeMs ? entry.data : null;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

// ─── GET /api/stations?search= ───────────────────────────────────────────────
export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const q   = clean(url.searchParams.get('search') || '');
    if (q.length < 2) return json({ stations: [] });
    return json({ stations: await getStations(q, context.env) });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ─── POST /api/train ─────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  try {
    const body      = await context.request.json();
    const query     = clean(body.query || body.stationName || '');
    const trainTime = clean(body.trainTime || body.time || '');
    const trainDate = clean(body.trainDate || body.date || '') || today();

    if (!query) return json({ error: 'Brak nazwy stacji.' }, 400);

    // 1. Stacja → ID  (cache 1h)
    const stations = await getStations(query, context.env);
    if (!stations.length)
      return json({ error: `Nie znaleziono stacji: "${query}"` }, 404);
    const { id: stationId, name: stationName } = stations[0];

    // 2. Plan  (cache 30 min per stacja+data)
    const schedKey  = `sched:${stationId}:${trainDate}`;
    let   schedJson = cacheFresh(schedKey, CACHE_SCHED_MS);
    let   schedFromCache = true;
    if (!schedJson) {
      schedFromCache = false;
      const r = await plkGet(
        `${BASE}/schedules?stations=${stationId}&dateFrom=${trainDate}&dateTo=${trainDate}&pageSize=200`,
        context.env
      );
      schedJson = r.ok ? await r.json() : {};
      cacheSet(schedKey, schedJson);
    }

    // 3. Realtime  (cache 30 s per stacja)
    const opsKey  = `ops:${stationId}`;
    let   opsJson = cacheFresh(opsKey, CACHE_OPS_MS);
    let   opsFromCache = true;
    if (!opsJson) {
      opsFromCache = false;
      const r = await plkGet(
        `${BASE}/operations?stations=${stationId}&withPlanned=true&fullRoutes=false&pageSize=500`,
        context.env
      );
      opsJson = r.ok ? await r.json() : {};
      cacheSet(opsKey, opsJson);
    }

    // 4. Indeks opóźnień: "scheduleId|orderId" → { delayMins, actualDep }
    const delayIndex = buildDelayIndex(opsJson, stationId);

    // 5. Mapuj plan → wiersze tablicy
    const rawSchedules = arrFrom(schedJson, ['schedules', 'data', 'items']);
    let   route = rawSchedules
      .map(s => mapScheduleRow(s, stationId, delayIndex))
      .filter(Boolean);

    // 6. Filtruj / deduplikuj / sortuj
    route = sortByTime(dedup(filterByTime(route, trainTime)));

    const maxDelay = route.length ? Math.max(0, ...route.map(r => r.delayMinutes)) : 0;
    const rawOps   = arrFrom(opsJson, ['operations', 'data', 'items']);

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
        schedulesRaw:    rawSchedules.length,
        operationsRaw:   rawOps.length,
        delayIndexSize:  Object.keys(delayIndex).length,
        cacheHits:       { sched: schedFromCache, ops: opsFromCache },
        schedSample:     rawSchedules[0] || null,
        opsSample:       rawOps[0] || null,
      }
    });

  } catch (e) {
    return json({ error: e.message || 'Worker error' }, 500);
  }
}

// ─── Stacje (cache 1h) ────────────────────────────────────────────────────────
async function getStations(search, env) {
  const cacheKey = `stations:${search.toLowerCase()}`;
  const cached   = cacheFresh(cacheKey, CACHE_STAT_MS);
  if (cached) return cached;

  const res  = await plkGet(
    `${BASE}/dictionaries/stations?search=${enc(search)}&pageSize=10`,
    env
  );
  if (!res.ok) throw new Error(`Stations HTTP ${res.status}`);
  const data   = await res.json();
  const result = arrFrom(data, ['stations', 'data', 'items'])
    .map(s => ({
      id:   s.id ?? s.stationId ?? s.sid,
      name: clean(s.name ?? s.stationName ?? s.label ?? ''),
    }))
    .filter(s => s.id && s.name);

  cacheSet(cacheKey, result);
  return result;
}

// ─── Indeks opóźnień ──────────────────────────────────────────────────────────
// Klucz: "scheduleId|orderId" — identyczne jak w /schedules
// Wartość: { delayMins, actualDep (HH:MM) }
function buildDelayIndex(opsJson, stationId) {
  const index = {};
  const ops   = arrFrom(opsJson, ['operations', 'data', 'items']);

  for (const op of ops) {
    const key = `${op.scheduleId}|${op.orderId}`;

    // Przystanek dla naszej stacji
    const opStops = arrFrom(op, ['stations', 'stops', 'route']);
    const myStop  = opStops.find(st =>
      String(st.stationId ?? st.id ?? '') === String(stationId)
    );
    if (!myStop) continue;

    // Czasy — API zwraca zarówno ISO jak i HH:MM:SS
    const planned    = fmtTime(
      myStop.plannedDeparture     ??
      myStop.plannedDepartureTime ?? ''
    );
    const actual     = fmtTime(
      myStop.actualDeparture     ??
      myStop.actualDepartureTime ?? ''
    );

    const delayMins  = calcDelay(planned, actual);

    // Zapisz nawet jeśli delay = 0 (żeby wiedzieć że dane są)
    index[key] = {
      delayMins,
      actualDep:   actual || planned,
      plannedDep:  planned,
      trainStatus: clean(op.trainStatus ?? ''),
    };
  }
  return index;
}

// ─── Mapowanie wiersza rozkładu ───────────────────────────────────────────────
function mapScheduleRow(s, stationId, delayIndex) {
  if (!s || typeof s !== 'object') return null;

  // Przystanek naszej stacji w trasie pociągu
  const stops  = arrFrom(s, ['stations', 'stops', 'route']);
  const myStop = stops.find(st =>
    String(st.stationId ?? st.id ?? '') === String(stationId)
  );
  if (!myStop) return null;

  // Godzina planowana odjazdu (potwierdzone: "departureTime" = "HH:MM:SS")
  const scheduled = fmtTime(
    myStop.departureTime    ??
    myStop.plannedDeparture ??
    myStop.arrivalTime      ??
    myStop.plannedArrival   ?? ''
  );
  if (!scheduled) return null;

  // Dane operacyjne (łączenie po scheduleId + orderId)
  const opKey  = `${s.scheduleId}|${s.orderId}`;
  const opData = delayIndex[opKey];

  const delayMinutes = opData?.delayMins ?? 0;
  const actual       = opData?.actualDep
    ? fmtTime(opData.actualDep) || addMins(scheduled, delayMinutes)
    : (delayMinutes > 0 ? addMins(scheduled, delayMinutes) : scheduled);

  // Status pociągu
  const trainStatus  = opData?.trainStatus ?? '';
  const cancelled    = s.cancelled === true || s.isCancelled === true
    || trainStatus.toUpperCase() === 'C'
    || trainStatus.toLowerCase().includes('cancel')
    || trainStatus.toLowerCase().includes('odwoł');

  // Dane pociągu (potwierdzone nazwy pól)
  const carrierCode = clean(s.carrierCode ?? s.carrier ?? '');
  const trainNo     = clean(
    myStop.departureTrainNumber ??
    myStop.arrivalTrainNumber   ??
    s.nationalNumber            ??
    s.trainNumber               ?? ''
  );
  const category    = clean(
    myStop.departureCommercialCategory ??
    myStop.arrivalCommercialCategory   ??
    s.commercialCategorySymbol         ?? ''
  );

  // Peron i tor (potwierdzone: departurePlatform, departureTrack)
  const platform = clean(
    myStop.departurePlatform ?? myStop.arrivalPlatform ?? myStop.platform ?? ''
  );
  const track    = clean(
    myStop.departureTrack ?? myStop.arrivalTrack ?? myStop.track ?? ''
  );
  const platformLabel = platform
    ? (track ? `${platform} / tor ${track}` : platform)
    : (track ? `tor ${track}` : '—');

  // Stacja docelowa — ostatni przystanek
  const lastStop    = stops[stops.length - 1] ?? {};
  const destination = clean(
    s.destinationStationName ?? s.destination ??
    lastStop.stationName     ?? lastStop.name ?? ''
  );

  // Stacje pośrednie po naszym przystanku (bez końcowej)
  const myIdx    = stops.indexOf(myStop);
  const viaStops = myIdx >= 0 ? stops.slice(myIdx + 1, -1) : [];
  const via = viaStops.slice(0, 5)
    .map(st => clean(st.stationName ?? st.name ?? ''))
    .filter(Boolean).join(', ');

  const trainLabel = [category, carrierCode, trainNo].filter(Boolean).join(' ');
  const key        = `${scheduled}|${trainNo}|${destination}`;

  return {
    _key:        key,
    station:     clean(myStop.stationName ?? myStop.name ?? ''),
    scheduled,
    actual,
    delayMinutes,
    status:      cancelled
      ? 'Odwołany'
      : opData
        ? (delayMinutes > 0 ? 'Opóźniony' : 'Punktualnie')
        : 'Planowy',          // brak danych realtime → "Planowy" (nie "Punktualnie")
    trainNumber: trainLabel || '—',
    destination: destination || '—',
    carrier:     expandCarrier(carrierCode),
    platform:    platformLabel,
    via:         via || '—',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function filterByTime(route, trainTime) {
  const pivot = parseClock(trainTime);
  if (pivot === null) return route;
  return route.filter(r => (parseClock(r.scheduled) ?? 9999) >= pivot);
}

function dedup(rows) {
  const seen = new Set();
  return rows.filter(r => {
    if (seen.has(r._key)) return false;
    seen.add(r._key); return true;
  });
}

function sortByTime(rows) {
  return rows.sort((a, b) =>
    (parseClock(a.scheduled) ?? 9999) - (parseClock(b.scheduled) ?? 9999)
  );
}

function calcDelay(planned, actual) {
  const p = parseClock(planned);
  const a = parseClock(actual);
  if (p === null || a === null || actual === '' || planned === '') return 0;
  const diff = a - p;
  return diff < -120 ? diff + 1440 : Math.max(0, diff); // obsługa przekroczenia północy
}

function addMins(time, mins) {
  const base = parseClock(time);
  if (base === null || !mins) return time;
  return minsToTime(base + mins);
}

function expandCarrier(code) {
  const map = {
    IC:  'PKP Intercity',      PR:  'Polregio',
    KM:  'Koleje Mazowieckie', KS:  'Koleje Śląskie',
    KD:  'Koleje Dolnośląskie',SKM: 'SKM Trójmiasto',
    WKD: 'WKD',                MK:  'Małopolska',
    AR:  'Arriva',             ŁKA: 'Łódź Aglomeracyjna',
  };
  return map[(code || '').toUpperCase()] ?? code ?? '—';
}

// Wyciąga tablicę z obiektu — próbuje kluczy, potem fallback na pierwszą tablicę
function arrFrom(obj, keys) {
  if (Array.isArray(obj)) return obj;
  for (const k of keys) {
    if (k && Array.isArray(obj?.[k]) && obj[k].length > 0) return obj[k];
  }
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) && v.length > 0) return v;
    }
  }
  return [];
}

async function plkGet(url, env) {
  return fetch(url, {
    headers: { 'Accept': 'application/json', 'x-api-key': env.PLK_API_KEY },
  });
}

function today() { return new Date().toISOString().slice(0, 10); }

function fmtTime(v) {
  const s = String(v || '').trim();
  const iso = s.match(/T(\d{2}):(\d{2})/);          // ISO: 2026-05-11T15:47:00
  if (iso) return `${iso[1]}:${iso[2]}`;
  const hm  = s.match(/^(\d{1,2}):(\d{2})/);         // HH:MM lub HH:MM:SS
  if (hm)  return hm[1].padStart(2, '0') + ':' + hm[2];
  return '';
}

function parseClock(v) {
  const m = String(v || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function minsToTime(mins) {
  const normalized = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function clean(v) {
  return String(v ?? '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function enc(v)    { return encodeURIComponent(v); }

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
