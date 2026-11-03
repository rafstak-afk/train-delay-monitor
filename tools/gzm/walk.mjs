// Dojście pieszo z peronu do przystanku GZM po prawdziwej sieci pieszej z
// OpenStreetMap (chodniki, ścieżki, schody, przejścia podziemne, kładki,
// przejścia przez jezdnię i tory). Dane: Overpass API, jedno zapytanie na
// stację (okrąg ~1 km) — bez masowego odpytywania serwerów do wyznaczania
// tras. Trasa: Dijkstra na własnym grafie (bez zewnętrznych bibliotek).
//
// Tory NIE są w grafie, więc przystanek „za torami” bez przejścia wyjdzie
// jako daleki albo nieosiągalny — dokładnie o to chodzi.

export const OVERPASS = "https://overpass-api.de/api/interpreter";
export const UA = "czy-zdaze-gzm-build/1.0 (rafstak@gmail.com)";
export const WALK_SPEED = 1.2;          // m/s
export const STEP_PENALTY_S = 60;       // +1 min za każde schody / przejście podziemne / kładkę
export const SIGNAL_PENALTY_S = 30;     // średnie czekanie na zielone światło dla pieszych
export const SNAP_MAX_M = 50;           // peron-„wyspa”: dociągnij do sieci pieszej najwyżej tyle metrów (odcinek przybliżony)
export const LOOSE_PLATFORM_M = 150;    // peron bez oznaczeń kolejowych przyjmujemy, gdy leży tak blisko punktu stacji

// Przejście w węźle / na drodze OSM: "sig" (ze światłami), "zebra" (bez), "rail" (przez tory) albo null
function hasSignals(t) { return t.crossing === "traffic_signals" || t["crossing:signals"] === "yes" || /^(pelican|toucan|puffin|pegasus)$/.test(t.crossing_ref || ""); }
export function nodeCross(t) {
  if (!t) return null;
  if (t.railway === "crossing") return "rail";
  if (t.highway === "crossing") return hasSignals(t) ? "sig" : "zebra";
  if (t.highway === "traffic_signals" && /crossing|both/.test(t.traffic_signals || "crossing")) return "sig";
  return null;
}
function wayCross(t) { return t.footway === "crossing" || t.highway === "crossing" ? (hasSignals(t) ? "sig" : "zebra") : t.railway === "crossing" ? "rail" : null; }

const EXCLUDED_HW = new Set(["motorway", "motorway_link", "trunk_link", "construction", "proposed", "raceway", "bus_guideway"]);

export function haversine(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function overpassQuery(lat, lon, radius) {
  return `[out:json][timeout:120];
(
  way["highway"](around:${radius},${lat},${lon});
  way["railway"="platform"](around:${Math.min(radius, 500)},${lat},${lon});
  rel["railway"="platform"](around:${Math.min(radius, 500)},${lat},${lon});
  rel["public_transport"="platform"]["train"="yes"](around:${Math.min(radius, 500)},${lat},${lon});
  way["public_transport"="platform"]["train"="yes"](around:${Math.min(radius, 500)},${lat},${lon});
  way["indoor"~"^(corridor|area|room)$"](around:${Math.min(radius, 500)},${lat},${lon});
  node["railway"="crossing"](around:${radius},${lat},${lon});
);
(._;>;);
out body qt;`;
}

const MIRRORS = [OVERPASS, "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
export async function fetchOverpass(query, tries = 3) {
  // GZM_OSM_CACHE=katalog — odpowiedzi zapisywane na dysku (testy lokalne bez ponownego odpytywania serwerów)
  const cdir = typeof process !== "undefined" && process.env.GZM_OSM_CACHE;
  let cfile = null;
  if (cdir) {
    const { createHash } = await import("node:crypto"); const fsm = await import("node:fs");
    cfile = cdir + "/" + createHash("sha1").update(query).digest("hex") + ".json";
    if (fsm.existsSync(cfile)) return JSON.parse(fsm.readFileSync(cfile, "utf8"));
  }
  const save = async (j) => { if (cfile) { const fsm = await import("node:fs"); fsm.mkdirSync(cdir, { recursive: true }); fsm.writeFileSync(cfile, JSON.stringify(j)); } return j; };
  for (let i = 0; i < tries * MIRRORS.length; i++) {
    const OVERPASS_URL = MIRRORS[i % MIRRORS.length];
    try {
      const res = await fetch(OVERPASS_URL, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query) });
      if (res.ok) { const txt = await res.text(); if (txt.startsWith("{")) return save(JSON.parse(txt)); continue; }
      if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 5000 + 5000 * Math.floor(i / MIRRORS.length))); continue; }   // następny serwer
      throw new Error("Overpass HTTP " + res.status);
    } catch (e) {
      if (i === tries * MIRRORS.length - 1) throw e;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw new Error("Overpass: wszystkie serwery zawiodły");
}

