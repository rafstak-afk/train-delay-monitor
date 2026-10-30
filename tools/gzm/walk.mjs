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

export async function fetchOverpass(query, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(OVERPASS, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(query) });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 15000 * (i + 1))); continue; }
      throw new Error("Overpass HTTP " + res.status);
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise(r => setTimeout(r, 10000 * (i + 1)));
    }
  }
}

// Peron kolejowy (nie tramwajowy ani autobusowy).
// Przystanki tramwajowe/autobusowe bywają oznaczone tak samo (railway=platform),
// więc odrzucamy: tram/bus=yes, highway=platform bez train=yes, ref/local_ref
// typu „1t”, przystanki z gtfs:stop_id (to słupki GZM), perony planowane/nieczynne.
export function isTrainPlatform(tags) {
  if (!tags) return false;
  if (tags.tram === "yes" || tags.bus === "yes" || tags.trolleybus === "yes" || tags.light_rail === "yes" || tags.train === "no") return false;
  if (tags.proposed || tags["disused:railway"] || tags["gtfs:stop_id"]) return false;
  // kolejki wąskotorowe / muzealne i perony nieczynne
  if (/wąskotor|waskotor|stowarzyszenie|muzeum/i.test([tags.operator, tags.name, tags.network].join(" ")) || /nieczynn/i.test(tags.note || "") || tags.usage === "tourism") return false;
  if (/dt$/i.test(tags.ref || "") || /dt$/i.test(tags.local_ref || "")) return false;
  if (tags.highway === "platform" && tags.train !== "yes") return false;
  return tags.railway === "platform" || (tags.public_transport === "platform" && tags.train === "yes");
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
  const relPlatform = new Map();
  for (const el of osm.elements) if (el.type === "relation" && isTrainPlatform(el.tags)) {
    const p = { ref: platformRef(el.tags), nodeIds: [], wayIds: new Set(), id: "r" + el.id };
    for (const m of el.members || []) if (m.type === "way") { p.wayIds.add(m.ref); relPlatform.set(m.ref, p); }
    platforms.push(p);
  }
  const wayById = new Map();
  for (const el of osm.elements) if (el.type === "way") wayById.set(el.id, el);
  for (const el of osm.elements) {
    if (el.type !== "way") continue;
    const relP = relPlatform.get(el.id);
    if (!relP && !walkable(el.tags)) continue;
    const t = el.tags || {}, idx = ways.length;
    ways.push({ id: el.id, obstacle: obstacle(t), name: t.name || "" });
    for (let i = 1; i < el.nodes.length; i++) link(el.nodes[i - 1], el.nodes[i], idx);
    if (relP) relP.nodeIds.push(...el.nodes);
    else if (isTrainPlatform(t)) platforms.push({ ref: platformRef(t), nodeIds: el.nodes.slice(), id: "w" + el.id });
  }
  // Start z peronu = jego obrys + węzły sieci pieszej leżące WEWNĄTRZ obrysu
  // (schody/windy zwykle zaczynają się w środku peronu, nie na krawędzi).
  for (const p of platforms) {
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
  return { nodes, adj, ways, platforms };
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
export function dijkstra(g, startIds, maxS = 1200) {
  const best = new Map(), heap = [];
  const push = (s, id) => { heap.push([s, id]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (const id of startIds) if (g.adj.has(id)) { best.set(id, { s: 0, m: 0, prev: null, prevWay: -1 }); push(0, id); }
  while (heap.length) {
    const [s, id] = pop();
    const cur = best.get(id); if (!cur || s > cur.s || s > maxS) continue;
    for (const [to, d, w] of g.adj.get(id) || []) {
      const way = g.ways[w];
      // kara za przeszkodę raz na „zdarzenie”: wejście na schody / do tunelu / na
      // kładkę z drogi innego rodzaju (kolejne odcinki tego samego tunelu się nie sumują)
      const prevObst = cur.prevWay >= 0 ? g.ways[cur.prevWay].obstacle : null;
      const pen = way.obstacle && way.obstacle !== prevObst ? STEP_PENALTY_S : 0;
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
  return { pts: pts.reverse(), obstacles };
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
