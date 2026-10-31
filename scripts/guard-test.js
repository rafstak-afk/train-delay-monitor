// Testy logiki strażnika przesiadek (guard-core.js):  node scripts/guard-test.js
// Uruchamiać przy KAŻDEJ zmianie w guard-core.js.
"use strict";
const G = require("../guard-core.js");

// Połączenie Katowice 14:00 → Chorzów Batory 14:10 (A), Chorzów Batory 14:20 → Tarnowskie Góry 14:50 (B)
const conn = {
  id: "t1", date: "2026-10-29", from: "Katowice", to: "Tarnowskie Góry",
  legs: [
    { train: { category: "KŚ", number: "40500" }, scheduleId: "2026", orderId: "1", board: { stationName: "Katowice", time: "14:00" }, alight: { stationName: "Chorzów Batory", time: "14:10" } },
    { train: { category: "KŚ", number: "40600" }, scheduleId: "2026", orderId: "2", board: { stationName: "Chorzów Batory", time: "14:20" }, alight: { stationName: "Tarnowskie Góry", time: "14:50" } }
  ]
};
// Dane /api/train-details: opcje opóźnień i statusów
function trainA(o) {
  o = o || {};
  return { status: o.cancelled ? "X" : "", delay: o.cur || 0, lastConfirmedStation: o.started ? "Katowice" : "",
    route: [
      { stationName: "Katowice", status: o.started ? "confirmed" : "upcoming", plannedDeparture: "14:00", departureDelay: o.depDelay != null ? o.depDelay : (o.cur || 0), delay: o.cur || 0, platform: "2" },
      { stationName: "Chorzów Batory", status: o.arrived ? "confirmed" : "upcoming", plannedArrival: "14:10", arrivalDelay: o.arrDelay, forecastArrivalDelay: o.forecast, delay: 0, platform: o.platformA || "1" }
    ] };
}
function trainB(o) {
  o = o || {};
  return { status: o.cancelled ? "X" : "", delay: o.cur || 0, lastConfirmedStation: o.started ? "Gliwice" : "",
    route: [
      { stationName: "Gliwice", status: o.started ? "confirmed" : "upcoming", plannedDeparture: "14:00", delay: o.cur || 0 },
      { stationName: "Chorzów Batory", status: o.departed ? "confirmed" : "upcoming", plannedDeparture: "14:20", departureDelay: o.depDelay, forecastDepartureDelay: o.forecast, delay: 0, platform: o.platformB || "1" },
      { stationName: "Tarnowskie Góry", status: o.arrived ? "confirmed" : "upcoming", plannedArrival: "14:50", forecastArrivalDelay: o.forecastArr, delay: 0 }
    ] };
}

const T = [];
const test = (name, fn) => T.push({ name, fn });
const eq = (a, b, msg) => { if (a !== b) throw new Error((msg || "") + " oczekiwano " + JSON.stringify(b) + ", jest " + JSON.stringify(a)); };
const ev = (a, b, opts) => G.evaluate(conn, [a, b], opts || { minTransfer: 3 });

