// Porównanie pomiarów z zegarkiem (Moje pociągi → „⏱️ Pomiar dojścia pieszo” →
// „📋 Kopiuj wyniki”) z czasami dojścia z mapy — i gotowe wpisy poprawek:
//   node tools/gzm/measure-match.mjs pomiary.txt
// Linia pomiaru: „30.10, 14:05 · peron → przystanek · peron 2 · Św. Jana · 5 min 12 s · start 50.25,19.01 (±9 m) → meta 50.26,19.02 (±6 m)”.
// Stację wybieramy po położeniu startu (albo mety — gdy trasa kończy się na peronie),
// przystanek GZM — po położeniu mety (do 60 m).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { haversine } from "./walk.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "out");
const index = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
const cache = JSON.parse(fs.readFileSync(path.join(DIR, "walk-cache.json"), "utf8"));
const txt = fs.readFileSync(process.argv[2] || 0, "utf8");

const pt = s => { const m = /(-?\d+\.\d+),(-?\d+\.\d+)/.exec(s || ""); return m ? { lat: +m[1], lon: +m[2] } : null; };
const overrides = {};
for (const line of txt.split(/\r?\n/)) {
  const m = /·\s*(\d+) min (\d+) s\s*·\s*start (.*?) → meta (.*)$/.exec(line);
  if (!m) continue;
  const sec = +m[1] * 60 + +m[2], from = pt(m[3]), to = pt(m[4]);
  const kind = /peron → przystanek/.test(line) ? "peron-przystanek" : /dom|praca/.test(line) ? "dom/praca" : "inne";
  const plat = (/peron (\d+)/.exec(line.replace(/peron → przystanek/, "")) || [])[1] || "";
  if (!from || !to) { console.log("· bez GPS — pomijam:", line.slice(0, 80)); continue; }
  if (kind !== "peron-przystanek") { console.log(`· ${kind}: ${Math.round(sec / 60)} min, ${Math.round(haversine(from, to))} m w linii prostej — zapisane do wiadomości`); continue; }
  const st = index.stations.map(s => ({ s, d: haversine(from, s) })).sort((a, b) => a.d - b.d)[0];
  if (!st || st.d > 600) { console.log("· start daleko od stacji GZM:", line.slice(0, 80)); continue; }
  const file = path.join(OUT, "stations", st.s.id + ".json");
  const stops = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).stops : [];
  // także przystanki odrzucone (np. za daleko wg mapy) — z pamięci dojść
  const cands = Object.keys(cache.entries).filter(k => k.startsWith(st.s.id + "|")).map(k => k.split("|")[1]);
  const all = [...new Set(stops.map(x => x.c).concat(cands))].map(c => ({ c, s: stops.find(x => x.c === c), e: cache.entries[st.s.id + "|" + c] }));
  // położenie przystanku: z pliku stacji albo końca trasy w pamięci dojść
  const pos = x => x.s ? { lat: x.s.lat, lon: x.s.lon } : (x.e && x.e.pts ? { lat: x.e.pts[x.e.pts.length - 1][0], lon: x.e.pts[x.e.pts.length - 1][1] } : null);
  const near = all.map(x => ({ x, d: pos(x) ? haversine(to, pos(x)) : 1e9 })).sort((a, b) => a.d - b.d)[0];
  if (!near || near.d > 60) { console.log(`· ${st.s.n}: meta ${Math.round(near ? near.d : 0)} m od najbliższego znanego przystanku — sprawdź ręcznie`); continue; }
  const e = near.x.e || {}, est = plat && e.byPlat && e.byPlat[plat] != null ? [e.byPlat[plat], e.byPlat[plat]] : [e.min, e.max];
  const meas = Math.ceil(sec / 60);
  const diff = meas - est[1];
  console.log(`✓ ${st.s.n} → ${(near.x.s && near.x.s.n) || near.x.c} (${near.x.c}), peron ${plat || "?"}: zmierzone ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}, wg mapy ${est[0]}–${est[1]} min${Math.abs(diff) >= 2 ? `  ⚠ różnica ${diff > 0 ? "+" : ""}${diff} min` : "  OK"}`);
  if (Math.abs(diff) >= 2 || !near.x.s) {
    const o = overrides[st.s.id] = overrides[st.s.id] || { note: st.s.n + " — z pomiaru", add: [], walk: {} };
    o.walk[near.x.c] = [Math.max(2, meas - 1), meas];
    if (!near.x.s) o.add.push(near.x.c);
  }
}
if (Object.keys(overrides).length) {
  console.log("\nProponowane wpisy do tools/gzm/station-overrides.json:");
  console.log(JSON.stringify(overrides, null, 2));
}