// Peron kolejowy (nie tramwajowy ani autobusowy).
// Przystanki tramwajowe/autobusowe bywają oznaczone tak samo (railway=platform),
// więc odrzucamy: tram/bus=yes, highway=platform bez train=yes, ref/local_ref
// typu „1t”, przystanki z gtfs:stop_id (to słupki GZM), perony planowane/nieczynne.
export function isTrainPlatform(tags) {
  if (!tags) return false;
  if (tags.tram === "yes" || tags.bus === "yes" || tags.trolleybus === "yes" || tags.light_rail === "yes" || tags.train === "no") return false;
  // gtfs:stop_id mają słupki GZM, ale też perony PKP PLK (np. Chorzów Batory: gtfs:stop_id=73106, train=yes) — te zostają
  const rail = tags.train === "yes" || /PKP|PLK|Polskie Linie Kolejowe/i.test([tags.operator, tags["operator:short"]].join(" "));
  if (tags.proposed || tags["disused:railway"] || (tags["gtfs:stop_id"] && !rail)) return false;
  // kolejki wąskotorowe / muzealne i perony nieczynne
  if (/wąskotor|waskotor|stowarzyszenie|muzeum/i.test([tags.operator, tags.name, tags.network].join(" ")) || /nieczynn/i.test(tags.note || "") || tags.usage === "tourism") return false;
  if (/dt$/i.test(tags.ref || "") || /dt$/i.test(tags.local_ref || "")) return false;
  if (tags.highway === "platform" && tags.train !== "yes") return false;
  return tags.railway === "platform" || (tags.public_transport === "platform" && tags.train === "yes");
}
export function isLoosePlatform(tags) {
  if (!tags || tags.railway !== "platform") return false;
  if (tags.tram === "yes" || tags.bus === "yes" || tags.trolleybus === "yes" || tags.light_rail === "yes" || tags.highway === "bus_stop") return false;
  if (tags.proposed || tags["disused:railway"] || /t$/i.test(tags.local_ref || "") || /t$/i.test(tags.ref || "")) return false;
  if (/wąskotor|waskotor|stowarzyszenie|muzeum/i.test([tags.operator, tags.name, tags.network].join(" "))) return false;
  return true;
}
function inPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < (b.lon - a.lon) * (p.lat - a.lat) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}
function walkable(tags) {
  if (!tags) return false;
  if (tags.indoor === "corridor" || tags.indoor === "area" || tags.indoor === "room") return tags.access !== "private" && tags.access !== "no";
  if (tags.foot === "no" || tags.access === "private" || tags.access === "no" && tags.foot !== "yes" && tags.foot !== "designated") return false;
  if (tags.railway === "platform" || tags.public_transport === "platform") return true;
  if (!tags.highway) return false;
  if (EXCLUDED_HW.has(tags.highway)) return false;
  if (tags.highway === "trunk" && tags.sidewalk !== "both" && tags.sidewalk !== "left" && tags.sidewalk !== "right" && tags.foot !== "yes") return false;
  if (tags.area === "yes" && tags.highway !== "pedestrian") return false;
  return true;
}
// „Przeszkoda” na trasie: schody, przejście podziemne, kładka (liczona raz na drogę OSM).
function obstacle(tags) {
  if (tags.highway === "steps") return "schody";
  const foot = /^(footway|path|pedestrian|steps|cycleway|corridor)$/.test(tags.highway || "");
  if (foot && tags.tunnel && tags.tunnel !== "no" && tags.tunnel !== "building_passage") return "podziemne";
  if (foot && tags.bridge && tags.bridge !== "no") return "kładka";
  return null;
}

