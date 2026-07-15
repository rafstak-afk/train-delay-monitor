export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;

  const monitored = [
    { station: "Katowice", train: "3815" },
    { station: "Tarnowskie Góry", train: "40450" },
    { station: "Miasteczko Śląskie", train: "44226" },
    { station: "Tarnowskie Góry", train: "40250" },
    { station: "Chorzów Batory", train: "40658" },
    { station: "Chorzów Batory", train: "40423" },
    { station: "Katowice", train: "38107" },
    { station: "Katowice", train: "40621" },
    { station: "Chorzów Batory", train: "40211" },
    { station: "Chorzów Uniwersytet", train: "40468" },
    { station: "Katowice", train: "63102" }
  ];

  const stations = [...new Set(monitored.map(x => x.station))];

  const byStation = {};

  await Promise.all(
    stations.map(async station => {
      const url =
        `${origin}/api/departures?station=` +
        encodeURIComponent(station) +
        "&limit=100";

      try {
        const r = await fetch(url);

        const data = await r.json();

        byStation[station] = Array.isArray(data.departures)
          ? data.departures
          : [];
      } catch {
        byStation[station] = [];
      }
    })
  );

  const result = monitored.map(item => {
    const rows = byStation[item.station] || [];

    const hit = rows.find(
      r =>
        String(
          r.train ||
          r.trainNumber ||
          r.number ||
          ""
        ).trim() === item.train
    );

    return {
      station: item.station,
      train: item.train,
      found: !!hit,
      delay: hit?.delay ?? null,
      scheduleId: hit?.scheduleId ?? null,
      orderId: hit?.orderId ?? null,
      trainOrderId: hit?.trainOrderId ?? null
    };
  });

  return new Response(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        foundCount: result.filter(x => x.found).length,
        trainCount: result.length,
        trains: result
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
