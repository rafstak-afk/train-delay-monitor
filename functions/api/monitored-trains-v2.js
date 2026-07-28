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
  { station: "Szczecin Główny", train: "83194" },

  { station: "Katowice", train: "63102" }
];

export async function onRequestGet(context) {
  const { request } = context;
  const origin = new URL(request.url).origin;

  // Unikalne stacje
  const stations = [...new Set(MONITORED_TRAINS.map(x => x.station))];
  const departuresByStation = {};

  // Równoległe pobranie z wyłapywaniem błędów pojedynczych stacji
  await Promise.all(
    stations.map(async (station) => {
      try {
        const url = `${origin}/api/departures?station=${encodeURIComponent(station)}&limit=100`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          departuresByStation[station] = Array.isArray(data.departures) ? data.departures : [];
        } else {
          departuresByStation[station] = [];
        }
      } catch (e) {
        departuresByStation[station] = [];
      }
    })
  );

  const trains = MONITORED_TRAINS.map(item => {
    const rows = departuresByStation[item.station] || [];
    const hit = rows.find(row => 
      String(row.train || row.trainNumber || row.number || "").trim() === String(item.train).trim()
    );

    return {
      station: item.station,
      train: item.train,
      found: !!hit,
      reason: hit ? "" : "Pociągu nie ma w pobranych danych PLK",
      delay: hit?.delay ?? 0,
      status: hit?.status ?? "",
      plannedTime: hit?.plannedTime ?? hit?.time ?? "--:--",
      time: hit?.time ?? "--:--",
      platform: hit?.platform ?? "-",
      track: hit?.track ?? "-",
      category: hit?.category || "Os",
      name: hit?.name ?? "",
      destination: hit?.destination ?? "",
      via: hit?.via ?? "",
      scheduleId: hit?.scheduleId ?? null,
      orderId: hit?.orderId ?? null,
      trainOrderId: hit?.trainOrderId ?? null
    };
  });

  return new Response(
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      stationCount: stations.length,
      trainCount: trains.length,
      foundCount: trains.filter(t => t.found).length,
      trains
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    }
  );
}
