// Budowanie danych „Przesiadki GZM” — uruchamiane codziennie (GitHub Action)
// i ręcznie:
//   node tools/gzm/build.mjs                 dane na `days` dni od dziś (Polska)
//   node tools/gzm/build.mjs --date=2026-11-02   od wskazanego dnia
//   node tools/gzm/build.mjs --only=73312,71001  tylko wybrane stacje PLK
//   node tools/gzm/build.mjs --refresh-osm       ponownie pobierz stacje z OSM
//   node tools/gzm/build.mjs --full-walk         przelicz wszystkie dojścia piesze
//
// Wynik: tools/gzm/out/ (index.json, stations/<id>.json, raport.json, raport.html)
// — Action wypycha go na gałąź `gzm-data`. Jeśli coś się nie uda albo walidacja
// nie przejdzie, out/ NIE jest nadpisywany (najpierw budujemy do out.tmp/).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as G from "./gtfs.mjs";
import * as W from "./walk.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, "config.json"), "utf8"));
const ROOT = path.resolve(DIR, "../..");
const CACHE = path.join(DIR, ".cache"), ZIPS = path.join(CACHE, "zips");
const OUT = path.join(DIR, "out"), TMP = path.join(DIR, "out.tmp");
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] == null ? true : m[2]] : [a, true]; }));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const T0 = Date.now();
fs.mkdirSync(ZIPS, { recursive: true });

function warsawToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const norm = s => String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return d; } };
const writeJson = (f, o, pretty) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, pretty ? 1 : 0)); };

// ---------- A. pliki ZIP z portalu ----------
async function fetchZips() {
  const res = await fetch(CFG.packageApi, { headers: { "User-Agent": W.UA } });
  if (!res.ok) throw new Error("API portalu: HTTP " + res.status);
  const j = await res.json();
  const list = j.result.resources.filter(r => /\.zip$/i.test(r.url || "") || (r.format || "").toUpperCase() === "ZIP");
  for (const r of list) {
    const f = path.join(ZIPS, r.name.replace(/[^\w.-]+/g, "_"));
    if (fs.existsSync(f) && fs.statSync(f).size > 1000) continue;
    log("pobieram", r.name);
    const z = await fetch(r.url, { headers: { "User-Agent": W.UA } });
    if (!z.ok) throw new Error(r.name + ": HTTP " + z.status);
    fs.writeFileSync(f + ".part", Buffer.from(await z.arrayBuffer()));
    fs.renameSync(f + ".part", f);
  }
  const names = new Set(list.map(r => r.name.replace(/[^\w.-]+/g, "_")));
  // stare ZIP-y (już nie na portalu) usuwamy z pamięci podręcznej
  for (const f of fs.readdirSync(ZIPS)) if (f.endsWith(".zip") && !names.has(f)) fs.unlinkSync(path.join(ZIPS, f));
  return [...names].map(n => path.join(ZIPS, n)).map(zip => {
    const fi = G.readTable(zip, "feed_info.txt")[0] || {};
    return { zip, name: path.basename(zip), from: G.iso(fi.feed_start_date || "00000000"), to: G.iso(fi.feed_end_date || "00000000"), version: fi.feed_version || "" };
  });
}
// Dla każdej daty: NAJNOWSZY plik, który ją obejmuje (nazwy rosną z numerem wersji).
function zipForDate(zips, d) {
  return zips.filter(z => z.from <= d && d <= z.to).sort((a, b) => b.name.localeCompare(a.name))[0] || null;
}