// Graf z odpowiedzi Overpass. Zwraca { nodes: Map(id→{lat,lon}), adj: Map(id→[[to, metry, wayIdx]]), ways: [...], platforms: [{ref, nodeIds}] }
// Numer peronu tak jak w PLK („peron 2”), nie numery torów (ref bywa „7;8”).
export function platformRef(t) {
  const m = /perons*([0-9]+[a-z]?)/i.exec(t.name || "");
  return t.local_ref || (m && m[1]) || t["railway:platform:ref"] || t.ref || "";
}
export function buildGraph(osm) {
  const nodes = new Map(), ways = [], adj = new Map(), platforms = [];
  for (const el of osm.elements) if (el.type === "node") nodes.set(el.id, { lat: el.lat, lon: el.lon, tags: el.tags });
  const link = (a, b, w) => {
    const A = nodes.get(a), B = nodes.get(b); if (!A || !B) return;
    const d = haversine(A, B);
    (adj.get(a) || adj.set(a, []).get(a)).push([b, d, w]);
    (adj.get(b) || adj.set(b, []).get(b)).push([a, d, w]);
  };
  // Perony jako relacje (obrys z kilku linii, np. Katowice 1–3): linie-członkowie są peronem.
  const relPlatform = new Map(), loose = [];
  for (const el of osm.elements) if (el.type === "relation" && (isTrainPlatform(el.tags) || isLoosePlatform(el.tags))) {
    const p = { ref: platformRef(el.tags), nodeIds: [], wayIds: new Set(), id: "r" + el.id, tags: el.tags, strict: isTrainPlatform(el.tags) };
    for (const m of el.members || []) if (m.type === "way") { p.wayIds.add(m.ref); relPlatform.set(m.ref, p); }
    (p.strict ? platforms : loose).push(p);
  }
  const wayById = new Map();
  for (const el of osm.elements) if (el.type === "way") wayById.set(el.id, el);
  for (const el of osm.elements) {
    if (el.type !== "way") continue;
    const relP = relPlatform.get(el.id);
    if (!relP && !walkable(el.tags)) continue;
    const t = el.tags || {}, idx = ways.length;
    ways.push({ id: el.id, obstacle: obstacle(t), name: t.name || "", cross: wayCross(t) });
    for (let i = 1; i < el.nodes.length; i++) link(el.nodes[i - 1], el.nodes[i], idx);
    if (relP) relP.nodeIds.push(...el.nodes);
    else if (isTrainPlatform(t)) platforms.push({ ref: platformRef(t), nodeIds: el.nodes.slice(), id: "w" + el.id, tags: t, strict: true });
    else if (isLoosePlatform(t)) loose.push({ ref: platformRef(t), nodeIds: el.nodes.slice(), id: "w" + el.id, tags: t, strict: false });
  }
  // Start z peronu = jego obrys + węzły sieci pieszej leżące WEWNĄTRZ obrysu
  // (schody/windy zwykle zaczynają się w środku peronu, nie na krawędzi).
  for (const p of platforms.concat(loose)) {
    const poly = p.nodeIds.map(id => nodes.get(id)).filter(Boolean);
    const set = new Set(p.nodeIds);
    if (poly.length >= 4) {
      let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
      for (const n of poly) { minLat = Math.min(minLat, n.lat); maxLat = Math.max(maxLat, n.lat); minLon = Math.min(minLon, n.lon); maxLon = Math.max(maxLon, n.lon); }
      for (const id of adj.keys()) { const n = nodes.get(id); if (n.lat >= minLat && n.lat <= maxLat && n.lon >= minLon && n.lon <= maxLon && inPolygon(n, poly)) set.add(id); }
    }
    p.startIds = [...set];
    p.center = poly.length ? { lat: poly.reduce((a, n) => a + n.lat, 0) / poly.length, lon: poly.reduce((a, n) => a + n.lon, 0) / poly.length } : null;
  }
  return { nodes, adj, ways, platforms, loose };
}

