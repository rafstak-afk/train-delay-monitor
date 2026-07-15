export async function onRequestGet(context) {
  const train =
    new URL(context.request.url)
      .searchParams.get("train") || "";

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

  const origin = new URL(context.request.url).origin;

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

  return new Response(
    JSON.stringify({
      train: item.train,
      station: item.station,
      found: item.found,

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

      lastConfirmedStation: null,
      lastConfirmedTime: null,

      route: []
    },
    null,
    2),
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
