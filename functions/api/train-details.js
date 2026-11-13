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

// Dane wolnozmienne (trasa, utrudnienia) cache'ujemy na brzegu Cloudflare
// (cf.cacheTtl, jak trasy w departures.js) — push-tick pyta o każdy pociąg
// co 5 min, a na żywo zmienia się tylko /operations.
const ROUTE_CACHE_TTL = 21600;
const DISRUPTIONS_CACHE_TTL = 600;

async function plkGet(path, apiKey, cacheTtl = 0) {
  // PLK potrafi nie odpowiadać wcale — bez limitu strona „czekała na dane” bez końca
  let res;
  try {
    res = await fetch(PLK_BASE + path, {
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(12000),
      ...(cacheTtl ? { cf: { cacheTtlByStatus: { "200-299": cacheTtl, "300-599": -1 }, cacheEverything: true } } : {})
    });
  } catch (e) {
    const err = new Error(e && e.name === "TimeoutError" ? "PLK nie odpowiada (12 s)" : "PLK niedostępny");
    err.plkDown = true; throw err;
  }

  if (!res.ok) {
    const err = new Error(`PLK HTTP ${res.status}`);
    if (res.status >= 500 || res.status === 429) err.plkDown = true;
    throw err;
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

    // op może istnieć w odpowiedzi PLK nawet dla stacji, przez którą
    // pociąg jeszcze nie przejechał (czysto planowy wpis, czasem nawet
    // z "actual"/"estimated" polami zawierającymi prognozę dla stacji
    // odległych o wiele godzin) — jedynym wiarygodnym sygnałem
    // faktycznego przejazdu jest isConfirmed===true.
    const isConfirmed = op?.isConfirmed === true;

    // Stacja pośrednia z postojem ma OSOBNO planowy przyjazd i odjazd
    // (np. kilkuminutowy postój) — liczymy je niezależnie zamiast
    // zlewać w jedno pole, jak wcześniej.
    const plannedArrivalRaw = station.plannedArrival || station.arrivalTime || "";
    const plannedDepartureRaw = station.plannedDeparture || station.departureTime || "";
    const actualArrivalRaw = op?.actualArrival || op?.estimatedArrival || "";
    const actualDepartureRaw = op?.actualDeparture || op?.estimatedDeparture || "";

    // Opóźnienie liczymy tylko dla potwierdzonych stacji — inaczej
    // prognoza PLK dla nieodwiedzonej jeszcze stacji (np. stacji
    // końcowej całej trasy) potrafi pokazać nieprawdziwe opóźnienie na
    // stacji, której pociąg jeszcze nawet nie dotknął.
    function stopDelay(plannedRaw, actualRaw, explicitDelay) {
      if (!isConfirmed || !plannedRaw) return null;
      if (typeof explicitDelay === "number") return explicitDelay;
      const p = minutesFromTime(plannedRaw);
      const a = minutesFromTime(actualRaw);
      return p !== null && a !== null ? Math.max(0, a - p) : 0;
    }

    const arrivalDelay = stopDelay(plannedArrivalRaw, actualArrivalRaw, op?.arrivalDelayMinutes);
    const departureDelay = stopDelay(plannedDepartureRaw, actualDepartureRaw, op?.departureDelayMinutes);

    // Prognoza PLK dla stacji, przez którą pociąg jeszcze nie przejechał.
    // Osobne pola (forecast*), żeby nigdy nie mieszały się z danymi
    // potwierdzonymi — to one liczą opóźnienie całego pociągu. Prognoza
    // istnieje tylko, gdy PLK faktycznie podał czas lub opóźnienie.
    function forecast(plannedRaw, actualRaw, explicitDelay) {
      if (isConfirmed || !op || !plannedRaw) return { time: "", delay: null };
      const hasExplicit = typeof explicitDelay === "number";
      if (!hasExplicit && !actualRaw) return { time: "", delay: null };
      let delay;
      if (hasExplicit) {
        delay = explicitDelay;
      } else {
        const p = minutesFromTime(plannedRaw);
        const a = minutesFromTime(actualRaw);
        delay = p !== null && a !== null ? Math.max(0, a - p) : 0;
      }
      let time = shortTime(actualRaw);
      if (!time) {
        const p = minutesFromTime(plannedRaw);
        if (p !== null) {
          const t = (p + delay) % 1440;
          time = String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
        }
      }
      return { time, delay };
    }
    const fArr = forecast(plannedArrivalRaw, actualArrivalRaw, op?.arrivalDelayMinutes);
    const fDep = forecast(plannedDepartureRaw, actualDepartureRaw, op?.departureDelayMinutes);

    // Zachowane dla wstecznej zgodności z istniejącymi widokami: jedno
    // pole "czasu" stacji, priorytet dla odjazdu, z fallbackiem na
    // przyjazd dla stacji końcowej (brak odjazdu).
    const plannedTime = plannedDepartureRaw || plannedArrivalRaw;
    const actualTime = isConfirmed ? (actualDepartureRaw || actualArrivalRaw) : "";
    const delay = departureDelay ?? arrivalDelay ?? 0;

    return {
      stationName: stationDisplayName(station, stationNames),
      plannedTime: shortTime(plannedTime) || "--:--",
      scheduledTime: shortTime(plannedTime) || "--:--",
      actualTime: isConfirmed ? shortTime(actualTime) : "",
      status: isConfirmed ? "confirmed" : "upcoming",
      delay,
      plannedArrival: plannedArrivalRaw ? shortTime(plannedArrivalRaw) : "",
      actualArrival: (isConfirmed && plannedArrivalRaw) ? shortTime(actualArrivalRaw || plannedArrivalRaw) : "",
      arrivalDelay,
      plannedDeparture: plannedDepartureRaw ? shortTime(plannedDepartureRaw) : "",
      actualDeparture: (isConfirmed && plannedDepartureRaw) ? shortTime(actualDepartureRaw || plannedDepartureRaw) : "",
      departureDelay,
      forecastArrival: fArr.time,
      forecastArrivalDelay: fArr.delay,
      forecastDeparture: fDep.time,
      forecastDepartureDelay: fDep.delay,
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

const SCHEDULES_CACHE_TTL = 21600;
function normTrainNo(v) { const s = String(v ?? "").trim(); return s ? s.replace(/^0+(?=\d)/, "") : ""; }
function routeHasTrain(r, want) {
  return [r.nationalNumber, r.trainNumber, r.commercialTrainNumber, ...(Array.isArray(r.stations) ? r.stations.flatMap(s => [s.arrivalTrainNumber, s.departureTrainNumber]) : [])]
    .some(v => normTrainNo(v) === want);
}
// Inny kurs tego samego pociągu z danymi o ruchu (najwyżej 2 stacje × 1 rozkład + 2 próby ruchu).
async function findAltCourse(route, { trainNum, trainOrderId, scheduleId, orderId, operatingDate }, apiKey) {
  const sts = Array.isArray(route.stations) ? route.stations : [];
  const ids = [...new Set([sts[0] && sts[0].stationId, sts[sts.length - 1] && sts[sts.length - 1].stationId].filter(Boolean))];
  const want = normTrainNo(trainNum), seen = new Set([String(orderId)]);
  let tries = 0;
  for (const sid of ids) {
    let data = null;
    try { data = await plkGet(`/schedules?stations=${encodeURIComponent(sid)}&dateFrom=${operatingDate}&dateTo=${operatingDate}`, apiKey, SCHEDULES_CACHE_TTL); } catch (e) { continue; }
    const routes = Array.isArray(data && data.routes) ? data.routes : [];
    // trainOrderId z linku bywa błędny (= orderId); prawdziwy bierzemy z tego samego rozkładu stacji (wpis z naszym orderId)
    const toIds = new Set([trainOrderId, ...routes.filter(r => String(r.orderId) === String(orderId)).map(r => r.trainOrderId)].filter(Boolean).map(String));
    const cands = routes.filter(r => r.orderId && !seen.has(String(r.orderId)) && ((r.trainOrderId && toIds.has(String(r.trainOrderId))) || (want && routeHasTrain(r, want))));
    for (const r of cands) {
      seen.add(String(r.orderId));
      if (++tries > 2) return null;
      const sch = r.scheduleId || scheduleId;
      try {
        const ops = await plkGet(`/operations/train/${encodeURIComponent(sch)}/${encodeURIComponent(r.orderId)}/${encodeURIComponent(operatingDate)}`, apiKey);
        if (ops) return { scheduleId: String(sch), orderId: String(r.orderId), operationData: ops };
      } catch (e) {}
    }
  }
  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const trainNum = url.searchParams.get("train") || "";
  let scheduleId = url.searchParams.get("scheduleId") || "";
  let orderId = url.searchParams.get("orderId") || "";
  let altFrom = null;
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

  let opsError = null;
  const startedAt = Date.now();
  try {
    let [routeData, operationData, stationNames] = await Promise.all([
      plkGet(
        `/schedules/route/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}`,
        apiKey,
        ROUTE_CACHE_TTL
      ),
      plkGet(
        `/operations/train/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}/${encodeURIComponent(operatingDate)}`,
        apiKey
      ).catch((e) => { opsError = String((e && e.message) || e); return null; }),
      getStationNameMap(apiKey)
    ]);

    let route = routeData?.route || routeData || {};
    if (!operationData && /404/.test(String(opsError || "")) && operatingDate === todayWarsaw()) {
      const alt = await findAltCourse(route, { trainNum, trainOrderId, scheduleId, orderId, operatingDate }, apiKey).catch(() => null);
      if (alt) {
        altFrom = orderId; scheduleId = alt.scheduleId; orderId = alt.orderId; operationData = alt.operationData; opsError = null;
        try { const rd = await plkGet(`/schedules/route/${encodeURIComponent(scheduleId)}/${encodeURIComponent(orderId)}`, apiKey, ROUTE_CACHE_TTL); route = rd?.route || rd || route; } catch (e) {}
      }
    }
    const operation = operationData?.operation || operationData || {};

    // Przyczyna opóźnienia/odwołania z PLK (np. "Awaria taboru"), dociągana
    // po stacjach CAŁEJ trasy — w odróżnieniu od tablicy (jedna stacja) tu
    // znamy pełną trasę, więc łapiemy też przyczynę powstałą wcześniej,
    // zanim pociąg dotarł do oglądanej właśnie stacji.
    const routeStationIds = [...new Set(
      (Array.isArray(route.stations) ? route.stations : [])
        .map(s => s.stationId)
        .filter(Boolean)
    )];

    let disruptionsRaw = null;
    if (routeStationIds.length) {
      try {
        disruptionsRaw = await plkGet(
          `/disruptions?dateFrom=${encodeURIComponent(operatingDate)}&dateTo=${encodeURIComponent(operatingDate)}&stations=${routeStationIds.join(",")}`,
          apiKey,
          DISRUPTIONS_CACHE_TTL
        );
      } catch (e) {
        disruptionsRaw = null;
      }
    }

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
    // Bez tego pola front-end (moje-pociagi) domyślał się "true" dla
    // KAŻDEGO pociągu, dla którego to pole nie istniało w odpowiedzi —
    // czyli pokazywał "pociąg skończył bieg" nawet dla kursów, które
    // jeszcze się nie zaczęły. Dodatkowo wymagamy potwierdzenia OSTATNIEJ
    // stacji trasy — sam trainStatus C/Z bywał niespójny między
    // endpointami PLK (widziany dla pociągów jeszcze w trasie).
    const isFinished =
      (operation.trainStatus === "C" || operation.trainStatus === "Z") && journeyDone;

    const disruptionDict = disruptionsRaw?.disruptionTypes || {};
    const isDisruptionCode = v => /^utr_\d+$/.test(String(v || ""));
    const resolveDisruptionMessage = d => {
      if (d.message && !isDisruptionCode(d.message)) return d.message;
      const code = isDisruptionCode(d.message) ? d.message : d.disruptionTypeCode;
      return (code && disruptionDict[code]) || d.message || "";
    };

    // Ten sam powód (np. "Ograniczenie prędkości pociągu") potrafi być
    // zgłoszony osobno dla kilku stacji na długiej trasie tego samego
    // pociągu — grupujemy po treści, zamiast powtarzać tę samą linijkę
    // kilka razy z inną tylko stacją.
    const disruptionGroups = new Map();

    for (const d of (disruptionsRaw?.disruptions || [])) {
      for (const ar of (d.affectedRoutes || [])) {
        if (Number(ar.orderId) !== Number(orderId)) continue;
        if (ar.operatingDate && String(ar.operatingDate).slice(0, 10) !== operatingDate) continue;

        const text = resolveDisruptionMessage(d);
        if (!text) continue;

        const stName = stationNames.get(String(ar.stationId)) || "";
        if (!disruptionGroups.has(text)) disruptionGroups.set(text, new Set());
        if (stName) disruptionGroups.get(text).add(stName);
      }
    }

    const disruptions = [...disruptionGroups.entries()].map(([message, stations]) => ({
      message,
      stations: [...stations]
    }));

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
      // diagnostyka: czy przyszła część „ruch pociągu” z PLK, ile stacji potwierdził, kiedy PLK wygenerował dane
      diag: {
        operatingDate,
        opsOk: !!operationData,
        opsError,
        altFrom,
        opsStations: opStations.length,
        opsGeneratedAt: (operationData && operationData.generatedAt) || null,
        routeStations: routeStations.length,
        confirmed: stops.filter(x => x.status === "confirmed").length,
        ms: Date.now() - startedAt,
        at: new Date().toISOString()
      },
      status: operation.trainStatus || "",
      isFinished,
      lastConfirmedStation: confirmed?.station || "",
      lastConfirmedTime: confirmed?.time || "",
      route: stops,
      connections: Array.isArray(route.connections) ? route.connections : [],
      disruptions,
      // Pełny słownik typów utrudnień PLK (kod → polski tekst) — tylko na
      // żądanie (?withDisruptionTypes=1), do budowy tłumaczeń w i18n/*.json.
      ...(url.searchParams.get("withDisruptionTypes") === "1" ? { disruptionTypes: disruptionDict } : {})
    });
  } catch (err) {
    return json({ error: err.message, plkDown: !!err.plkDown, route: [] }, 502);
  }
}
