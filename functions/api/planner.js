// ============ Planer podróży ============
// Szuka połączeń bezpośrednich, z przesiadką(ami) i z wymuszonymi stacjami
// "przez" między dwiema dowolnymi stacjami w kraju, bez żadnej
// predefiniowanej listy węzłów przesiadkowych. Algorytm: "meet in the
// middle" — pyta PLK osobno o wszystko, co dotyka stacji A (gdzie da się
// dojechać jadąc stąd) i osobno o wszystko, co dotyka stacji B (skąd da się
// dojechać do B), a potem szuka części wspólnej stacji — to jest kandydat na
// przesiadkę, gdziekolwiek faktycznie leży.
//
// Trzy ścieżki w jednym endpointzie:
//  - brak "przez": bezpośrednio + 1 przesiadka zawsze; automatyczne 2
//    przesiadki (maxTransfers=2) tylko gdy to nie wystarczy.
//  - "przez" podane: łańcuch segmentów (from→via1→...→to), każdy segment to
//    bezpośrednio+1 przesiadka, sklejone z ograniczonym backtrackingiem.
//  - wzbogacenie o czas rzeczywisty (operations/train/...) dla dzisiejszej
//    daty, tylko dla wyników faktycznie zwracanych.

const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";

const CACHE_TTL = {
  STATION_SEARCH: 86400,
  STATIONS_DICTIONARY: 86400,
  SCHEDULES_FUTURE: 21600,
  SCHEDULES_TODAY: 1800
};
const COMPOSED_CACHE_TTL = 1800;
const UPSTREAM_TIMEOUT_MS = 9000;
const DEFAULT_TRANSFER_MINUTES = 3;
const TRANSFER_MINUTES_MIN = 0;
const TRANSFER_MINUTES_MAX = 120;
const DEFAULT_MAX_RESULTS = 20;
// Bez górnego limitu ten sam pierwszy kurs łączył się z KAŻDYM późniejszym
// kursem na drugiej nodze — technicznie ważna przesiadka, praktycznie
// wielogodzinne czekanie na peronie.
const MAX_TRANSFER_WAIT_MINUTES = 120;
const MAX_VIA_STATIONS = 3;
// Automatyczne rozszerzenie o drugi skok (bez wskazanej stacji "przez"):
// M kandydatów, bez listy węzłów — ranking po liczbie kursów, jakie już i
// tak policzyliśmy przy okazji 1-przesiadki. N=2 celowo (jedna dodatkowa
// runda, nie zagnieżdżona — M wywołań, nie M²).
// M=5 było za mało na żywym przykładzie: w gęstej aglomeracji (Tarnowskie
// Góry/Chorzów/Katowice) kilkanaście sąsiednich stacji ma DOKŁADNIE tę samą
// liczbę połączeń (to te same linie, zatrzymujące się po drodze) — realnie
// potrzebny węzeł (Chorzów Batory) odpadał tuż za progiem przy remisie.
const MULTI_TRANSFER_CANDIDATES = 12;
// Backtracking przy "przez": ile najwcześniejszych kandydatów na segment
// bierzemy pod uwagę na każdym kroku DFS — bez nowych zapytań, to tylko
// porównania w pamięci, więc nawet pełne przeszukanie jest trywialne.
const VIA_SCAN_WINDOW = 8;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const fromName = (url.searchParams.get("from") || "").trim();
  const toName = (url.searchParams.get("to") || "").trim();
  const fromIdParam = (url.searchParams.get("fromId") || "").trim();
  const toIdParam = (url.searchParams.get("toId") || "").trim();
  const viaNamesRaw = (url.searchParams.get("via") || "").trim();
  const viaIdsRaw = (url.searchParams.get("viaIds") || "").trim();
  const viaNames = viaNamesRaw ? viaNamesRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const viaIds = viaIdsRaw ? viaIdsRaw.split(",").map((s) => s.trim()) : [];
  const date = url.searchParams.get("date") || localDateYYYYMMDD();
  const isToday = date === localDateYYYYMMDD();
  const time = url.searchParams.get("time") || (isToday ? currentTimeHHMM() : "00:00");
  const transferMinutes = clamp(
    Number(url.searchParams.get("transferMinutes") ?? DEFAULT_TRANSFER_MINUTES),
    TRANSFER_MINUTES_MIN,
    TRANSFER_MINUTES_MAX
  );
  const maxResults = clamp(Number(url.searchParams.get("maxResults") || DEFAULT_MAX_RESULTS), 1, 50);
  const maxTransfers = clamp(Number(url.searchParams.get("maxTransfers") ?? 2), 1, 2);
  const excludeCarrierSet = parseCarrierSet(url.searchParams.get("excludeCarriers"));
  globalThis.__plannerDebug = url.searchParams.get("debug") === "1" ? {} : null;

  if (!fromName || !toName) {
    return json({ ok: false, error: "Brak parametru from/to" }, 400);
  }
  if (viaNames.length > MAX_VIA_STATIONS) {
    return json({ ok: false, error: `Maksymalnie ${MAX_VIA_STATIONS} stacje „przez”` }, 400);
  }

  const apiKey = env.PLK_API_KEY || env.PDP_API_KEY || "";
  if (!apiKey) {
    return json({ ok: false, error: "Brak klucza PLK_API_KEY/PDP_API_KEY" }, 500);
  }

  const headers = { "X-API-Key": apiKey, Accept: "application/json" };
  const scheduleTtl = isToday ? CACHE_TTL.SCHEDULES_TODAY : CACHE_TTL.SCHEDULES_FUTURE;
  const hasVia = viaNames.length > 0;

  const composedKey = composedCacheKey({
    from: fromIdParam || normalize(fromName),
    to: toIdParam || normalize(toName),
    via: viaNames.map(normalize).join(">"),
    viaIds: viaIds.join(","),
    date,
    time,
    transferMinutes,
    maxTransfers: hasVia ? 1 : maxTransfers,
    excludeCarriers: [...excludeCarrierSet].sort().join(",")
  });
  const cachedComposed = globalThis.__plannerDebug ? null : await caches.default.match(composedKey);
  if (cachedComposed) {
    const payload = await cachedComposed.json();
    payload.cache = { ...payload.cache, composed: "HIT" };
    return json(payload);
  }

  try {
    const waypointDefs = [
      { name: fromName, id: fromIdParam },
      ...viaNames.map((name, i) => ({ name, id: viaIds[i] || "" })),
      { name: toName, id: toIdParam }
    ];

    const resolvedWaypoints = await Promise.all(
      waypointDefs.map((w) =>
        w.id
          ? Promise.resolve({ id: w.id, name: w.name, ambiguous: false, alternateIds: [], cache: "SKIPPED" })
          : resolveStation(w.name, headers)
      )
    );

    for (let i = 0; i < resolvedWaypoints.length; i++) {
      if (!resolvedWaypoints[i].id) {
        return json({ ok: false, error: `Nie znaleziono stacji „${waypointDefs[i].name}”` }, 404);
      }
    }
    for (let i = 0; i < resolvedWaypoints.length - 1; i++) {
      if (String(resolvedWaypoints[i].id) === String(resolvedWaypoints[i + 1].id)) {
        return json({ ok: false, error: "Dwie sąsiednie stacje trasy są takie same" }, 400);
      }
    }

    const stationsDictionaryUrl = `${PLK_BASE}/dictionaries/stations?pageSize=20000`;
    const stationsDictionaryResult = await getJsonCached(
      stationsDictionaryUrl,
      headers,
      CACHE_TTL.STATIONS_DICTIONARY
    );
    const stationNames = buildStationNameMap(stationsDictionaryResult.data);

    const apiLimitsList = [stationsDictionaryResult.apiLimits];
    let requestBudgetUsed = 3; // słownik stacji, ~1 getJsonCached

    let itineraries = [];
    let noConnectionFound = false;
    let viaFailedAt = null;
    let cacheInfo = { stationsDictionary: stationsDictionaryResult.cache };

    if (hasVia) {
      const segmentPromises = [];
      for (let i = 0; i < resolvedWaypoints.length - 1; i++) {
        segmentPromises.push(
          searchSegment({
            from: resolvedWaypoints[i],
            to: resolvedWaypoints[i + 1],
            date,
            transferMinutes,
            excludeCarrierSet,
            headers,
            scheduleTtl,
            stationNames
          })
        );
      }
      const segmentResults = await Promise.all(segmentPromises);
      segmentResults.forEach((s) => apiLimitsList.push(...s.apiLimitsList));
      requestBudgetUsed += segmentResults.length * 9;
      cacheInfo = { ...cacheInfo, segments: segmentResults.map((s) => s.cache) };

      const timeFloor = minutesFromTime(time) ?? 0;
      const stitched = stitchViaChain(segmentResults, resolvedWaypoints, transferMinutes, timeFloor);
      itineraries = stitched.combos.sort((a, b) => a.departureTime.localeCompare(b.departureTime)).slice(0, maxResults);
      if (!itineraries.length) {
        noConnectionFound = true;
        viaFailedAt = stitched.failedAt;
      }
    } else {
      const segment = await searchSegment({
        from: resolvedWaypoints[0],
        to: resolvedWaypoints[1],
        date,
        transferMinutes,
        excludeCarrierSet,
        headers,
        scheduleTtl,
        stationNames
      });
      apiLimitsList.push(...segment.apiLimitsList);
      requestBudgetUsed += 9;
      cacheInfo = { ...cacheInfo, ...segment.cache };

      const minMinutes = minutesFromTime(time) ?? 0;
      const afterTime = (it) => (minutesFromTime(it.departureTime) ?? 0) >= minMinutes;

      let combined = segment.itineraries.filter(afterTime);

      if (maxTransfers === 2 && combined.length < maxResults) {
        const multi = await buildMultiTransferItineraries({
          reachableAfterA: segment.reachableAfterA,
          reachableBeforeB: segment.reachableBeforeB,
          from: resolvedWaypoints[0],
          to: resolvedWaypoints[1],
          transferMinutes,
          stationNames,
          excludeCarrierSet,
          headers,
          scheduleTtl,
          date
        });
        apiLimitsList.push(...multi.apiLimitsList);
        requestBudgetUsed += multi.fetchedCount * 3;
        combined = combined.concat(multi.itineraries.filter(afterTime));
      }

      itineraries = combined.sort((a, b) => a.departureTime.localeCompare(b.departureTime)).slice(0, maxResults);
      noConnectionFound = itineraries.length === 0;
    }

    itineraries.forEach((it) => {
      it.transfer = (it.transfers && it.transfers[0]) || null;
    });

    const liveBudget = Math.max(5, 45 - requestBudgetUsed);
    const liveDelay = await enrichWithLiveDelay(itineraries, date, headers, isToday, liveBudget, transferMinutes);

    const apiLimits = mergeApiLimits(apiLimitsList);

    const counts = {
      direct: itineraries.filter((it) => it.type === "direct").length,
      transfer: itineraries.filter((it) => it.type === "transfer").length,
      multiTransfer: itineraries.filter((it) => it.type === "multi-transfer").length,
      via: itineraries.filter((it) => it.type === "via").length
    };

    const responsePayload = {
      ok: true,
      query: {
        from: fromName,
        to: toName,
        via: viaNames,
        date,
        time,
        transferMinutes,
        maxTransfers,
        excludeCarriers: [...excludeCarrierSet]
      },
      resolvedFrom: resolvedWaypoints[0],
      resolvedTo: resolvedWaypoints[resolvedWaypoints.length - 1],
      resolvedVia: hasVia ? resolvedWaypoints.slice(1, -1) : [],
      generatedAt: new Date().toISOString(),
      counts,
      noConnectionFound,
      viaFailedAt,
      itineraries,
      liveDelay,
      apiLimits,
      cache: { ...cacheInfo, composed: "MISS" },
      __debug: globalThis.__plannerDebug || undefined
    };

    if (!globalThis.__plannerDebug) {
      context.waitUntil(
        caches.default.put(
          composedKey,
          new Response(JSON.stringify(responsePayload), {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": `public, max-age=${COMPOSED_CACHE_TTL}`
            }
          })
        )
      );
    }

    return json(responsePayload);
  } catch (error) {
    return json({ ok: false, error: "Błąd API PLK", details: error.message }, 502);
  }
}

