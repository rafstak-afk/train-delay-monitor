const CORS_JSON = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const MAX_PATCH_BYTES = 200000;
const TOKEN_RE = /^[A-Z0-9]{16}$/;

// Profil wygasa sam (Cloudflare KV usuwa klucz po TTL) po tylu sekundach
// BEZ żadnego zapisu. Każdy PUT — czyli każda realna czynność w aplikacji
// (wyszukanie stacji, dodanie pociągu, alarm, obejrzenie biegu) — odświeża
// ten licznik od nowa, więc aktywnie używany profil nigdy nie wygasa.
// Ma to czyścić tokeny porzucone/zapomniane, nie karać rzadkiego użycia.
const PROFILE_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 dni

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_JSON });
}

function normalizeToken(raw) {
  return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function isValidToken(token) {
  return TOKEN_RE.test(token);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_JSON });
  }

  if (!env.USER_PROFILES) {
    return json({
      ok: false,
      error: "Brak skonfigurowanego magazynu profili (KV binding USER_PROFILES)."
    }, 500);
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const token = normalizeToken(url.searchParams.get("token"));

    if (!isValidToken(token)) {
      return json({ ok: false, error: "Nieprawidłowy token" }, 400);
    }

    const raw = await env.USER_PROFILES.get(token);

    return json({
      ok: true,
      data: raw ? JSON.parse(raw) : null
    });
  }

  if (request.method === "PUT") {
    let body;

    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "Nieprawidłowe dane JSON" }, 400);
    }

    const token = normalizeToken(body?.token);

    if (!isValidToken(token)) {
      return json({ ok: false, error: "Nieprawidłowy token" }, 400);
    }

    const patch = body?.patch;

    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return json({ ok: false, error: "Brak danych do zapisania (patch)" }, 400);
    }

    const patchJson = JSON.stringify(patch);

    if (patchJson.length > MAX_PATCH_BYTES) {
      return json({ ok: false, error: "Za duże dane (limit 200KB)" }, 413);
    }

    const existingRaw = await env.USER_PROFILES.get(token);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};

    const merged = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    await env.USER_PROFILES.put(token, JSON.stringify(merged), {
      expirationTtl: PROFILE_TTL_SECONDS
    });

    return json({ ok: true, data: merged });
  }

  return json({ ok: false, error: "Niedozwolona metoda" }, 405);
}