// ---------- C. stacje PLK na obszarze GZM (OSM → numer PLK) ----------
async function loadStations() {
  const f = path.join(DIR, "stations-osm.json");
  if (fs.existsSync(f) && !args["refresh-osm"]) return JSON.parse(fs.readFileSync(f, "utf8"));
  const [s, w, n, e] = CFG.bbox;
  const q = `[out:json][timeout:120];(node["railway"~"^(station|halt)$"](${s},${w},${n},${e});way["railway"~"^(station|halt)$"](${s},${w},${n},${e});node["public_transport"="station"]["train"="yes"](${s},${w},${n},${e}););out center tags;`;
  const osm = await W.fetchOverpass(q);
  const plk = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stations-pl.json"), "utf8")).stations;
  const byName = new Map(plk.map(([id, nm]) => [norm(nm), { id, nm }]));
  const out = new Map(), unmatched = [];
  for (const el of osm.elements) {
    const t = el.tags || {};
    if (!t.name || t.station === "tram" || t.station === "light_rail" || (t.tram === "yes" && t.train !== "yes")) continue;
    if (/wąskotor/i.test(t.name) || t.usage === "tourism") continue;
    const p = byName.get(norm(t.name));
    if (!p) { unmatched.push(t.name); continue; }
    if (out.has(p.id)) continue;
    out.set(p.id, { id: p.id, name: p.nm, lat: el.lat || el.center.lat, lon: el.lon || el.center.lon, osm: el.type[0] + el.id });
  }
  const list = { generated: new Date().toISOString(), stations: [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "pl")), unmatched: [...new Set(unmatched)].sort() };
  writeJson(f, list, true);
  return list;
}

// ---------- D. przystanki GZM (bez technicznych i granicznych) ----------
function loadStops(zip) {
  const ext = new Map(G.readTable(zip, "stops_ext.txt").map(r => [r.stop_id, r]));
  return G.readTable(zip, "stops.txt").map(r => {
    const x = ext.get(r.stop_id) || {};
    const attrs = String(x.stop_attribute_ids || "").split("_");
    return { id: r.stop_id, code: r.stop_code, name: r.stop_name, lat: +r.stop_lat, lon: +r.stop_lon, url: r.stop_url || "", types: String(x.stop_vehicle_type_ids || "").split("_").filter(Boolean).map(Number), bad: /\[tech\]/i.test(r.stop_name) || attrs.includes("5") || attrs.includes("6") };
  }).filter(s => !s.bad && isFinite(s.lat) && isFinite(s.lon));
}

// ---------- F. dojścia piesze (z pamięcią podręczną) ----------
async function computeWalks(stations, stopsByCode, cache) {
  let osmCalls = 0, osmSeconds = 0;
  for (const st of stations) {
    const cands = [...stopsByCode.values()].map(s => ({ s, straight: Math.round(W.haversine(st, s)) })).filter(x => x.straight <= CFG.candidateRadiusM);
    st.candidates = cands.map(c => c.s.code);
    const missing = cands.filter(c => !cache.entries[st.id + "|" + c.s.code]);
    if (!cands.length || (!missing.length && !args["full-walk"])) continue;
    log(`dojścia: ${st.name} (${cands.length} kandydatów, nowych ${missing.length})`);
    let g = null, plats = [], err = null;
    const t0 = Date.now();
    try {
      const osm = await W.fetchOverpass(W.overpassQuery(st.lat, st.lon, CFG.overpassRadiusM));
      osmCalls++;
      g = W.buildGraph(osm);
      plats = g.platforms.filter(p => p.center && W.haversine(p.center, st) < 450);
      // Mała stacja bez peronów w OSM: start z sieci pieszej w promieniu 120 m od punktu stacji.
      if (!plats.length) {
        const near = [...g.adj.keys()].filter(id => W.haversine(g.nodes.get(id), st) <= 120);
        if (near.length) plats = [{ ref: "", startIds: near, center: { lat: st.lat, lon: st.lon }, approx: true }];
      }
    } catch (e) { err = String(e.message || e); }
    osmSeconds += (Date.now() - t0) / 1000;
    const per = plats.map(p => W.dijkstra(g, p.startIds, 1500));
    cache.stations[st.id] = { at: new Date().toISOString(), platforms: plats.map(p => ({ ref: p.ref, c: p.center && [+p.center.lat.toFixed(6), +p.center.lon.toFixed(6)] })), error: err };
    for (const c of (args["full-walk"] ? cands : missing)) {
      const res = per.map((b, i) => { const r = W.reachPoint(g, b, c.s, 60); return r && Object.assign(r, { plat: plats[i].ref, i }); }).filter(Boolean);
      const e = { straight: c.straight, at: new Date().toISOString().slice(0, 10) };
      if (res.length) {
        const mins = res.map(r => Math.max(2, Math.ceil(r.s / 60)));
        const best = res.reduce((a, b) => a.s < b.s ? a : b);
        const p = W.pathTo(g, per[best.i], best.id);
        Object.assign(e, { src: plats[0] && plats[0].approx ? "osm-stacja" : "osm", m: Math.round(best.m), min: Math.min(...mins), max: Math.max(...mins), byPlat: Object.fromEntries(res.map((r, k) => [r.plat || String(k + 1), mins[k]])), obst: p.obstacles, pts: simplify(p.pts.concat([[+c.s.lat.toFixed(6), +c.s.lon.toFixed(6)]])) });
        if (best.m > CFG.suspiciousRatio * Math.max(c.straight, 40)) e.check = "trasa ponad " + CFG.suspiciousRatio + "× dłuższa niż prosto";
      } else {
        const fm = Math.max(2, Math.ceil(c.straight * CFG.fallbackFactor / W.WALK_SPEED / 60));
        Object.assign(e, { src: "fallback", m: Math.round(c.straight * CFG.fallbackFactor), min: fm, max: fm, obst: [], check: err ? "błąd OSM: " + err : (plats.length ? "brak trasy pieszej z peronu" : "brak peronów w OSM") });
      }
      cache.entries[st.id + "|" + c.s.code] = e;
    }
    await new Promise(r => setTimeout(r, 3000));   // grzecznie wobec Overpass
  }
  return { osmCalls, osmSeconds };
}
// Uproszczenie łamanej (co ~8 m) — mniejszy raport.
function simplify(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const a = out[out.length - 1], b = pts[i]; if (W.haversine({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }) >= 8) out.push(b); }
  if (pts.length > 1) out.push(pts[pts.length - 1]);
  return out;
}