test("planowo: 10 min zapasu → 🟢", () => {
  const r = ev(trainA(), trainB());
  eq(r.status, "ok"); eq(r.transfers[0].plannedSlack, 10); eq(r.transfers[0].slack, 10);
});
test("A +4 (prognoza) → zapas 6, minimum 3 → 🟡 (poniżej 3+5)", () => {
  const r = ev(trainA({ started: true, cur: 4, forecast: 4 }), trainB());
  eq(r.transfers[0].slack, 6); eq(r.status, "risk");
});
test("A +2 → zapas 8 = minimum + 5 → 🟢", () => {
  eq(ev(trainA({ started: true, cur: 2, forecast: 2 }), trainB()).status, "ok");
});
test("A +8 → zapas 2 < 3 → 🔴", () => {
  const r = ev(trainA({ started: true, cur: 8, forecast: 8 }), trainB());
  eq(r.transfers[0].slack, 2); eq(r.status, "broken");
});
test("ujemny zapas: A +15 → −5 → 🔴", () => {
  const r = ev(trainA({ started: true, cur: 15, forecast: 15 }), trainB());
  eq(r.transfers[0].slack, -5); eq(r.status, "broken");
});
test("odwołany A → ⚫", () => { eq(ev(trainA({ cancelled: true }), trainB()).status, "cancelled"); });
test("odwołany B → ⚫", () => { eq(ev(trainA(), trainB({ cancelled: true })).status, "cancelled"); });
test("oba opóźnione: A +12, B +10 → zapas 8, ale TYLKO dzięki B → najwyżej 🟡", () => {
  const r = ev(trainA({ started: true, cur: 12, forecast: 12 }), trainB({ started: true, cur: 10, forecast: 10 }));
  eq(r.transfers[0].slack, 8); eq(r.transfers[0].onlyThanksToB, true); eq(r.status, "risk");
});
test("oba opóźnione: A +12, B +5 → zapas 3 = minimum → 🟡", () => {
  const r = ev(trainA({ started: true, cur: 12, forecast: 12 }), trainB({ started: true, cur: 5, forecast: 5 }));
  eq(r.transfers[0].slack, 3); eq(r.status, "risk");
});
test("oba opóźnione: A +12, B +2 → zapas 0 → 🔴", () => {
  eq(ev(trainA({ started: true, cur: 12, forecast: 12 }), trainB({ started: true, cur: 2, forecast: 2 })).status, "broken");
});
test("inny peron (1 → 4): minimum 3+2 = 5; zapas 6 → 🟡", () => {
  const r = ev(trainA({ started: true, cur: 4, forecast: 4, platformA: "1" }), trainB({ platformB: "4" }));
  eq(r.transfers[0].platformChange, true); eq(r.transfers[0].need, 5); eq(r.status, "risk");
});
test("inny peron, A +6 → zapas 4 < 5 → 🔴", () => {
  eq(ev(trainA({ started: true, cur: 6, forecast: 6, platformA: "1" }), trainB({ platformB: "4" })).status, "broken");
});
test("brak danych o B → ❔ (nie udajemy, że OK)", () => {
  const r = ev(trainA(), null);
  eq(r.status, "nodata"); eq(r.transfers[0].status, "nodata");
});
test("prognoza ma pierwszeństwo przed bieżącym opóźnieniem", () => {
  const r = ev(trainA({ started: true, cur: 9, forecast: 3 }), trainB());
  eq(r.transfers[0].delayA, 3); eq(r.transfers[0].delaySourceA, "forecast");
});
test("bez prognozy: bieżące opóźnienie jadącego pociągu", () => {
  const r = ev(trainA({ started: true, cur: 9 }), trainB());
  eq(r.transfers[0].delayA, 9); eq(r.status, "broken");
});
test("przyjazd A potwierdzony z +5 → zapas 5 → 🟡", () => {
  const r = ev(trainA({ started: true, arrived: true, arrDelay: 5 }), trainB());
  eq(r.transfers[0].delayA, 5); eq(r.transfers[0].delaySourceA, "confirmed"); eq(r.status, "risk");
});
test("B odjechał, A jeszcze nie dojechał (z opóźnieniem) → 🔴", () => {
  const r = ev(trainA({ started: true, cur: 9, forecast: 9 }), trainB({ started: true, departed: true, depDelay: 0 }));
  eq(r.status, "broken");
});
test("dojechał na cel → done", () => {
  eq(ev(trainA({ started: true, arrived: true, arrDelay: 0 }), trainB({ started: true, departed: true, depDelay: 0, arrived: true })).status, "done");
});
test("połączenie bezpośrednie (1 noga): ok / odwołany / brak danych", () => {
  const one = { id: "d", date: "2026-10-29", from: "Katowice", to: "Chorzów Batory", legs: [conn.legs[0]] };
  eq(G.evaluate(one, [trainA()]).status, "ok");
  eq(G.evaluate(one, [trainA({ cancelled: true })]).status, "cancelled");
  eq(G.evaluate(one, [null]).status, "nodata");
});
test("przesiadka przez północ (23:55 → 00:10)", () => {
  const c = { date: "2026-10-29", legs: [
    { train: {}, board: { stationName: "A", time: "23:30" }, alight: { stationName: "X", time: "23:55" } },
    { train: {}, board: { stationName: "X", time: "00:10" }, alight: { stationName: "B", time: "00:40" } }] };
  const t = G.evalTransfer(c.legs[0], c.legs[1], null, null, 3);
  eq(t.status, "nodata");
  const r = G.evalTransfer(c.legs[0], c.legs[1], { noData: false, plannedArr: "23:55", delayArr: 0 }, { noData: false, plannedDep: "00:10", delayDep: 0 }, 3);
  eq(r.plannedSlack, 15); eq(r.status, "ok");
});
test("opóźnienie rośnie: 3 kolejne odczyty w górę", () => {
  eq(G.rising([2, 4, 7]), true); eq(G.rising([2, 4, 4]), false); eq(G.rising([5, 4, 7]), false); eq(G.rising([4, 7]), false);
});
test("powiadomienia tylko przy zmianie statusu (bez spamu)", () => {
  eq(G.shouldNotify(null, { status: "ok" }), null, "pierwszy 🟢:");
  eq(G.shouldNotify({ status: "ok" }, { status: "ok" }), null, "🟢→🟢:");
  eq(G.shouldNotify({ status: "ok" }, { status: "risk", delayA: 5 }), "worse", "🟢→🟡:");
  eq(G.shouldNotify({ status: "risk", delayA: 5 }, { status: "broken", delayA: 9 }), "worse", "🟡→🔴:");
  eq(G.shouldNotify({ status: "risk", delayA: 5 }, { status: "risk", delayA: 7 }), null, "🟡 +2 min:");
  eq(G.shouldNotify({ status: "risk", delayA: 5 }, { status: "risk", delayA: 10 }), "delay", "🟡 +5 min:");
  eq(G.shouldNotify({ status: "broken", delayA: 9 }, { status: "ok", delayA: 1 }), "better", "🔴→🟢:");
  eq(G.shouldNotify({ status: "ok" }, { status: "nodata" }), null, "→ brak danych:");
  eq(G.shouldNotify({ status: "nodata" }, { status: "ok" }), null, "brak danych → 🟢:");
  eq(G.shouldNotify({ status: "nodata" }, { status: "broken", delayA: 9 }), "worse", "brak danych → 🔴:");
  eq(G.shouldNotify({ status: "ok" }, { status: "cancelled" }), "worse", "🟢→⚫:");
});
test("treść powiadomienia jak w przykładzie", () => {
  const r = ev(trainA({ started: true, cur: 9, forecast: 9 }), trainB());
  const m = G.message(conn, r, "worse", "pl", "KŚ 40602 o 14:50");
  eq(m.title, "🛡️ Pilnowane połączenie");
  if (!/Chorzów Batory/.test(m.body) || !/KŚ 40500 ma \+9 min/.test(m.body) || !/alternatywa: KŚ 40602 o 14:50/.test(m.body)) throw new Error(m.body);
  const ok = G.message(conn, ev(trainA(), trainB()), "better", "pl");
  if (!/znów bezpieczna/.test(ok.body)) throw new Error(ok.body);
  const y = G.message(conn, ev(trainA({ started: true, cur: 4, forecast: 4 }), trainB()), "worse", "pl");
  if (!/zagrożona: KŚ 40500 ma \+4 min, na przesiadkę na KŚ 40600 zostanie 6 min \(potrzebne 3\)/.test(y.body)) throw new Error(y.body);
});
test("okno pilnowania: od 2 h przed odjazdem do przyjazdu + 60 min", () => {
  eq(G.isActive(conn, 14 * 60 - 121, 120), false); eq(G.isActive(conn, 14 * 60 - 120, 120), true);
  eq(G.isActive(conn, 14 * 60 + 50 + 60, 120), true); eq(G.isActive(conn, 14 * 60 + 50 + 61, 120), false);
});
test("plan z dzienniczka → połączenia (ciąg odcinków)", () => {
  const trips = [
    { _key: "a", date: "2026-10-29", scheduleId: "2026", orderId: "1", trainNumber: "40500", category: "KŚ", boardStation: "Katowice", alightStation: "Chorzów Batory", plannedDeparture: "14:00", plannedArrival: "14:10" },
    { _key: "b", date: "2026-10-29", scheduleId: "2026", orderId: "2", trainNumber: "40600", category: "KŚ", boardStation: "Chorzów Batory", alightStation: "Tarnowskie Góry", plannedDeparture: "14:20", plannedArrival: "14:50" },
    { _key: "c", date: "2026-10-29", scheduleId: "2026", orderId: "3", trainNumber: "3815", category: "IC", boardStation: "Tarnowskie Góry", alightStation: "Opole Główne", plannedDeparture: "20:00", plannedArrival: "21:00" }
  ];
  const cs = G.fromPlannedTrips(trips);
  eq(cs.length, 2); eq(cs[0].legs.length, 2); eq(cs[1].legs.length, 1); eq(cs[0].to, "Tarnowskie Góry");
});
test("z wyniku planera: to samo połączenie → to samo id", () => {
  const it = { legs: [{ train: { number: "1" }, scheduleId: "2026", orderId: "9", board: { stationName: "A", time: "10:00" }, alight: { stationName: "B", time: "11:00" } }] };
  eq(G.fromItinerary(it, { date: "2026-10-29" }).id, G.fromItinerary(it, { date: "2026-10-29" }).id);
});

