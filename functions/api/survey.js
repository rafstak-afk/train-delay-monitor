// Ankieta zadowolenia (1-5 gwiazdek).
//
// POST /api/survey  {stars, hasToken, version}  -> zapisuje odpowiedź
// GET  /api/survey  (nagłówek X-Survey-Key)     -> statystyki dla strony
//                                                  /ankieta-wyniki/
// DELETE /api/survey (nagłówek X-Survey-Key)    -> zeruje statystyki
//
// Nie zapisujemy ani tokenu profilu, ani adresu IP. Zamiast pojedynczych
// odpowiedzi trzymamy jeden zbiorczy rekord (liczniki + ostatnie 50 wpisów),
// więc odczyt wyników to jedno zapytanie do KV — lista i pobieranie setek
// kluczy przekroczyłyby limit zapytań jednej funkcji.
//
// Sekret do odczytu: zmienna SURVEY_ADMIN (min. 8 znaków) w ustawieniach
// Cloudflare Pages.
const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const STATS_KEY = "survey:stats";
const MAX_PER_IP_PER_DAY = 5;
const MAX_BODY_CHARS = 400;
const MAX_VERSIONS = 40;
const MAX_RECENT = 50;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function emptyStats() {
  return {
    total: 0,
    sum: 0,
    dist: [0, 0, 0, 0, 0],
    token: { n: 0, sum: 0 },
    anon: { n: 0, sum: 0 },
    versions: {},
    recent: []
  };
}

// Skrót adresu IP tylko do limitu nadużyć; sól to sekret, więc skrótu nie
// da się łatwo odwrócić. Sam skrót żyje w KV maks. 2 doby.
async function ipHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const data = new TextEncoder().encode(ip + "|" + (env.SURVEY_ADMIN || "salt"));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .slice(0, 12)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handlePost(request, env) {
  let raw = "";
  try {
    raw = await request.text();
  } catch (e) {
    return json({ ok: false, error: "Bad request" }, 400);
  }
  if (raw.length > MAX_BODY_CHARS) return json({ ok: false, error: "Za duże żądanie." }, 413);

  let body = null;
  try {
    body = JSON.parse(raw);
  } catch (e) {
    return json({ ok: false, error: "Niepoprawny JSON." }, 400);
  }

  const stars = Number(body && body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return json({ ok: false, error: "Ocena musi być liczbą od 1 do 5." }, 400);
  }
  const hasToken = body.hasToken === true;
  let version = String(body.version || "").trim();
  if (!/^v\. 0\.\d{1,4}$/.test(version)) version = "inna";

  // Limit odpowiedzi z jednego adresu na dobę.
  const day = new Date().toISOString().slice(0, 10);
  const rlKey = "surveyrl:" + (await ipHash(request, env)) + ":" + day;
  const used = parseInt((await env.USER_PROFILES.get(rlKey)) || "0", 10) || 0;
  if (used >= MAX_PER_IP_PER_DAY) {
    return json({ ok: false, error: "Dziś przyjęliśmy już wystarczająco odpowiedzi z tego adresu." }, 429);
  }
  await env.USER_PROFILES.put(rlKey, String(used + 1), { expirationTtl: 172800 });

  let stats = null;
  try {
    stats = await env.USER_PROFILES.get(STATS_KEY, "json");
  } catch (e) {
    stats = null;
  }
  if (!stats || typeof stats !== "object") stats = emptyStats();
  stats = Object.assign(emptyStats(), stats);

  stats.total += 1;
  stats.sum += stars;
  stats.dist[stars - 1] = (stats.dist[stars - 1] || 0) + 1;
  const bucket = hasToken ? stats.token : stats.anon;
  bucket.n += 1;
  bucket.sum += stars;

  const vKey = (stats.versions[version] || Object.keys(stats.versions).length < MAX_VERSIONS) ? version : "inna";
  const v = stats.versions[vKey] || { n: 0, sum: 0 };
  v.n += 1;
  v.sum += stars;
  stats.versions[vKey] = v;

  stats.recent.unshift({ at: new Date().toISOString(), stars, t: hasToken ? 1 : 0, v: version });
  stats.recent = stats.recent.slice(0, MAX_RECENT);

  await env.USER_PROFILES.put(STATS_KEY, JSON.stringify(stats));
  return json({ ok: true });
}

// Wspólne sprawdzenie klucza dla odczytu i zerowania wyników.
function checkAdmin(request, env) {
  const secret = String(env.SURVEY_ADMIN || "");
  if (secret.length < 8) {
    return json({ ok: false, error: "Wyniki nie są jeszcze skonfigurowane (zmienna SURVEY_ADMIN)." }, 503);
  }
  if (!safeEqual(request.headers.get("X-Survey-Key"), secret)) {
    return json({ ok: false, error: "Nieprawidłowy klucz." }, 401);
  }
  return null;
}

async function handleDelete(request, env) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;
  await env.USER_PROFILES.delete(STATS_KEY);
  return json({ ok: true });
}

async function handleGet(request, env) {
  const denied = checkAdmin(request, env);
  if (denied) return denied;
  let stats = null;
  try {
    stats = await env.USER_PROFILES.get(STATS_KEY, "json");
  } catch (e) {
    stats = null;
  }
  return json({ ok: true, stats: Object.assign(emptyStats(), stats || {}) });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.USER_PROFILES) {
    return json({ ok: false, error: "Brak skonfigurowanego magazynu (KV binding USER_PROFILES)." }, 500);
  }
  if (request.method === "POST") return handlePost(request, env);
  if (request.method === "GET") return handleGet(request, env);
  if (request.method === "DELETE") return handleDelete(request, env);
  return json({ ok: false, error: "Method not allowed" }, 405);
}