// ============ Jeden segment (bezpośrednio + 1 przesiadka między dwiema konkretnymi, już rozwiązanymi stacjami) ============
async function searchSegment({ from, to, date, transferMinutes, excludeCarrierSet, headers, scheduleTtl, stationNames }) {
  const directUrl =
    `${PLK_BASE}/schedules?from=${encodeURIComponent(from.name)}&to=${encodeURIComponent(to.name)}` +
    `&dateFrom=${date}&dateTo=${date}`;
  const fromFullUrl =
    `${PLK_BASE}/schedules/shortened?stations=${from.id}&fullRoute=true&dateFrom=${date}&dateTo=${date}`;
  const toFullUrl =
    `${PLK_BASE}/schedules/shortened?stations=${to.id}&fullRoute=true&dateFrom=${date}&dateTo=${date}`;

  const [directResult, fromFullResult, toFullResult] = await Promise.all([
    getJsonCached(directUrl, headers, scheduleTtl),
    getJsonCached(fromFullUrl, headers, scheduleTtl),
    getJsonCached(toFullUrl, headers, scheduleTtl)
  ]);

  const directRoutes = directResult.data?.routes || [];
  const directItins = buildDirectItineraries(directRoutes, from, to, date, excludeCarrierSet);

  const fromRoutes = fromFullResult.data?.rt || [];
  const toRoutes = toFullResult.data?.rt || [];
  const { itineraries: transferItins, reachableAfterA, reachableBeforeB } = buildTransferItineraries(
    fromRoutes,
    toRoutes,
    from,
    to,
    transferMinutes,
    stationNames,
    excludeCarrierSet
  );

  const itineraries = [...directItins, ...transferItins].sort((a, b) =>
    a.departureTime.localeCompare(b.departureTime)
  );

  return {
    itineraries,
    reachableAfterA,
    reachableBeforeB,
    apiLimitsList: [directResult.apiLimits, fromFullResult.apiLimits, toFullResult.apiLimits],
    cache: { direct: directResult.cache, fromFullRoute: fromFullResult.cache, toFullRoute: toFullResult.cache }
  };
}

