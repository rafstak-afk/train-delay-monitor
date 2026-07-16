export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const train =
    url.searchParams.get("train") || "";

  if (!train) {
    return new Response(
      JSON.stringify({
        error: "Brak parametru train"
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  const origin = url.origin;

  const monitorResponse =
    await fetch(
      `${origin}/api/monitored-trains-v2`
    );

  const monitorData =
    await monitorResponse.json();

  const item =
    (monitorData.trains || []).find(
      t => String(t.train) === String(train)
    );

  if (!item) {
    return new Response(
      JSON.stringify({
        error: "Nie znaleziono pociągu",
        train
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  let trainStatus = null;
  let lastConfirmedStationId = null;
  let lastConfirmedStation = null;
  let lastConfirmedTime = null;

  let route = [];

  try {

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    const debugResponse =
      await fetch(
        `${origin}/api/debug-train` +
        `?date=${today}` +
        `&scheduleId=${item.scheduleId}` +
        `&orderId=${item.orderId}` +
        `&trainOrderId=${item.trainOrderId}`
      );

    const debugData =
      await debugResponse.json();

    trainStatus =
      debugData.operation?.trainStatus || null;

    const operationStations =
      debugData.operation?.stations || [];

    const routeStations =
      debugData.route?.stations || [];

    const stationIds =
      [...new Set(
        routeStations.map(
          s => String(s.stationId)
        )
      )];

    if (stationIds.length) {

      const stationsResponse =
        await fetch(
          `${origin}/api/stations?ids=` +
          stationIds.join(',')
        );

      const stationsData =
        await stationsResponse.json();

      const stationNames =
        stationsData.names || {};


route =
  routeStations.map((s, index) => {

    const op =
      operationStations[index] || {};

    const plannedTime =
      op.plannedDepartureTime ||
      op.plannedArrivalTime ||
      s.departureTime ||
      s.arrivalTime ||
      null;

    const actualTime =
      op.actualDeparture
        ? op.actualDeparture.slice(11,16)
        : (
            op.actualArrival
              ? op.actualArrival.slice(11,16)
              : null
          );

    const delayMinutes =
      op.departureDelayMinutes ??
      op.arrivalDelayMinutes ??
      0;

    return {
      stationId:
        String(s.stationId),

      stationName:
        stationNames[
          String(s.stationId)
        ] || null,

      plannedTime:
        plannedTime
          ? plannedTime.slice(0,5)
          : null,

      actualTime,

      delayMinutes,

      platform:
        s.departurePlatform ||
        s.arrivalPlatform ||
        null,

      track:
        s.departureTrack ||
        s.arrivalTrack ||
        null,

      confirmed:
        op.isConfirmed === true
    };
  });



    }

    const confirmed =
      operationStations.filter(
        s => s.isConfirmed === true
      );

    const last =
      confirmed.length
        ? confirmed[confirmed.length - 1]
        : null;

    if (last) {

      lastConfirmedStationId =
        String(last.stationId);

      const confirmedDateTime =
        last.actualDeparture ||
        last.actualArrival ||
        null;

      lastConfirmedTime =
        confirmedDateTime
          ? confirmedDateTime.slice(11, 19)
          : null;

      if (!route.length) {

        const stationsResponse =
          await fetch(
            `${origin}/api/stations?ids=${lastConfirmedStationId}`
          );

        const stationsData =
          await stationsResponse.json();

        lastConfirmedStation =
          stationsData.names?.[
            lastConfirmedStationId
          ] || null;

      } else {

        const found =
          route.find(
            r =>
              r.stationId ===
              lastConfirmedStationId
          );

        lastConfirmedStation =
          found?.stationName ||
          null;
      }
    }

  } 
catch (err) {
  return new Response(
    JSON.stringify({
      error: err.message,
      stack: String(err.stack || "")
    }, null, 2),
    {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}


  return new Response(
    JSON.stringify(
      {
        train: item.train,
        station: item.station,

        category: item.category,
        name: item.name,
        destination: item.destination,

        delay: item.delay,
        platform: item.platform,
        track: item.track,

        scheduleId: item.scheduleId,
        orderId: item.orderId,
        trainOrderId: item.trainOrderId,

        status: item.found
          ? "W ruchu"
          : "Nie znaleziono",

        trainStatus,

        lastConfirmedStationId,
        lastConfirmedStation,
        lastConfirmedTime,

        route
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store"
      }
    }
  );
}
