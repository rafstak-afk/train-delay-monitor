export async function onRequest(context) {
  const request = context.request;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders()
    });
  }

  const url = new URL(request.url);
  const station = clean(url.searchParams.get("station"));

  if (!station) {
    return json({
      ok: false,
      error: "Missing station"
    }, 400);
  }

  try {
    const result = await resolveStationLink(station);

    return json({
      ok: true,
      station,
      ...result
    });
  } catch (error) {
    return json({
      ok: false,
      station,
      error: error.message,
      catalogLink: catalogUrl(station),
      stationLink: catalogUrl(station)
    }, 500);
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function clean(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x3D;/g, "=")
    .replace(/&#x3F;/g, "?")
    .replace(/&#x26;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogUrl(station) {
  return `https://portalpasazera.pl/KatalogStacji/Index?stacja=${encodeURIComponent(station)}`;
}

function absoluteUrl(href) {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `https://portalpasazera.pl${href}`;
  return `https://portalpasazera.pl/${href}`;
}

async function fetchTextCached(url, ttl = 86400) {
  const cache = caches.default;
  const key = new Request(url, { method: "GET" });

  const cached = await cache.match(key);
  if (cached) {
    return cached.text();
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Portal ${response.status}`);
  }

  await cache.put(
    key,
    new Response(text, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": `public, max-age=${ttl}`
      }
    })
  );

  return text;
}

async function resolveStationLink(station) {
  const catalogLink = catalogUrl(station);
  const html = await fetchTextCached(catalogLink);

  const displayHref = findDisplayHref(html);

  if (displayHref) {
    const stationLink = absoluteUrl(displayHref);

    return {
      type: "display",
      stationLink,
      catalogLink
    };
  }

  return {
    type: "catalog",
    stationLink: catalogLink,
    catalogLink
  };
}

function findDisplayHref(html) {
  const patterns = [
    /<a[^>]+href=["']([^"']*(?:Wyswietlacz|Wyświetlacz|wyswietlacz)[^"']*)["'][^>]*>\s*Wyświetlacz stacyjny\s*<\/a>/i,
    /<a[^>]+href=["']([^"']*(?:Wyswietlacz|Wyświetlacz|wyswietlacz)[^"']*)["'][^>]*>/i,
    /href=["']([^"']*sid=[^"']*)["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return clean(match[1]);
    }
  }

  return "";
}
