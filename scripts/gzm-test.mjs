// Testy logiki „Przesiadki GZM”: node scripts/gzm-test.mjs
//   — kalendarz GTFS (wiele wierszy na service_id, calendar_dates), godziny ≥ 24:00,
//   — statusy zdążysz / na styk / nie zdążysz, opóźnienie pociągu, przesiadka koło północy,
//   — dane na żywo: opóźnienie, pojazd za przystankiem, kurs odwołany, brak danych,
//   — widok „Wysiadam”: zawsze 5 pozycji, dociąganie kolejnych, ulubione linie,
//   — dekoder GTFS-Realtime (ujemne opóźnienie).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const C = require("../gzm-core.js");
const R = require("../gzm-rt-core.js");
const G = await import("../tools/gzm/gtfs.mjs");

let ok = 0, fail = 0;
function t(name, cond, info) { if (cond) ok++; else { fail++; console.log("  ✘ " + name + (info ? "  → " + info : "")); } }

// ---------- kalendarz ----------
const cal = [
  { service_id: "1", monday: "1", tuesday: "1", wednesday: "1", thursday: "1", friday: "1", saturday: "0", sunday: "0", start_date: "20261026", end_date: "20261030" },
  { service_id: "1", monday: "1", tuesday: "0", wednesday: "0", thursday: "0", friday: "0", saturday: "0", sunday: "0", start_date: "20261102", end_date: "20261102" },
  { service_id: "7", monday: "0", tuesday: "0", wednesday: "0", thursday: "0", friday: "0", saturday: "0", sunday: "1", start_date: "20261026", end_date: "20261108" }
];
t("kalendarz: wiersz 1 obejmuje piątek 30.10", G.activeServices(cal, [], "2026-10-30").has("1"));
t("kalendarz: drugi wiersz tego samego service_id (pon. 2.11)", G.activeServices(cal, [], "2026-11-02").has("1"));
t("kalendarz: wtorek 3.11 poza oboma wierszami", !G.activeServices(cal, [], "2026-11-03").has("1"));
t("kalendarz: niedziela 1.11 tylko service 7", [...G.activeServices(cal, [], "2026-11-01")].join() === "7");
t("calendar_dates: 2 = usuń", !G.activeServices(cal, [{ service_id: "1", date: "20261030", exception_type: "2" }], "2026-10-30").has("1"));
t("calendar_dates: 1 = dodaj", G.activeServices(cal, [{ service_id: "9", date: "20261030", exception_type: "1" }], "2026-10-30").has("9"));
t("godzina 25:10 → 1510 min", G.hmsMin("25:10:00") === 1510);
t("godzina 24:03 → 1443 min", G.hmsMin("24:03:00") === 1443);
t("CSV z cudzysłowem i przecinkiem", G.csvLine('1,"Katowice, Dworzec",x').join("|") === "1|Katowice, Dworzec|x");

// ---------- plik stacji (syntetyczny) ----------
// przystanek 0: 2 min pieszo; przystanek 1: 5–7 min (peron 1: 5, peron 2: 7)
function file(days) {
  return { id: 1, name: "Test", generated: new Date().toISOString(), stops: [{ c: "A", n: "Test Dworzec", w: [2, 2] }, { c: "B", n: "Test Rynek", w: [5, 7], p: { 1: 5, 2: 7 } }],
    lines: [["12", 3, "Ligota"], ["T16", 0, "Brynów"], ["900", 3, "Witosa"], ["N1", 3, "Nocna"]], days };
}
const D = "2026-11-02", D2 = "2026-11-03";
// odjazdy co 2 min od 6:00 do 7:00 na przystanku A linią 12, i tramwaje T16 z B
const many = [];
for (let m = 360; m <= 420; m += 2) many.push([m, 0, 0, "t12_" + m, 5]);
for (let m = 361; m <= 421; m += 4) many.push([m, 1, 1, "t16_" + m, 8]);
const F = file({ [D]: many.sort((a, b) => a[0] - b[0]), [D2]: [] });

// statusy
let r = C.compute({ file: F, date: D, arrMin: 365, nowMin: 300, windowMin: 60 });
const at = (min, line) => r.items.find(x => x.dep.min === min && x.dep.line === line);
t("status: zapas ≥ 3 → zdążysz", at(370, "12").status === "ok", at(370, "12") && at(370, "12").slack);          // 365+2=367, zapas 3
t("status: zapas 0–2 → na styk", at(368, "12").status === "tight");                                                  // zapas 1
t("status: odjazd przed dojściem → nie zdążysz", at(366, "12").status === "missed");
t("dojście bez znanego peronu = najdalszy (7 min)", at(373, "T16").walk.min === 7 && at(373, "T16").status === "tight"); // 365+7=372
r = C.compute({ file: F, date: D, arrMin: 365, nowMin: 300, windowMin: 60, platform: "1" });
t("dojście z peronu 1 = 5 min", r.items.find(x => x.dep.min === 373 && x.dep.line === "T16").walk.min === 5);

