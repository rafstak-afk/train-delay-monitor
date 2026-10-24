// Zapisuje/usuwa subskrypcję Web Push (PushSubscription z przeglądarki) w
// profilu użytkownika (ten sam magazyn KV co profile.js) — osobny endpoint,
// nie zwykłe PUT /api/profile, bo tamto robi płytki merge całego pola i
// nadpisałoby subskrypcje INNYCH urządzeń pod tym samym tokenem. Tutaj
// scalamy tablicę pushSubscriptions po "endpoint" (jedno urządzenie = jeden
// endpoint), więc telefon i komputer pod tym samym profilem współistnieją.
//
// Wymaga ISTNIEJĄCEGO profilu (token) — subskrypcja push bez profilu nie ma
// gdzie "mieszkać" po stronie serwera (localStorage jest niewidoczne dla
// cyklicznego sprawdzania w tle, push-tick.js), więc świadomie NIE tworzymy
// tu nowego profilu samą subskrypcją.

const CORS_JSON = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const TOKEN_RE = /^[A-Z0-9]{16}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_JSON });
}

function normalizeToken(raw) {
  return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function isValidSubscription(sub) {
  return !!(
    sub &&
    typeof sub.endpoint === "string" &&
    sub.endpoint.startsWith("https://") &&
    sub.keys &&
    typeof sub.keys.p256dh === "string" &&
    typeof sub.keys.auth === "string"
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_JSON });
  }

  if (!env.USER_PROFILES) {
    return json({ ok: false, error: "Brak skonfigurowanego magazynu profili (KV binding USER_PROFILES)." }, 500);
  }

  if (request.method !== "POST" && request.method !== "DELETE") {
    return json({ ok: false, error: "Niedozwolona metoda" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: "Nieprawidłowe dane JSON" }, 400);
  }

  const token = normalizeToken(body?.token);
  if (!TOKEN_RE.test(token)) {
    return json({ ok: false, error: "Nieprawidłowy token" }, 400);
  }

  const existingRaw = await env.USER_PROFILES.get(token);
  if (!existingRaw) {
    return json({ ok: false, code: "no_profile", error: "Nie ma takiego profilu — załóż profil, żeby alarmy mogły działać w tle." }, 404);
  }

  const profile = JSON.parse(existingRaw);
  const current = Array.isArray(profile.pushSubscriptions) ? profile.pushSubscriptions : [];

  if (request.method === "POST") {
    const sub = body?.subscription;
    if (!isValidSubscription(sub)) {
      return json({ ok: false, error: "Nieprawidłowa subskrypcja push" }, 400);
    }
    // Ta sama subskrypcja przychodzi ponownie przy każdym otwarciu strony z
    // włączonym alarmem — zachowujemy istniejący wpis (addedAt i stan
    // deduplikacji z push-tick: notifiedTrain/notifiedStation), podmieniając
    // tylko klucze. Wcześniej wpis tworzony od nowa gubił ten stan i każde
    // otwarcie aplikacji kończyło się ponownym pushem wszystkich opóźnień.
    //
    // `previousEndpoint` — poprzednia subskrypcja TEGO urządzenia (gdy
    // przeglądarka wydała nową): usuwamy ją, żeby urządzenie nie dostawało
    // każdego powiadomienia dwa razy.
    const previous = typeof body?.previousEndpoint === "string" ? body.previousEndpoint : "";
    const existing = current.find(s => s.endpoint === sub.endpoint);
    const others = current.filter(s => s.endpoint !== sub.endpoint && (!previous || s.endpoint !== previous));
    profile.pushSubscriptions = [
      ...others,
      existing
        ? { ...existing, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }
        : { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, addedAt: new Date().toISOString() }
    ];
  } else {
    const endpoint = String(body?.endpoint || "");
    profile.pushSubscriptions = current.filter(s => s.endpoint !== endpoint);
  }

  // Świadomie NIE ruszamy profile.updatedAt — inne strony (np. dziennik)
  // używają go jako znacznika czasu do scalania lokalnych/zdalnych zmian
  // (pendingLocal), a subskrypcja push nie ma z tamtymi danymi nic
  // wspólnego. Podbijamy tylko TTL w KV, bo to oznaka aktywnego użycia.
  await env.USER_PROFILES.put(token, JSON.stringify(profile), {
    expirationTtl: 60 * 60 * 24 * 180,
    metadata: { createdAt: profile.createdAt, updatedAt: profile.updatedAt }
  });

  return json({ ok: true, count: profile.pushSubscriptions.length });
}
