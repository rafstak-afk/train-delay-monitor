const BASE = "https://pdp-api.plk-sa.pl/api/v1";

const CORS_JSON = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS_JSON });
}

function getApiKey(context) {
  return context.env.PLK_API_KEY || context.env.PDP_API_KEY || "";
}

function todayIso() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
}

async function plkFetch(path, key) {
  try {
    const res = await fetch(BASE + path, {
      headers: { "X-API-Key": key, "Accept": "application/json, text/plain, */*" }
    });
    if (!res.ok) return { _error: true, status: res.status };
    return await res.json();
  } catch (err) {
    return { _error: true, message: err.message };
  }
}

function normalizeTrainNumber(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.replace(/^0+(?=\d)/, "");
}

function routeMatchesTrain(route, wantedNormalized) {
  const candidates = [
    route.nationalNumber,
    route.trainNumber,
    route.commercialTrainNumber,
    ...(Array.isArray(route.stations)
      ? route.stations.flatMap(s => [s.arrivalTrainNumber, s.departureTrainNumber])
      : [])
  ];

  return candidates.some(v => normalizeTrainNumber(v) === wantedNormalized);
}

async function resolveStationId(stationName, key) {
  const path = "/dictionaries/stations?search=" + encodeURIComponent(stationName) + "&pageSize=20";
  const data = await plkFetch(path, key);
  if (!data || data._error) return null;

  const list = Array.isArray(data) ? data : (data.stations || data.items || data.results || data.data || []);
  const wanted = stationName.trim().toLowerCase();

  const found =
    list.find(s => String(s.name || s.stationName || "").trim().toLowerCase() === wanted) ||
    list[0];

  if (!found) return null;
  return found.id || found.stationId || null;
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_JSON });
  }

  const url = new URL(context.request.url);
  const trainNum = (url.searchParams.get("train") || "").trim();
  const stationName = (url.searchParams.get("station") || "").trim();
  const planTime = (url.searchParams.get("time") || "").trim();
  const date = url.searchParams.get("date") || todayIso();
  const key = getApiKey(context);

  if (!key) {
    return json({ ok: false, error: "Brak klucza PLK_API_KEY" }, 401);
  }

  if (!trainNum) {
    return json({ ok: false, error: "Brak numeru pociągu" }, 400);
  }

  try {
    // UWAGA: PLK API nie ma endpointu /departures (to nasz własny,
    // złożony z /schedules + /operations w functions/api/departures.js)
    // i nie filtruje /schedules po trainNumber= — ten parametr jest po
    // cichu ignorowany, więc poprzednia wersja tego pliku zwracała
    // pierwszy z brzegu, zupełnie niepowiązany kurs dla każdego pociągu
    // spoza aktualnego okna tablicy odjazdów. Zamiast tego: znajdź
    // stację i przefiltruj /schedules po stationId (sprawdzony wzorzec
    // z departures.js / [[path]].ts), a numer pociągu dopasuj sami.
    if (!stationName) {
      return json({
        ok: false,
        error: "Brak stacji — nie da się jednoznacznie znaleźć kursu bez filtra po stacji."
      }, 200);
    }

    const stationId = await resolveStationId(stationName, key);

    if (!stationId) {
      return json({ ok: false, error: "Nie znaleziono stacji " + stationName }, 200);
    }

    const schedulesPath =
      "/schedules?stations=" + encodeURIComponent(stationId) +
      "&dateFrom=" + date + "&dateTo=" + date + "&pageSize=500";

    const schedData = await plkFetch(schedulesPath, key);

    if (!schedData || schedData._error) {
      return json({
        ok: false,
        error: "Nie udało się pobrać rozkładu dla stacji " + stationName
      }, 200);
    }

    const routes = Array.isArray(schedData.routes) ? schedData.routes : [];
    const wanted = normalizeTrainNumber(trainNum);
    const matches = routes.filter(r => routeMatchesTrain(r, wanted));

    if (!matches.length) {
      return json({
        ok: false,
        error: "Nie znaleziono pociągu " + trainNum + " dla stacji " + stationName + " w podanym dniu."
      }, 200);
    }

    let bestCourse = matches[0];
    if (planTime && matches.length > 1) {
      const matchByTime = matches.find(item => JSON.stringify(item).includes(planTime));
      if (matchByTime) bestCourse = matchByTime;
    }

    return json({
      ok: true,
      source: "schedules-by-station",
      train: trainNum,
      scheduleId: bestCourse.scheduleId || "",
      orderId: bestCourse.orderId || "",
      trainOrderId: bestCourse.trainOrderId || "",
      station: stationName,
      stationId,
      date: date
    });

  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
}
