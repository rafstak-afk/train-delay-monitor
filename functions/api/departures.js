const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const stationName = (url.searchParams.get("station") || "").trim();

  if (!stationName) {
    return json({ error: "Brak parametru station" }, 400);
  }

  if (!env.PLK_API_KEY) {
    return json({ error: "Brak zmiennej PLK_API_KEY" }, 500);
  }

  const headers = {
    "X-API-Key": env.PLK_API_KEY,
    "Accept": "application/json"
  };

  try {
    const stationData = await getJson(
      `${PLK_BASE}/dictionaries/stations?search=${encodeURIComponent(stationName)}&pageSize=20`,
      headers
    );

    const stations =
      stationData.stations ||
      stationData.items ||
      stationData.results ||
      stationData.data ||
      [];

    const station = stations.find(s => normalize(s.name) === normalize(stationName)) || stations[0];

    if (!station) {
      return json({ error: "Nie znaleziono stacji", stationName }, 404);
    }

    const stationId = station.id || station.stationId;
    const today = new Date().toISOString().slice(0, 10);

    const schedulesUrl =
      `${PLK_BASE}/schedules?dateFrom=${today}&dateTo=${today}&stations=${stationId}`;

    const operationsUrl =
      `${PLK_BASE}/operations?stations=${stationId}&withPlanned=true&pageSize=10000`;

    const [schedulesRaw, operationsRaw] = await Promise.all([
      getJson(schedulesUrl, headers),
      getJson(operationsUrl, headers)
    ]);

    return json({
      station: {
        id: stationId,
        name: station.name
      },
      generatedAt: new Date().toISOString(),
      debug: {
        schedulesUrl,
        operationsUrl,
        schedulesTopLevelKeys: Object.keys(schedulesRaw),
        operationsTopLevelKeys: Object.keys(operationsRaw),
        schedulesSample: firstUsefulArray(schedulesRaw).slice(0, 3),
        operationsSample: firstUsefulArray(operationsRaw).slice(0, 3)
      },
      departures: []
    });

  } catch (error) {
    return json({
      error: "Błąd API PLK",
      details: error.message
    }, 500);
  }
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return JSON.parse(text);
}

function firstUsefulArray(obj) {
  for (const key of Object.keys(obj)) {
    if (Array.isArray(obj[key])) {
      return obj[key];
    }
  }

  return [];
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