// ============ Rozwiązywanie nazwy stacji → ID ============
// PLK potrafi mieć dla jednej nazwy dwa różne ID (np. "Bohumin" — stacja po
// obu stronach granicy w jednym słowniku) — zwracamy pierwsze trafienie, ale
// oznaczamy ambiguous+alternateIds, żeby UI mogło pokazać obie opcje.
async function resolveStation(name, headers) {
  const url = `${PLK_BASE}/dictionaries/stations?search=${encodeURIComponent(name)}&pageSize=20`;
  const result = await getJsonCached(url, headers, CACHE_TTL.STATION_SEARCH);
  const stations = extractArray(result.data);
  const wanted = normalize(name);
  const exact = stations.filter((s) => normalize(s.name || s.stationName) === wanted);
  const list = exact.length ? exact : stations[0] ? [stations[0]] : [];

  if (!list.length) {
    return { id: null, name, ambiguous: false, alternateIds: [], cache: result.cache };
  }

  return {
    id: String(list[0].id ?? list[0].stationId),
    name: list[0].name || list[0].stationName,
    ambiguous: list.length > 1,
    alternateIds: list.slice(1).map((s) => String(s.id ?? s.stationId)),
    cache: result.cache
  };
}

function parseCarrierSet(csv) {
  return new Set(
    String(csv || "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
  );
}

function carrierCodeOf(value) {
  return String(value || "").trim().toUpperCase();
}

// ============ Połączenia bezpośrednie ============
// PLK już filtruje `from`/`to` po swojej stronie — każda zwrócona trasa ma
// stację A przed stacją B. Wystarczy znaleźć oba indeksy i przeczytać
// godziny na nich.
function buildDirectItineraries(routes, from, to, date, excludeCarrierSet) {
  const results = [];

  for (const r of routes) {
    if (excludeCarrierSet && excludeCarrierSet.has(carrierCodeOf(r.carrierCode))) continue;

    const stations = r.stations || [];
    const fi = stations.findIndex((s) => String(s.stationId) === String(from.id));
    if (fi < 0) continue;
    const ti = stations.findIndex((s, idx) => idx > fi && String(s.stationId) === String(to.id));
    if (ti < 0) continue;

    const boardStop = stations[fi];
    const alightStop = stations[ti];
    const depTime = shortTime(boardStop.departureTime);
    const arrTime = shortTime(alightStop.arrivalTime);
    if (!depTime || !arrTime) continue;

    const depMin = minutesFromTime(depTime);
    let arrMin = minutesFromTime(arrTime);
    let nextDay = false;
    if (arrMin < depMin) {
      arrMin += 1440;
      nextDay = true;
    }

    const train = {
      number: r.nationalNumber || "",
      category: r.commercialCategorySymbol || "",
      name: r.name || "",
      carrier: r.carrierCode || ""
    };

    const leg = {
      train,
      scheduleId: String(r.scheduleId || ""),
      orderId: String(r.orderId || ""),
      trainOrderId: String(r.trainOrderId || ""),
      board: {
        stationId: String(from.id),
        stationName: from.name,
        time: depTime,
        platform: boardStop.departurePlatform || "",
        track: boardStop.departureTrack || ""
      },
      alight: { stationId: String(to.id), stationName: to.name, time: arrTime, nextDay }
    };
    leg.trainUrl = buildTrainUrl(leg, to.name, date);

    results.push({
      type: "direct",
      departureTime: depTime,
      arrivalTime: arrTime,
      arrivalNextDay: nextDay,
      durationMinutes: arrMin - depMin,
      legs: [leg],
      transfers: []
    });
  }

  return results;
}

// ============ Połączenia z jedną przesiadką (meet in the middle) ============
// Uwaga o granicy doby: jeśli pierwsza noga sama w sobie przekracza północ
// (jej czas przyjazdu, liczbowo, jest wcześniejszy niż czas odjazdu), taki
// przystanek świadomie NIE trafia do kandydatów na przesiadkę — dane dla
// drugiej nogi są pobierane tylko dla jednego dnia, więc nie da się
// bezpiecznie rozstrzygnąć, czy jej odjazd przypada przed czy po takim
// przejściu przez północ. To samo ograniczenie dotyczy automatycznych 2
// przesiadek i łańcucha "przez" — żadne z rozszerzeń tego nie naprawia.

function routeKeyOf(r) {
  return `${r.sid}|${r.oid}`;
}

function trainInfoFromShort(r) {
  return {
    number: r.nn || "",
    category: r.ccs || "",
    name: r.nm || "",
    carrier: r.cc || ""
  };
}

// Mapa: ID stacji osiągalnej PO stacji `stationId` → lista kandydujących
// pierwszych nóg (kurs, godzina wejścia na pokład w `stationId`, godzina
// przyjazdu na stację-kandydata).
function buildReachableAfter(routes, stationId, excludeCarrierSet) {
  const map = new Map();

  for (const r of routes) {
    if (excludeCarrierSet && excludeCarrierSet.has(carrierCodeOf(r.cc))) continue;

    const stops = r.st || [];
    const idx = stops.findIndex((s) => String(s.id) === String(stationId));
    if (idx < 0) continue;

    const originStop = stops[idx];
    const boardTime = shortTime(originStop.dtm);
    if (!boardTime) continue; // to jest ostatni przystanek tego kursu — nie da się tu wsiąść dalej
    const boardMin = minutesFromTime(boardTime);

    for (let j = idx + 1; j < stops.length; j++) {
      const stop = stops[j];
      const arrTime = shortTime(stop.atm);
      if (!arrTime) continue;
      if (minutesFromTime(arrTime) < boardMin) continue; // przejście przez północ — pomijamy

      const key = String(stop.id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ routeKey: routeKeyOf(r), route: r, boardTime, arrTime });
    }
  }

  return map;
}

