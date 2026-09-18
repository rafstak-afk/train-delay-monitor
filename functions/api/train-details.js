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

const STATIONS_DICTIONARY_CACHE_TTL = 86400;

// Trasa z /schedules/route/... niesie tylko stationId dla wielu stacji
// (bez nazwy) — bez słownika "ostatnio zaliczona stacja" pokazywałaby
// nieczytelne "Stacja 273" zamiast prawdziwej nazwy.
async function getStationNameMap(apiKey) {
  const url = `${PLK_BASE}/dictionaries/stations?pageSize=20000`;
  const cache = caches.default;
  const cacheKey = new Request("https://cache.local/" + btoa(url), { method: "GET" });

  try {
    const cached = await cache.match(cacheKey);
    const data = cached ? await cached.json() : await plkGet("/dictionaries/stations?pageSize=20000", apiKey);

    if (!cached) {
      await cache.put(cacheKey, new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${STATIONS_DICTIONARY_CACHE_TTL}`
        }
      }));
    }

    const list = Array.isArray(data) ? data : (data?.stations || data?.items || data?.results || data?.data || []);
    const map = new Map();

    for (const item of list) {
      const id = item.id || item.stationId || item.stopPointId;
      const name = item.name || item.stationName || item.stopPointName;
      if (id && name) map.set(String(id), name);
    }

    return map;
  } catch (_) {
    // Brak nazw stacji nie powinien wywracać całej odpowiedzi.
    return new Map();
  }
}

function stationKey(station) {
  const id = station?.stationId ?? station?.stopId ?? station?.id;
  return id == null ? "" : String(id);
}

function stationDisplayName(station, stationNames) {
  const key = stationKey(station);

  return (
    station?.stationName ||
    station?.name ||
    station?.station ||
    (key && stationNames?.get(key)) ||
    (key ? `Stacja ${key}` : "")
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

function buildStops(routeStations, opStations, stationNames) {
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

    // op może istnieć w odpowiedzi PLK nawet dla stacji, przez którą
    // pociąg jeszcze nie przejechał (czysto planowy wpis, czasem nawet
    // z "actual"/"estimated" polami zawierającymi prognozę dla stacji
    // odległych o wiele godzin) — jedynym wiarygodnym sygnałem
    // faktycznego przejazdu jest isConfirmed===true.
    const isConfirmed = op?.isConfirmed === true;

    // Opóźnienie liczymy tylko dla potwierdzonych stacji — inaczej
    // prognoza PLK dla nieodwiedzonej jeszcze stacji (np. stacji
    // końcowej całej trasy) potrafi pokazać nieprawdziwe opóźnienie na
    // stacji, której pociąg jeszcze nawet nie dotknął.
    const delay = isConfirmed
      ? (typeof op?.departureDelayMinutes === "number"
          ? op.departureDelayMinutes
          : typeof op?.arrivalDelayMinutes === "number"
            ? op.arrivalDelayMinutes
            : (() => {
                const p = minutesFromTime(plannedTime);
                const a = minutesFromTime(actualTime);
                return p !== null && a !== null ? Math.max(0, a - p) : 0;
              })())
      : 0;

    return {
      stationName: stationDisplayName(station, stationNames),
      plannedTime: shortTime(plannedTime) || "--:--",
      scheduledTime: shortTime(plannedTime) || "--:--",
      actualTime: isConfirmed ? shortTime(actualTime) : "",
      status: isConfirmed ? "confirmed" : "upcoming",
      delay,
      platform: station.departurePlatform || station.arrivalPlatform || "-",
      track: station.departureTrack || station.arrivalTrack || "-"
    };
  });
}

function lastConfirmed(stops) {
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i].status === "confirmed" && stops[i].actualTime) {
      return { station: stops[i].stationName, time: stops[i].actualTime, delay: stops[i].delay || 0 };
    }
  }
  return null;
}

function normalizeStationText(value) {
  return String(value || "").trim().toLowerCase();
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
    const [routeData, operationData, stationNames] = await Promise.all([
      plkGet(
        `/schedules/route/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}`,
        apiKey
      ),
      plkGet(
        `/operations/train/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}/${encodeURIComponent(operatingDate)}`,
        apiKey
      ).catch(() => null),
      getStationNameMap(apiKey)
    ]);

    const route = routeData?.route || routeData || {};
    const operation = operationData?.operation || operationData || {};

    const routeStations = Array.isArray(route.stations) ? route.stations : [];
    const opStations = Array.isArray(operation.stations) ? operation.stations : [];

    const stops = buildStops(routeStations, opStations, stationNames);
    const confirmed = lastConfirmed(stops);

    // Opóźnienie liczymy WYŁĄCZNIE z potwierdzonych danych, nigdy z
    // nieodwiedzonych jeszcze stacji. PLK potrafi dla stacji z dalekiej
    // przyszłości (np. stacji końcowej całej trasy) wstawić "actual"
    // różniące się od planu mimo status:"upcoming" — to prognoza, nie
    // fakt. Wcześniej liczyliśmy max(delay) po WSZYSTKICH stacjach, co
    // pokazywało np. "+8 min w Katowicach" mimo że pociąg był jeszcze
    // przed Krakowem i Katowic w ogóle nie dotknął — ten "+8" pochodził
    // z prognozy dla stacji końcowej (Szczecin), 7 godzin później.
    const stationParam = url.searchParams.get("station") || "";

    const targetStop = stationParam
      ? stops.find(s => normalizeStationText(s.stationName) === normalizeStationText(stationParam))
      : null;

    const lastStop = stops[stops.length - 1];
    const journeyDone = !!lastStop && lastStop.status === "confirmed";

    // Gdy pociąg już DOJECHAŁ do stacji końcowej całej trasy, liczy się
    // wynik końcowy — nie stan sprzed kilkudziesięciu minut na stacji
    // pośredniej, którą monitorujemy. Bez tego rozróżnienia zakończony
    // kurs z opóźnieniem 2 min na stacji pośredniej, ale 0 min na mecie,
    // pokazywał "+2 min" mimo że PLK na stacji końcowej pokazuje 0.
    const currentDelay = journeyDone
      ? lastStop.delay
      : (targetStop && targetStop.status === "confirmed" ? targetStop.delay : (confirmed?.delay || 0));

    // Kody statusu PLK: C = zrealizowany/zakończony, Z = zakończony.
    // Bez tego pola front-end (moje-pociagi-v2) domyślał się "true" dla
    // KAŻDEGO pociągu, dla którego to pole nie istniało w odpowiedzi —
    // czyli pokazywał "pociąg skończył bieg" nawet dla kursów, które
    // jeszcze się nie zaczęły. Dodatkowo wymagamy potwierdzenia OSTATNIEJ
    // stacji trasy — sam trainStatus C/Z bywał niespójny między
    // endpointami PLK (widziany dla pociągów jeszcze w trasie).
    const isFinished =
      (operation.trainStatus === "C" || operation.trainStatus === "Z") && journeyDone;

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
      delay: currentDelay,
      totalDelay: currentDelay,
      status: operation.trainStatus || "",
      isFinished,
      lastConfirmedStation: confirmed?.station || "",
      lastConfirmedTime: confirmed?.time || "",
      route: stops
    });
  } catch (err) {
    return json({ error: err.message, route: [] }, 502);
  }
}