test("alternatywy: zerwana przesiadka → szukamy od stacji przesiadki od przewidywanego przyjazdu", () => {
  const r = ev(trainA({ started: true, cur: 9, forecast: 9 }), trainB());
  const o = G.altOrigin(conn, r);
  eq(o.station, "Chorzów Batory"); eq(o.time, "14:19"); eq(o.keep, 1);
  const q = G.altQuery(conn, o);
  eq(q.from, "Chorzów Batory"); eq(q.to, "Tarnowskie Góry"); eq(q.date, "2026-10-29"); eq(q.time, "14:19");
});
test("alternatywy: odwołany pierwszy pociąg → szukamy od stacji startowej od jego odjazdu", () => {
  const o = G.altOrigin(conn, ev(trainA({ cancelled: true }), trainB()));
  eq(o.station, "Katowice"); eq(o.time, "14:00"); eq(o.keep, 0);
});
test("alternatywy: odwołany drugi pociąg → od stacji przesiadki", () => {
  const o = G.altOrigin(conn, ev(trainA(), trainB({ cancelled: true })));
  eq(o.station, "Chorzów Batory"); eq(o.keep, 1);
});
test("alternatywy: najwcześniejszy przyjazd pierwszy; tekst w powiadomieniu", () => {
  const its = [
    { departureTime: "14:30", arrivalTime: "15:20", legs: [{ train: { category: "KŚ", number: "40602" }, board: { time: "14:30" }, alight: { time: "15:20" } }] },
    { departureTime: "14:25", arrivalTime: "15:05", legs: [{ train: { category: "KŚ", number: "40610" }, board: { time: "14:25" }, alight: { time: "14:45" } }, { train: { category: "IC", number: "3815" }, board: { time: "14:50" }, alight: { time: "15:05" } }] },
    { departureTime: "23:50", arrivalTime: "00:30", arrivalNextDay: true, legs: [{ train: { category: "R", number: "1" }, board: { time: "23:50" }, alight: { time: "00:30" } }] }
  ];
  const best = G.pickAlternatives(its, 3);
  eq(best[0].arrivalTime, "15:05"); eq(best[2].arrivalTime, "00:30");
  eq(G.altText(best[0], "pl"), "KŚ 40610 + IC 3815 o 14:25 (przyj. 15:05)");
  eq(G.altText(best[0], "en"), "KŚ 40610 + IC 3815 at 14:25 (arr. 15:05)");
  const m = G.message(conn, ev(trainA({ started: true, cur: 9, forecast: 9 }), trainB()), "worse", "pl", G.altText(best[0], "pl"));
  if (!/Najbliższa alternatywa: KŚ 40610 \+ IC 3815 o 14:25 \(przyj\. 15:05\)\./.test(m.body)) throw new Error(m.body);
});