// Mapa: ID stacji, z której da się dojechać DO stacji `stationId` → lista
// kandydujących drugich nóg (kurs, godzina odjazdu ze stacji-kandydata,
// godzina przyjazdu do `stationId`).
function buildReachableBefore(routes, stationId, excludeCarrierSet) {
  const map = new Map();

  for (const r of routes) {
    if (excludeCarrierSet && excludeCarrierSet.has(carrierCodeOf(r.cc))) continue;

    const stops = r.st || [];
    const idx = stops.findIndex((s) => String(s.id) === String(stationId));
    if (idx < 0) continue;

    const destStop = stops[idx];
    const arrAtDest = shortTime(destStop.atm);
    if (!arrAtDest) continue; // to jest pierwszy przystanek tego kursu — nikt tu nie przyjeżdża

    for (let j = 0; j < idx; j++) {
      const stop = stops[j];
      const depTime = shortTime(stop.dtm);
      if (!depTime) continue;

      const key = String(stop.id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ routeKey: routeKeyOf(r), route: r, boardTime: depTime, arrTime: arrAtDest });
    }
  }

  return map;
}

function buildTransferItineraries(fromRoutes, toRoutes, from, to, transferMinutes, stationNames, excludeCarrierSet) {
  const reachableAfterA = buildReachableAfter(fromRoutes, from.id, excludeCarrierSet);
  const reachableBeforeB = buildReachableBefore(toRoutes, to.id, excludeCarrierSet);
  const results = [];

  for (const [transferStationId, leg1List] of reachableAfterA) {
    const leg2List = reachableBeforeB.get(transferStationId);
    if (!leg2List) continue;

    for (const leg1 of leg1List) {
      const arr1 = minutesFromTime(leg1.arrTime);

      for (const leg2 of leg2List) {
        if (leg1.routeKey === leg2.routeKey) continue; // ten sam kurs — to już jest "bezpośrednio"

        const dep2 = minutesFromTime(leg2.boardTime);
        const bufferMinutes = dep2 - arr1;
        if (bufferMinutes < transferMinutes || bufferMinutes > MAX_TRANSFER_WAIT_MINUTES) continue;

        let arr2 = minutesFromTime(leg2.arrTime);
        let nextDay = false;
        if (arr2 < dep2) {
          arr2 += 1440;
          nextDay = true;
        }

        const transferStationName =
          stationNames.get(Number(transferStationId)) || `Stacja ${transferStationId}`;

        const leg1Info = {
          train: trainInfoFromShort(leg1.route),
          scheduleId: String(leg1.route.sid || ""),
          orderId: String(leg1.route.oid || ""),
          trainOrderId: String(leg1.route.toid || ""),
          board: { stationId: String(from.id), stationName: from.name, time: leg1.boardTime },
          alight: {
            stationId: transferStationId,
            stationName: transferStationName,
            time: leg1.arrTime,
            nextDay: false
          }
        };
        leg1Info.trainUrl = buildTrainUrl(leg1Info, transferStationName, null);

        const leg2Info = {
          train: trainInfoFromShort(leg2.route),
          scheduleId: String(leg2.route.sid || ""),
          orderId: String(leg2.route.oid || ""),
          trainOrderId: String(leg2.route.toid || ""),
          board: { stationId: transferStationId, stationName: transferStationName, time: leg2.boardTime },
          alight: { stationId: String(to.id), stationName: to.name, time: leg2.arrTime, nextDay }
        };
        leg2Info.trainUrl = buildTrainUrl(leg2Info, to.name, null);

        results.push({
          type: "transfer",
          departureTime: leg1.boardTime,
          arrivalTime: leg2.arrTime,
          arrivalNextDay: nextDay,
          durationMinutes: arr2 - minutesFromTime(leg1.boardTime),
          legs: [leg1Info, leg2Info],
          transfers: [{ stationId: transferStationId, stationName: transferStationName, bufferMinutes, ok: true }]
        });
      }
    }
  }

  return { itineraries: dedupItineraries(results), reachableAfterA, reachableBeforeB };
}

