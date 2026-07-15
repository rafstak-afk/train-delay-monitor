const MONITORED_TRAINS = [
  { station: "Katowice", train: "3815" },
  { station: "Tarnowskie Góry", train: "40450" },
  { station: "Miasteczko Śląskie", train: "44226" },
  { station: "Tarnowskie Góry", train: "40250" },

  // objazdy do 31.07.2026
  { station: "Tarnowskie Góry", train: "40423" },
  { station: "Tarnowskie Góry", train: "40211" },
  { station: "Tarnowskie Góry", train: "40468" },

  { station: "Katowice", train: "38107" },
  { station: "Chorzów Uniwersytet", train: "40621" },

  { station: "Bytom Karb", train: "40658" },

  { station: "Katowice", train: "63102" }
];

export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;

  const stations = [
    ...new Set(MONITORED_TRAINS.map(x => x.station))
  ];

  const departuresByStation = {};

  await Promise.all(
    stations.map(async station => {
      try {
        const response = await fetch(
          `${origin}/api/departures?station=${encodeURIComponent(station)}&limit=100`
        );

        const data = await response.json();

        departuresByStation[station] =
          Array.isArray(data.departures)
            ? data.departures
            : [];
      } catch {
        departuresByStation[station] = [];
      }
    })
  );

  const trains = MONITORED_TRAINS.map(item => {
    const rows = departuresByStation[item.station] || [];

    const hit = rows.find(row =>
      String(
        row.train ??
        row.trainNumber ??
        row.number ??
        row.trainNo ??
        ""
      ).trim() === String(item.train).trim()
    );

    return {
      station: item.station,
      train: item.train,
      found: !!hit,
      delay: hit?.delay ?? null,
      status: hit?.status ?? "",
      plannedTime: hit?.plannedTime ?? "",
      time: hit?.time ?? "",
      platform: hit?.platform ?? "",
      track: hit?.track ?? "",
      category: hit?.category ?? "",
      name: hit?.name ?? "",
      destination: hit?.destination ?? "",
      scheduleId: hit?.scheduleId ?? null,
      orderId: hit?.orderId ?? null,
      trainOrderId: hit?.trainOrderId ?? null
    };
  });

  return new Response(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        stationCount: stations.length,
        trainCount: trains.length,
        foundCount: trains.filter(t => t.found).length,
        trains
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