test("dzienniczek: wpisy tylko dla potwierdzonych odcinków, z rzeczywistymi godzinami", () => {
  const rs = [trainA({ started: true, arrived: true, arrDelay: 7, depDelay: 5 }), trainB({ started: true, departed: true, depDelay: 0, arrived: true })];
  const all = G.buildJournalEntries(conn, rs, null, "2026-10-29T15:00:00Z");
  eq(all.length, 2);
  eq(all[0].actualDeparture, "14:05"); eq(all[0].actualArrival, "14:17"); eq(all[0].delayMinutes, 7);
  eq(all[0].plannedDurationMin, 10); eq(all[0].actualDurationMin, 12);
  eq(all[0].tripLabel, "Katowice → Tarnowskie Góry"); eq(all[0].legNumber, 1); eq(all[1].legNumber, 2);
  eq(all[0]._key, "2026-10-29|2026|1|katowice|chorzów batory");
  const onlySecond = G.buildJournalEntries(conn, rs, [false, true]);
  eq(onlySecond.length, 1); eq(onlySecond[0].boardStation, "Chorzów Batory");
  const noData = G.buildJournalEntries(conn, [null, null], null);
  eq(noData[0].actualDeparture, "14:00"); eq(noData[0].delayMinutes, 0);
});
test("przypomnienie po przyjeździe i planowy przyjazd na cel", () => {
  eq(G.lastArrMin(conn), 14 * 60 + 50);
  const m = G.remindMessage(conn, "pl");
  if (!/Dojechałeś\? Zapisz przejazd Katowice → Tarnowskie Góry/.test(m.body)) throw new Error(m.body);
});

