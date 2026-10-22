// Porownuje klucze (Object.keys, rekurencyjnie) miedzy i18n/pl.json a
// pozostalymi jezykami — wypisuje brakujace/nadmiarowe klucze per jezyk.
// Uruchamiane recznie przed kazdym deployem dotykajacym i18n (patrz plan
// "Wersje jezykowe serwisu", sekcja "Utrzymanie na przyszlosc").
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "i18n");
const LANGS = ["pl", "en", "de", "cs", "es", "uk"];

function flatten(obj, prefix, out) {
  out = out || {};
  for (const k of Object.keys(obj)) {
    const key = prefix ? prefix + "." + k : k;
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = true;
  }
  return out;
}

const dicts = {};
for (const lang of LANGS) {
  const file = path.join(DIR, lang + ".json");
  if (!fs.existsSync(file)) {
    console.error("BRAK PLIKU: i18n/" + lang + ".json");
    process.exitCode = 1;
    continue;
  }
  try {
    dicts[lang] = flatten(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (e) {
    console.error("BLAD JSON w i18n/" + lang + ".json: " + e.message);
    process.exitCode = 1;
  }
}

const base = dicts.pl;
if (!base) {
  console.error("Brak i18n/pl.json — nie ma z czym porownac.");
  process.exit(1);
}

let ok = true;
for (const lang of LANGS) {
  if (lang === "pl" || !dicts[lang]) continue;
  const other = dicts[lang];
  const missing = Object.keys(base).filter(k => !(k in other));
  const extra = Object.keys(other).filter(k => !(k in base));
  if (missing.length || extra.length) {
    ok = false;
    console.log("== " + lang + " ==");
    if (missing.length) console.log("  brakuje: " + missing.join(", "));
    if (extra.length) console.log("  nadmiarowe: " + extra.join(", "));
  }
}

if (ok) console.log("OK — wszystkie " + LANGS.length + " jezyki maja identyczny zestaw kluczy.");
else process.exitCode = 1;
