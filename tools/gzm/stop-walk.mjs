// TODO 71: przejścia piesze MIĘDZY przystankami (do 300 m) po prawdziwej sieci pieszej z OpenStreetMap,
// zamiast linii prostej × 1,4. Przy stanowiskach po obu stronach ulicy trzeba dojść do przejścia dla pieszych
// (np. Osiedle Wieczorka Szkoła 01 ↔ 02: ok. 40 m w linii prostej, ale przez jezdnię tylko na światłach).
//
// Zasady grafu (inne niż przy dojściu z peronu):
//  - jezdnie główne (trunk/primary/secondary/tertiary i łączniki) wyłączone, chyba że mają chodnik oznaczony na samej
//    drodze (sidewalk=both/left/right/yes) — wtedy chodnik nie jest narysowany osobno i inaczej się nie da;
//  - każda droga z chodnikiem narysowanym osobno (sidewalk=separate) wyłączona — idziemy osobnym chodnikiem;
//  - przez jezdnię tylko tam, gdzie mapa ma przejście (footway=crossing / highway=crossing), światła +30 s.
// Dane: Overpass, kafelki ok. 2,2 × 2,1 km tylko tam, gdzie są pary przystanków bez wyniku w pamięci (stop-walk-cache.json).
import * as W from "./walk.mjs";

export const PAIR_M = 300;            // jak WALK_M w gzm-raptor.js
const TILE_LAT = 0.02, TILE_LON = 0.03, MARGIN = 0.003;   // margines ~330 m — trasa może okrążać kwartał
const SNAP_M = 40;                    // przystanek → najbliższy węzeł sieci pieszej
const MAJOR = /^(trunk|primary|secondary|tertiary)(_link)?$/;
const SIDE_OK = /^(both|left|right|yes)$/;

