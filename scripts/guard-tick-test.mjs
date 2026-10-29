// Test strażnika w cronie (functions/api/push-tick.js) na atrapie KV i API:
//   node scripts/guard-tick-test.mjs
// Kolejne przebiegi crona ze zmieniającym się opóźnieniem pociągu A — sprawdza,
// KIEDY idzie powiadomienie (tylko przy zmianie statusu / ≥5 min), stan w KV,
// liczbę zapisów i że alarm „Moje pociągi” milczy dla pilnowanego pociągu.
import { webcrypto } from "node:crypto";
const mod = await import(new URL("../functions/api/push-tick.js", import.meta.url));

// czas „teraz” w Polsce
const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map(p => [p.type, p.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;
const nowMin = (+parts.hour % 24) * 60 + +parts.minute;
const hm = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0") + ":" + String(((m % 60) + 60) % 60).padStart(2, "0");
if (nowMin > 1440 - 120) { console.log("Za późno w dobie na ten test (po 22:00) — uruchom w dzień."); process.exit(0); }
// A: odjazd za 30 min, przyjazd za 50 min; B: odjazd za 60 min (zapas planowy 10)
const A = { dep: nowMin + 30, arr: nowMin + 50 }, B = { dep: nowMin + 60, arr: nowMin + 90 };
const conn = {
  id: today + "|test", date: today, from: "Katowice", to: "Tarnowskie Góry", source: "planner",
  legs: [
    { train: { category: "KŚ", number: "40500" }, scheduleId: "2026", orderId: "A1", board: { stationName: "Katowice", time: hm(A.dep) }, alight: { stationName: "Chorzów Batory", time: hm(A.arr) } },
    { train: { category: "KŚ", number: "40600" }, scheduleId: "2026", orderId: "B1", board: { stationName: "Chorzów Batory", time: hm(B.dep) }, alight: { stationName: "Tarnowskie Góry", time: hm(B.arr) } }
  ]
};

// klucze push (prawdziwe, żeby sendPush zbudował zapytanie)
const vapid = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await webcrypto.subtle.exportKey("jwk", vapid.privateKey);
const ua = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const rawPub = Buffer.from(await webcrypto.subtle.exportKey("raw", ua.publicKey)).toString("base64url");
const sub = { endpoint: "https://push.example/sub1", keys: { p256dh: rawPub, auth: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url") } };

const TOKEN = "ABCDEFGH12345678";
const store = new Map();
let puts = [];
store.set(TOKEN, JSON.stringify({ showVersion: true, language: "pl", pushSubscriptions: [sub], alarmEnabled: true,
  trains: [{ station: "Katowice", trainNum: "40500", planTime: hm(A.dep) }], guardedConnections: [conn], guardSettings: { leadMin: 120, minTransfer: 3 } }));
store.set("disruptionTypes:checked:" + today.slice(0, 7), "1");
const env = {
  PUSH_TICK_SECRET: "s", VAPID_PRIVATE_KEY: JSON.stringify(jwk),
  USER_PROFILES: {
    get: async k => store.get(k) ?? null,
    put: async (k, v) => { puts.push(k); store.set(k, v); },
    list: async () => ({ keys: [...store.keys()].map(name => ({ name })), list_complete: true })
  }
};

let delayA = 0, pushes = [], smartLookups = 0;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("https://push.example/")) { pushes.push(u); return new Response("", { status: 201 }); }
  const q = new URL(u).searchParams;
  if (u.includes("/api/v2/smart-lookup")) { smartLookups++; return new Response(JSON.stringify({ ok: false }), { status: 200 }); }
  if (u.includes("/api/train-details")) {
    const isA = q.get("orderId") === "A1";
    const d = isA ? delayA : 0;
    const data = { status: "", delay: d, lastConfirmedStation: d ? "Wcześniej" : "", route: isA
      ? [{ stationName: "Katowice", status: "upcoming", plannedDeparture: hm(A.dep), forecastDepartureDelay: d, platform: "2" },
         { stationName: "Chorzów Batory", status: "upcoming", plannedArrival: hm(A.arr), forecastArrivalDelay: d, platform: "1" }]
      : [{ stationName: "Chorzów Batory", status: "upcoming", plannedDeparture: hm(B.dep), forecastDepartureDelay: 0, platform: "1" },
         { stationName: "Tarnowskie Góry", status: "upcoming", plannedArrival: hm(B.arr), forecastArrivalDelay: 0 }] };
    return new Response(JSON.stringify(data), { status: 200 });
  }
  return new Response("{}", { status: 404 });
};

async function tick(d) {
  delayA = d; pushes = []; puts = [];
  const res = await mod.onRequestPost({ request: new Request("https://app.test/api/push-tick", { method: "POST", headers: { Authorization: "Bearer s" } }), env });
  const body = await res.json();
  const st = JSON.parse(store.get("guardstate:" + TOKEN) || "{}")[conn.id] || {};
  return { pushes: pushes.length, status: st.status, delayA: st.delayA, guardPuts: puts.filter(k => k.startsWith("guardstate:")).length, errors: body.errors, guardPushes: body.guardPushes || 0 };
}

const steps = [
  [0, 0, "ok", "planowo — 🟢, bez powiadomienia"],
  [0, 0, "ok", "znów 🟢 — cisza, bez zapisu"],
  [4, 1, "risk", "A +4 → zapas 6 → 🟡 — powiadomienie"],
  [5, 0, "risk", "A +5 — ten sam status, zmiana < 5 min — cisza"],
  [9, 1, "broken", "A +9 → zapas 1 → 🔴 — powiadomienie"],
  [11, 0, "broken", "A +11 — 🔴, +2 od ostatniego powiadomienia — cisza"],
  [13, 0, "broken", "A +13 — 🔴, +4 od ostatniego powiadomienia — cisza"],
  [14, 1, "broken", "A +14 — 🔴, +5 od ostatniego powiadomienia (narastało po trochu) — powiadomienie"],
  [1, 1, "ok", "A +1 → 🟢 — „znów bezpieczna”"]
];
let fail = 0;
for (const [d, wantPush, wantStatus, label] of steps) {
  const r = await tick(d);
  const ok = r.pushes === wantPush && r.status === wantStatus && !r.errors.length;
  if (!ok) fail++;
  console.log((ok ? "  ✔ " : "  ✘ ") + label + `  [push: ${r.pushes}, status: ${r.status}, zapisy stanu: ${r.guardPuts}${r.errors.length ? ", błędy: " + r.errors.join("; ") : ""}]`);
}
// alarm Moje pociągi dla pilnowanego 40500 nie powinien odpytywać smart-lookup
console.log((smartLookups === 0 ? "  ✔ " : "  ✘ ") + "alarm „Moje pociągi” milczy dla pociągu z pilnowanego połączenia (smart-lookup: " + smartLookups + ")");
if (smartLookups) fail++;
// profil bez showVersion → strażnik nic nie robi
const p = JSON.parse(store.get(TOKEN)); p.showVersion = false; p.trains = []; store.set(TOKEN, JSON.stringify(p)); store.delete("guardstate:" + TOKEN);
const r = await tick(9);
const silent = r.pushes === 0 && r.status === undefined;
console.log((silent ? "  ✔ " : "  ✘ ") + "BETA: profil bez ?wersja=1 — strażnik nie działa");
if (!silent) fail++;
console.log(fail ? `\n${fail} błędów` : "\nwszystko OK");
process.exit(fail ? 1 : 0);
