// Licznik użyć czatu 💬 (TODO 9) — oszczędnie dla limitu zapisów KV (1000/dobę):
// telefon liczy pytania lokalnie i raz dziennie (przy pierwszym otwarciu w kolejnym dniu) wysyła jeden zbiorczy wpis
// {date, n}. Serwer dodaje go do klucza chatstat:<data> = {devices, questions}. Najwyżej 200 wpisów na dzień.
// Bez danych osobowych: tylko data i liczba pytań.
const MAX_DEVICES = 200, TTL = 400 * 86400;
function json(d, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
function warsawDate(ms) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date(ms)); }

export async function onRequestPost({ request, env }) {
  let b = null;
  try { b = await request.json(); } catch (e) { return json({ ok: false }, 400); }
  const date = String(b && b.date || ""), n = Math.round(+(b && b.n) || 0);
  const now = Date.now();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= warsawDate(now) || date < warsawDate(now - 7 * 86400000)) return json({ ok: false, error: "data" }, 400);
  if (!(n >= 1 && n <= 500)) return json({ ok: false, error: "n" }, 400);
  const key = "chatstat:" + date;
  let cur = { devices: 0, questions: 0 };
  try { cur = JSON.parse((await env.USER_PROFILES.get(key)) || "null") || cur; } catch (e) {}
  if (cur.devices >= MAX_DEVICES) return json({ ok: true, skipped: "limit" });
  cur.devices++; cur.questions += n;
  await env.USER_PROFILES.put(key, JSON.stringify(cur), { expirationTtl: TTL });
  return json({ ok: true });
}