// ============ Automatyczne 2 przesiadki (bez wskazanej stacji "przez") ============
// M=5 kandydatów na drugi skok, wybranych BEZ listy węzłów: ze stacji już
// osiągalnych z A (reachableAfterA), które same nie dały żadnej ważnej
// 1-przesiadki, ranking po liczbie różnych kursów stamtąd — to już policzone
// przy okazji 1-przesiadki, za darmo.
async function buildMultiTransferItineraries({
  reachableAfterA,
  reachableBeforeB,
  from,
  to,
  transferMinutes,
  stationNames,
  excludeCarrierSet,
  headers,
  scheduleTtl,
  date
}) {
  // UWAGA: świadomie BEZ odrzucania stacji, które już są kluczem w
  // reachableBeforeB. To, że JAKIŚ pociąg stamtąd dojeżdża do B, nie znaczy,
  // że MOJA konkretna pierwsza noga (ten akurat przyjazd z A) zdąży się z
  // nim połączyć — bufor czasowy mógł się nie zgadzać. Taki filtr
  // systematycznie wykluczał właśnie największe węzły (np. Katowice —
  // "już i tak coś stamtąd jedzie do B"), które realnie są NAJLEPSZYMI
  // kandydatami na przesiadkę. Złapane na żywym przykładzie: Tarnowskie
  // Góry→Chorzów Batory→Katowice→Radziechowy Wieprz ginęło właśnie przez
  // ten filtr.
  const ranked = [...reachableAfterA.entries()].sort((a, b) => b[1].length - a[1].length);
  const candidateIds = ranked.slice(0, MULTI_TRANSFER_CANDIDATES).map(([stationId]) => stationId);

  if (globalThis.__plannerDebug) {
    globalThis.__plannerDebug.reachableAfterAKeys = [...reachableAfterA.keys()];
    globalThis.__plannerDebug.reachableAfterATop = ranked.slice(0, 15).map(([id, list]) => [id, list.length]);
    globalThis.__plannerDebug.candidateIds = candidateIds;
    globalThis.__plannerDebug.chorzowBatoryInReachableAfterA = reachableAfterA.has("73106");
    globalThis.__plannerDebug.chorzowBatoryInReachableBeforeB = reachableBeforeB.has("73106");
  }

  if (!candidateIds.length) {
    return { itineraries: [], apiLimitsList: [], fetchedCount: 0 };
  }

  const fetched = await Promise.all(
    candidateIds.map((stationId) =>
      getJsonCached(
        `${PLK_BASE}/schedules/shortened?stations=${stationId}&fullRoute=true&dateFrom=${date}&dateTo=${date}`,
        headers,
        scheduleTtl
      )
        .then((r) => ({ stationId, result: r }))
        .catch(() => ({ stationId, result: null }))
    )
  );

  const apiLimitsList = [];
  const results = [];

  for (const { stationId: xi, result } of fetched) {
    if (!result) continue;
    apiLimitsList.push(result.apiLimits);

    const xiRoutes = result.data?.rt || [];
    const reachableAfterXi = buildReachableAfter(xiRoutes, xi, excludeCarrierSet);
    // Realne listy mają tu zwykle kilkadziesiąt wpisów (nie setki) — ucinanie
    // ich do pierwszych 10 w kolejności napotkania (nie czasu!) po cichu
    // gubiło akurat potrzebny kurs na żywym przykładzie. Sortujemy po
    // godzinie i zostawiamy szeroki, ale skończony margines bezpieczeństwa.
    const byTime = (key) => (a, b) => minutesFromTime(a[key]) - minutesFromTime(b[key]);
    const leg1List = (reachableAfterA.get(xi) || []).slice().sort(byTime("boardTime")).slice(0, 40);

    for (const [yId, leg2ListFull] of reachableAfterXi) {
      const leg3ListFull = reachableBeforeB.get(yId);
      if (!leg3ListFull) continue;

      const leg2List = leg2ListFull.slice().sort(byTime("boardTime")).slice(0, 40);
      const leg3List = leg3ListFull.slice().sort(byTime("boardTime")).slice(0, 40);

      for (const leg1 of leg1List) {
        const arr1 = minutesFromTime(leg1.arrTime);

        for (const leg2 of leg2List) {
          if (leg2.routeKey === leg1.routeKey) continue;
          const dep2 = minutesFromTime(leg2.boardTime);
          const buf1 = dep2 - arr1;
          if (buf1 < transferMinutes || buf1 > MAX_TRANSFER_WAIT_MINUTES) continue;
          const arr2 = minutesFromTime(leg2.arrTime);

          for (const leg3 of leg3List) {
            if (leg3.routeKey === leg2.routeKey || leg3.routeKey === leg1.routeKey) continue;
            const dep3 = minutesFromTime(leg3.boardTime);
            const buf2 = dep3 - arr2;
            if (buf2 < transferMinutes || buf2 > MAX_TRANSFER_WAIT_MINUTES) continue;

            let arr3 = minutesFromTime(leg3.arrTime);
            let nextDay = false;
            if (arr3 < dep3) {
              arr3 += 1440;
              nextDay = true;
            }

            const xiName = stationNames.get(Number(xi)) || `Stacja ${xi}`;
            const yName = stationNames.get(Number(yId)) || `Stacja ${yId}`;

            const leg1Info = {
              train: trainInfoFromShort(leg1.route),
              scheduleId: String(leg1.route.sid || ""),
              orderId: String(leg1.route.oid || ""),
              trainOrderId: String(leg1.route.toid || ""),
              board: { stationId: String(from.id), stationName: from.name, time: leg1.boardTime },
              alight: { stationId: xi, stationName: xiName, time: leg1.arrTime, nextDay: false }
            };
            leg1Info.trainUrl = buildTrainUrl(leg1Info, xiName, null);

            const leg2Info = {
              train: trainInfoFromShort(leg2.route),
              scheduleId: String(leg2.route.sid || ""),
              orderId: String(leg2.route.oid || ""),
              trainOrderId: String(leg2.route.toid || ""),
              board: { stationId: xi, stationName: xiName, time: leg2.boardTime },
              alight: { stationId: yId, stationName: yName, time: leg2.arrTime, nextDay: false }
            };
            leg2Info.trainUrl = buildTrainUrl(leg2Info, yName, null);

            const leg3Info = {
              train: trainInfoFromShort(leg3.route),
              scheduleId: String(leg3.route.sid || ""),
              orderId: String(leg3.route.oid || ""),
              trainOrderId: String(leg3.route.toid || ""),
              board: { stationId: yId, stationName: yName, time: leg3.boardTime },
              alight: { stationId: String(to.id), stationName: to.name, time: leg3.arrTime, nextDay }
            };
            leg3Info.trainUrl = buildTrainUrl(leg3Info, to.name, null);

            results.push({
              type: "multi-transfer",
              departureTime: leg1.boardTime,
              arrivalTime: leg3.arrTime,
              arrivalNextDay: nextDay,
              durationMinutes: arr3 - minutesFromTime(leg1.boardTime),
              legs: [leg1Info, leg2Info, leg3Info],
              transfers: [
                { stationId: xi, stationName: xiName, bufferMinutes: buf1, ok: true },
                { stationId: yId, stationName: yName, bufferMinutes: buf2, ok: true }
              ]
            });
          }
        }
      }
    }
  }

  return { itineraries: dedupItineraries(results), apiLimitsList, fetchedCount: fetched.length };
}

