const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const stationName = (url.searchParams.get("station") || "").trim();

  if (!stationName) {
    return json({ error: "Brak parametru station" }, 400);
  }

  if (!env.PLK_API_KEY) {
    return json({ error: "Brak zmiennej środowiskowej PLK_API_KEY" }, 500);
  }

  const headers = {
    "X-API-Key": env.PLK_API_KEY,
    "Accept": "application/json"
  };

  try {
    const station = await findStation(stationName, headers);

    if (!station) {
      return json({ error: "Nie znaleziono stacji", station: stationName }, 404);
    }

    const today = new Date().toISOString().slice(0, 10);

    const [schedules, operations] = await Promise.all([
      getJson(`${PLK_BASE}/schedules?dateFrom=${today}&dateTo=${today}&stations=${station.id}`, headers),
      getJson(`${PLK_BASE}/operations?stations=${station.id}&withPlanned=true&pageSize=10000`, headers)
    ]);

    const rows = normalizeDepartures(schedules, operations, station);

    return json({
      station,
      generatedAt: new Date().toISOString(),
      departures: rows.slice(0, 40)
    });

  } catch (err) {
    return json({
      error: "Błąd pobierania danych z API PLK",
      details: err.message
    }, 500);
  }
}

async function findStation(name, headers) {
  const data = await getJson(
    `${PLK_BASE}/dictionaries/stations?search=${encodeURIComponent(name)}&pageSize=20`,
    headers
  );

  const list =
    data.stations ||
    data.items ||
    data.results ||
    data.data ||
    [];

  const normalizedName = normalize(name);

  const exact = list.find(s =>
    normalize(s.name || s.stationName || s.n) === normalizedName
  );

  const candidate = exact || list[0];

  if (!candidate) return null;

  return {
    id: candidate.id || candidate.stationId || candidate.sid,
    name: candidate.name || candidate.stationName || candidate.n
  };
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PLK HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json();
}

function normalizeDepartures(schedulesData, operationsData, station) {
  const schedules =
    schedulesData.schedules ||
    schedulesData.items ||
    schedulesData.results ||
    schedulesData.data ||
    [];

  const operations =
    operationsData.operations ||
    operationsData.items ||
    operationsData.results ||
    operationsData.data ||
    [];

  const opMap = new Map();

  for (const op of operations) {
    const key = makeTrainKey(op);
    if (key) opMap.set(key, op);
  }

  return schedules
    .map(item => {
      const key = makeTrainKey(item);
      const op = key ? opMap.get(key) : null;

      const plannedDeparture =
        item.plannedDeparture ||
        item.departureTime ||
        item.plannedDepartureTime ||
        item.departure ||
        "";

      const realDeparture =
        op?.actualDeparture ||
        op?.estimatedDeparture ||
        op?.realDeparture ||
        op?.departureTime ||
        plannedDeparture;

      const delay =
        op?.delayMinutes ??
        op?.departureDelayMinutes ??
        op?.delay ??
        item.delayMinutes ??
        0;

      return {
        time: formatTime(realDeparture || plannedDeparture),
        plannedTime: formatTime(plannedDeparture),
        train: item.trainNumber || item.number || item.trainNo || op?.trainNumber || "",
        category: item.commercialCategory || item.category || op?.category || "",
        destination: item.destinationStationName || item.toStationName || item.destination || "",
        platform: item.platform || op?.platform || "",
        track: item.track || op?.track || "",
        delay: Number(delay) || 0
      };
    })
    .filter(row => row.time)
    .sort((a, b) => a.time.localeCompare(b.time));
}

function makeTrainKey(x) {
  const scheduleId = x.scheduleId || x.sid;
  const orderId = x.orderId || x.oid;
  const date = x.operatingDate || x.date;

  if (scheduleId && orderId) return `${scheduleId}-${orderId}-${date || ""}`;

  return x.trainNumber || x.number || x.trainNo || null;
}

function formatTime(value) {
  if (!value) return "";

  const str = String(value);

  const match = str.match(/T(\d{2}:\d{2})/);
  if (match) return match[1];

  const short = str.match(/\b(\d{2}:\d{2})/);
  if (short) return short[1];

  return "";
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
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
