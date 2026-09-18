const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function todayWarsaw() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
}

async function plkGet(path, apiKey) {
  const res = await fetch(PLK_BASE + path, {
    headers: {
      "X-API-Key": apiKey,
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`PLK HTTP ${res.status}`);
  }

  return res.json();
}

function stationKey(station) {
  const id = station?.stationId ?? station?.stopId ?? station?.id;
  return id == null ? "" : String(id);
}

function stationDisplayName(station) {
  return (
    station?.stationName ||
    station?.name ||
    station?.station ||
    (stationKey(station) ? `Stacja ${stationKey(station)}` : "")
  );
}

function shortTime(value) {
  if (!value) return "";
  const match = String(value).match(/(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function minutesFromTime(time) {
  const match = String(time || "").match(/(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function buildStops(routeStations, opStations) {
  const opByStation = new Map();
  for (const op of opStations) {
    const key = stationKey(op);
    if (key) opByStation.set(key, op);
  }

  return routeStations.map(station => {
    const op = opByStation.get(stationKey(station)) || null;

    const plannedTime =
      station.plannedDeparture ||
      station.plannedArrival ||
      station.departureTime ||
      station.arrivalTime ||
      "";

    const actualTime =
      op?.actualDeparture ||
      op?.actualArrival ||
      op?.estimatedDeparture ||
      op?.estimatedArrival ||
      "";

    const delay =
      typeof op?.departureDelayMinutes === "number"
        ? op.departureDelayMinutes
        : typeof op?.arrivalDelayMinutes === "number"
          ? op.arrivalDelayMinutes
          : (() => {
              const p = minutesFromTime(plannedTime);
              const a = minutesFromTime(actualTime);
              return p !== null && a !== null ? Math.max(0, a - p) : 0;
            })();

    return {
      stationName: stationDisplayName(station),
      plannedTime: shortTime(plannedTime) || "--:--",
      scheduledTime: shortTime(plannedTime) || "--:--",
      actualTime: shortTime(actualTime),
      status: op ? "confirmed" : "upcoming",
      delay,
      platform: station.departurePlatform || station.arrivalPlatform || "-",
      track: station.departureTrack || station.arrivalTrack || "-"
    };
  });
}

function lastConfirmed(stops) {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i].status === "confirmed" && stops[i].actualTime) {
      return { station: stops[i].stationName, time: stops[i].actualTime };
    }
  }
  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const trainNum = url.searchParams.get("train") || "";
  const scheduleId = url.searchParams.get("scheduleId") || "";
  const orderId = url.searchParams.get("orderId") || "";
  const trainOrderId = url.searchParams.get("trainOrderId") || "";

  const operatingDate =
    url.searchParams.get("operatingDate") ||
    url.searchParams.get("date") ||
    todayWarsaw();

  const apiKey = env.PLK_API_KEY || env.PDP_API_KEY || "";

  if (!scheduleId || !orderId) {
    return json({
      error: "Brak parametru scheduleId/orderId. Wymagany jest kurs wybrany z tablicy odjazdów.",
      route: []
    }, 400);
  }

  if (!apiKey) {
    return json({ error: "Brak klucza PLK_API_KEY/PDP_API_KEY", route: [] }, 500);
  }

  try {
    const [routeData, operationData] = await Promise.all([
      plkGet(
        `/schedules/route/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}`,
        apiKey
      ),
      plkGet(
        `/operations/train/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}/${encodeURIComponent(operatingDate)}`,
        apiKey
      ).catch(() => null)
    ]);

    const route = routeData?.route || routeData || {};
    const operation = operationData?.operation || operationData || {};

    const routeStations = Array.isArray(route.stations) ? route.stations : [];
    const opStations = Array.isArray(operation.stations) ? operation.stations : [];

    const stops = buildStops(routeStations, opStations);
    const totalDelay = stops.reduce((max, s) => Math.max(max, s.delay || 0), 0);
    const confirmed = lastConfirmed(stops);

    return json({
      train: trainNum,
      scheduleId,
      orderId,
      trainOrderId,
      operatingDate,
      category: route.commercialCategorySymbol || "",
      name: route.name || "",
      trainName: route.name || "",
      trainNumber: route.nationalNumber || trainNum,
      delay: totalDelay,
      totalDelay,
      status: operation.trainStatus || "",
      lastConfirmedStation: confirmed?.station || "",
      lastConfirmedTime: confirmed?.time || "",
      route: stops
    });
  } catch (err) {
    return json({ error: err.message, route: [] }, 502);
  }
}
