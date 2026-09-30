// Statystyki adopcji: ile jest aktywnych profili i ile powstało niedawno.
// Chronione tym samym kluczem co /api/survey (SURVEY_ADMIN), żeby nie
// zakładać kolejnego hasła do zapamiętania.
//
// Liczymy wyłącznie z METADANYCH kluczy w KV (list()), nie odczytując
// zawartości każdego profilu — szybciej i taniej niż pobieranie wszystkiego.
// Metadane (createdAt/updatedAt) dopisujemy dopiero od tej zmiany, więc
// profile założone wcześniej trafiają do "unknownMeta": widzimy, że
// istnieją, ale nie znamy ich daty — uczciwie pokazujemy to osobno,
// zamiast zgadywać.
const CORS_JSON = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const TOKEN_RE = /^[A-Z0-9]{16}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_JSON });
}

function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }
  if (!env.USER_PROFILES) {
    return json({ ok: false, error: "Brak skonfigurowanego magazynu (KV binding USER_PROFILES)." }, 500);
  }
  const secret = String(env.SURVEY_ADMIN || "");
  if (secret.length < 8) {
    return json({ ok: false, error: "Statystyki nie są jeszcze skonfigurowane (zmienna SURVEY_ADMIN)." }, 503);
  }
  if (!safeEqual(request.headers.get("X-Survey-Key"), secret)) {
    return json({ ok: false, error: "Nieprawidłowy klucz." }, 401);
  }

  const now = Date.now();
  const day7 = now - 7 * DAY_MS;
  const day30 = now - 30 * DAY_MS;

  let total = 0, active7 = 0, active30 = 0, createdLast7 = 0, createdLast30 = 0, unknownMeta = 0;
  let cursor;
  let pages = 0;

  do {
    const page = await env.USER_PROFILES.list({ cursor, limit: 1000 });
    for (const k of page.keys) {
      if (!TOKEN_RE.test(k.name)) continue; // pomijamy klucze diagnostyczne (survey:*, surveyrl:*, profilecreate:*)
      total++;
      const md = k.metadata;
      if (!md || !md.updatedAt) { unknownMeta++; continue; }
      const uAt = Date.parse(md.updatedAt) || 0;
      const cAt = Date.parse(md.createdAt || md.updatedAt) || 0;
      if (uAt >= day7) active7++;
      if (uAt >= day30) active30++;
      if (cAt >= day7) createdLast7++;
      if (cAt >= day30) createdLast30++;
    }
    cursor = page.list_complete ? undefined : page.cursor;
    pages++;
  } while (cursor && pages < 50); // bezpiecznik — przy hobbystycznej skali to i tak nigdy nie zadziała

  return json({
    ok: true,
    stats: { total, active7, active30, createdLast7, createdLast30, unknownMeta }
  });
}
