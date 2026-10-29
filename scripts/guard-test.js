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

let fail = 0;
for (const t of T) { try { t.fn(); console.log("  ✔ " + t.name); } catch (e) { fail++; console.log("  ✘ " + t.name + "\n      " + e.message); } }
console.log("\n" + (T.length - fail) + "/" + T.length + " testów OK");
process.exit(fail ? 1 : 0);
