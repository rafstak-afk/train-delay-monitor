let KEY = '';
const PLK_BASE = 'https://pdp-api.plk-sa.pl/api/v1';
const GTFS_ZIP_URL = 'https://github.com/TransportGZM-GTFS-mirror/TransportGZM-GTFS-extended-ver/releases/latest/download/TransportGZM-GTFS.zip';
const GTFS_RT_URL = 'https://gtfsrt.transportgzm.pl:5443/gtfsrt/gzm/tripUpdates';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const GROUPS = {
  TG_DWORZEC: {
    name: 'TG Dworzec',
    stops: [[3599, '1'], [3598, '2'], [5869, '3'], [5870, '4'], [5872, '6'], [7454, '7']]
  },
  TG_POWSTANCOW: {
    name: 'TG Powstańców Śląskich',
    stops: [[2409, '1'], [2410, '2']]
  },
  TG_SIENKIEWICZA: {
    name: 'TG Sienkiewicza',
    stops: [[3629, '1']]
  },
  TG_BYTOMSKA: {
    name: 'TG Bytomska',
    stops: [[3570, '1'], [3569, '2']]
  },
  SWIERKLANIEC_PARK: {
    name: 'Świerklaniec Park',
    stops: [[44, '1'], [8756, '2'], [8755, '3'], [45, '4']]
  },
  KT_KOPERNIKA: {
    name: 'Katowice Kopernika Dworzec',
    stops: [[11081, '1'], [11101, '2']]
  }
};

let gtfsZipCache = null;
let gtfsZipCacheAt = 0;
let gtfsIndexCache = null;
let gtfsIndexCacheAt = 0;
let rtCache = null;
let rtCacheAt = 0;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function plkGet(path) {
  const res = await fetch(PLK_BASE + path, { headers: { 'X-API-Key': KEY } });
  if (!res.ok) throw new Error('PLK HTTP ' + res.status);
  return res.json();
}

function warsawParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    weekday: 'short'
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    compact: `${parts.year}${parts.month}${parts.day}`,
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second || 0),
    nowMin: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function dayField(weekday) {
  const w = String(weekday || '').toLowerCase();
  if (w.startsWith('mon')) return 'monday';
  if (w.startsWith('tue')) return 'tuesday';
  if (w.startsWith('wed')) return 'wednesday';
  if (w.startsWith('thu')) return 'thursday';
  if (w.startsWith('fri')) return 'friday';
  if (w.startsWith('sat')) return 'saturday';
  return 'sunday';
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsvRows(text, onRow) {
  const normalized = text.replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/);
  if (!lines.length) return;
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = parseCsvLine(line);
    onRow(cells, idx);
  }
}

function getCell(cells, idx, name) {
  const p = idx[name];
  return p == null ? '' : (cells[p] ?? '');
}

