const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const stationName = (url.searchParams.get("station") || "").trim();

  if (!stationName) return json({ error: "Brak parametru station" }, 400);
  if (!env.PLK_API_KEY) return json({ error: "Brak zmiennej PLK_API_KEY" }, 500);

  const headers = {
    "X-API-Key": env.PLK_API_KEY,
    "Accept": "application/json"
  };

  try {
    const station = await findStation(stationName, headers);
    if (!station) return json({ error: "Nie znaleziono stacji", stationName }, 404);

    const today = new Date().toISOString().slice(0, 10);

    const [schedulesRaw, operationsRaw] = await Promise.all([
      getJson(`${PLK_BASE}/schedules?dateFrom=${today}&dateTo=${today}&stations=${station.id}`, headers),
      getJson(`${PLK_BASE}/operations?stations=${station.id}&withPlanned=true&pageSize=10000`, headers)
    ]);

    const departures = buildDepartures(schedulesRaw, operationsRaw, station.id);

    return json({
      station,
      generatedAt: new Date().toISOString(),
      departures
    });

  } catch (error) {
    return json({
      error: "Błąd API PLK",
      details: error.message
    }, 500);
  }
}

async function findStation(name, headers) {
  const data = await getJson(
    `${PLK_BASE}/dictionaries/stations?search=${encodeURIComponent(name)}&pageSize=20`,
    headers
  );

  const stations = data.stations || data.items || data.results || data.data || [];
  const wanted = normalize(name);

  const found =
    stations.find(s => normalize(s.name) === wanted) ||
    stations[0];

  if (!found) return null;

  return {
    id: found.id || found.stationId,
    name: found.name || found.stationName
  };
}

function buildDepartures(schedulesRaw, operationsRaw, stationId) {
  const routes = schedulesRaw.routes || [];
  const trains = operationsRaw.trains || [];

  const operationsMap = new Map();

  for (const train of trains) {
    const key = makeKey(train);
    const stationOp = (train.stations || []).find(s => Number(s.stationId) === Number(stationId));

    if (key && stationOp) {
      operationsMap.set(key, {
        train,
        station: stationOp
      });
    }
  }

  const rows = [];

  for (const route of routes) {
    const stationPlan = (route.stations || []).find(s => Number(s.stationId) === Number(stationId));

    if (!stationPlan || !stationPlan.departureTime) continue;

    const key = makeKey(route);
    const operation = operationsMap.get(key);

    const opStation = operation?.station;

    const plannedTime =
      stationPlan.departureTime ||
      opStation?.plannedDepartureTime ||
      "";

    const actualTime =
      timeOnly(opStation?.actualDeparture) ||
      timeOnly(opStation?.estimatedDeparture) ||
      opStation?.plannedDepartureTime ||
      plannedTime;

    const delay =
      typeof opStation?.departureDelayMinutes === "number"
        ? opStation.departureDelayMinutes
        : calculateDelay(plannedTime, actualTime);

    rows.push({
      time: actualTime || plannedTime,
      plannedTime,
      train: stationPlan.departureTrainNumber || route.nationalNumber || "",
      category: stationPlan.departureCommercialCategory || route.commercialCategorySymbol || "",
      name: route.name || "",
      carrier: route.carrierCode || "",
      platform: stationPlan.departurePlatform || "",
      track: stationPlan.departureTrack || "",
      delay,
      status: operation?.train?.trainStatus || "",
      scheduleId: route.scheduleId,
      orderId: route.orderId,
      trainOrderId: route.trainOrderId
    });
  }

  return rows
    .filter(r => r.time)
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, 80);
}

function makeKey(x) {
  return [
    x.scheduleId || "",
    x.orderId || "",
    x.trainOrderId || ""
  ].join("|");
}

function timeOnly(value) {
  if (!value) return "";

  const str = String(value);
  const match = str.match(/T(\d{2}:\d{2})/);

  if (match) return match[1];

  const short = str.match(/^(\d{2}:\d{2})/);
  return short ? short[1] : "";
}

function calculateDelay(planned, actual) {
  if (!planned || !actual) return 0;

  const p = minutes(planned);
  const a = minutes(actual);

  if (p === null || a === null) return 0;

  return a - p;
}

function minutes(time) {
  const match = String(time).match(/^(\d{2}):(\d{2})/);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return JSON.parse(text);
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