// Peron-„wyspa” (jego chodniki nie łączą się z resztą sieci): dociągamy go odcinkiem w linii prostej
// (≤ SNAP_MAX_M) do najbliższego węzła sieci pieszej — do każdego pobliskiego „kawałka” sieci osobno
// (najwyżej 3). Odcinek dostaje znacznik approx — trasa przez niego jest przybliżona.
// Czy peron jest „wyspą” (jego sieć ma ≤ 400 węzłów — niepołączona z resztą chodników)?
export function isIsland(g, p) {
  const own = new Set(), stack = (p.startIds || []).slice();
  while (stack.length && own.size <= 400) { const id = stack.pop(); if (own.has(id)) continue; own.add(id); for (const [to] of g.adj.get(id) || []) if (!own.has(to)) stack.push(to); }
  return own.size <= 400;
}
export function snapIsland(g, p, maxM = SNAP_MAX_M) {
  if (!p.startIds || !p.startIds.length) return 0;
  const own = new Set(), stack = p.startIds.filter(id => g.adj.has(id));
  if (!stack.length) stack.push(...p.startIds);
  while (stack.length) { const id = stack.pop(); if (own.has(id)) continue; own.add(id); for (const [to] of g.adj.get(id) || []) if (!own.has(to)) stack.push(to); }
  if (own.size > 400) return 0;                       // to nie wyspa — jest połączony z większą siecią
  const ownPts = [...own].map(id => [id, g.nodes.get(id)]).filter(x => x[1]);
  const cands = [];
  for (const [id, e] of g.adj) {
    if (!e.length || own.has(id)) continue;
    const n = g.nodes.get(id); let best = null;
    for (const [oid, on] of ownPts) { if (Math.abs(on.lat - n.lat) > 0.0006 || Math.abs(on.lon - n.lon) > 0.0009) continue; const d = haversine(on, n); if (d <= maxM && (!best || d < best.d)) best = { from: oid, to: id, d }; }
    if (best) cands.push(best);
  }
  cands.sort((a, b) => a.d - b.d);
  // po jednym dociągnięciu na każdy osobny kawałek sieci
  const used = [], linked = new Set();
  for (const c of cands) {
    if (used.length >= 3 || linked.has(c.to)) continue;
    const comp = new Set(), st2 = [c.to];
    while (st2.length && comp.size < 5000) { const id = st2.pop(); if (comp.has(id)) continue; comp.add(id); for (const [to] of g.adj.get(id) || []) if (!comp.has(to)) st2.push(to); }
    comp.forEach(id => linked.add(id));
    used.push(c);
  }
  for (const c of used) {
    const idx = g.ways.length; g.ways.push({ id: "snap", obstacle: null, name: "", cross: null, approx: true });
    (g.adj.get(c.from) || g.adj.set(c.from, []).get(c.from)).push([c.to, c.d, idx]);
    (g.adj.get(c.to) || g.adj.set(c.to, []).get(c.to)).push([c.from, c.d, idx]);
    if (!p.startIds.includes(c.from)) p.startIds.push(c.from);
  }
  return used.length;
}

// Najbliższy węzeł grafu (z krawędziami) do punktu.
export function nearestNode(g, p, maxM = 80) {
  let best = null, bd = Infinity;
  for (const [id, edges] of g.adj) {
    if (!edges.length) continue;
    const n = g.nodes.get(id), d = haversine(n, p);
    if (d < bd) { bd = d; best = id; }
  }
  return bd <= maxM ? { id: best, dist: bd } : null;
}

