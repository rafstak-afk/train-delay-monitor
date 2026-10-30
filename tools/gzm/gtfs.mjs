// Czytanie plików GTFS ZTM GZM prosto z ZIP-ów (systemowe `unzip -p`, bez
// bibliotek) — także ogromny stop_times.txt, strumieniowo, linia po linii.
import { spawn, execFileSync } from "child_process";
import readline from "readline";

// Linia CSV z polami w cudzysłowach.
export function csvLine(l) {
  const o = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { o.push(cur); cur = ""; }
    else cur += ch;
  }
  o.push(cur);
  return o;
}

// Cały mały plik → tablica obiektów (kolumny po nazwach z nagłówka).
export function readTable(zip, name) {
  let txt;
  try { txt = execFileSync("unzip", ["-p", zip, name], { maxBuffer: 1 << 28 }).toString("utf8"); }
  catch (e) { return []; }
  const lines = txt.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const head = csvLine(lines[0]);
  return lines.slice(1).map(l => { const c = csvLine(l), o = {}; head.forEach((h, i) => { o[h] = c[i]; }); return o; });
}

// Duży plik strumieniowo: onRow(obiekt) dla każdego wiersza.
export function streamTable(zip, name, onRow) {
  return new Promise((resolve, reject) => {
    const p = spawn("unzip", ["-p", zip, name]);
    const rl = readline.createInterface({ input: p.stdout, crlfDelay: Infinity });
    let head = null;
    rl.on("line", l => {
      if (!l) return;
      if (!head) { head = csvLine(l.replace(/^﻿/, "")); return; }
      const c = csvLine(l), o = {};
      for (let i = 0; i < head.length; i++) o[head[i]] = c[i];
      onRow(o);
    });
    rl.on("close", resolve);
    p.on("error", reject);
  });
}

// „25:10:00” → minuty od północy dnia rozkładowego (może być ≥ 1440).
export function hmsMin(s) {
  const m = /^(\d+):(\d\d)/.exec(s || "");
  return m ? +m[1] * 60 + +m[2] : null;
}

// YYYYMMDD ↔ YYYY-MM-DD, dzień tygodnia (0 = poniedziałek).
export const ymd = d => d.replace(/-/g, "");
export const iso = s => s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
export function addDays(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const DOW = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export function dowKey(isoDate) { return DOW[(new Date(isoDate + "T12:00:00Z").getUTCDay() + 6) % 7]; }

// Usługi (service_id) aktywne w danym dniu: calendar.txt może mieć WIELE
// wierszy na jeden service_id (różne zakresy dat) — wystarczy, że którykolwiek
// obejmuje dzień i ma 1 w kolumnie dnia tygodnia. Do tego calendar_dates
// (1 = dodaj, 2 = usuń).
export function activeServices(calendar, calendarDates, isoDate) {
  const d = ymd(isoDate), key = dowKey(isoDate), on = new Set();
  for (const r of calendar) if (r.start_date <= d && d <= r.end_date && r[key] === "1") on.add(r.service_id);
  for (const r of calendarDates) if (r.date === d) { if (r.exception_type === "1") on.add(r.service_id); else if (r.exception_type === "2") on.delete(r.service_id); }
  return on;
}
