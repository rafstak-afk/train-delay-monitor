// OpenTripPlanner — sprawdzenie dojść pieszych tam, gdzie nasz graf z OSM nie znalazł drogi
// (wpisy „fallback” w walk-cache.json = litera „B” / czas szacunkowy).
// NIE zmienia danych produkcyjnych — zapisuje tylko raport (tools/gzm/out/otp-walk.json + .md).
//
//   node tools/gzm/otp-walk.mjs pairs  <network.json>   → out/otp-pairs.json + bbox (do wycięcia mapy)
//   node tools/gzm/otp-walk.mjs query  [http://localhost:8080] → pyta OTP o każdą parę, pisze raport
//
// Dla porównania dokładamy po 3 pary „kontrolne” z tych samych stacji, które nasz graf liczy (src osm).
import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const OUT = path.join(DIR, "out");
const SPEED = 1.2;   // m/s — jak w walk.mjs
const [, , cmd, arg] = process.argv;

function hav(a, b) {
  const R = 6371000, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function decode(str) {   // Google polyline
  const pts = []; let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, s = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 31) << s; s += 5; } while (b >= 32);
      const d = res & 1 ? ~(res >> 1) : res >> 1;
      if (k === 0) lat += d; else lon += d;
    }
    pts.push([lat / 1e5, lon / 1e5]);
  }
  return pts;
}

if (cmd === "pairs") {
  const cache = JSON.parse(fs.readFileSync(path.join(DIR, "walk-cache.json"), "utf8"));
  const net = JSON.parse(fs.readFileSync(arg, "utf8"));
  const byCode = {}; net.stops.forEach(s => { if (s[3]) byCode[s[3]] = { c: [s[1], s[2]], n: net.names[s[0]] }; });
  const pairs = [], bad = new Set();
  // OTP_CUSTOM="stacja:peron:prefiks_słupka" (np. 73312:2:2469011-001) — tylko wskazane pary zamiast „B”
  const custom = process.env.OTP_CUSTOM ? process.env.OTP_CUSTOM.split(":") : null;
  if (custom) {
    const [cst, cref, cpre] = custom, plat = ((cache.stations[cst] || {}).platforms || []).filter(p => p.c && (!cref || String(p.ref).split(";").includes(cref)));
    for (const [code, s] of Object.entries(byCode)) if (code.startsWith(cpre)) {
      const v = cache.entries[cst + "|" + code] || {}, our = cref && v.byPlat && v.byPlat[cref] != null ? v.byPlat[cref] : v.min;
      pairs.push({ st: cst, code, stop: s.n, to: s.c, ctrl: false, our: { src: v.src || "brak", min: our, max: cref ? our : v.max, m: v.m }, from: plat.map(p => ({ ref: p.ref, c: p.c })) });
    }
  }
  // OTP_ALL=1 — wszystkie pary stacja–słupek w GZM (raport porównawczy, TODO 22)
  const all = process.env.OTP_ALL === "1";
  if (!custom) for (const [k, v] of Object.entries(cache.entries)) if (v.src === "fallback") bad.add(k.split("|")[0]);
  for (const [k, v] of (custom ? [] : Object.entries(cache.entries))) {
    const [st, code] = k.split("|"), s = byCode[code], plat = (cache.stations[st] || {}).platforms || [];
    if (!s || (!all && !bad.has(st)) || !plat.length) continue;
    const ctrl = v.src === "osm";
    if (!all && ctrl && pairs.filter(p => p.st === st && p.ctrl).length >= 3) continue;
    if (!all && !ctrl && v.src !== "fallback") continue;
    pairs.push({ st, code, stop: s.n, to: s.c, ctrl, our: { src: v.src, min: v.min, max: v.max, m: v.m },
      from: plat.filter(p => p.c).map(p => ({ ref: p.ref, c: p.c })) });
  }
  let b = [90, 180, -90, -180];
  for (const p of pairs) for (const c of [p.to, ...p.from.map(f => f.c)]) b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])];
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "otp-pairs.json"), JSON.stringify(pairs, null, 1));
  // osobne prostokąty (stacje są daleko od siebie) — po ~2 km zapasu wokół każdej stacji
  const boxes = {};
  for (const p of pairs) for (const c of [p.to, ...p.from.map(f => f.c)]) {
    const x = boxes[p.st] || (boxes[p.st] = [90, 180, -90, -180]);
    boxes[p.st] = [Math.min(x[0], c[0]), Math.min(x[1], c[1]), Math.max(x[2], c[0]), Math.max(x[3], c[1])];
  }
  // osmium: minlon,minlat,maxlon,maxlat
  const lines = Object.values(boxes).map(x => [x[1] - 0.03, x[0] - 0.02, x[3] + 0.03, x[2] + 0.02].map(v => v.toFixed(4)).join(","));
  fs.writeFileSync(path.join(OUT, "otp-bbox.txt"), lines.join("\n") + "\n");
  console.log(pairs.length, "par (", pairs.filter(p => !p.ctrl).length, "szacunkowych +", pairs.filter(p => p.ctrl).length, "kontrolnych )");
  console.log(lines.join("\n"));
}