// ---------- G. przypisanie przystanków do stacji (+ ręczne poprawki) ----------
function assign(stations, stopsByCode, cache, overrides) {
  for (const st of stations) {
    const ov = overrides[String(st.id)] || {};
    const remove = new Set(ov.remove || []);
    const codes = new Set((st.candidates || []).filter(code => { const e = cache.entries[st.id + "|" + code]; return e && e.max <= CFG.maxWalkMin; }));
    for (const c of ov.add || []) codes.add(c);
    for (const c of remove) codes.delete(c);
    st.stops = [...codes].map(code => {
      const s = stopsByCode.get(code); if (!s) return null;
      const e = cache.entries[st.id + "|" + code] || { straight: Math.round(W.haversine(st, s)), src: "override" };
      const w = ov.walk && ov.walk[code];
      return { code, id: s.id, name: s.name, lat: s.lat, lon: s.lon, url: s.url, types: s.types, byPlat: w ? undefined : e.byPlat, min: w ? w[0] : e.min, max: w ? w[1] : e.max, stairs: (e.obst || []).includes("schody") || undefined, src: w ? "override" : e.src };
    }).filter(Boolean).sort((a, b) => a.min - b.min || a.max - b.max || a.name.localeCompare(b.name, "pl"));
  }
}

// ---------- H. odjazdy z przystanków stacji na kolejne dni ----------
async function buildDepartures(dates, zipsFor, wantedIds) {
  // dla dnia D potrzebujemy kursów dnia rozkładowego D oraz D−1 (godziny ≥ 24:00)
  const serviceDays = [G.addDays(dates[0], -1), ...dates];
  const byZip = new Map();
  for (const d of serviceDays) { const z = zipsFor(d); if (z) (byZip.get(z.zip) || byZip.set(z.zip, { z, days: [] }).get(z.zip)).days.push(d); }
  const dep = new Map();  // stopId → [{date, min, line, head, type, trip, seq}]
  const arrivals = new Map();  // stopId → [{date, min, m0, line, type, head, trip, seq, up}]
  const seen = new Set(), seenA = new Set();
  for (const { z, days } of byZip.values()) {
    log("rozkład", z.name, "dni:", days.join(", "));
    const cal = G.readTable(z.zip, "calendar.txt"), cd = G.readTable(z.zip, "calendar_dates.txt");
    const routes = new Map(G.readTable(z.zip, "routes.txt").map(r => [r.route_id, { short: r.route_short_name, type: +r.route_type }]));
    const trips = new Map(G.readTable(z.zip, "trips.txt").map(t => [t.trip_id, { route: t.route_id, service: t.service_id, head: t.trip_headsign }]));
    const active = days.map(d => ({ d, on: G.activeServices(cal, cd, d) }));
    const ids = wantedIds(z);
    const local = [];   // odjazdy z tego pliku — do dopisania dalszych przystanków
    const localA = [];  // przyjazdy — do dopisania wcześniejszych przystanków
    await G.streamTable(z.zip, "stop_times.txt", r => {
      if (!ids.has(r.stop_id)) return;
      if (r.drop_off_type !== "1" && +r.stop_sequence > 0) {
        const ta = trips.get(r.trip_id), ma = G.hmsMin(r.arrival_time || r.departure_time);
        if (ta && ma != null) {
          const rta = routes.get(ta.route) || { short: "?", type: 3 };
          for (const { d, on } of active) {
            if (!on.has(ta.service)) continue;
            const date = G.addDays(d, Math.floor(ma / 1440)), min = ma % 1440;
            if (date < dates[0] || date > dates[dates.length - 1]) continue;
            const ka = r.stop_id + "|" + date + "|" + min + "|" + rta.short + "|" + ta.head;
            if (seenA.has(ka)) continue; seenA.add(ka);
            const xa = { date, min, m0: ma, line: rta.short, type: rta.type, head: ta.head, trip: r.trip_id, seq: +r.stop_sequence };
            (arrivals.get(r.stop_id) || arrivals.set(r.stop_id, []).get(r.stop_id)).push(xa);
            localA.push(xa);
          }
        }
      }
      if (r.pickup_type === "1") return;
      const t = trips.get(r.trip_id); if (!t) return;
      const m0 = G.hmsMin(r.departure_time || r.arrival_time); if (m0 == null) return;
      const rt = routes.get(t.route) || { short: "?", type: 3 };
      for (const { d, on } of active) {
        if (!on.has(t.service)) continue;
        const date = G.addDays(d, Math.floor(m0 / 1440)), min = m0 % 1440;
        if (date < dates[0] || date > dates[dates.length - 1]) continue;
        // duplikaty (ten sam przystanek, godzina, linia, kierunek) — wypadają
        const key = r.stop_id + "|" + date + "|" + min + "|" + rt.short + "|" + t.head;
        if (seen.has(key)) continue; seen.add(key);
        const x = { date, min, m0, line: rt.short, type: rt.type, head: t.head, trip: r.trip_id, seq: +r.stop_sequence };
        (dep.get(r.stop_id) || dep.set(r.stop_id, []).get(r.stop_id)).push(x);
        local.push(x);
      }
    });
    // Drugi przebieg: całe kursy (tylko te, które odjeżdżają spod stacji) →
    // dla każdego odjazdu dalsze przystanki z czasem jazdy (do DOWN_MAX min).
    // Linia okrężna mija przystanek dwa razy — bierzemy PIERWSZE wystąpienie.
    const want = new Set(local.map(x => x.trip).concat(localA.map(x => x.trip))), seqs = new Map();
    await G.streamTable(z.zip, "stop_times.txt", r => {
      if (!want.has(r.trip_id)) return;
      (seqs.get(r.trip_id) || seqs.set(r.trip_id, []).get(r.trip_id)).push([+r.stop_sequence, r.stop_id, G.hmsMin(r.arrival_time || r.departure_time), r.drop_off_type === "1", G.hmsMin(r.departure_time || r.arrival_time), r.pickup_type === "1"]);
    });
    const names = new Map(loadStops(z.zip).map(st => [st.id, st.name]));
    for (const rows of seqs.values()) rows.sort((a, b) => a[0] - b[0]);
    for (const x of local) {
      const rows = seqs.get(x.trip) || [], seen2 = new Set(), down = [];
      for (const [sq, sid, arr, noDrop] of rows) {
        if (sq <= x.seq || arr == null || noDrop) continue;
        const off = arr - x.m0; if (off > DOWN_MAX) break;
        const n = names.get(sid); if (!n || seen2.has(n)) continue;
        seen2.add(n); down.push([n, off]);
      }
      x.down = down;
    }
    // Wcześniejsze przystanki (skąd można było wsiąść): od stacji wstecz, do UP_MAX min;
    // linia okrężna — bierzemy NAJBLIŻSZE wystąpienie przed stacją (najkrótsza jazda).
    for (const x of localA) {
      const rows = seqs.get(x.trip) || [], seen3 = new Set(), up = [];
      for (let i = rows.length - 1; i >= 0; i--) {
        const [sq, sid, , , dep, noPick] = rows[i];
        if (sq >= x.seq || dep == null || noPick) continue;
        const off = x.m0 - dep; if (off > UP_MAX) break;
        const n = names.get(sid); if (!n || seen3.has(n)) continue;
        seen3.add(n); up.push([n, off]);
      }
      x.up = up;
    }
  }
  return { dep, arrivals };
}