// Overpass z twardym limitem czasu: każdy serwer najwyżej raz, po 75 s rezygnujemy (kafelek wraca następnego dnia) —
// 18.11 przy przeciążonych serwerach pojedynczy kafelek potrafił czekać 5–17 min na ponowieniach
const MIRRORS = [W.OVERPASS, "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
let mirror = 0;
async function fetchQuick(q) {
  let last = null;
  for (let i = 0; i < MIRRORS.length; i++) {
    const url = MIRRORS[(mirror + i) % MIRRORS.length], ac = new AbortController(), tm = setTimeout(() => ac.abort(), 75000);
    try {
      const r = await fetch(url, { method: "POST", signal: ac.signal, headers: { "User-Agent": W.UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
      const tx = r.ok ? await r.text() : "";
      if (r.ok && tx.startsWith("{")) { mirror = (mirror + i) % MIRRORS.length; return JSON.parse(tx); }
      last = new Error(url.split("/")[2] + " HTTP " + r.status);
    } catch (e) { last = e.name === "AbortError" ? new Error(url.split("/")[2] + " > 75 s") : e; }
    finally { clearTimeout(tm); }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw last || new Error("Overpass");
}
function sepSidewalk(t) { return [t.sidewalk, t["sidewalk:both"], t["sidewalk:left"], t["sidewalk:right"]].some(v => v === "separate"); }
export function stopWalkable(t) {
  if (!t || !t.highway) return true;          // perony itp. — decyduje walk.mjs
  if (sepSidewalk(t)) return false;
  if (MAJOR.test(t.highway) && !SIDE_OK.test(t.sidewalk || "") && !SIDE_OK.test(t["sidewalk:both"] || "") && t.foot !== "yes" && t.foot !== "designated") return false;
  return true;
}

function query(b) {
  return `[out:json][timeout:60];
(
  way["highway"](${b.s},${b.w},${b.n},${b.e});
);
(._;>;);
out body qt;`;
}

export function pairsOf(stops) {
  // stops: [{code, lat, lon}] — pary w promieniu PAIR_M (siatka jak w gzm-raptor.prepare)
  const cell = 0.003, grid = new Map(), out = [];
  stops.forEach((s, i) => { const k = Math.floor(s.lat / cell) + "," + Math.floor(s.lon / (cell * 1.6)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  stops.forEach((s, i) => {
    const gy = Math.floor(s.lat / cell), gx = Math.floor(s.lon / (cell * 1.6));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const o of grid.get((gy + dy) + "," + (gx + dx)) || []) {
      if (o <= i) continue;
      const d = W.haversine(s, stops[o]); if (d <= PAIR_M) out.push([i, o, d]);
    }
  });
  return out;
}
export const keyOf = (a, b) => a < b ? a + "|" + b : b + "|" + a;

function nearIds(g, p, maxM) {
  const out = [];
  for (const [id, e] of g.adj) {
    if (!e.length) continue; const n = g.nodes.get(id);
    if (Math.abs(n.lat - p.lat) > 0.0005 || Math.abs(n.lon - p.lon) > 0.0008) continue;
    const d = W.haversine(n, p); if (d <= maxM) out.push([id, d]);
  }
  return out.sort((a, b) => a[1] - b[1]);
}

// Wynik pary: [minuty, metry, światła, przejścia] albo [minuty z linii prostej, metry, -1] (brak trasy w mapie)
export async function computeStopWalks(stops, cache, opts = {}) {
  const log = opts.log || (() => {}), maxTiles = opts.maxTiles == null ? Infinity : opts.maxTiles, until = opts.maxMinutes ? Date.now() + opts.maxMinutes * 60000 : Infinity;
  const pairs = pairsOf(stops), today = new Date().toISOString().slice(0, 10);
  const missing = pairs.filter(([a, b]) => !cache.entries[keyOf(stops[a].code, stops[b].code)]);
  log(`przejścia między przystankami: par ${pairs.length}, do policzenia ${missing.length}`);
  const tiles = new Map();
  for (const pr of missing) { const s = stops[pr[0]], k = Math.floor(s.lat / TILE_LAT) + "," + Math.floor(s.lon / TILE_LON); (tiles.get(k) || tiles.set(k, []).get(k)).push(pr); }
  let done = 0, calls = 0;
  for (const [k, list] of tiles) {
    if (calls >= maxTiles || Date.now() > until) { log(`  limit przebiegu (${calls} kafelków) — reszta przy następnym budowaniu`); break; }
    // zapytanie tylko o obszar przystanków z tego kafelka (+ margines) — na przedmieściach znacznie mniejsze niż cały kafelek
    const pts = list.flatMap(([a, o]) => [stops[a], stops[o]]);
    const b = { s: +(Math.min(...pts.map(p => p.lat)) - MARGIN).toFixed(5), n: +(Math.max(...pts.map(p => p.lat)) + MARGIN).toFixed(5), w: +(Math.min(...pts.map(p => p.lon)) - MARGIN * 1.6).toFixed(5), e: +(Math.max(...pts.map(p => p.lon)) + MARGIN * 1.6).toFixed(5) };
    let g;
    try { calls++; const osm = process.env.GZM_OSM_CACHE ? await W.fetchOverpass(query(b)) : await fetchQuick(query(b)); g = W.buildGraph(osm, { walkable: stopWalkable }); }
    catch (e) { log(`  kafelek ${k}: błąd OSM ${e.message || e} — następnym razem`); continue; }
    const byA = new Map(); for (const pr of list) (byA.get(pr[0]) || byA.set(pr[0], []).get(pr[0])).push(pr);
    for (const [a, prs] of byA) {
      const A = stops[a], starts = nearIds(g, A, SNAP_M);
      let best = null;
      if (starts.length) {
        // start z kilku najbliższych węzłów (po tej samej stronie ulicy — jezdnie główne są wyłączone)
        const s0 = starts[0][1], ids = starts.filter(x => x[1] <= s0 + 3).map(x => x[0]);
        best = W.dijkstra(g, ids, 900);
      }
      for (const [, o, d] of prs) {
        const B = stops[o], key = keyOf(A.code, B.code);
        const est = Math.max(1, Math.ceil(d * 1.4 / 1.2 / 60));
        // cel: węzły najbliżej przystanku B (najbliższy + 10 m) — nie „dociągamy” prostą kreską przez jezdnię
        const ends = nearIds(g, B, SNAP_M), e0 = ends.length ? ends[0][1] : 0;
        let r = null;
        if (best) for (const [id, dd] of ends) { if (dd > e0 + 3) break; const x = best.get(id); if (x && (!r || x.s + dd / W.WALK_SPEED < r.s)) r = { id, s: x.s + dd / W.WALK_SPEED, m: x.m + dd }; }
        if (!r || r.m > 6 * Math.max(d, 50) + 300) { cache.entries[key] = [est, Math.round(d * 1.4), -1, 0, today]; continue; }
        const p = W.pathTo(g, best, r.id);
        const sec = r.s + (starts[0][1]) / W.WALK_SPEED;
        cache.entries[key] = [Math.max(1, Math.ceil(d / W.WALK_SPEED / 60), Math.ceil(sec / 60)), Math.round(r.m + starts[0][1]), p.sig, p.cx, today];
      }
      done += prs.length;
    }
    log(`  kafelek ${k}: ${list.length} par (razem ${done}/${missing.length})`);
    await new Promise(r => setTimeout(r, opts.pauseMs == null ? 3000 : opts.pauseMs));   // grzecznie wobec Overpass
  }
  return { pairs: pairs.length, computed: done, calls };
}
