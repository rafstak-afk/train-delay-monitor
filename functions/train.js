export async function onRequest(context) {
  return handleRequest(context.request, context.env);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  return String(value ?? "").trim();
}

function normalize(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function fetchJson(url, headers = {}) {

  const response = await fetch(url, {
    method: "GET",
    headers
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Niepoprawna odpowiedź API");
  }

  if (!response.ok) {

    throw new Error(
      `PLK API ${response.status}`
    );

  }

  return data;
}

function extractArray(payload) {

  if (Array.isArray(payload)) {
    return payload;
  }

  const keys = [
    "data",
    "items",
    "results",
    "stations",
    "operations",
    "trains"
  ];

  for (const key of keys) {

    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }

  }

  return [];
}

function parseTime(value) {

  const m =
    clean(value).match(/(\d{2}):(\d{2})/);

  if (!m) {
    return null;
  }

  return Number(m[1]) * 60 + Number(m[2]);
}

function formatTime(value) {

  const m =
    clean(value).match(/(\d{2}:\d{2})/);

  return m ? m[1] : "—";
}

function calculateDelay(planned, actual) {

  const p = parseTime(planned);
  const a = parseTime(actual);

  if (p === null || a === null) {
    return 0;
  }

  return Math.max(0, a - p);
}

function normalizeStatus(status) {

  const s =
    clean(status).toUpperCase();

  if (["S","DONE"].includes(s)) {
    return "Zrealizowano";
  }

  if (["RUNNING","C"].includes(s)) {
    return "W ruchu";
  }

  return "W ruchu";
}

function stopStationId(stop) {
  return clean(stop.stationId || stop.id);
}

function stopName(stop, stationMap) {

  return (
    clean(stop.stationName)
    || clean(stop.name)
    || stationMap[stopStationId(stop)]
    || ""
  );

}

function sortStops(stops) {

  return [...stops].sort((a,b) => {

    const aa =
      Number(
        a.plannedSequenceNumber
        ?? a.actualSequenceNumber
        ?? 0
      );

    const bb =
      Number(
        b.plannedSequenceNumber
        ?? b.actualSequenceNumber
        ?? 0
      );

    return aa - bb;

  });

}

function getDestination(stops, currentIndex, stationMap) {

  const sorted =
    sortStops(stops);

  const last =
    sorted[sorted.length - 1];

  return (
    stopName(last, stationMap)
    || "—"
  );

}

function getVia(stops, currentIndex, stationMap) {

  const sorted =
    sortStops(stops);

  const current =
    stops[currentIndex];

  const currentSeq =
    Number(
      current.plannedSequenceNumber
      ?? current.actualSequenceNumber
      ?? 0
    );

  const names = [];

  for (const stop of sorted) {

    const seq =
      Number(
        stop.plannedSequenceNumber
        ?? stop.actualSequenceNumber
        ?? 0
      );

    if (seq <= currentSeq) {
      continue;
    }

    const name =
      stopName(stop, stationMap);

    if (!name) {
      continue;
    }

    if (!names.includes(name)) {
      names.push(name);
    }

  }

  if (!names.length) {
    return "Kończy bieg";
  }

  return names.slice(0,4).join(" • ");

}

function getTrainNumber(operation) {

  const values = [

    operation.trainNumber,
    operation.publicTrainNumber,
    operation.commercialNumber,
    operation.marketingNumber,
    operation.trainName,
    operation.name

  ];

  for (const value of values) {

    const cleaned =
      clean(value);

    if (cleaned) {
      return cleaned;
    }

  }

  return "brak";

}

function getCarrier(operation) {

  const values = [

    operation.carrier,
    operation.carrierName,
    operation.operator,
    operation.operatorName

  ];

  for (const value of values) {

    const cleaned =
      clean(value);

    if (cleaned) {
      return cleaned;
    }

  }

  return "—";

}

function getPlatform(stop) {

  const values = [

    stop.platform,
    stop.platformNumber,
    stop.track

  ];

  for (const value of values) {

    const cleaned =
      clean(value);

    if (cleaned) {
      return cleaned;
    }

  }

  return "—";

}

function dedupeRows(rows) {

  const seen = new Set();

  return rows.filter(row => {

    const key = [

      row.destination,
      row.scheduled,
      row.trainNumber,
      row.platform

    ].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;

  });

}

function filterByTime(rows, time) {

  if (!time) {
    return rows;
  }

  const pivot =
    parseTime(time);

  return rows.filter(row => {

    const value =
      parseTime(
        row.actual
        || row.scheduled
      );

    return (
      value !== null
      && value >= pivot
    );

  });

}

async function handleRequest(request, env) {

  if (request.method === "OPTIONS") {

    return new Response(
      null,
      { headers: corsHeaders() }
    );

  }

  try {

    const body =
      await request.json();

    const stationQuery =
      clean(body.station);

    const requestDate =
      clean(body.date);

    const requestTime =
      clean(body.time);

    const apiBase =
      clean(env.PLK_API_BASE)
      || "https://pdp-api.plk-sa.pl/api/v1";

    const headers = {};

    if (env.PLK_API_KEY) {

      headers["X-Api-Key"] =
        env.PLK_API_KEY;

    }

    const stationsUrl =
      new URL(
        `${apiBase}/dictionaries/stations`
      );

    stationsUrl.searchParams.set(
      "search",
      stationQuery
    );

    const stationsPayload =
      await fetchJson(
        stationsUrl.toString(),
        headers
      );

    const stations =
      extractArray(stationsPayload);

    const matchedStation =
      stations[0];

    if (!matchedStation) {

      return json({
        error: "Nie znaleziono stacji"
      }, 404);

    }

    const stationId =
      clean(
        matchedStation.id
        || matchedStation.stationId
      );

    const stationName =
      clean(
        matchedStation.name
        || matchedStation.stationName
      );

    const stationMap = {};

    for (const station of stations) {

      stationMap[
        clean(
          station.id
          || station.stationId
        )
      ] =
        clean(
          station.name
          || station.stationName
        );

    }

    const operationsUrl =
      new URL(
        `${apiBase}/operations`
      );

    operationsUrl.searchParams.set(
      "stations",
      stationId
    );

    operationsUrl.searchParams.set(
      "withPlanned",
      "true"
    );

    operationsUrl.searchParams.set(
      "fullRoutes",
      "true"
    );

    operationsUrl.searchParams.set(
      "pageSize",
      "200"
    );

    if (requestDate) {

      operationsUrl.searchParams.set(
        "date",
        requestDate
      );

    }

    const operationsPayload =
      await fetchJson(
        operationsUrl.toString(),
        headers
      );

    const operations =
      extractArray(
        operationsPayload
      );

    const rows = [];

    for (const operation of operations) {

      const stops =
        operation.stations
        || [];

      if (!stops.length) {
        continue;
      }

      const stopIndex =
        stops.findIndex(
          stop =>
            stopStationId(stop)
            === stationId
        );

      if (stopIndex === -1) {
        continue;
      }

      const stop =
        stops[stopIndex];

      const planned =
        formatTime(
          stop.plannedDeparture
          || stop.plannedArrival
        );

      const actual =
        formatTime(
          stop.actualDeparture
          || stop.actualArrival
        ) || planned;

      rows.push({

        station:
          stationName,

        scheduled:
          planned,

        actual,

        delayMinutes:
          calculateDelay(
            planned,
            actual
          ),

        status:
          normalizeStatus(
            operation.trainStatus
          ),

        trainNumber:
          getTrainNumber(operation),

        destination:
          getDestination(
            stops,
            stopIndex,
            stationMap
          ),

        carrier:
          getCarrier(operation),

        platform:
          getPlatform(stop),

        via:
          getVia(
            stops,
            stopIndex,
            stationMap
          )

      });

    }

    const filteredRows =
      filterByTime(
        dedupeRows(rows),
        requestTime
      );

    filteredRows.sort((a,b) => {

      return (
        (parseTime(a.actual) ?? 99999)
        -
        (parseTime(b.actual) ?? 99999)
      );

    });

    return json({

      ok: true,

      matchedStation:
        stationName,

      matchedStationId:
        stationId,

      portalStationId:
        `7${stationId}`,

      totalDepartures:
        filteredRows.length,

      route:
        filteredRows.slice(0,20)

    });

  } catch (error) {

    return json({

      error:
        error.message
        || "Worker error"

    }, 500);

  }

}
