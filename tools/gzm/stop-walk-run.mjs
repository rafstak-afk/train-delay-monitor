// TODO 71: osobny przebieg liczenia przejść między przystankami (krok w gzm-data.yml po publikacji danych).
// Przystanki z najnowszego pliku sieci w tools/gzm/out/network/, limity z config.json (stopWalkMaxTiles, stopWalkMaxMinutes).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as SW from "./stop-walk.mjs";
const DIR = path.dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(fs.readFileSync(path.join(DIR, "config.json"), "utf8"));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const nd = path.join(DIR, "out", "network"), files = fs.existsSync(nd) ? fs.readdirSync(nd).filter(f => f.endsWith(".json")).sort() : [];
if (!files.length) { log("brak plików sieci — nic do liczenia"); process.exit(0); }
const net = JSON.parse(fs.readFileSync(path.join(nd, files[0]), "utf8"));
const stops = net.stops.filter(s => s[3]).map(s => ({ code: s[3], lat: s[1], lon: s[2] }));
const F = path.join(DIR, "stop-walk-cache.json");
const cache = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, "utf8")) : { v: 1, entries: {} };
const save = () => fs.writeFileSync(F, JSON.stringify(cache));
const r = await SW.computeStopWalks(stops, cache, { log: m => { log(m); save(); }, maxTiles: CFG.stopWalkMaxTiles ?? 150, maxMinutes: CFG.stopWalkMaxMinutes ?? 90 });
save();
const v = Object.values(cache.entries);
log("przejścia między przystankami:", JSON.stringify(r), "| w pamięci", v.length, "par, z OSM", v.filter(x => x[2] >= 0).length);
