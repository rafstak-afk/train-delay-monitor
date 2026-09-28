// Adres, na który trafiają uwagi z formularza /kontakt/. Trzymamy go w
// zmiennej środowiskowej FEEDBACK_TO (Cloudflare Pages -> Settings ->
// Variables), a nie w kodzie — repozytorium jest publiczne, więc adres
// wpisany w plik zostałby w historii Gita na zawsze.
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: HEADERS
    });
  }

  const to = String(env.FEEDBACK_TO || "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return new Response(JSON.stringify({
      ok: false,
      error: "Adres kontaktowy nie jest jeszcze skonfigurowany."
    }), { status: 503, headers: HEADERS });
  }

  return new Response(JSON.stringify({ ok: true, to }), { headers: HEADERS });
}