// opóźnienie pociągu przesuwa wszystko
const r10 = C.compute({ file: F, date: D, arrMin: 375, nowMin: 300, windowMin: 60 });
t("pociąg +10 min: pierwsza propozycja ≥ 375+2", r10.catchable[0].real >= 377, r10.catchable[0].real);

// „Wysiadam”: zawsze 5, dociąganie
t("zawsze 5 propozycji (jeśli są kursy)", r10.catchable.slice(0, 5).length === 5);
const first5 = r10.catchable.slice(0, 5).map(x => x.dep.trip).join();
const later = C.compute({ file: F, date: D, arrMin: 375, nowMin: 380, windowMin: 60 });   // minęło 5 min, już wysiadł
t("po upływie czasu: wciąż 5", later.catchable.slice(0, 5).length === 5);
t("po upływie czasu: uciekłe znikają, dociągają się nowe", later.catchable.slice(0, 5).map(x => x.dep.trip).join() !== first5 && later.catchable[0].real >= 382);
t("„pokaż kolejne 5”: jest co najmniej 10", later.catchable.length >= 10);
t("uciekłe: najwyżej 3", later.missed.length <= 3);

// ulubione linie (linia|kierunek)
const fav = C.compute({ file: F, date: D, arrMin: 365, nowMin: 300, windowMin: 60, favs: ["T16|Brynów"], onlyFavs: true });
t("ulubione: tylko T16 → Brynów", fav.catchable.length > 0 && fav.catchable.every(x => x.dep.line === "T16"));
const favOff = C.compute({ file: F, date: D, arrMin: 365, nowMin: 300, windowMin: 60, favs: ["T16|Brynów"], onlyFavs: false });
t("„wszystkie odjazdy”: też inne linie", favOff.catchable.some(x => x.dep.line === "12"));

// dane na żywo
const rt = { trips: { t12_370: [3, 240], t12_372: [9, 0], t12_374: [5, "X"], t16_373: [8, -60] } };
r = C.compute({ file: F, date: D, arrMin: 365, nowMin: 300, windowMin: 60, rt });
const it = (trip) => r.items.find(x => x.dep.trip === trip);
t("na żywo: +4 min przenosi się na nasz przystanek", it("t12_370").real === 374 && it("t12_370").live);
t("na żywo: pojazd za naszym przystankiem → znika", !it("t12_372"));
t("na żywo: odwołany → status cancelled i nie w propozycjach", it("t12_374").status === "cancelled" && !r.catchable.some(x => x.dep.trip === "t12_374"));
t("na żywo: −1 min (przed czasem)", it("t16_373").real === 372);
t("brak danych na żywo → wg rozkładu", it("t12_376").live === false && it("t12_376").real === 376);
const noRt = C.compute({ file: F, date: D, arrMin: 365, nowMin: 300, windowMin: 60, rt: null });
t("feed niedostępny → bez błędu, wg rozkładu", noRt.catchable.length > 0 && noRt.items.every(x => !x.live));

// przesiadka koło północy: przyjazd 23:58, autobus nocny 0:05 następnego dnia
const FN = file({ [D]: [[1430, 3, 0, "n1", 3]], [D2]: [[5, 3, 0, "n2", 3]] });
const night = C.compute({ file: FN, date: D, arrMin: 1438, nowMin: 1400, windowMin: 60 });
t("północ: odjazd 0:05 następnego dnia jest propozycją", night.catchable.length === 1 && night.catchable[0].real === 1445 && C.fmt(night.catchable[0].real) === "00:05");
t("północ: odjazd 23:50 uciekł", !night.catchable.some(x => x.dep.trip === "n1"));

// grupowanie po linii
const groups = C.groupByLine(C.compute({ file: F, date: D, arrMin: 365, nowMin: 300, windowMin: 60 }).items, 3);
t("grupowanie: linie 12 i T16, po max 3 odjazdy", groups.length === 2 && groups.every(g => g.items.length <= 3));

