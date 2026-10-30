// /api/gzm-data/<plik> — dane „Przesiadki GZM” z gałęzi `gzm-data` (budowane
// codziennie przez GitHub Action, patrz .github/workflows/gzm-data.yml).
// Repozytorium jest publiczne, więc czytamy surowe pliki z GitHuba i trzymamy
// je w pamięci podręcznej Cloudflare (10 min), żeby nie pytać GitHuba przy
// każdym otwarciu zakładki. Dozwolone tylko konkretne pliki.
const RAW = "https://raw.githubusercontent.com/rafstak-afk/train-delay-monitor/gzm-data/";
const ALLOWED = /^(index\.json|feeders\.json|egress\.json|raport\.json|raport\.html|stations\/\d{1,7}(-arr)?\.json)$/;
const TYPES = { json: "application/json; charset=utf-8", html: "text/html; charset=utf-8" };

export async function onRequestGet(context) {
  const parts = context.params.path;
  const file = Array.isArray(parts) ? parts.join("/") : String(parts || "");
  if (!ALLOWED.test(file)) return new Response(JSON.stringify({ ok: false, error: "nieznany plik" }), { status: 404, headers: { "Content-Type": TYPES.json } });
  try {
    const res = await fetch(RAW + file, { cf: { cacheTtl: 600, cacheEverything: true } });
    if (res.status === 404) return new Response(JSON.stringify({ ok: false, error: "brak danych", file }), { status: 404, headers: { "Content-Type": TYPES.json, "Cache-Control": "public, max-age=60" } });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: "GitHub HTTP " + res.status }), { status: 502, headers: { "Content-Type": TYPES.json } });
    const ext = file.split(".").pop();
    return new Response(res.body, { status: 200, headers: { "Content-Type": TYPES[ext] || "application/octet-stream", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 502, headers: { "Content-Type": TYPES.json } });
  }
}
