// TODO 71: przejścia między przystankami z PLIKU mapy OSM (Geofabrik, województwo śląskie) zamiast zapytań do Overpass.
// Plik przygotowuje osmium (krok w gzm-data.yml): wycinek GZM → tylko drogi (highway) → format tekstowy OPL.
//   node tools/gzm/stop-walk-pbf.mjs --need        → kod wyjścia 0, gdy są pary do policzenia (albo ALL=1), 1 gdy nie ma
//   node tools/gzm/stop-walk-pbf.mjs plik.opl      → liczy brakujące pary (ALL=1: wszystkie od nowa)
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import * as W from "./walk.mjs";
import * as SW from "./stop-walk.mjs";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const all = process.env.ALL === "1";
const nd = path.join(DIR, "out", "network"), files = fs.existsSync(nd) ? fs.readdirSync(nd).filter(f => f.endsWith(".json")).sort() : [];
if (!files.length) { log("brak plików sieci"); process.exit(1); }
const net = JSON.parse(fs.readFileSync(path.join(nd, files[0]), "utf8"));
const stops = net.stops.filter(s => s[3]).map(s => ({ code: s[3], lat: s[1], lon: s[2] }));
const F = process.env.GZM_SW_CACHE || path.join(DIR, "stop-walk-cache.json");   // GZM_SW_CACHE — test lokalny
const cache = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, "utf8")) : { v: 1, entries: {} };
const pairs = SW.pairsOf(stops), miss = pairs.filter(([a, b]) => !cache.entries[SW.keyOf(stops[a].code, stops[b].code)]).length;
if (process.argv[2] === "--need") { log(`par ${pairs.length}, brak ${miss}${all ? ", ALL=1" : ""}`); process.exit(all || miss > 0 ? 0 : 1); }

// OPL: „n<id> T<tagi> x<lon> y<lat>”, „w<id> T<tagi> N<n1>,<n2>,…”; znaki specjalne jako %xx%
const dec = v => v.replace(/%([0-9a-fA-F]+)%/g, (m, h) => String.fromCodePoint(parseInt(h, 16)));
const tagsOf = t => { if (!t) return undefined; const o = {}; for (const kv of t.split(",")) { if (!kv) continue; const i = kv.indexOf("="); o[dec(kv.slice(0, i))] = dec(kv.slice(i + 1)); } return o; };
const elements = []; let nN = 0, nW = 0;
const rl = readline.createInterface({ input: fs.createReadStream(process.argv[2]), crlfDelay: Infinity });
for await (const line of rl) {
  const parts = line.split(" "), id = +parts[0].slice(1);
  let T = "", x = null, y = null, N = "";
  for (let i = 1; i < parts.length; i++) { const p = parts[i], c = p[0], v = p.slice(1); if (c === "T") T = v; else if (c === "x") x = +v; else if (c === "y") y = +v; else if (c === "N") N = v; }
  if (parts[0][0] === "n") { if (x == null || y == null) continue; const e = { type: "node", id, lat: y, lon: x }; if (T) e.tags = tagsOf(T); elements.push(e); nN++; }
  else if (parts[0][0] === "w") { elements.push({ type: "way", id, tags: tagsOf(T) || {}, nodes: N ? N.split(",").map(r => +r.slice(1)) : [] }); nW++; }
}
log(`plik mapy: węzłów ${nN}, dróg ${nW}`);
const g = SW.gridIndex(W.buildGraph({ elements }, { walkable: SW.stopWalkable }));
elements.length = 0;
log(`graf: węzłów z krawędziami ${g._grid ? [...g._grid.values()].reduce((a, b) => a + b.length, 0) : "?"}`);
const r = await SW.computeStopWalks(stops, cache, { graph: g, all, log, progress: true });
fs.writeFileSync(F, JSON.stringify(cache));
const v = Object.values(cache.entries);
log("przejścia między przystankami (plik mapy):", JSON.stringify(r), "| w pamięci", v.length, "par, z OSM", v.filter(x => x[2] >= 0).length);
