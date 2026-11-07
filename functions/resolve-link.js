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
    // Portal nie odpowiada naszemu serwerowi (7.11: błąd 526 — serwer portalu nie wysyła certyfikatu pośredniego;
    // przeglądarki to obchodzą, Cloudflare nie). Zamiast błędu: ostatni dobry link do wyświetlacza (pamięć serwera,
    // potem stała lista najczęstszych stacji), a w ostateczności Katalog Stacji PLK.
    const saved = (await savedDisplayLink(station)) || KNOWN_DISPLAY[station] || "";
    return json({
      ok: true,
      station,
      type: saved ? "display-saved" : "catalog",
      stationLink: saved || catalogUrl(station),
      catalogLink: catalogUrl(station),
      portalError: error.message
    });
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

// Linki do wyświetlaczy pobrane 7.11.2026 z Katalogu Stacji (sprawdzone: każdy otwiera wyświetlacz właściwej stacji).
const KNOWN_DISPLAY = {
  "Tarnowskie Góry": "https://portalpasazera.pl/Wyswietlacz?sid=R0FQU0tJfPlvmpcPVG1Hj5lPX71YhkLyNb4AIWx3h2scc2BAc2meEhxovscc2FANYyw2erSvcraXtbU6zGjUa48ZwAKgPQ282mUQngscc2Sscc2S&src=web",
  "Chorzów Batory": "https://portalpasazera.pl/Wyswietlacz?sid=R0FQU0tJfMME9Pscc2B3uAz1aL5k57WzcqxWNV0hisfvwkdUb3Ou9eTrWtVoJyKRFZyscc2B35fHBh7LGuLF2iamBSggLYxJXTXbdZteBZ1xfHmGMp0kscc2Bw0BtaUscc2S&src=web",
  "Katowice": "https://portalpasazera.pl/Wyswietlacz?sid=R0FQU0tJwvIENzY4zT7CxXXvgoREiCWscc2BEJDROM8Z30okmkoHbRhtscc2BJ0uW5lj58MMscc2BYIscc2FMMscc2FPnhblU2LdYLwYeJFv61MNA7E2JthK1RkM0vescc2FvDALpSUscc2S&src=web",
  "Bytom": "https://portalpasazera.pl/Wyswietlacz?sid=R0FQU0tJSTXGdscc2FBscc2F5P3h8sE10gg0OYfdFGwikCRi0BxFOzPgRscc2FSSpHmd1ioxEscc2BhSIz0Y7o8Y6JAbFscc2Bx19CwIfH0n3b0rgQscc2Sscc2S&src=web",
  "Gliwice": "https://portalpasazera.pl/Wyswietlacz?sid=R0FQU0tJscc2FwTWGXJbGscc2BZ0cKjb4OErIogscc2BgJseFXpxIbLJnuApFMjsaDNdDiDA78FHSm8XWvJ0mVv0NB92RBTtk3C3wFgFrpujI8PMjiJ9yrVuS9ywlXsscc2S&src=web",
  "Kraków Główny": "https://portalpasazera.pl/Wyswietlacz?sid=R0FQU0tJ9V9vm5RO6QnOi4byGxD0zhRhXly4oZqGzlMfpMv3FFyAXaFJrLo56VBiscc2Fy7CWksfCqNjeaqTG5scc2FoQv53bHaUIQscc2Sscc2S&src=web",
  "Rybnik": "https://portalpasazera.pl/Wyswietlacz?sid=R0FQU0tJoscc2FmOvwbAsuV6EAPJtD8bHQHCqR3ZGhoujGmIqYxsukM3QCGvm0K2Xf8OAELWKNvzucux4lKjJ4TfqEqptbQfhByIscc2BCTGgmV8n2rAHE3d2Dwscc2S&src=web",
  "Lubliniec": "https://portalpasazera.pl/Wyswietlacz?sid=R0FQU0tJofHgaB4GUZXFmqq2SzNBMJZrlCttscc2Fzp1lscc2BZzxFoJDDXxwpjOIm3jrI1eyE0vf4p42llPnJkvIxWsw5vSscc2FYZUgSxadtTBH2glvdsf79tTg28scc2S&src=web",
  "Zawiercie": "https://portalpasazera.pl/Wyswietlacz?sid=R0FQU0tJk78Sl6dcVxTrzmOpFscc2FnxM7EcynmpPC9D14Lqj3BIlXVIDyruqiG90Iiiscc2FL5scc2FmcI3qTfzscc2FatGalLXWOxy2hMdSRPM1HnOe5duL0Wr3zx2L7Iscc2S&src=web",
  "Krzeszowice": "https://portalpasazera.pl/Wyswietlacz?sid=R0FQU0tJYzGHllPscc2B5TlAYGUHoDFVguLIcIgKiqtqRPKKueyiroXHY94EqnIW1xWENDIEscc2BMWFGGJzL2ZzJNQ01saGVgTd2cBbzY4iTk80HJMCsZbTy1Ascc2S&src=web"
};

const SAVED_KEY = station => new Request("https://czy-zdaze.internal/display-link/" + encodeURIComponent(station));
async function savedDisplayLink(station) {
  try { const r = await caches.default.match(SAVED_KEY(station)); return r ? (await r.text()).trim() : ""; } catch (e) { return ""; }
}
async function saveDisplayLink(station, link) {
  try { await caches.default.put(SAVED_KEY(station), new Response(link, { headers: { "Cache-Control": "public, max-age=2592000" } })); } catch (e) {}
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
    await saveDisplayLink(station, stationLink);

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
