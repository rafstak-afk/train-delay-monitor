// functions/api/departures.js
// RafStaK Alarmy v0.4.0
// Cel: /api/departures ma zwracać nie tylko „ładne” pola do tabeli,
// ale też link/identyfikatory biegu z surowego rekordu PLK.
// Dzięki temu /alarmy/index.html może otworzyć prawdziwy bieg pociągu bez zgadywania po numerze.

const API_BASE = 'https://pdp-api.plk-sa.pl';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

// Awaryjne mapowanie tylko jako plan B. Jeżeli Twój dotychczasowy worker miał resolver stacji,
// zostaw go i przenieś z tego pliku przede wszystkim funkcje: enrichDeparture(), deepFindLinks(), deepFindIds().
const STATION_IDS = {
  'katowice': '73312',
  'tarnowskie gory': '73472',
  'tarnowskie góry': '73472',
  'chorzow batory': '73002',
  'chorzów batory': '73002',
  'gliwice': '73006'
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  try {
    const station = (url.searchParams.get('station') || '').trim();
    const stationId = (url.searchParams.get('stationId') || STATION_IDS[norm(station)] || '').trim();
    const date = url.searchParams.get('date') || todayWarsaw();
    const time = url.searchParams.get('time') || '00:00';
    const limit = Math.min(Number(url.searchParams.get('limit') || 160), 500);

    if (!station && !stationId) {
      return json({ error: 'Brak parametru station albo stationId.' }, 400);
    }
    if (!stationId) {
      return json({ error: 'Nie znam stationId dla stacji: ' + station, hint: 'Podaj stationId albo dopisz stację do STATION_IDS w workerze.' }, 404);
    }

    const apiKey = env.PLK_API_KEY || env.PDP_API_KEY || env.API_KEY || env.PLK_KEY || '';
    if (!apiKey) return json({ error: 'Brak klucza API w env.PLK_API_KEY / env.PDP_API_KEY.' }, 500);

    const upstreamUrl = new URL('/api/v1/operations', API_BASE);
    upstreamUrl.searchParams.set('stations', stationId);
    upstreamUrl.searchParams.set('withPlanned', 'true');
    upstreamUrl.searchParams.set('pageSize', '10000');

    const r = await fetch(upstreamUrl.toString(), {
      headers: {
        'accept': 'application/json',
        'x-api-key': apiKey,
        'api-key': apiKey,
        'authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`
      }
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { rawText: text }; }
    if (!r.ok) {
      return json({ error: 'PLK API ' + r.status, details: data }, r.status);
    }

    const rows = pickArray(data).map(x => enrichDeparture(x, { station, stationId }));
    const filtered = filterByDateTime(rows, date, time).slice(0, limit);

    return json({
      station,
      stationId,
      date,
      time,
      count: filtered.length,
      departures: filtered,
      _debug: {
        source: '/api/v1/operations',
        rawCount: rows.length,
        linkFieldsInjected: true,
        note: 'Każdy rekord zawiera pola detailUrl/detailsUrl/trainUrl/plkLink, runId/courseId/journeyId oraz _raw.'
      }
    });
  } catch (e) {
    return json({ error: 'Błąd workera /api/departures', details: String(e && e.message || e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: JSON_HEADERS });
}

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ');
}

function todayWarsaw() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pickArray(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['items', 'data', 'results', 'operations', 'departures', 'content', 'rows']) {
    if (Array.isArray(data && data[key])) return data[key];
  }
  // czasem API opakowuje listę głębiej, więc szukamy pierwszej sensownej tablicy obiektów
  const found = [];
  walk(data, (v) => {
    if (!found.length && Array.isArray(v) && v.some(x => x && typeof x === 'object')) found.push(v);
  });
  return found[0] || [];
}

function val(obj, keys) {
  for (const k of keys) {
    const v = obj && obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function enrichDeparture(raw, ctx) {
  const links = deepFindLinks(raw);
  const ids = deepFindIds(raw);

  const trainNo = String(val(raw, ['train', 'trainNumber', 'number', 'commercialNumber', 'trainNo', 'nrPociagu', 'nrPociągu']) || ids.trainNumber || '').trim();
  const planned = val(raw, ['plannedTime', 'scheduledTime', 'planTime', 'departureTime', 'time', 'plannedDepartureTime']);
  const actual = val(raw, ['time', 'actualTime', 'realTime', 'estimatedTime', 'actualDepartureTime']) || planned;

  const detailUrl = links[0] || '';

  return {
    // pola używane przez obecny front
    train: trainNo,
    trainNumber: trainNo,
    category: val(raw, ['category', 'trainCategory', 'type', 'kind']),
    name: val(raw, ['name', 'trainName', 'commercialName']),
    carrier: val(raw, ['carrier', 'operator', 'company', 'railwayUndertaking']),
    destination: stationName(val(raw, ['destination', 'to', 'targetStation', 'stationTo', 'finalStation', 'endStation'])),
    origin: stationName(val(raw, ['origin', 'from', 'startStation', 'stationFrom', 'departureStation'])),
    via: viaText(raw),
    time: actual,
    plannedTime: planned,
    delay: Number(val(raw, ['delay', 'delayMinutes', 'delayInMinutes', 'delayedMinutes']) || 0),
    status: val(raw, ['status', 'state', 'realizationStatus', 'operationStatus', 'trainStatus']),
    statusCode: val(raw, ['statusCode', 'code', 'plkCode', 'plkStatus', 'kodPLK']),
    platform: val(raw, ['platform', 'peron', 'platformNumber']),
    track: val(raw, ['track', 'tor', 'trackNumber']),

    // KLUCZOWE: pola linku i identyfikatorów dla alarmów
    detailUrl,
    detailsUrl: detailUrl,
    trainUrl: detailUrl,
    runUrl: detailUrl,
    plkLink: detailUrl,
    portalUrl: detailUrl,
    link: detailUrl,
    href: detailUrl,
    url: detailUrl,

    runId: ids.runId || '',
    courseId: ids.courseId || '',
    journeyId: ids.journeyId || '',
    trainId: ids.trainId || '',
    operationId: ids.operationId || '',
    scheduleId: ids.scheduleId || '',
    communicationId: ids.communicationId || '',
    connectionId: ids.connectionId || '',

    _station: ctx.station || '',
    _stationId: ctx.stationId || '',
    _links: links,
    _ids: ids,
    _raw: raw
  };
}

function stationName(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return val(v, ['name', 'stationName', 'displayName', 'shortName']) || String(v.id || v.stationId || '');
}

function viaText(raw) {
  const v = val(raw, ['via', 'through', 'route', 'stops', 'intermediateStations']);
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(stationName).filter(Boolean).join(', ');
  return '';
}

function filterByDateTime(rows, date, time) {
  // Nie wycinamy agresywnie, bo API PLK potrafi różnie formatować czasy.
  // Jeśli jest data/czas w rekordzie, filtrujemy miękko od podanej godziny.
  const min = String(time || '00:00').slice(0, 5);
  return rows.filter(d => {
    const t = hhmm(d.time || d.plannedTime);
    if (!t) return true;
    return t >= min;
  });
}

function hhmm(v) {
  const m = String(v || '').match(/(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

function deepFindLinks(root) {
  const out = [];
  const seen = new Set();
  walk(root, (v, path) => {
    if (typeof v !== 'string') return;
    const s = v.trim();
    const p = path.join('.');
    if (!s) return;
    const keyLooksLink = /(link|url|href|detail|details|run|journey|course|route|portal|plk|bieg|pociag|pociąg)/i.test(p);
    const valueLooksLink = /^(https?:)?\/\//i.test(s) || /^\//.test(s) || /portalpasazera|plk-sa|\/Pociag|\/Train|\/Szczegoly|\/Details|bieg|journey|run|course/i.test(s);
    if ((keyLooksLink || valueLooksLink) && !/^\d{1,8}$/.test(s)) {
      const u = normalizeUrl(s);
      if (u && !seen.has(u)) { seen.add(u); out.push(u); }
    }
  });
  return out.sort((a, b) => linkScore(b) - linkScore(a));
}

function normalizeUrl(s) {
  if (!s) return '';
  if (/^\/\//.test(s)) return 'https:' + s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\//.test(s)) return 'https://portalpasazera.pl' + s;
  if (/portalpasazera|plk-sa/i.test(s)) return s.startsWith('http') ? s : 'https://' + s;
  return s;
}

function linkScore(s) {
  let n = 0;
  if (/portalpasazera/i.test(s)) n += 50;
  if (/pociag|pociąg|train|bieg|run|journey|course|szczeg|details/i.test(s)) n += 40;
  if (/wyswietlacz|tablica|station/i.test(s)) n -= 20;
  return n;
}

function deepFindIds(root) {
  const ids = {};
  const wanted = /(runId|courseId|journeyId|trainId|operationId|scheduleId|communicationId|connectionId|trainNumber|commercialNumber|number|id)$/i;
  walk(root, (v, path) => {
    const k = path[path.length - 1] || '';
    if (!wanted.test(k)) return;
    if (v === null || v === undefined || typeof v === 'object') return;
    const s = String(v).trim();
    if (!s) return;
    const canonical = canonicalIdKey(k);
    // Odrzuć rok jako rzekomy ID. Tak, serio, już nas to raz ugryzło.
    if (canonical !== 'trainNumber' && /^20\d{2}$/.test(s)) return;
    if (!ids[canonical]) ids[canonical] = s;
  });
  return ids;
}

function canonicalIdKey(k) {
  const s = String(k).toLowerCase();
  if (s.includes('run')) return 'runId';
  if (s.includes('course')) return 'courseId';
  if (s.includes('journey')) return 'journeyId';
  if (s.includes('operation')) return 'operationId';
  if (s.includes('schedule')) return 'scheduleId';
  if (s.includes('communication')) return 'communicationId';
  if (s.includes('connection')) return 'connectionId';
  if (s.includes('train') && s.includes('id')) return 'trainId';
  if (s.includes('train') || s.includes('commercial') || s === 'number') return 'trainNumber';
  return k;
}

function walk(v, cb, path = [], seen = new WeakSet()) {
  cb(v, path);
  if (!v || typeof v !== 'object') return;
  if (seen.has(v)) return;
  seen.add(v);
  if (Array.isArray(v)) {
    v.forEach((x, i) => walk(x, cb, path.concat(String(i)), seen));
  } else {
    Object.entries(v).forEach(([k, x]) => walk(x, cb, path.concat(k), seen));
  }
}
