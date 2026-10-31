// Test przypomnień o wyjściu (cron co minutę) na atrapie KV i API:
//   node scripts/remind-tick-test.mjs
// Indeks remind:index z profilu (profile.js), wysyłka o czasie, bez powtórek,
// przesunięcie przy opóźnieniu pociągu, odwołanie — od razu z dopiskiem.
import { webcrypto } from "node:crypto";
const tick = await import(new URL("../functions/api/remind-tick.js", import.meta.url));
const prof = await import(new URL("../functions/api/profile.js", import.meta.url));

const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;
const nowMin = (+parts.hour % 24) * 60 + +parts.minute;
const hm = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0") + ":" + String(((m % 60) + 60) % 60).padStart(2, "0");
if (nowMin > 1440 - 90 || nowMin < 60) { console.log("Uruchom w dzień (między 1:00 a 22:30)."); process.exit(0); }

// A: pociąg za 25 min, dojście 10 → wyjście za 15 → przypomnienie „15 min” TERAZ, „5 min” za 10 min
// B: pociąg za 20 min, dojście 0, przypomnienie 20 min → teraz (do przesunięcia przy opóźnieniu)
const mk = (id, dep, order) => ({ id, date: today, from: "Tarnowskie Góry", to: "Katowice", legs: [
  { train: { category: "KŚ", number: order === "PA" ? "40500" : "40502" }, scheduleId: "2026", orderId: order, board: { stationName: "Tarnowskie Góry", time: hm(dep) }, alight: { stationName: "Katowice", time: hm(dep + 40) } }] });
const A = mk(today + "|A", nowMin + 25, "PA"), B = mk(today + "|B", nowMin + 20, "PB");
const vapid = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await webcrypto.subtle.exportKey("jwk", vapid.privateKey);
const ua = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const sub = { endpoint: "https://push.example/sub1", keys: { p256dh: Buffer.from(await webcrypto.subtle.exportKey("raw", ua.publicKey)).toString("base64url"), auth: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url") } };
const TOKEN = "REMTEST123456789";
const store = new Map();
store.set(TOKEN, JSON.stringify({ language: "pl", pushSubscriptions: [sub], guardedConnections: [A, B], updatedAt: new Date().toISOString() }));
const env = { PUSH_TICK_SECRET: "s", VAPID_PRIVATE_KEY: JSON.stringify(jwk), USER_PROFILES: {
  get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); }, list: async () => ({ keys: [], list_complete: true }) } };
let delayB = 0, cancelB = false, pushes = 0, plk = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  if (u.startsWith("https://push.example/")) { pushes++; return new Response("", { status: 201 }); }
  if (u.includes("/api/train-details")) {
    plk++;
    const isB = u.includes("orderId=PB"), c = isB ? B : A, d = isB ? delayB : 0;
    return new Response(JSON.stringify({ status: isB && cancelB ? "cancelled" : "", delay: d, lastConfirmedStation: "", route: [
      { stationName: "Tarnowskie Góry", status: "upcoming", plannedDeparture: c.legs[0].board.time, forecastDepartureDelay: d, platform: "2" },
      { stationName: "Katowice", status: "upcoming", plannedArrival: c.legs[0].alight.time, forecastArrivalDelay: d }] }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
};
const run = async () => { pushes = 0; plk = 0; const r = await tick.onRequestPost({ request: new Request("https://app.test/api/remind-tick", { method: "POST", headers: { Authorization: "Bearer s" } }), env }); return r.json(); };

let fail = 0;
const check = (ok, label, extra) => { console.log((ok ? "  ✔ " : "  ✘ ") + label + (ok ? "" : "  " + JSON.stringify(extra))); if (!ok) fail++; };

// 1. zapis ustawień przez profil → indeks
const put = await prof.onRequest({ request: new Request("https://app.test/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: TOKEN, patch: { guardReminders: {
  [A.id]: { on: true, walk: 10, mins: [15, 5], date: today }, [B.id]: { on: true, walk: 0, mins: [20], date: today } } } }) }), env });
const idx = JSON.parse(store.get("remind:index") || "{}");
check(put.status === 200 && idx[TOKEN] === today, "profil z przypomnieniami trafia do indeksu remind:index", idx);

// 2. B opóźniony +8 → B czeka; A „15 min” wysłane teraz
delayB = 8;
let r = await run();
check(r.sent === 1 && pushes === 1, "A: „za 15 min wyjście” o czasie; B (opóźnienie +8) jeszcze nie", r);
// 3. ta sama minuta jeszcze raz — bez powtórki A, B dalej czeka
r = await run();
check(pushes === 0, "bez powtórki w tej samej minucie", r);
// 4. B odwołany → wysłane od razu
cancelB = true;
r = await run();
check(pushes === 1, "B odwołany wg PLK — przypomnienie od razu", r);
// 5. treść: peron, opóźnienie/odwołanie
const sent = JSON.parse(store.get("remindsent:" + TOKEN) || "{}");
check(sent.date === today && sent.keys.length === 2, "zapamiętane wysłane: 2", sent);
// 6. wyłączenie przypomnień → profil wypada z indeksu
await prof.onRequest({ request: new Request("https://app.test/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: TOKEN, patch: { guardReminders: {} } }) }), env });
check(!(TOKEN in JSON.parse(store.get("remind:index") || "{}")), "po wyłączeniu profil znika z indeksu");
globalThis.fetch = realFetch;
console.log(fail ? "\n" + fail + " błędów" : "\nwszystko OK");
process.exit(fail ? 1 : 0);
