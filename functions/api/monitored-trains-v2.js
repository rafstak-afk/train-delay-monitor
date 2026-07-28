const MONITORED_TRAINS = [
  { station: "Katowice", train: "3815" },
  { station: "Tarnowskie Góry", train: "40450" },
  { station: "Miasteczko Śląskie", train: "44226" },
  { station: "Tarnowskie Góry", train: "40250" },
  { station: "Tarnowskie Góry", train: "40423" },
  { station: "Tarnowskie Góry", train: "40211" },
  { station: "Tarnowskie Góry", train: "40468" },
  { station: "Katowice", train: "38107" },
  { station: "Chorzów Uniwersytet", train: "40621" },
  { station: "Bytom Karb", train: "40658" },
  { station: "Szczecin Główny", train: "83194" },
  { station: "Katowice", train: "63102" }
];

export async function onRequestGet(context) {
  const { request } = context;
  const originUrl = new URL(request.url).origin;

  const stations = [...new Set(MONITORED_TRAINS.map(x => x.station))];
  const departuresByStation = {};

  // Pobieramy dane bezpiecznie - jeśli jedna stacja zawiedzie, reszta działa
  await Promise.all(
    stations.map(async (station) => {
      try {
        const url = `${originUrl}/api/departures?station=${encodeURIComponent(station)}&limit=100`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          departuresByStation[station] = Array.isArray(data.departures) ? data.departures : (data.trains || []);
        } else {
          departuresByStation[station] = [];
        }
      } catch (e) {
        departuresByStation[station] = [];
      }
    })
  );

  let foundCount = 0;

  const trains = MONITORED_TRAINS.map(item => {
    const rows = departuresByStation[item.station] || [];
    const hit = rows.find(row => 
      String(row.train || row.trainNumber || row.number || "").trim() === String(item.train).trim()
    );

    if (hit) foundCount++;

    return {
      station: item.station,
      train: item.train,
      found: !!hit,
      reason: hit ? "" : "Brak danych w API PLK",
      delay: hit?.delay ?? 0,
      status: hit?.status ?? "",
      plannedTime: hit?.plannedTime ?? hit?.time ?? "--:--",
      time: hit?.time ?? "--:--",
      platform: hit?.platform ?? "-",
      track: hit?.track ?? "-",
      category: hit?.category || "Os",
      name: hit?.name ?? "",
      from: hit?.from || hit?.origin || "", // Prawdziwa stacja początkowa (np. Katowice)
      destination: hit?.destination || hit?.to || "",
      via: hit?.via ?? "",
      scheduleId: hit?.scheduleId ?? null,
      orderId: hit?.orderId ?? null,
      trainOrderId: hit?.trainOrderId ?? null
    };
  });

  return new Response(
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      foundCount,
      trainCount: trains.length,
      trains
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