// ============ Przesiadki "przez" wskazane stacje — sklejanie segmentów ============
// Każdy segment (from→via1, via1→via2, ..., viaN→to) to już policzone
// bezpośrednio+1 przesiadka. Sklejamy z ograniczonym DFS: bez segmentu 0
// bierzemy kandydatów od zadanej godziny w górę; dla kolejnych segmentów
// okno [poprzedni przyjazd + bufor, poprzedni przyjazd + max. oczekiwanie].
// Żadnych nowych zapytań — to czyste porównania w pamięci na już pobranych
// listach, więc nawet pełne przeszukanie (max VIA_SCAN_WINDOW^segmenty) jest
// trywialne obliczeniowo.
function stitchViaChain(segmentResults, waypoints, transferMinutes, timeFloor) {
  const n = segmentResults.length;
  const combos = [];

  function candidatesAt(segIdx, floor, ceil) {
    return segmentResults[segIdx].itineraries
      .filter((it) => {
        const d = minutesFromTime(it.departureTime);
        return d != null && d >= floor && d <= ceil;
      })
      .slice(0, VIA_SCAN_WINDOW);
  }

  function dfs(segIdx, floor, ceil, chosen) {
    if (segIdx === n) {
      combos.push([...chosen]);
      return;
    }
    const cands = candidatesAt(segIdx, floor, segIdx === 0 ? Infinity : ceil);
    for (const cand of cands) {
      const dep = minutesFromTime(cand.departureTime);
      const arr = dep + cand.durationMinutes;
      chosen.push(cand);
      dfs(segIdx + 1, arr + transferMinutes, arr + MAX_TRANSFER_WAIT_MINUTES, chosen);
      chosen.pop();
    }
  }

  dfs(0, timeFloor, Infinity, []);

  let failedAt = null;
  if (!combos.length) {
    let floor = timeFloor;
    let ceil = Infinity;
    for (let i = 0; i < n; i++) {
      const cands = candidatesAt(i, floor, i === 0 ? Infinity : ceil);
      if (!cands.length) {
        failedAt = waypoints[i].name;
        break;
      }
      const best = cands[0];
      const dep = minutesFromTime(best.departureTime);
      const arr = dep + best.durationMinutes;
      floor = arr + transferMinutes;
      ceil = arr + MAX_TRANSFER_WAIT_MINUTES;
    }
  }

  return { combos: dedupItineraries(combos.map((chosen) => combineViaChain(chosen, waypoints))), failedAt };
}

