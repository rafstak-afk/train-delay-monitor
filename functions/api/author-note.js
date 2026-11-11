// Notatki dla Claude (TODO 50) — TYLKO profil autora (pole showVersion w profilu). Wpis (tekst + zdjęcia z telefonu)
// trafia do KV pod kluczem authornote:<czas>:<los> na 60 dni; Claude odczytuje je przez wrangler i przenosi do
// prywatnego repozytorium czy-zdaze-notatki. Jeden zapis KV na wpis, bez nowych kluczy ani usług.
const TOKEN_RE = /^[A-Z0-9]{16}$/;
const MAX_TEXT = 8000, MAX_IMAGES = 6, MAX_BYTES = 9 * 1024 * 1024, TTL = 60 * 86400;
function json(d, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
function normalizeToken(raw) { return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(); }

export async function onRequestPost({ request, env }) {
  let body = null;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "Zły format" }, 400); }
  const token = normalizeToken(body && body.token);
  if (!TOKEN_RE.test(token)) return json({ ok: false, error: "Brak profilu" }, 403);
  let profile = null;
  try { profile = JSON.parse((await env.USER_PROFILES.get(token)) || "null"); } catch (e) {}
  if (!profile || profile.showVersion !== true) return json({ ok: false, error: "Tylko dla autora" }, 403);
  const text = String(body.text || "").slice(0, MAX_TEXT).trim();
  const images = (Array.isArray(body.images) ? body.images : []).filter(x => typeof x === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(x)).slice(0, MAX_IMAGES);
  if (!text && !images.length) return json({ ok: false, error: "Pusty wpis" }, 400);
  const size = text.length + images.reduce((a, x) => a + x.length, 0);
  if (size > MAX_BYTES) return json({ ok: false, error: "Za duże zdjęcia" }, 413);
  const at = new Date().toISOString();
  const key = "authornote:" + at + ":" + Math.random().toString(36).slice(2, 8);
  await env.USER_PROFILES.put(key, JSON.stringify({ at, text, images, ua: (request.headers.get("User-Agent") || "").slice(0, 120) }), { expirationTtl: TTL });
  return json({ ok: true, at, images: images.length });
}
