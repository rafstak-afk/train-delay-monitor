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

// Nowy rekord powstaje TYLKO na wyraźne żądanie ("create": true), które
// wysyła przycisk "Utwórz nowy profil" (albo urządzenie odtwarzające profil,
// który wygasł). Zwykły zapis do nieistniejącego tokenu jest odrzucany —
// inaczej literówka w tokenie zakładała po cichu "profil-widmo". Liczbę
// utworzeń z jednego adresu na dobę ograniczamy, żeby nie dało się
// zaśmiecać bazy pustymi rekordami.
const MAX_CREATES_PER_IP_PER_DAY = 5;

// Skrót adresu IP tylko do tego limitu (klucz żyje w KV maks. 2 doby).
async function ipHash(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const data = new TextEncoder().encode(ip + "|profile-create");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .slice(0, 12)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

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

  if (request.method === "PUT" || request.method === "POST") {
    // POST obsługujemy tak samo jak PUT — potrzebny dla navigator.sendBeacon()
    // (profile-sync.js: pushBeacon), który zawsze wysyła POST i nie umie PUT.
    // sendBeacon dostarcza zapis nawet gdy strona w międzyczasie się zamyka —
    // zwykły fetch() w takiej chwili bywa po cichu przerywany przez przeglądarkę.
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

    if (!existingRaw) {
      if (body?.create !== true) {
        return json({
          ok: false,
          code: "no_profile",
          error: "Nie ma takiego profilu."
        }, 404);
      }

      const day = new Date().toISOString().slice(0, 10);
      const limitKey = "profilecreate:" + (await ipHash(request)) + ":" + day;
      const used = parseInt((await env.USER_PROFILES.get(limitKey)) || "0", 10) || 0;

      if (used >= MAX_CREATES_PER_IP_PER_DAY) {
        return json({
          ok: false,
          code: "create_limit",
          error: "Dziś utworzono już zbyt wiele profili z tego adresu."
        }, 429);
      }

      await env.USER_PROFILES.put(limitKey, String(used + 1), { expirationTtl: 172800 });
    }

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