function combineViaChain(chosen, waypoints) {
  const legs = [...chosen[0].legs];
  // gaps[k] opisuje przerwę między legs[k] i legs[k+1] — albo prawdziwe
  // złączenie segmentów (stacja "przez"), albo przesiadka WEWNĄTRZ
  // pojedynczego segmentu (gdy ten segment sam w sobie był typu "transfer").
  const gaps = [...(chosen[0].transfers || [])];
  let runningArr = minutesFromTime(chosen[0].departureTime) + chosen[0].durationMinutes;

  for (let i = 1; i < chosen.length; i++) {
    let dep = minutesFromTime(chosen[i].departureTime);
    while (dep < runningArr) dep += 1440;
    const bufferMinutes = dep - runningArr;
    const viaStation = waypoints[i];
    gaps.push({ stationId: String(viaStation.id), stationName: viaStation.name, bufferMinutes, ok: true });
    legs.push(...chosen[i].legs);
    gaps.push(...(chosen[i].transfers || []));
    runningArr = dep + chosen[i].durationMinutes;
  }

  const totalDuration = runningArr - minutesFromTime(chosen[0].departureTime);
  const arrivalNextDay = runningArr >= 1440;

  // Ten sam fizyczny kurs bywa jednocześnie "ostatnią nogą" jednego segmentu
  // i "pierwszą nogą" następnego — jedzie dalej przez wymuszoną stację
  // "przez", pasażer wcale nie wysiada. Scalamy sąsiednie nogi tego samego
  // kursu w jedną, usuwając sztuczną przesiadkę między nimi.
  let k = 0;
  while (k < legs.length - 1) {
    if (legs[k].scheduleId === legs[k + 1].scheduleId && legs[k].orderId === legs[k + 1].orderId) {
      legs[k] = { ...legs[k], alight: legs[k + 1].alight };
      legs.splice(k + 1, 1);
      gaps.splice(k, 1);
    } else {
      k++;
    }
  }

  return {
    type: "via",
    departureTime: chosen[0].departureTime,
    arrivalTime: hhmmFromMinutes(runningArr),
    arrivalNextDay,
    durationMinutes: totalDuration,
    legs,
    transfers: gaps
  };
}

// ============ Deduplikacja ============
// Ta sama para/trójka kursów potrafi mieć kilka wspólnych przystanków z
// rzędu (pociągi jadą równolegle przez kilka stacji, zanim się rozjadą) —
// bez tego ta sama, w istocie jedna, przesiadka powielałaby się kilkanaście
// razy, tylko z inną stacją zmiany. Zostaje jeden reprezentant na zestaw
// kursów: ten z najmniejszą sumą buforów (najmniej czasu traconego na
// peronach łącznie).
function dedupItineraries(results) {
  const best = new Map();
  for (const it of results) {
    const key = it.legs.map((l) => l.scheduleId + "|" + l.orderId).join(">");
    const score = (it.transfers || []).reduce((s, t) => s + t.bufferMinutes, 0);
    const existing = best.get(key);
    const existingScore = existing ? (existing.transfers || []).reduce((s, t) => s + t.bufferMinutes, 0) : Infinity;
    if (!existing || score < existingScore) best.set(key, it);
  }
  return [...best.values()];
}

// ============ Wzbogacenie o czas rzeczywisty (opóźnienia na żywo) ============
// Tylko dla dzisiejszej daty, tylko dla wyników faktycznie zwracanych (nigdy
// dla odrzuconych kandydatów) — i z dynamicznym limitem liczby zapytań, żeby
// nie przekroczyć budżetu subrequestów razem z ewentualnym via-chainingiem.
async function enrichWithLiveDelay(itineraries, date, headers, isToday, budget, transferMinutes) {
  const meta = { applied: false, reason: isToday ? "ok" : "future-date", enrichedPairs: 0, cappedAt: budget };
  if (!isToday || !itineraries.length) return meta;

  const uniquePairs = new Map();
  for (const it of itineraries) {
    for (const leg of it.legs) {
      if (!leg.scheduleId || !leg.orderId) continue;
      const key = leg.scheduleId + "|" + leg.orderId;
      if (!uniquePairs.has(key)) uniquePairs.set(key, { scheduleId: leg.scheduleId, orderId: leg.orderId });
    }
  }

  const pairsToFetch = [...uniquePairs.values()].slice(0, budget);
  const opMaps = new Map();

  await Promise.all(
    pairsToFetch.map(async (p) => {
      try {
        const opUrl = `${PLK_BASE}/operations/train/${encodeURIComponent(p.scheduleId)}/${encodeURIComponent(
          p.orderId
        )}/${encodeURIComponent(date)}`;
        const result = await getJsonWithMeta(opUrl, headers);
        const operation = result.data?.operation || result.data || {};
        const stops = Array.isArray(operation.stations) ? operation.stations : [];
        const stopMap = new Map();
        for (const s of stops) {
          const key = String(s.stationId ?? s.stopId ?? s.id ?? "");
          if (key) stopMap.set(key, s);
        }
        opMaps.set(p.scheduleId + "|" + p.orderId, stopMap);
      } catch (e) {
        // Brak danych na żywo dla tego kursu — pomijamy go, nie wywracamy reszty.
      }
    })
  );

  meta.applied = true;
  meta.enrichedPairs = opMaps.size;

  for (const it of itineraries) {
    if (!it.transfers || !it.transfers.length) continue;

    for (let i = 0; i < it.transfers.length; i++) {
      const legBefore = it.legs[i];
      const legAfter = it.legs[i + 1];
      const t = it.transfers[i];
      const beforeMap = opMaps.get(legBefore.scheduleId + "|" + legBefore.orderId);
      const afterMap = opMaps.get(legAfter.scheduleId + "|" + legAfter.orderId);

      if (!beforeMap || !afterMap) {
        t.liveDataAvailable = false;
        t.liveRisk = null;
        continue;
      }

      const arrLive = liveTimeForStop(beforeMap, legBefore.alight.stationId, true);
      const depLive = liveTimeForStop(afterMap, legAfter.board.stationId, false);

      if (!arrLive.known || !depLive.known) {
        t.liveDataAvailable = false;
        t.liveRisk = null;
        continue;
      }

      const arrMin = minutesFromTime(arrLive.time);
      let depMin = minutesFromTime(depLive.time);
      if (depMin < arrMin) depMin += 1440;
      const realBufferMinutes = depMin - arrMin;

      t.realBufferMinutes = realBufferMinutes;
      t.liveDataAvailable = true;
      t.liveRisk =
        realBufferMinutes >= transferMinutes ? "safe" : realBufferMinutes >= 0 ? "tight" : "missed";
    }
  }

  return meta;
}