function timeToMin(t) {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minToHHMM(mins) {
  if (mins == null || !Number.isFinite(mins)) return '';
  const normalized = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function minutesLabel(diff) {
  if (diff <= 0) return 'już!';
  return `${diff} min`;
}

async function getGtfsZipArrayBuffer() {
  const now = Date.now();
  if (gtfsZipCache && now - gtfsZipCacheAt < 15 * 60 * 1000) return gtfsZipCache;

  const cache = caches.default;
  const cacheReq = new Request(GTFS_ZIP_URL, { method: 'GET' });
  const cached = await cache.match(cacheReq);
  if (cached) {
    const ab = await cached.arrayBuffer();
    gtfsZipCache = ab;
    gtfsZipCacheAt = now;
    return ab;
  }

  const res = await fetch(GTFS_ZIP_URL, {
    headers: { 'Accept': 'application/zip, application/octet-stream, */*' }
  });
  if (!res.ok) throw new Error('GTFS static HTTP ' + res.status);

  const clone = res.clone();
  try { await cache.put(cacheReq, clone); } catch (_) {}
  const ab = await res.arrayBuffer();
  gtfsZipCache = ab;
  gtfsZipCacheAt = now;
  return ab;
}

function u16(dv, p) { return dv.getUint16(p, true); }
function u32(dv, p) { return dv.getUint32(p, true); }

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Brak DecompressionStream w środowisku Workera');
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipSelectedText(arrayBuffer, wantedNames) {
  const wanted = new Set(wantedNames);
  const result = {};
  const bytes = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);

  let eocd = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 66000); p--) {
    if (u32(dv, p) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('Nie znaleziono końca ZIP');

  const cdCount = u16(dv, eocd + 10);
  let cdPos = u32(dv, eocd + 16);
  const decoder = new TextDecoder('utf-8');

  for (let i = 0; i < cdCount; i++) {
    if (u32(dv, cdPos) !== 0x02014b50) throw new Error('Błędny central directory ZIP');
    const method = u16(dv, cdPos + 10);
    const compSize = u32(dv, cdPos + 20);
    const nameLen = u16(dv, cdPos + 28);
    const extraLen = u16(dv, cdPos + 30);
    const commentLen = u16(dv, cdPos + 32);
    const localOffset = u32(dv, cdPos + 42);
    const name = decoder.decode(bytes.slice(cdPos + 46, cdPos + 46 + nameLen));

    if (wanted.has(name)) {
      if (u32(dv, localOffset) !== 0x04034b50) throw new Error('Błędny lokalny nagłówek ZIP dla ' + name);
      const lfNameLen = u16(dv, localOffset + 26);
      const lfExtraLen = u16(dv, localOffset + 28);
      const dataStart = localOffset + 30 + lfNameLen + lfExtraLen;
      const compressed = bytes.slice(dataStart, dataStart + compSize);
      let plain;
      if (method === 0) plain = compressed;
      else if (method === 8) plain = await inflateRaw(compressed);
      else throw new Error('Nieobsługiwana kompresja ZIP ' + method + ' dla ' + name);
      result[name] = decoder.decode(plain);
      if (Object.keys(result).length === wanted.size) break;
    }

    cdPos += 46 + nameLen + extraLen + commentLen;
  }

  return result;
}

async function getGtfsIndex() {
  const now = Date.now();
  if (gtfsIndexCache && now - gtfsIndexCacheAt < 30 * 60 * 1000) return gtfsIndexCache;

  const ab = await getGtfsZipArrayBuffer();
  const files = await unzipSelectedText(ab, ['stops.txt', 'routes.txt', 'trips.txt', 'calendar.txt', 'calendar_dates.txt']);

  const stopsByPublicId = new Map();
  const stopsByStopId = new Map();
  parseCsvRows(files['stops.txt'] || '', (cells, idx) => {
    const stop_id = getCell(cells, idx, 'stop_id');
    const stop_code = getCell(cells, idx, 'stop_code');
    const stop_name = getCell(cells, idx, 'stop_name');
    const parent_station = getCell(cells, idx, 'parent_station');
    const obj = { stop_id, stop_code, stop_name, parent_station };
    stopsByStopId.set(String(stop_id), obj);
    for (const key of [stop_id, stop_code]) {
      if (!key) continue;
      const k = String(key);
      if (!stopsByPublicId.has(k)) stopsByPublicId.set(k, new Set());
      stopsByPublicId.get(k).add(String(stop_id));
    }
  });

  const routes = new Map();
  parseCsvRows(files['routes.txt'] || '', (cells, idx) => {
    const route_id = getCell(cells, idx, 'route_id');
    routes.set(String(route_id), {
      route_id,
      short: getCell(cells, idx, 'route_short_name'),
      long: getCell(cells, idx, 'route_long_name')
    });
  });

  const trips = new Map();
  parseCsvRows(files['trips.txt'] || '', (cells, idx) => {
    const trip_id = getCell(cells, idx, 'trip_id');
    const route_id = getCell(cells, idx, 'route_id');
    const service_id = getCell(cells, idx, 'service_id');
    trips.set(String(trip_id), {
      trip_id,
      route_id,
      service_id,
      headsign: getCell(cells, idx, 'trip_headsign')
    });
  });

  const calendar = new Map();
  parseCsvRows(files['calendar.txt'] || '', (cells, idx) => {
    const service_id = getCell(cells, idx, 'service_id');
    calendar.set(String(service_id), {
      service_id,
      monday: getCell(cells, idx, 'monday'),
      tuesday: getCell(cells, idx, 'tuesday'),
      wednesday: getCell(cells, idx, 'wednesday'),
      thursday: getCell(cells, idx, 'thursday'),
      friday: getCell(cells, idx, 'friday'),
      saturday: getCell(cells, idx, 'saturday'),
      sunday: getCell(cells, idx, 'sunday'),
      start_date: getCell(cells, idx, 'start_date'),
      end_date: getCell(cells, idx, 'end_date')
    });
  });

  const calendarDates = new Map();
  parseCsvRows(files['calendar_dates.txt'] || '', (cells, idx) => {
    const service_id = getCell(cells, idx, 'service_id');
    const date = getCell(cells, idx, 'date');
    const exception_type = getCell(cells, idx, 'exception_type');
    if (!date || !service_id) return;
    if (!calendarDates.has(date)) calendarDates.set(date, new Map());
    calendarDates.get(date).set(String(service_id), String(exception_type));
  });

  gtfsIndexCache = { stopsByPublicId, stopsByStopId, routes, trips, calendar, calendarDates };
  gtfsIndexCacheAt = now;
  return gtfsIndexCache;
}

function activeServices(index, wp) {
  const active = new Set();
  const field = dayField(wp.weekday);
  for (const [serviceId, cal] of index.calendar.entries()) {
    if (cal.start_date && wp.compact < cal.start_date) continue;
    if (cal.end_date && wp.compact > cal.end_date) continue;
    if (String(cal[field]) === '1') active.add(serviceId);
  }
  const exceptions = index.calendarDates.get(wp.compact);
  if (exceptions) {
    for (const [sid, typ] of exceptions.entries()) {
      if (typ === '1') active.add(sid);
      if (typ === '2') active.delete(sid);
    }
  }
  return active;
}

async function getGtfsRtDelays() {
  const now = Date.now();
  if (rtCache && now - rtCacheAt < 25 * 1000) return rtCache;

  let delays = {};
  let ok = false;
  let error = null;
  try {
    const res = await fetch(GTFS_RT_URL);
    if (!res.ok) throw new Error('GTFS-RT HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const data = new Uint8Array(buf);

    function readVarint(data, pos) {
      let result = 0, shift = 0;
      while (pos < data.length) {
        const b = data[pos++];
        result |= (b & 0x7F) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      return [result, pos];
    }
    function readMessage(data, start, end) {
      const fields = {};
      let pos = start;
      while (pos < end) {
        let tag, val;
        [tag, pos] = readVarint(data, pos);
        const fieldNum = tag >> 3;
        const wireType = tag & 0x7;
        if (wireType === 0) {
          [val, pos] = readVarint(data, pos);
          (fields[fieldNum] = fields[fieldNum] || []).push(val);
        } else if (wireType === 2) {
          let len;
          [len, pos] = readVarint(data, pos);
          val = data.slice(pos, pos + len);
          pos += len;
          (fields[fieldNum] = fields[fieldNum] || []).push(val);
        } else if (wireType === 1) pos += 8;
        else if (wireType === 5) pos += 4;
        else break;
      }
      return fields;
    }
    function getString(bytes) {
      try { return new TextDecoder().decode(bytes); } catch { return ''; }
    }

    const feed = readMessage(data, 0, data.length);
    for (const entityBytes of (feed[2] || [])) {
      const entity = readMessage(entityBytes, 0, entityBytes.length);
      for (const tuBytes of (entity[3] || [])) {
        const tu = readMessage(tuBytes, 0, tuBytes.length);
        let tripId = '';
        for (const tdBytes of (tu[1] || [])) {
          const td = readMessage(tdBytes, 0, tdBytes.length);
          for (const v of (td[1] || [])) if (v instanceof Uint8Array) tripId = getString(v);
        }
        if (!tripId) continue;
        for (const stuBytes of (tu[2] || [])) {
          const stu = readMessage(stuBytes, 0, stuBytes.length);
          const stopSeq = (stu[1] || [])[0];
          if (stopSeq == null) continue;
          let delaySec = null;
          for (const arrBytes of (stu[2] || [])) {
            const arr = readMessage(arrBytes, 0, arrBytes.length);
            for (const dv of (arr[1] || [])) delaySec = (dv >> 1) ^ -(dv & 1);
          }
          for (const depBytes of (stu[3] || [])) {
            const dep = readMessage(depBytes, 0, depBytes.length);
            for (const dv of (dep[1] || [])) delaySec = (dv >> 1) ^ -(dv & 1);
          }
          if (delaySec == null) continue;
          if (!delays[tripId]) delays[tripId] = {};
          delays[tripId][String(stopSeq)] = delaySec;
        }
      }
    }
    ok = true;
  } catch (e) {
    error = e.message;
  }

  rtCache = { ok, error, delays, updated: minToHHMM(warsawParts().nowMin) };
  rtCacheAt = now;
  return rtCache;
}

async function buildDeparturesForStopIds(publicStopIds, limit = 12) {
  const wp = warsawParts();
  const index = await getGtfsIndex();
  const active = activeServices(index, wp);
  const rt = await getGtfsRtDelays();

  const wantedStopIds = new Set();
  const requested = [];
  for (const raw of publicStopIds) {
    const key = String(raw);
    requested.push(key);
    if (index.stopsByPublicId.has(key)) {
      for (const sid of index.stopsByPublicId.get(key)) wantedStopIds.add(sid);
    }
    if (index.stopsByStopId.has(key)) wantedStopIds.add(key);
  }

  if (!wantedStopIds.size) {
    return {
      requested,
      matchedStopIds: [],
      departures: [],
      source: 'none',
      timeType: 'NONE',
      error: 'Nie znaleziono stop_id/stop_code w GTFS static'
    };
  }

  const ab = await getGtfsZipArrayBuffer();
  const files = await unzipSelectedText(ab, ['stop_times.txt']);
  const departures = [];

  parseCsvRows(files['stop_times.txt'] || '', (cells, idx) => {
    const stop_id = String(getCell(cells, idx, 'stop_id'));
    if (!wantedStopIds.has(stop_id)) return;

    const trip_id = String(getCell(cells, idx, 'trip_id'));
    const trip = index.trips.get(trip_id);
    if (!trip || !active.has(String(trip.service_id))) return;

    const depRaw = getCell(cells, idx, 'departure_time') || getCell(cells, idx, 'arrival_time');
    const plannedMin = timeToMin(depRaw);
    if (plannedMin == null) return;

    const stop_sequence = String(getCell(cells, idx, 'stop_sequence') || '');
    const delaySec = rt.delays?.[trip_id]?.[stop_sequence];
    const delayMin = delaySec == null ? 0 : Math.round(delaySec / 60);
    const actualMin = plannedMin + delayMin;

    // Pokazuj najbliższe odjazdy: także te z opóźnieniem, które planowo są już po czasie.
    const diffMin = actualMin - wp.nowMin;
    if (diffMin < -3 || diffMin > 180) return;

    const route = index.routes.get(String(trip.route_id)) || {};
    const line = route.short || route.long || '';
    const headsign = trip.headsign || route.long || '';

    departures.push({
      line,
      direction: headsign,
      headsign,
      planned: minToHHMM(plannedMin),
      actual: actualMin,
      time: minToHHMM(actualMin),
      diffMin,
      delay: Math.max(0, delayMin),
      minutes: minutesLabel(diffMin),
      tripId: trip_id,
      stopId: stop_id,
      stopSequence: stop_sequence,
      source: delaySec == null ? 'gtfs-static' : 'gtfs-rt',
      timeType: delaySec == null ? 'PLAN' : 'RT'
    });
  });

  departures.sort((a, b) => a.diffMin - b.diffMin || String(a.line).localeCompare(String(b.line), 'pl'));

  return {
    requested,
    matchedStopIds: Array.from(wantedStopIds),
    departures: departures.slice(0, limit),
    source: departures.some(d => d.timeType === 'RT') ? 'gtfs-rt+static' : 'gtfs-static',
    timeType: departures.some(d => d.timeType === 'RT') ? 'MIXED' : 'PLAN',
    rtStatus: rt.ok ? 'OK' : ('ERROR: ' + (rt.error || 'unknown'))
  };
}

async function handleSdip(url) {
  const stopId = url.searchParams.get('stop') || '';
  if (!stopId) return json({ error: 'Brak stop' }, 400);
  const out = await buildDeparturesForStopIds([stopId], Number(url.searchParams.get('limit') || 12));
  return json({
    stopId,
    updated: warsawParts().hour.toString().padStart(2, '0') + ':' + warsawParts().minute.toString().padStart(2, '0'),
    source: out.source,
    timeType: out.timeType,
    rtStatus: out.rtStatus,
    matchedStopIds: out.matchedStopIds,
    error: out.error || null,
    departures: out.departures,
    debug: {
      requested: out.requested,
      matchedStopIds: out.matchedStopIds,
      departures: out.departures.length
    }
  });
}

async function handleTgzm() {
  const groups = {};
  const allStopIds = [];
  const stopToGroups = new Map();

  for (const [groupId, group] of Object.entries(GROUPS)) {
    groups[groupId] = { name: group.name, deps: [] };
    for (const [stopId] of group.stops) {
      allStopIds.push(stopId);
      if (!stopToGroups.has(String(stopId))) stopToGroups.set(String(stopId), []);
      stopToGroups.get(String(stopId)).push(groupId);
    }
  }

  const out = await buildDeparturesForStopIds(allStopIds, 200);
  for (const d of out.departures) {
    const keys = stopToGroups.get(String(d.stopId)) || [];
    for (const groupId of keys) groups[groupId].deps.push(d);
  }
  for (const group of Object.values(groups)) group.deps = group.deps.slice(0, 10);

  return json({
    groups,
    updated: warsawParts().hour.toString().padStart(2, '0') + ':' + warsawParts().minute.toString().padStart(2, '0'),
    source: out.source,
    timeType: out.timeType,
    rtStatus: out.rtStatus,
    debug: {
      matchedStopIds: out.matchedStopIds.length,
      departures: out.departures.length,
      gtfsStatic: GTFS_ZIP_URL
    }
  });
}

export async function onRequest(context) {
  const request = context.request;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  KEY = context.env.PLK_API_KEY || context.env.PDP_API_KEY || KEY || '';
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';

  try {
    if (url.pathname !== '/api') return fetch(request);

    if (action === 'limit') {
      if (!KEY) return json({ error: 'Brak zmiennej środowiskowej PLK_API_KEY' }, 500);
      const res = await fetch(PLK_BASE + '/operations?stations=73312&pageSize=1&withPlanned=false', { headers: { 'X-API-Key': KEY } });
      return json({
        hourly_remaining: res.headers.get('X-RateLimit-Hourly-Remaining') || '?',
        hourly_limit: res.headers.get('X-RateLimit-Hourly-Limit') || '?',
        daily_remaining: res.headers.get('X-RateLimit-Daily-Remaining') || '?',
        daily_limit: res.headers.get('X-RateLimit-Daily-Limit') || '?'
      });
    }

    if (action === 'sdip') return await handleSdip(url);
    if (action === 'tgzm') return await handleTgzm();

    return json({ error: 'Nieznana akcja', action }, 400);
  } catch (e) {
    return json({
      error: e.message || String(e),
      action,
      hint: 'Błąd backendu /api. Jeśli dotyczy TGZM, sprawdź czy Worker może pobrać i rozpakować GTFS static.'
    }, 500);
  }
}
