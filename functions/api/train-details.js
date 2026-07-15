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

    const stations =
      debugData.operation?.stations || [];

    const confirmed =
      stations.filter(
        s => s.isConfirmed === true
      );

    const last =
      confirmed.length
        ? confirmed[confirmed.length - 1]
        : null;

    if (last) {

      lastConfirmedStationId =
        String(last.stationId);

      lastConfirmedTime =
        last.actualDeparture ||
        last.actualArrival ||
        null;

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
    }

  } catch (err) {
    console.error(err);
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

        route: []
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