// ---------- podróż z odcinkami GZM (autobus → pociąg → tramwaj) ----------
// 46: AWF 14:30 → Katowice Dworzec 14:37 (na peron 2 min); pociąg Katowice 14:45 → TG 15:30;
// tramwaj z TG Dworzec 15:40 (z peronu 5 min) → Plac 15:50
const mm = { id: "m1", date: "2026-10-29", from: "Katowice AWF", to: "Plac", legs: [
  { mode: "gzm", trip: "b46", train: { category: "🚌", number: "46" }, board: { stationName: "Katowice AWF", time: "14:30" }, alight: { stationName: "Katowice Dworzec", time: "14:37" } },
  { train: { category: "KŚ", number: "40500" }, scheduleId: "2026", orderId: "1", walkBefore: 2, board: { stationName: "Katowice", time: "14:45" }, alight: { stationName: "Tarnowskie Góry", time: "15:30" } },
  { mode: "gzm", trip: "t9", walkBefore: 5, train: { category: "🚋", number: "9" }, board: { stationName: "TG Dworzec", time: "15:40" }, alight: { stationName: "Plac", time: "15:50" } }
] };
function trainM(arrDelay) { return { status: "", delay: 0, lastConfirmedStation: "", route: [
  { stationName: "Katowice", status: "upcoming", plannedDeparture: "14:45", forecastDepartureDelay: 0 },
  { stationName: "Tarnowskie Góry", status: "upcoming", plannedArrival: "15:30", forecastArrivalDelay: arrDelay } ] }; }
test("GZM: autobus i tramwaj planowo, pociąg punktualnie → 🟢 (zapas 6 i 5 min)", () => {
  const r = G.evaluate(mm, [{ gzm: true, t: null }, trainM(0), { gzm: true, t: null }], { minTransfer: 3 });
  if (r.status !== "ok") throw new Error(r.status + " " + JSON.stringify(r.transfers.map(t => [t.status, t.slack, t.need])));
  if (r.transfers[0].need !== 2 || r.transfers[1].need !== 5) throw new Error("need " + r.transfers.map(t => t.need));
});
test("GZM: autobus +5 min (na żywo) → przesiadka na pociąg na styk 🟡", () => {
  const r = G.evaluate(mm, [{ gzm: true, t: [3, 300] }, trainM(0), { gzm: true, t: null }], { minTransfer: 3 });
  if (r.transfers[0].status !== "risk" || r.transfers[0].slack !== 3) throw new Error(JSON.stringify(r.transfers[0]));
});
test("GZM: pociąg +6 min → tramwaj ucieka 🔴", () => {
  const r = G.evaluate(mm, [{ gzm: true, t: null }, trainM(6), { gzm: true, t: null }], { minTransfer: 3 });
  if (r.transfers[1].status !== "broken") throw new Error(JSON.stringify(r.transfers[1]));
});
test("GZM: tramwaj odwołany → ⚫", () => {
  const r = G.evaluate(mm, [{ gzm: true, t: null }, trainM(0), { gzm: true, t: [1, "X"] }], { minTransfer: 3 });
  if (r.status !== "cancelled") throw new Error(r.status);
});
test("GZM: bez alternatyw z planera PLK, w dzienniczku tylko pociąg, id z numerem kursu GZM", () => {
  if (G.altOrigin(mm, { legs: [{ cancelled: true }] }) !== null) throw new Error("alt");
  const e = G.buildJournalEntries(mm, [null, trainM(0), null], null, "2026-10-29T16:00:00Z");
  if (e.length !== 1 || e[0].trainNumber !== "40500") throw new Error(JSON.stringify(e));
  if (!/gb46@katowice awf/.test(G.connectionId("2026-10-29", mm.legs))) throw new Error(G.connectionId("2026-10-29", mm.legs));
});

test("GZM: z opcją gzm w dzienniczku cała podróż (autobus, pociąg, tramwaj), osobne klucze", () => {
  const e = G.buildJournalEntries(mm, [{ gzm: true, t: [3, 120] }, trainM(0), null], null, "2026-10-29T16:00:00Z", { gzm: true });
  if (e.length !== 3) throw new Error(JSON.stringify(e));
  if (e[0].mode !== "gzm" || !e[0].trainNumber || e[0].delayMinutes !== 2 || e[0].orderId !== "") throw new Error(JSON.stringify(e[0]));
  if (e[1].trainNumber !== "40500" || e[1].mode) throw new Error(JSON.stringify(e[1]));
  if (new Set(e.map(x => x._key)).size !== 3) throw new Error("klucze");
});

let fail = 0;
for (const t of T) { try { t.fn(); console.log("  ✔ " + t.name); } catch (e) { fail++; console.log("  ✘ " + t.name + "\n      " + e.message); } }
console.log("\n" + (T.length - fail) + "/" + T.length + " testów OK");
process.exit(fail ? 1 : 0);
