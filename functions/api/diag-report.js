// Automatyczna diagnostyka biegu pociągu (TODO 31): gdy strona biegu pokaże „PLK nie podał danych o ruchu”,
// „PLK nie aktualizuje” albo ≥ 2 stacje „BRAK INFO Z API”, telefon wysyła krótki raport (bez danych osobowych:
// numer pociągu, kurs, stacja, data, diagnostyka). Serwer od razu jeszcze raz pyta o bieg pociągu (train-details sam
// szuka innego kursu, gdy PLK nie ma danych o ruchu) i zapisuje wynik w KV: diagrep:<data>:<pociąg>:<los>, 30 dni.
// Limity: najwyżej 40 raportów na dobę i 1 na pociąg na dobę (1 listowanie + 1 zapis KV na raport).
const MAX_PER_DAY = 40, TTL = 30 * 86400;
function json(d, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
function warsawDate() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date()); }
const clean = (v, n) => String(v == null ? "" : v).replace(/[^\p{L}\p{N} .,:;()\/+\-_|]/gu, "").slice(0, n);


// Pkt 78 (20.11.2026): prosty licznik w pamięci podręcznej Cloudflare (bez zapisów do KV, limit 1000/dobę) —
// chroni przed zalaniem zapisami. Liczy osobno w każdym centrum danych, więc to „hamulec”, nie dokładny licznik.
async function rateOk(request, name, max, ttlSec) {
  try {
    const key = new Request(new URL("/__rl/" + encodeURIComponent(name), request.url).toString());
    const hit = await caches.default.match(key);
    const n = hit ? (parseInt(await hit.text(), 10) || 0) : 0;
    if (n >= max) return false;
    await caches.default.put(key, new Response(String(n + 1), { headers: { "Cache-Control": "max-age=" + ttlSec } }));
  } catch (e) {}
  return true;
}
function rlDay() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" }); }

export async function onRequestPost({ request, env }) {
  let b = null;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: "Zły format" }, 400); }
  const train = clean(b && b.train, 12).replace(/\D/g, "");
  const kind = clean(b && b.kind, 12);
  if (!train || !/^(ops|stale|noinfo)$/.test(kind)) return json({ ok: false, error: "Brak danych" }, 400);
  const day = warsawDate(), prefix = "diagrep:" + day + ":";
  if (!(await rateOk(request, "di:" + (request.headers.get("CF-Connecting-IP") || "?") + ":" + day, 10, 86400)) || !(await rateOk(request, "d:" + day, 80, 86400))) return json({ ok: true, skipped: "rate" });
  const list = await env.USER_PROFILES.list({ prefix, limit: 100 });
  const keys = (list && list.keys) || [];
  if (keys.length >= MAX_PER_DAY) return json({ ok: true, skipped: "limit" });
  if (keys.some(k => k.name.startsWith(prefix + train + ":"))) return json({ ok: true, skipped: "dup" });
  const rep = {
    at: new Date().toISOString(), kind, train,
    station: clean(b.station, 60), scheduleId: clean(b.scheduleId, 10), orderId: clean(b.orderId, 14), date: clean(b.date, 10),
    noInfo: Math.max(0, Math.min(99, +b.noInfo || 0)), lastConfirmed: clean(b.lastConfirmed, 60),
    diag: b.diag && typeof b.diag === "object" ? { opsOk: !!b.diag.opsOk, opsError: clean(b.diag.opsError, 60), confirmed: +b.diag.confirmed || 0, routeStations: +b.diag.routeStations || 0 } : null,
    v: clean(b.v, 12)
  };
  // sprawdzenie na serwerze w tej samej chwili
  try {
    const q = new URLSearchParams({ train, scheduleId: rep.scheduleId, orderId: rep.orderId, operatingDate: rep.date || day, station: rep.station });
    const r = await fetch(new URL("/api/train-details?" + q.toString(), request.url));
    const d = await r.json();
    const route = Array.isArray(d.route) ? d.route : [], conf = route.filter(s => s.status === "confirmed");
    rep.check = { http: r.status, opsOk: !!(d.diag && d.diag.opsOk), opsError: d.diag ? d.diag.opsError : null, altFrom: d.diag ? d.diag.altFrom || null : null,
      orderId: d.orderId || null, confirmed: conf.length, last: conf.length ? conf[conf.length - 1].stationName + " " + (conf[conf.length - 1].actualTime || "") : null };
  } catch (e) { rep.check = { error: String(e && e.message || e).slice(0, 80) }; }
  await env.USER_PROFILES.put(prefix + train + ":" + Math.random().toString(36).slice(2, 7), JSON.stringify(rep), { expirationTtl: TTL });
  return json({ ok: true });
}
