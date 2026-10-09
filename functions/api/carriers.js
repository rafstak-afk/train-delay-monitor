// Lista przewoźników (do filtra "wyklucz przewoźnika" w planerze podróży) —
// ten sam wzorzec co stations.js: jeden długo cache'owany słownik PLK.
const PLK_BASE = 'https://pdp-api.plk-sa.pl/api/v1';
const CACHE_TTL = 86400;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}

function extractArray(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.carriers)) return data.carriers;
  return [];
}

async function getDictionary(apiKey) {
  const url = `${PLK_BASE}/dictionaries/carriers`;
  const cache = caches.default;
  const cacheKey = new Request('https://cache.local/' + btoa(url), { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if (cached) {
    return { data: await cached.json(), cache: 'HIT' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  let response;
  try {
    response = await fetch(url, {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' },
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('PLK dictionaries/carriers: upstream timeout po 9000ms');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PLK HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = JSON.parse(text);
  await cache.put(cacheKey, new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL}`
    }
  }));

  return { data, cache: 'MISS' };
}

export async function onRequestGet(context) {
  const apiKey = context.env.PLK_API_KEY || context.env.PDP_API_KEY || '';

  if (!apiKey) {
    return json({ ok: false, error: 'Brak PLK_API_KEY/PDP_API_KEY' }, 500);
  }

  try {
    const dictionary = await getDictionary(apiKey);
    const rows = extractArray(dictionary.data);
    const now = Date.now();

    const carriers = rows
      .filter(r => r.code && r.name)
      // Niektóre wpisy w słowniku PLK mają już nieaktualny okres
      // ważności (np. stary podmiot przewoźnika po rebrandingu) —
      // pomijamy je, żeby lista checkboxów nie puchła historycznymi
      // nazwami, których nie zobaczysz już w żadnym realnym kursie.
      .filter(r => !r.validTo || new Date(r.validTo).getTime() >= now)
      .map(r => ({ code: String(r.code).trim(), name: String(r.name).trim() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));

    return json({ ok: true, carriers, cache: dictionary.cache });
  } catch (error) {
    return json({ ok: false, error: 'Nie udało się pobrać listy przewoźników', details: error.message }, 502);
  }
}