// Najlepszy znany czas (rzeczywisty > prognoza > nic) dla jednego przystanku
// jednego kursu, z odpowiedzi /operations/train/... — ufamy "actual" tylko
// gdy isConfirmed===true (tak samo jak train-details.js), inaczej bierzemy
// prognozę PLK, jeśli ją podał; brak jednego i drugiego = nieznany.
function liveTimeForStop(stopMap, stationId, isArrival) {
  const op = stopMap.get(String(stationId));
  if (!op) return { time: null, known: false };

  const isConfirmed = op.isConfirmed === true;
  if (isConfirmed) {
    const raw = isArrival ? op.actualArrival || op.estimatedArrival : op.actualDeparture || op.estimatedDeparture;
    const t = shortTime(raw);
    return t ? { time: t, known: true } : { time: null, known: false };
  }

  const estimatedRaw = isArrival ? op.estimatedArrival : op.estimatedDeparture;
  const t = shortTime(estimatedRaw);
  return t ? { time: t, known: true } : { time: null, known: false };
}

// ============ Słownik ID stacji → nazwa (ten sam wzorzec co departures.js) ============
function buildStationNameMap(dictionaryRaw) {
  const map = new Map();
  const possibleLists = [
    dictionaryRaw?.stations,
    dictionaryRaw?.items,
    dictionaryRaw?.results,
    dictionaryRaw?.data,
    dictionaryRaw
  ];

  for (const list of possibleLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const id = item.id || item.stationId || item.stopPointId;
      const name = item.name || item.stationName || item.stopPointName;
      if (id && name) map.set(Number(id), name);
    }
  }

  return map;
}

// ============ Budowa linku do /train (te same parametry co buildTrainUrl w index.html) ============
function buildTrainUrl(leg, destinationName, date) {
  const p = new URLSearchParams();
  p.set("train", leg.train.number || "");
  if (leg.train.category) p.set("category", leg.train.category);
  if (leg.train.name) p.set("name", leg.train.name);
  if (destinationName) p.set("destination", destinationName);
  if (date) p.set("date", date);
  if (leg.scheduleId) {
    p.set("scheduleId", leg.scheduleId);
    p.set("scheduledId", leg.scheduleId);
  }
  if (leg.orderId) p.set("orderId", leg.orderId);
  if (leg.trainOrderId) p.set("trainOrderId", leg.trainOrderId);
  if (leg.board.stationId) p.set("stationId", leg.board.stationId);
  if (leg.board.stationName) p.set("station", leg.board.stationName);
  return "/train?" + p.toString();
}

// ============ Cache (caches.default, ten sam wzorzec co departures.js/stations.js) ============
function composedCacheKey(parts) {
  const raw = JSON.stringify(parts);
  return new Request("https://cache.local/composed-planner/" + btoa(encodeURIComponent(raw)), {
    method: "GET"
  });
}

async function getJsonCached(url, headers, ttlSeconds) {
  const cache = caches.default;
  const cacheKey = new Request("https://cache.local/" + btoa(url), { method: "GET" });
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    const cachedData = await cachedResponse.json();
    return {
      data: cachedData,
      apiLimits: { available: false, limit: null, remaining: null, reset: null },
      cache: "HIT"
    };
  }

  const result = await getJsonWithMeta(url, headers);

  const responseForCache = new Response(JSON.stringify(result.data), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${ttlSeconds}`
    }
  });
  await cache.put(cacheKey, responseForCache);

  return { ...result, cache: "MISS" };
}

async function getJsonWithMeta(url, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    return { data: JSON.parse(text), apiLimits: readApiLimits(res.headers) };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Upstream timeout po ${UPSTREAM_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function readApiLimits(headers) {
  const limit =
    headers.get("x-ratelimit-limit") ||
    headers.get("ratelimit-limit") ||
    headers.get("x-rate-limit-limit") ||
    headers.get("x-ratelimit-hourly-limit") ||
    headers.get("x-ratelimit-daily-limit");

  const remaining =
    headers.get("x-ratelimit-remaining") ||
    headers.get("ratelimit-remaining") ||
    headers.get("x-rate-limit-remaining") ||
    headers.get("x-ratelimit-hourly-remaining") ||
    headers.get("x-ratelimit-daily-remaining");

  const reset =
    headers.get("x-ratelimit-reset") ||
    headers.get("ratelimit-reset") ||
    headers.get("x-rate-limit-reset");

  return {
    available: Boolean(limit || remaining || reset),
    limit: limit ?? null,
    remaining: remaining ?? null,
    reset: reset ?? null
  };
}

function mergeApiLimits(items) {
  const availableItems = items.filter((item) => item && item.available);
  if (!availableItems.length) {
    return { available: false, limit: null, remaining: null, reset: null };
  }

  const remainingValues = availableItems.map((item) => Number(item.remaining)).filter(Number.isFinite);
  const limitValues = availableItems.map((item) => Number(item.limit)).filter(Number.isFinite);

  return {
    available: true,
    limit: limitValues.length ? String(Math.max(...limitValues)) : availableItems[0].limit,
    remaining: remainingValues.length ? String(Math.min(...remainingValues)) : availableItems[0].remaining,
    reset: availableItems.find((item) => item.reset)?.reset ?? null
  };
}

// ============ Małe pomocniki ============
function localDateYYYYMMDD() {
  const now = new Date();
  return (
    String(now.getFullYear()).padStart(4, "0") +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0")
  );
}

function currentTimeHHMM() {
  const now = new Date();
  return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
}

function shortTime(value) {
  if (!value) return "";
  const match = String(value).match(/(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

function hhmmFromMinutes(m) {
  const mm = ((m % 1440) + 1440) % 1440;
  return String(Math.floor(mm / 60)).padStart(2, "0") + ":" + String(mm % 60).padStart(2, "0");
}

function minutesFromTime(time) {
  const match = String(time || "").match(/(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function extractArray(data) {
  if (Array.isArray(data)) return data;
  return data?.stations || data?.items || data?.results || data?.data || [];
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
  });
}
