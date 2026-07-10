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

  const keys = [
    'stations',
    'items',
    'content',
    'results',
    'records',
    'data'
  ];

  for (const key of keys) {
    const value = data[key];

    if (Array.isArray(value)) return value;

    if (value && typeof value === 'object') {
      for (const nestedKey of keys) {
        if (Array.isArray(value[nestedKey])) {
          return value[nestedKey];
        }
      }
    }
  }

  return [];
}

function stationId(item) {
  return String(
    item?.id ??
    item?.stationId ??
    item?.stopId ??
    item?.stopPointId ??
    ''
  ).trim();
}

function stationName(item) {
  return String(
    item?.name ??
    item?.stationName ??
    item?.stopName ??
    item?.displayName ??
    item?.shortName ??
    ''
  ).trim();
}

async function getDictionary(apiKey) {
  const url = `${PLK_BASE}/dictionaries/stations?pageSize=100000`;
  const cache = caches.default;

  const cacheKey = new Request(
    'https://cache.local/' + btoa(url),
    { method: 'GET' }
  );

  const cached = await cache.match(cacheKey);

  if (cached) {
    return {
      data: await cached.json(),
      cache: 'HIT'
    };
  }

  const response = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      'Accept': 'application/json'
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`PLK HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const data = JSON.parse(text);

  await cache.put(
    cacheKey,
    new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL}`
      }
    })
  );

  return {
    data,
    cache: 'MISS'
  };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const apiKey =
    context.env.PLK_API_KEY ||
    context.env.PDP_API_KEY ||
    '';

  if (!apiKey) {
    return json({
      ok: false,
      error: 'Brak PLK_API_KEY/PDP_API_KEY'
    }, 500);
  }

  const requested = [
    ...new Set(
      (url.searchParams.get('ids') || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    )
  ];

  if (!requested.length) {
    return json({
      ok: false,
      error: 'Brak parametru ids'
    }, 400);
  }

  try {
    const dictionary = await getDictionary(apiKey);
    const rows = extractArray(dictionary.data);
    const wanted = new Set(requested);
    const names = {};

    for (const row of rows) {
      const id = stationId(row);

      if (!id || !wanted.has(id)) continue;

      const name = stationName(row);

      if (name) {
        names[id] = name;
      }

      if (Object.keys(names).length === requested.length) {
        break;
      }
    }

    return json({
      ok: true,
      requested,
      names,
      missing: requested.filter(id => !names[id]),
      cache: dictionary.cache,
      dictionaryRows: rows.length
    });
  } catch (error) {
    return json({
      ok: false,
      error: 'Nie udało się pobrać nazw stacji',
      details: error.message
    }, 502);
  }
}
