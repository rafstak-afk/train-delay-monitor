// Przypomnienia o wyjściu z domu (🛡️ Pilnowane → ⏰ Przypomnij) — wywoływane co minutę przez Worker
// push-tick-cron. Czyta tylko profile z indeksu remind:index (bez list() całej bazy). Pociąg sprawdza w PLK
// dopiero, gdy przypomnienie jest „na już” (opóźnienie przesuwa wyjście), więc zapytań jest kilka na podróż.
// Wysłane przypomnienia: KV remindsent:<token> — zapis tylko przy wysyłce.
import { buildPushHTTPRequest } from "../_pushforge/main.js";
import GuardCoreMod from "../../guard-core.js";
const G = (GuardCoreMod && GuardCoreMod.remindPlan) ? GuardCoreMod : globalThis.GuardCore;

const ADMIN_CONTACT = "mailto:rafstak@gmail.com";
const INDEX_KEY = "remind:index";
const SENT_PREFIX = "remindsent:";
const LATE_MAX = 15;   // spóźnione o więcej (np. przerwa w cronie) — już nie wysyłamy

function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }); }
function warsawNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: p.year + "-" + p.month + "-" + p.day, min: (+p.hour % 24) * 60 + (+p.minute) };
}
async function fetchJson(origin, path) {
  try { const r = await fetch(origin + path, { headers: { Accept: "application/json" } }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}
async function sendPush(env, subscription, payload) {
  const { endpoint, headers, body } = await buildPushHTTPRequest({ privateJWK: env.VAPID_PRIVATE_KEY, subscription, message: { payload, adminContact: ADMIN_CONTACT, options: { ttl: 900 } } });
  const res = await fetch(endpoint, { method: "POST", headers, body });
  return res.status;
}
// Pilnowane połączenia profilu: ręczne + z planu dzienniczka (jak w push-tick).
function connectionsOf(profile) {
  const manual = Array.isArray(profile.guardedConnections) ? profile.guardedConnections.filter(c => c && c.id && Array.isArray(c.legs) && c.legs.length) : [];
  const list = manual.slice();
  const s = profile.guardSettings && typeof profile.guardSettings === "object" ? profile.guardSettings : {};
  if (s.autoPlan !== false) {
    const off = Array.isArray(profile.guardPlanOff) ? profile.guardPlanOff : [];
    const have = new Set(manual.map(c => c.id));
    for (const c of G.fromPlannedTrips(profile.plannedTrips)) if (!off.includes(c.id) && !have.has(c.id) && !have.has(c.id.replace(/^plan:/, ""))) list.push(c);
  }
  return list;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.USER_PROFILES || !env.VAPID_PRIVATE_KEY || !env.PUSH_TICK_SECRET) return json({ ok: false, error: "config" }, 500);
  if ((request.headers.get("Authorization") || "") !== "Bearer " + env.PUSH_TICK_SECRET) return json({ ok: false, error: "Nieautoryzowany" }, 401);
  const origin = new URL(request.url).origin;
  const now = warsawNow();
  const sum = { profiles: 0, due: 0, sent: 0, plk: 0, errors: [] };
  let idx = {};
  try { idx = JSON.parse((await env.USER_PROFILES.get(INDEX_KEY)) || "{}") || {}; } catch (e) {}
  const trainCache = new Map();
  let gzmRt = null;
  const reading = async (leg, date) => {
    if (leg.mode === "gzm") {
      if (!gzmRt) gzmRt = fetchJson(origin, "/api/gzm-rt");
      const rt = await gzmRt; return G.readLeg(leg, { gzm: true, t: rt && rt.ok && rt.trips ? rt.trips[leg.trip] || null : null });
    }
    if (!leg.orderId) return null;
    const k = leg.scheduleId + "|" + leg.orderId + "|" + date;
    if (!trainCache.has(k)) {
      sum.plk++;
      const q = new URLSearchParams({ scheduleId: leg.scheduleId || "", orderId: leg.orderId, operatingDate: date, train: (leg.train && leg.train.number) || "" });
      trainCache.set(k, fetchJson(origin, "/api/train-details?" + q));
    }
    const d = await trainCache.get(k);
    return d ? G.readLeg(leg, d) : null;
  };

  for (const token of Object.keys(idx)) {
    if (idx[token] < now.date) continue;
    let profile = null;
    try { profile = JSON.parse((await env.USER_PROFILES.get(token)) || "null"); } catch (e) {}
    if (!profile) continue;
    const subs = Array.isArray(profile.pushSubscriptions) ? profile.pushSubscriptions : [];
    const rem = profile.guardReminders && typeof profile.guardReminders === "object" ? profile.guardReminders : {};
    if (!subs.length) continue;
    sum.profiles++;
    const lang = typeof profile.language === "string" ? profile.language : "pl";
    let sent = null, sentDirty = false;
    for (const c of connectionsOf(profile)) {
      const cfg = rem[c.id];
      if (!cfg || !cfg.on || c.date !== now.date) continue;
      const base = G.remindPlan(c, cfg, 0); if (!base) continue;
      for (const f of base.fires) {
        if (now.min < f.at || now.min > f.at + 120) continue;   // jeszcze nie / dawno po czasie (nawet z opóźnieniem)
        if (!sent) { try { sent = JSON.parse((await env.USER_PROFILES.get(SENT_PREFIX + token)) || "{}") || {}; } catch (e) { sent = {}; } if (sent.date !== now.date) sent = { date: now.date, keys: [] }; }
        const key = c.id + "|" + f.m;
        if (sent.keys.includes(key)) continue;
        sum.due++;
        const r = await reading(c.legs[0], c.date);
        const shift = G.remindShift(r);
        const plan = G.remindPlan(c, cfg, shift);
        const at = f.at + shift;
        if (!(r && r.cancelled) && now.min < at) continue;           // pociąg opóźniony — przypomnienie później
        sent.keys.push(key); sentDirty = true;
        if (now.min > at + LATE_MAX) continue;
        const t = G.remindText(lang, { m: f.m, conn: c, reading: r, plan, shift });
        const payload = JSON.stringify({ title: t.title, body: t.body, url: "/planer/?gid=" + encodeURIComponent(c.id) + "#pilnowane", tag: "remind-" + c.id + "-" + f.m, kind: "remind" });
        // nieaktualne subskrypcje (404/410) sprząta push-tick — tu tylko wysyłka
        for (const sub of subs) {
          try { await sendPush(env, sub, payload); sum.sent++; }
          catch (e) { sum.errors.push(token.slice(0, 4) + " push: " + e.message); }
        }
      }
    }
    if (sentDirty) await env.USER_PROFILES.put(SENT_PREFIX + token, JSON.stringify(sent), { expirationTtl: 60 * 60 * 48 });
  }
  return json({ ok: true, now, ...sum });
}