// ---------- przystanek docelowy (etap: pociąg → przystanek GZM) ----------
// wzór 0: 12 jedzie do „Cel” 6 min; wzór 1: T16 do „Cel B” 5 min; wzór 2: okrężna 99 do „Cel” 40 min
const FD = { id: 2, name: "Test", generated: new Date().toISOString(), stops: [{ c: "A", n: "Dworzec", w: [2, 2] }], lines: [["12", 3, "X"], ["T16", 0, "Y"], ["99", 3, "Z"], ["5", 3, "W"]],
  ds: ["Cel", "Cel B", "Inny"], pt: [[2, 3, 0, 6], [1, 5], [0, 40], [2, 4]],
  days: { [D]: [[370, 0, 0, "a", 1, 0], [371, 1, 0, "b", 1, 1], [372, 2, 0, "c", 1, 2], [373, 3, 0, "d", 1, 3], [380, 0, 0, "e", 1, 0]], [D2]: [] } };
const dr = C.compute({ file: FD, date: D, arrMin: 365, nowMin: 300, windowMin: 60, dest: ["Cel"] });
t("cel: tylko kursy, które dowiozą (bez linii 5)", dr.items.every(x => x.dep.line !== "5") && dr.items.some(x => x.dep.line === "12"), dr.items.map(x => x.dep.line).join());
t("cel: okrężna 40 min odrzucona (najszybsza 6)", !dr.items.some(x => x.dep.line === "99"));
t("cel: godzina dojazdu = odjazd + jazda", dr.items.find(x => x.dep.trip === "a").arrDest === 376);
const dr2 = C.compute({ file: FD, date: D, arrMin: 365, nowMin: 300, windowMin: 60, dest: ["Cel", "Cel B"] });
t("cel: kilka nazw (np. AWF i Stadion AWF), sortowanie wg dojazdu (remis → wcześniejszy odjazd)", dr2.catchable[0].arrDest === 376 && dr2.catchable[1].arrDest === 376 && dr2.catchable[0].dep.trip === "a" && dr2.catchable[2].arrDest > 376);
const drLive = C.compute({ file: FD, date: D, arrMin: 365, nowMin: 300, windowMin: 60, dest: ["Cel"], rt: { trips: { a: [1, 180] } } });
t("cel: opóźnienie na żywo przesuwa dojazd", drLive.items.find(x => x.dep.trip === "a").arrDest === 379);
t("cel: ulubione linie ignorowane, gdy jest cel", C.compute({ file: FD, date: D, arrMin: 365, nowMin: 300, windowMin: 60, dest: ["Cel"], favs: ["5|W"], onlyFavs: true }).catchable.length > 0);

// ---------- krok 2: przystanek GZM → pociąg ----------
// kurs k1 (linia 46) z „Start” jedzie pod stację: przystanek P1 (8 min na peron) o 14:34 i P2 (2 min) o 14:37
const AF = { stops: [{ c: "P1", n: "Mikołowska", w: [8, 8] }, { c: "P2", n: "Dworzec", w: [2, 2] }], lines: [["46", 3, "X"], ["T6", 0, "Y"]],
  us: ["Start", "Inny"], up: [[0, 4], [0, 7], [1, 3, 0, 6]],
  days: { [D]: [[874, 0, 0, "k1", 5, 0], [877, 0, 1, "k1", 7, 1], [879, 1, 1, "k2", 9, 2], [930, 0, 1, "k3", 7, 1]], [D2]: [] } };
const rides = C.ridesToStation({ arrFile: AF, origin: ["Start"], date: D, fromMin: 870, maxMin: 120 });
t("do pociągu: kurs liczony raz, z przystankiem najszybszym na peron (Dworzec)", rides.filter(r => r.trip === "k1").length === 1 && rides.find(r => r.trip === "k1").stop.n === "Dworzec" && rides[0].platform === 879, JSON.stringify(rides[0]));
t("do pociągu: odjazd z przystanku startowego = przyjazd − jazda", rides.find(r => r.trip === "k1").dep === 870 && rides.find(r => r.trip === "k2").dep === 873);
t("do pociągu: przed godziną wyjścia — pomijany", C.ridesToStation({ arrFile: AF, origin: ["Start"], date: D, fromMin: 872, maxMin: 120 }).every(r => r.trip !== "k1"));
const ridesLive = C.ridesToStation({ arrFile: AF, origin: ["Start"], date: D, fromMin: 870, maxMin: 120, rt: { trips: { k1: [3, 120], k2: [9, 0] } } });
t("do pociągu: opóźnienie +2 przesuwa peron; pojazd już pod stacją → znika", ridesLive.find(r => r.trip === "k1").platform === 881 && !ridesLive.some(r => r.trip === "k2"));
const mt = C.matchTrains(rides, [{ dep: 885 }, { dep: 880 }, { dep: 870 }], 3);
t("pociąg 14:45: k1 (zapas 6) i k2 (zapas 4), oba 🟢; najpóźniej = k2", mt[0].count === 2 && mt[0].latest.trip === "k2" && mt[0].rides.every(r => r.status === "ok"));
t("pociąg 14:40: tylko k1 na styk (zapas 1)", mt[1].count === 1 && mt[1].rides[0].status === "tight");
t("pociąg 14:30: nic nie zdąży → pominięty", mt.length === 2);

