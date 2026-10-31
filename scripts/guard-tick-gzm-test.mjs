// Test strażnika w cronie z odcinkiem GZM (autobus → pociąg) na atrapie KV i API:
//   node scripts/guard-tick-gzm-test.mjs
// Autobus spóźnia się na żywo (/api/gzm-rt) → przesiadka na pociąg robi się
// zagrożona/zerwana → powiadomienie; bez danych na żywo → rozkład (nie „brak danych”).
import { webcrypto } from "node:crypto";
const mod = await import(new URL("../functions/api/push-tick.js", import.meta.url));

const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map(p => [p.type, p.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;
const nowMin = (+parts.hour % 24) * 60 + +parts.minute;
const hm = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0") + ":" + String(((m % 60) + 60) % 60).padStart(2, "0");
if (nowMin > 1440 - 120 || nowMin < 60) { console.log("Uruchom w dzień (między 1:00 a 22:00)."); process.exit(0); }
// autobus 46: AWF za 20 min → Dworzec za 27 min; dojście na peron 2 min; pociąg za 37 min (zapas planowy 8)
const B = { dep: nowMin + 20, arr: nowMin + 27 }, P = { dep: nowMin + 37, arr: nowMin + 80 };
const conn = { id: today + "|gzmtest", date: today, from: "Katowice AWF", to: "Tarnowskie Góry", source: "multimodal", legs: [
  { mode: "gzm", trip: "1_777", kind: "bus", train: { category: "🚌", number: "46", name: "→ Katowice Dworzec" }, board: { stationName: "Katowice AWF", time: hm(B.dep) }, alight: { stationName: "Katowice Dworzec", time: hm(B.arr) } },
  { train: { category: "Os", number: "40921" }, scheduleId: "2026", orderId: "P1", walkBefore: 2, board: { stationName: "Katowice", time: hm(P.dep) }, alight: { stationName: "Tarnowskie Góry", time: hm(P.arr) } }
] };
const vapid = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await webcrypto.subtle.exportKey("jwk", vapid.privateKey);
const ua = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const rawPub = Buffer.from(await webcrypto.subtle.exportKey("raw", ua.publicKey)).toString("base64url");
const sub = { endpoint: "https://push.example/sub1", keys: { p256dh: rawPub, auth: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url") } };
const TOKEN = "GZMTEST123456789";
const store = new Map();
store.set(TOKEN, JSON.stringify({ language: "pl", pushSubscriptions: [sub], guardedConnections: [conn], guardSettings: { leadMin: 120, minTransfer: 3 } }));
store.set("disruptionTypes:checked:" + today.slice(0, 7), "1");
const env = { PUSH_TICK_SECRET: "s", VAPID_PRIVATE_KEY: JSON.stringify(jwk), USER_PROFILES: {
  get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); },
  list: async () => ({ keys: [...store.keys()].map(name => ({ name })), list_complete: true }) } };
let busDelay = null, pushes = [], bodies = [], rtCalls = 0;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("https://push.example/")) { pushes.push(u); return new Response("", { status: 201 }); }
  if (u.includes("/api/gzm-rt")) { rtCalls++; return new Response(JSON.stringify({ ok: true, age: 5, trips: busDelay == null ? {} : { "1_777": [2, busDelay * 60, 50.2, 19.0, 0] } }), { status: 200 }); }
  if (u.includes("/api/train-details")) {
    return new Response(JSON.stringify({ status: "", delay: 0, lastConfirmedStation: "", route: [
      { stationName: "Katowice", status: "upcoming", plannedDeparture: hm(P.dep), forecastDepartureDelay: 0, platform: "4" },
      { stationName: "Tarnowskie Góry", status: "upcoming", plannedArrival: hm(P.arr), forecastArrivalDelay: 0 }] }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
};
async function tick(d) {
  busDelay = d; pushes = []; rtCalls = 0;
  const res = await mod.onRequestPost({ request: new Request("https://app.test/api/push-tick", { method: "POST", headers: { Authorization: "Bearer s" } }), env });
  const body = await res.json();
  const st = JSON.parse(store.get("guardstate:" + TOKEN) || "{}")[conn.id] || {};
  return { pushes: pushes.length, status: st.status, errors: body.errors, rtCalls };
}
const steps = [
  [null, 0, "ok", "brak danych na żywo → rozkład, 🟢, cisza"],
  [0, 0, "ok", "autobus punktualnie (na żywo) — cisza"],
  [4, 1, "risk", "autobus +4 → na peronie 2 min przed pociągiem → 🟡 powiadomienie"],
  [9, 1, "broken", "autobus +9 → pod dworcem 1 min przed pociągiem, dojście 2 min → 🔴 powiadomienie"],
  [1, 1, "ok", "autobus +1 → znów 🟢 — „znów bezpieczna”"]
];
let fail = 0;
for (const [d, wantPush, wantStatus, label] of steps) {
  const r = await tick(d);
  const ok = r.pushes === wantPush && r.status === wantStatus && !r.errors.length && r.rtCalls <= 1;
  if (!ok) fail++;
  console.log((ok ? "  ✔ " : "  ✘ ") + label + `  [push: ${r.pushes}, status: ${r.status}, zapytań gzm-rt: ${r.rtCalls}${r.errors.length ? ", błędy: " + r.errors.join("; ") : ""}]`);
}
console.log(fail ? `\n${fail} błędów` : "\nwszystko OK");
process.exit(fail ? 1 : 0);