// Dijkstra z wielu startów (wszystkie węzły peronu) — koszt w sekundach
// (droga / prędkość + kara za przeszkody). Zwraca mapę id → {s, prev, prevWay, m}.
export function dijkstra(g, startIds, maxS = 1200, opts = {}) {
  const best = new Map(), heap = [];
  const push = (s, id) => { heap.push([s, id]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const id of startIds) if (g.adj.has(id)) { best.set(id, { s: 0, m: 0, prev: null, prevWay: -1 }); push(0, id); }
  while (heap.length) {
    const [s, id] = pop();
    const cur = best.get(id); if (!cur || s > cur.s || s > maxS) continue;
    for (const [to, d, w] of g.adj.get(id) || []) {
      const way = g.ways[w];
      if (opts.noSteps && way.obstacle === "schody") continue;   // trasa bez schodów (wózek): windy i pochylnie zostają
      // kara za przeszkodę raz na „zdarzenie”: wejście na schody / do tunelu / na
      // kładkę z drogi innego rodzaju (kolejne odcinki tego samego tunelu się nie sumują)
      const prevObst = cur.prevWay >= 0 ? g.ways[cur.prevWay].obstacle : null;
      let pen = way.obstacle && way.obstacle !== prevObst ? STEP_PENALTY_S : 0;
      const toCross = nodeCross((g.nodes.get(to) || {}).tags);
      if (toCross === "sig") pen += SIGNAL_PENALTY_S;
      else if (way.cross === "sig" && cur.prevWay !== w && nodeCross((g.nodes.get(id) || {}).tags) !== "sig") pen += SIGNAL_PENALTY_S;
      const ns = s + d / WALK_SPEED + pen;
      const nb = best.get(to);
      if (!nb || ns < nb.s) { best.set(to, { s: ns, m: cur.m + d, prev: id, prevWay: w }); push(ns, to); }
    }
  }
  return best;
}

// Ścieżka (lista [lat,lon]) i przeszkody na niej.
export function pathTo(g, best, endId) {
  const pts = [], seq = [];
  let id = endId;
  while (id != null) {
    const n = g.nodes.get(id); pts.push([+n.lat.toFixed(6), +n.lon.toFixed(6)]);
    const b = best.get(id);
    if (b.prevWay >= 0) seq.push(g.ways[b.prevWay].obstacle);
    id = b.prev;
  }
  seq.reverse();
  const obstacles = seq.filter((o, i) => o && o !== seq[i - 1]);
  // przejścia: węzły z oznaczeniem + odcinki „footway=crossing” (każda droga raz, jeśli jej węzły nie są oznaczone)
  const cnt = { sig: 0, zebra: 0, rail: 0 }, seenWay = new Set();
  let id2 = endId;
  while (id2 != null) {
    const b = best.get(id2), nc = nodeCross((g.nodes.get(id2) || {}).tags);
    if (nc) cnt[nc]++;
    else if (b.prevWay >= 0 && g.ways[b.prevWay].cross && !seenWay.has(b.prevWay)) {
      const prevNc = b.prev != null ? nodeCross((g.nodes.get(b.prev) || {}).tags) : null;
      if (!prevNc) { cnt[g.ways[b.prevWay].cross]++; seenWay.add(b.prevWay); }
    }
    if (b.prevWay >= 0 && nc) seenWay.add(b.prevWay);
    id2 = b.prev;
  }
  let approxM = 0; { let id3 = endId; while (id3 != null) { const b = best.get(id3); if (b.prevWay >= 0 && g.ways[b.prevWay].approx) approxM += b.m - (best.get(b.prev) || { m: 0 }).m; id3 = b.prev; } }
  return { pts: pts.reverse(), obstacles, cx: cnt.sig + cnt.zebra, sig: cnt.sig, rail: cnt.rail, approxM: Math.round(approxM) };
}

// Najtańsze dojście do punktu (przystanku): spośród węzłów osiągalnych z peronu
// w promieniu snapM — koszt dojścia do węzła + reszta prosto. Przystanki bywają
// narysowane obok sieci albo przy niepołączonym kawałku mapy; tak trafiamy
// zawsze w część, do której naprawdę da się dojść.
export function reachPoint(g, best, p, snapM = 60) {
  let bestId = null, bestS = Infinity, bestD = 0;
  for (const [id, r] of best) {
    const n = g.nodes.get(id);
    if (Math.abs(n.lat - p.lat) > 0.0007 || Math.abs(n.lon - p.lon) > 0.0011) continue;
    const d = haversine(n, p); if (d > snapM) continue;
    const s = r.s + d / WALK_SPEED;
    if (s < bestS) { bestS = s; bestId = id; bestD = d; }
  }
  return bestId == null ? null : { id: bestId, s: bestS, m: best.get(bestId).m + bestD, snap: bestD };
}