const DOWN_MAX = 120;   // dalsze przystanki kursu: do 2 h jazdy
const UP_MAX = 90;      // wcześniejsze przystanki kursu (dojazd pod stację): do 1,5 h

// ---------- główny przebieg ----------
async function main() {
  const start = args.date || warsawToday();
  const dates = Array.from({ length: CFG.days }, (_, i) => G.addDays(start, i));
  log("dni:", dates.join(", "));

  const zips = await fetchZips();
  const zipsFor = d => zipForDate(zips, d);
  const missingDays = dates.filter(d => !zipsFor(d));
  if (missingDays.length === dates.length) throw new Error("żaden plik rozkładu nie obejmuje dni " + dates.join(", "));

  const stationsAll = (await loadStations()).stations;
  const only = args.only ? new Set(String(args.only).split(",").map(Number)) : null;
  const stations = stationsAll.filter(s => !only || only.has(s.id)).map(s => Object.assign({}, s));

  // przystanki: z najnowszego pliku dla każdego dnia (kod przystanku jako klucz)
  const stopsByCode = new Map();
  for (const d of dates) { const z = zipsFor(d); if (z) for (const s of loadStops(z.zip)) if (!stopsByCode.has(s.code)) stopsByCode.set(s.code, s); }
  log("przystanków GZM:", stopsByCode.size, "stacji:", stations.length);

  const cacheF = path.join(DIR, "walk-cache.json");
  const cache = readJson(cacheF, { v: 1, entries: {}, stations: {} });
  const t0 = Date.now();
  const walkStats = await computeWalks(stations, stopsByCode, cache);
  writeJson(cacheF, cache, false);
  const walkSeconds = (Date.now() - t0) / 1000;

  const overrides = readJson(path.join(DIR, "station-overrides.json"), {});
  assign(stations, stopsByCode, cache, overrides);

  // odjazdy: stop_id bywa inny w różnych plikach — szukamy po kodzie przystanku
  const wantedCodes = new Set(stations.flatMap(s => s.stops.map(x => x.code)));
  const idsByZip = new Map();
  const wantedIds = z => {
    if (!idsByZip.has(z.zip)) idsByZip.set(z.zip, new Set(loadStops(z.zip).filter(s => wantedCodes.has(s.code)).map(s => s.id)));
    return idsByZip.get(z.zip);
  };
  const codeById = new Map();
  for (const z of new Set(dates.map(zipsFor).filter(Boolean))) for (const s of loadStops(z.zip)) codeById.set(s.id, s.code);
  const built = await buildDepartures(dates, zipsFor, wantedIds), dep = built.dep;
  const depByCode = new Map();
  for (const [id, list] of dep) { const c = codeById.get(id); if (c) (depByCode.get(c) || depByCode.set(c, []).get(c)).push(...list); }
  const arrByCode = new Map();
  for (const [id, list] of built.arrivals) { const c = codeById.get(id); if (c) (arrByCode.get(c) || arrByCode.set(c, []).get(c)).push(...list); }
  const feeders = new Map();   // nazwa przystanku → Map(stacja → najkrótsza jazda pod stację)

  // ---------- zapis (najpierw do out.tmp/) ----------
  fs.rmSync(TMP, { recursive: true, force: true });
  const gen = new Date().toISOString();
  const index = { v: 1, generated: gen, range: [dates[0], dates[dates.length - 1]], missingDays, sources: [...new Set(dates.map(zipsFor).filter(Boolean).map(z => z.version))], license: "Źródło danych rozkładowych: ZTM GZM (CC BY 4.0)", dataset: CFG.datasetUrl, maxWalkMin: CFG.maxWalkMin, stations: [] };
  let biggest = { id: null, kb: 0 }, totalDeps = 0;
  for (const st of stations) {
    const lines = [], lineIdx = new Map(), days = {};
    const dsNames = [], dsIdx = new Map(), pats = [], patIdx = new Map();
    const patOf = down => {
      if (!down || !down.length) return -1;
      const flat = [];
      for (const [n, off] of down) { if (!dsIdx.has(n)) { dsIdx.set(n, dsNames.length); dsNames.push(n); } flat.push(dsIdx.get(n), off); }
      const k = flat.join(",");
      if (!patIdx.has(k)) { patIdx.set(k, pats.length); pats.push(flat); }
      return patIdx.get(k);
    };
    for (const d of dates) days[d] = [];
    st.stops.forEach((s, si) => {
      for (const x of depByCode.get(s.code) || []) {
        const lk = x.line + "|" + x.type + "|" + x.head;
        if (!lineIdx.has(lk)) { lineIdx.set(lk, lines.length); lines.push([x.line, x.type, x.head]); }
        days[x.date].push([x.min, lineIdx.get(lk), si, x.trip, x.seq, patOf(x.down)]);
      }
    });
    for (const d of dates) { days[d].sort((a, b) => a[0] - b[0]); totalDeps += days[d].length; }
    const file = { v: 1, id: st.id, name: st.name, generated: gen, range: index.range, stops: st.stops.map(s => ({ c: s.code, n: s.name, lat: s.lat, lon: s.lon, w: [s.min, s.max], p: s.byPlat, stairs: s.stairs, u: s.url, src: s.src })), lines, days, ds: dsNames, pt: pats };
    const txt = JSON.stringify(file);
    if (st.stops.length) {
      fs.mkdirSync(path.join(TMP, "stations"), { recursive: true });
      fs.writeFileSync(path.join(TMP, "stations", st.id + ".json"), txt);
      if (txt.length / 1024 > biggest.kb) biggest = { id: st.id, name: st.name, kb: Math.round(txt.length / 1024) };
    }
    if (st.stops.length) {
      const aLines = [], aLineIdx = new Map(), usNames = [], usIdx = new Map(), ups = [], upIdx = new Map(), aDays = {};
      for (const d of dates) aDays[d] = [];
      const upOf = up => {
        if (!up || !up.length) return -1;
        const flat = [];
        for (const [n, off] of up) {
          if (!usIdx.has(n)) { usIdx.set(n, usNames.length); usNames.push(n); }
          flat.push(usIdx.get(n), off);
          const fm = feeders.get(n) || feeders.set(n, new Map()).get(n);
          if (!fm.has(st.id) || fm.get(st.id) > off) fm.set(st.id, off);
        }
        const k = flat.join(",");
        if (!upIdx.has(k)) { upIdx.set(k, ups.length); ups.push(flat); }
        return upIdx.get(k);
      };
      st.stops.forEach((s, si) => {
        for (const x of arrByCode.get(s.code) || []) {
          const lk = x.line + "|" + x.type + "|" + x.head;
          if (!aLineIdx.has(lk)) { aLineIdx.set(lk, aLines.length); aLines.push([x.line, x.type, x.head]); }
          aDays[x.date].push([x.min, aLineIdx.get(lk), si, x.trip, x.seq, upOf(x.up)]);
        }
      });
      for (const d of dates) aDays[d].sort((a, b) => a[0] - b[0]);
      fs.writeFileSync(path.join(TMP, "stations", st.id + "-arr.json"), JSON.stringify({ v: 1, id: st.id, name: st.name, generated: gen, range: index.range, stops: st.stops.map(s => ({ c: s.code, n: s.name, w: [s.min, s.max] })), lines: aLines, us: usNames, up: ups, days: aDays }));
    }
    index.stations.push({ id: st.id, n: st.name, lat: +st.lat.toFixed(6), lon: +st.lon.toFixed(6), s: st.stops.map(s => [s.code, s.n || s.name, s.min, s.max]) });
  }
  writeJson(path.join(TMP, "index.json"), index);
  // przystanek → stacje, do których z niego dojedziesz bez przesiadki (z najkrótszym czasem jazdy)
  const fz = {};
  for (const [n, m] of feeders) fz[n] = [...m.entries()].sort((a, b) => a[1] - b[1]).slice(0, 6);
  writeJson(path.join(TMP, "feeders.json"), { v: 1, generated: gen, stops: fz });

  // raport (dane) — z porównaniem z poprzednim
  const prev = readJson(path.join(OUT, "raport.json"), null);
  const report = buildReport(stations, stopsByCode, cache, prev, { gen, dates, walkStats, walkSeconds, biggest, totalDeps, unmatched: (readJson(path.join(DIR, "stations-osm.json"), {}).unmatched || []) });
  writeJson(path.join(TMP, "raport.json"), report);
  fs.copyFileSync(path.join(DIR, "raport.html"), path.join(TMP, "raport.html"));

  // walidacja: są stacje z przystankami i odjazdy
  const withStops = index.stations.filter(s => s.s.length).length;
  if (!only && (withStops < 20 || totalDeps < 1000)) throw new Error(`walidacja: za mało danych (stacje z przystankami: ${withStops}, odjazdów: ${totalDeps}) — out/ bez zmian`);
  if (only) { fs.rmSync(path.join(DIR, "out.only"), { recursive: true, force: true }); fs.renameSync(TMP, path.join(DIR, "out.only")); }
  else { fs.rmSync(OUT, { recursive: true, force: true }); fs.renameSync(TMP, OUT); }
  log(`gotowe w ${((Date.now() - T0) / 1000).toFixed(0)} s: stacje z przystankami ${withStops}/${index.stations.length}, odjazdów ${totalDeps}, największy plik ${biggest.name} ${biggest.kb} KB, Overpass: ${walkStats.osmCalls} zapytań / ${walkSeconds.toFixed(0)} s`);
}

