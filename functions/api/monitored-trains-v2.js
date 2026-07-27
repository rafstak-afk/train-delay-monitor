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
  
  // Pociąg dalekobieżny z wymuszonym szukaniem bezpośrednim
  { station: "Szczecin Główny", train: "83194", directLookup: true },

  { station: "Katowice", train: "63102" }
];

export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;

  const stations = [
    ...new Set(MONITORED_TRAINS.map(x => x.station))
  ];

  const departuresByStation = {};

  // 1. Pobieramy tablice odjazdów ze stacji
  await Promise.all(
    stations.map(async station => {
      try {
        const response = await fetch(
          `${origin}/api/departures?station=${encodeURIComponent(station)}&limit=100`
        );
        const data = await response.json();
        departuresByStation[station] = Array.isArray(data.departures) ? data.departures : [];
      } catch (err) {
        departuresByStation[station] = [];
      }
    })
  );

  // 2. Dopasowujemy pociągi, a dla brakujących/dalekobieżnych wykonujemy Direct Lookup
  const trains = await Promise.all(
    MONITORED_TRAINS.map(async item => {
      const rows = departuresByStation[item.station] || [];

      let hit = rows.find(row =>
        String(
          row.train ?? row.trainNumber ?? row.number ?? row.trainNo ?? ""
        ).trim() === String(item.train).trim()
      );

      // Jeżeli nie znaleziono na tablicy odjazdów (np. poza oknem czasowym), szukamy bezpośrednio po numerze pociągu
      if (!hit) {
        try {
          const directRes = await fetch(
            `${origin}/api/train-search?train=${encodeURIComponent(item.train)}&station=${encodeURIComponent(item.station)}`
          );
          if (directRes.ok) {
            const directData = await directRes.json();
            if (directData && directData.found) {
              hit = directData.trainData;
            }
          }
        } catch (e) {
          // Fallback w przypadku błędu wyszukiwania
        }
      }

      return {
        station: item.station,
        train: item.train,
        found: !!hit,
        reason: hit ? "" : "Pociąg poza oknem odjazdów i brakiem w rozkładzie na dziś",
        delay: hit?.delay ?? 0,
        status: hit?.status ?? "",
        plannedTime: hit?.plannedTime ?? hit?.time ?? "--:--",
        time: hit?.time ?? "--:--",
        platform: hit?.platform ?? "-",
        track: hit?.track ?? "-",
        category: hit?.category ?? "IC",
        name: hit?.name ?? "",
        destination: hit?.destination ?? "",
        via: hit?.via ?? "",
        scheduleId: hit?.scheduleId ?? null,
        orderId: hit?.orderId ?? null,
        trainOrderId: hit?.trainOrderId ?? hit?.id ?? null
      };
    })
  );

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