// ---------- podróż bez pociągu (przesiadka przy stacji-węźle) ----------
const HA = { stops: [{ c: "S1", n: "Węzeł A", w: [3, 3] }], lines: [["670", 3, "X"]], us: ["Start"], up: [[0, 5]], days: { [D]: [[600, 0, 0, "t1", 4, 0], [660, 0, 0, "t9", 4, 0]], [D2]: [] } };
const HD = { stops: [{ c: "S1", n: "Węzeł A", lat: 50, lon: 19, w: [3, 3] }, { c: "S2", n: "Węzeł B", lat: 50.001, lon: 19, w: [3, 3] }], lines: [["129", 3, "Y"], ["670", 3, "X"]],
  ds: ["Cel"], pt: [[0, 40], [0, 30]], days: { [D]: [[602, 0, 1, "u1", 1, 0], [604, 0, 1, "u2", 1, 0], [601, 1, 0, "t1", 5, 1]], [D2]: [] } };
const hub = C.hubTrips({ arrFile: HA, depFile: HD, origin: ["Start"], dest: ["Cel"], date: D, fromMin: 590, maxMin: 120 });
const h1 = hub.find(o => o.dep === 595);
t("bez pociągu: ten sam kurs jedzie dalej → bez przesiadki, najwcześniejszy dojazd", h1 && h1.same && h1.arrDest === 631, JSON.stringify(h1 && { same: h1.same, arr: h1.arrDest }));
const hubNoSame = C.hubTrips({ arrFile: HA, depFile: { ...HD, days: { [D]: [[602, 0, 1, "u1", 1, 0], [604, 0, 1, "u2", 1, 0]], [D2]: [] } }, origin: ["Start"], dest: ["Cel"], date: D, fromMin: 590, maxMin: 120 });
const h2 = hubNoSame.find(o => o.dep === 595);
t("bez pociągu: inny słupek ~111 m → przesiadka 4 min (3 marszu + 1), łapie 129 o 10:04 (nie 10:02)", h2 && !h2.same && h2.transfer === 4 && h2.b.real === 604 && h2.arrDest === 644, JSON.stringify(h2 && { tr: h2.transfer, b: h2.b.real, arr: h2.arrDest }));

// ---------- dekoder GTFS-RT ----------
// FeedMessage{ header{version "2.0", timestamp 100}, entity{ id "e1", trip_update{ trip{trip_id "1_5"}, stop_time_update{ seq 7, arrival{ delay -120 } } } } }
function varint(n) { const o = []; let v = BigInt.asUintN(64, BigInt(n)); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; o.push(b); } while (v); return o; }
const fld = (no, wt, bytes) => [...varint(no * 8 + wt), ...bytes];
const lenD = (no, arr) => fld(no, 2, [...varint(arr.length), ...arr]);
const str = (no, s) => lenD(no, [...Buffer.from(s)]);
const header = lenD(1, [...str(1, "2.0"), ...fld(3, 0, varint(100))]);
const stu = lenD(2, [...fld(1, 0, varint(7)), ...lenD(2, fld(1, 0, varint(-120)))]);
const tu = lenD(3, [...lenD(1, str(1, "1_5")), ...stu]);
const ent = lenD(2, [...str(1, "e1"), ...tu]);
const feed = R.decodeFeed(new Uint8Array([...header, ...ent]));
const u = feed.entities[0].tripUpdate;
t("RT: nagłówek", feed.version === "2.0" && feed.timestamp === 100);
t("RT: trip_id, stop_sequence, ujemne opóźnienie −120 s", u.trip.tripId === "1_5" && u.stu[0].seq === 7 && u.stu[0].arr.delay === -120, JSON.stringify(u));

console.log(fail ? `\n${fail} błędów, ${ok} OK` : `\n${ok}/${ok} testów OK`);
process.exit(fail ? 1 : 0);