function buildReport(stations, stopsByCode, cache, prev, meta) {
  const st = stations.map(s => {
    const cands = (s.candidates || []).map(code => {
      const e = cache.entries[s.id + "|" + code] || {}, stop = stopsByCode.get(code) || {};
      const kept = s.stops.some(x => x.code === code);
      return { c: code, n: stop.name, lat: stop.lat, lon: stop.lon, kept, straight: e.straight, m: e.m, min: e.min, max: e.max, byPlat: e.byPlat, obst: e.obst, src: e.src, check: e.check, pts: kept || e.check ? e.pts : undefined, u: stop.url };
    });
    return { id: s.id, n: s.name, lat: s.lat, lon: s.lon, platforms: (cache.stations[s.id] || {}).platforms || [], osmError: (cache.stations[s.id] || {}).error, cands };
  });
  // zmiany od poprzedniego raportu
  const changes = [];
  if (prev) {
    const pm = new Map(prev.stations.map(s => [s.id, new Map(s.cands.filter(c => c.kept).map(c => [c.c, c]))]));
    for (const s of st) {
      const was = pm.get(s.id) || new Map(), now = new Map(s.cands.filter(c => c.kept).map(c => [c.c, c]));
      for (const [c, x] of now) { const p = was.get(c); if (!p) changes.push({ id: s.id, n: s.n, what: "nowy", c, name: x.n }); else if (Math.abs((p.max || 0) - (x.max || 0)) >= 2) changes.push({ id: s.id, n: s.n, what: `czas ${p.min}–${p.max} → ${x.min}–${x.max} min`, c, name: x.n }); }
      for (const [c, x] of was) if (!now.has(c)) changes.push({ id: s.id, n: s.n, what: "usunięty", c, name: x.n });
    }
  }
  return { generated: meta.gen, dates: meta.dates, maxWalkMin: CFG.maxWalkMin, longWalkMin: CFG.longWalkMin, stats: { walkSeconds: Math.round(meta.walkSeconds), overpassCalls: meta.walkStats.osmCalls, biggest: meta.biggest, totalDeps: meta.totalDeps }, unmatched: meta.unmatched, changes, stations: st };
}

main().catch(e => { console.error("BŁĄD:", e && e.stack || e); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(1); });