if (cmd === "query") {
  const base = arg || "http://localhost:8080";
  const pairs = JSON.parse(fs.readFileSync(path.join(OUT, "otp-pairs.json"), "utf8"));
  const Q1 = `query($fa:CoordinateValue!,$fo:CoordinateValue!,$ta:CoordinateValue!,$to:CoordinateValue!){
    planConnection(origin:{location:{coordinate:{latitude:$fa,longitude:$fo}}},destination:{location:{coordinate:{latitude:$ta,longitude:$to}}},
      modes:{directOnly:true,direct:[WALK]},preferences:{street:{walk:{speed:${SPEED}}}},first:1){
      edges{node{duration legs{distance duration legGeometry{points}}}}}}`;
  const Q2 = `query($fa:Float!,$fo:Float!,$ta:Float!,$to:Float!){
    plan(from:{lat:$fa,lon:$fo},to:{lat:$ta,lon:$to},transportModes:[{mode:WALK}],walkSpeed:${SPEED},numItineraries:1){
      itineraries{duration legs{distance duration legGeometry{points}}}}}`;
  async function gql(q, v) {
    const r = await fetch(base + "/otp/gtfs/v1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, variables: v }) });
    return r.json();
  }
  async function walk(a, b) {
    const v = { fa: a[0], fo: a[1], ta: b[0], to: b[1] };
    let j = await gql(Q1, v), it = j.data && j.data.planConnection && j.data.planConnection.edges[0] && j.data.planConnection.edges[0].node;
    if (!it) { const j2 = await gql(Q2, v); it = j2.data && j2.data.plan && j2.data.plan.itineraries[0]; if (!it && !j2.data) console.log("   błąd OTP:", JSON.stringify(j.errors || j2.errors).slice(0, 300)); }
    if (!it) return null;
    const pts = it.legs.flatMap(l => decode(l.legGeometry.points)), m = it.legs.reduce((s, l) => s + l.distance, 0);
    return { s: it.duration, m: Math.round(m), linkFrom: Math.round(hav(a, pts[0])), linkTo: Math.round(hav(b, pts[pts.length - 1])), pts: pts.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]) };
  }
  const res = [];
  for (const p of pairs) {
    const per = [];
    for (const f of p.from) { const w = await walk(f.c, p.to); per.push(Object.assign({ ref: f.ref }, w || { none: true })); }
    const ok = per.filter(x => !x.none), mins = ok.map(x => Math.max(2, Math.ceil(x.s / 60)));
    res.push(Object.assign({}, p, { otp: ok.length ? { min: Math.min(...mins), max: Math.max(...mins), m: Math.min(...ok.map(x => x.m)), linkMax: Math.max(...ok.map(x => Math.max(x.linkFrom, x.linkTo))), per } : null }));
    const o = res[res.length - 1].otp;
    console.log((p.ctrl ? "  kontrola " : "  B/szac.  ") + p.stop + " " + p.code + " | nasze: " + p.our.min + "–" + p.our.max + " min " + (p.our.m || "?") + " m (" + p.our.src + ") | OTP: " + (o ? o.min + "–" + o.max + " min, " + o.m + " m, dociągnięcie do drogi ≤ " + o.linkMax + " m" : "brak trasy"));
  }
  fs.writeFileSync(path.join(OUT, "otp-walk.json"), JSON.stringify(res));
  const md = ["| Stacja | Przystanek | | Nasze | OTP | Dociągnięcie |", "|---|---|---|---|---|---|"].concat(res.map(r =>
    `| ${r.st} | ${r.stop} (${r.code}) | ${r.ctrl ? "kontrola" : process.env.OTP_CUSTOM ? "sprawdzane" : "**B / szac.**"} | ${r.our.min}–${r.our.max} min, ${r.our.m || "?"} m | ${r.otp ? r.otp.min + "–" + r.otp.max + " min, " + r.otp.m + " m" : "brak"} | ${r.otp ? "≤ " + r.otp.linkMax + " m" : ""} |`));
  fs.writeFileSync(path.join(OUT, "otp-walk.md"), md.join("\n") + "\n");
}
