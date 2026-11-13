// „📋 Moja lista” (TODO 58) — TYLKO profil autora (showVersion w profilu). Czyta TODO.md z prywatnego repozytorium
// czy-zdaze-notatki i zamienia ruchy autora (odpowiedź, zamknij, otwórz ponownie, nowe zadanie) na zgłoszenia GitHub
// z etykietą „z listy” — Claude przenosi je do TODO.md przy następnej rozmowie. Bez zapisów KV.
// Klucz: sekret NOTES_GH_TOKEN w Cloudflare Pages (fine-grained, tylko czy-zdaze-notatki: Contents read, Issues read/write).
const TOKEN_RE = /^[A-Z0-9]{16}$/;
const REPO = "rafstak-afk/czy-zdaze-notatki", API = "https://api.github.com/repos/" + REPO;
const KINDS = { reply: "💬 Odpowiedź", close: "✅ Zamknij", reopen: "↩️ Otwórz ponownie", new: "➕ Nowe zadanie", comment: "📝 Komentarz" };
function json(d, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
function normalizeToken(raw) { return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(); }

function gh(env, path, init = {}) {
  return fetch(API + path, Object.assign({}, init, { headers: Object.assign({ Authorization: "Bearer " + env.NOTES_GH_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "czy-zdaze-app", "X-GitHub-Api-Version": "2022-11-28" }, init.headers || {}) }));
}

function parseTodo(md) {
  const sections = []; let sec = null, item = null;
  const intro = [];
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const h = line.match(/^## (.+)$/);
    if (h) { sec = { title: h[1].trim(), items: [] }; sections.push(sec); item = null; continue; }
    const m = line.match(/^\*\*(\d+)\.\*\*\s?(.*)$/);
    if (m && sec) { item = { n: +m[1], text: m[2] }; sec.items.push(item); continue; }
    if (item) item.text += "\n" + line; else if (!sec) intro.push(line);
  }
  for (const s of sections) for (const it of s.items) it.text = it.text.replace(/\s+$/, "").replace(/ {2}\n/g, "\n");
  return { intro: intro.join("\n").trim(), sections };
}

export async function onRequestPost({ request, env }) {
  let body = null;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "Zły format" }, 400); }
  const token = normalizeToken(body && body.token);
  if (!TOKEN_RE.test(token)) return json({ ok: false, error: "Brak profilu" }, 403);
  let profile = null;
  try { profile = JSON.parse((await env.USER_PROFILES.get(token)) || "null"); } catch (e) {}
  if (!profile || profile.showVersion !== true) return json({ ok: false, error: "Tylko dla autora" }, 403);
  if (!env.NOTES_GH_TOKEN) return json({ ok: false, error: "nokey" }, 503);

  if (body.action === "list") {
    const [f, iss] = await Promise.all([
      gh(env, "/contents/TODO.md", { headers: { Accept: "application/vnd.github.raw" } }),
      gh(env, "/issues?state=open&labels=" + encodeURIComponent("z listy") + "&per_page=100")
    ]);
    if (!f.ok) return json({ ok: false, error: "GitHub " + f.status }, 502);
    const todo = parseTodo(await f.text());
    const pending = iss.ok ? (await iss.json()).map(i => ({ n: (i.title.match(/^\[TODO (\d+)\]/) || [])[1] || null, title: i.title, body: (i.body || "").slice(0, 400), at: i.created_at, url: i.html_url })) : [];
    return json({ ok: true, ...todo, pending });
  }

  if (body.action === "move") {
    const kind = String(body.kind || ""), n = parseInt(body.n, 10), text = String(body.text || "").slice(0, 6000).trim();
    if (!KINDS[kind]) return json({ ok: false, error: "Zły rodzaj" }, 400);
    if (kind !== "new" && !(n > 0)) return json({ ok: false, error: "Brak numeru" }, 400);
    if ((kind === "reply" || kind === "new" || kind === "comment") && !text) return json({ ok: false, error: "Pusty wpis" }, 400);
    const title = (kind === "new" ? "" : "[TODO " + n + "] ") + KINDS[kind] + (kind === "new" ? ": " + text.split("\n")[0].slice(0, 70) : "");
    const r = await gh(env, "/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body: (text || "(bez komentarza)") + "\n\n— z „📋 Moja lista” w aplikacji", labels: ["z listy", "nowe"] }) });
    if (!r.ok) return json({ ok: false, error: r.status === 403 || r.status === 404 ? "klucz GitHub nie ma uprawnienia Issues: Read and write (GitHub " + r.status + ")" : "GitHub " + r.status }, 502);
    const j = await r.json();
    return json({ ok: true, number: j.number, url: j.html_url });
  }
  return json({ ok: false, error: "Nieznana akcja" }, 400);
}
