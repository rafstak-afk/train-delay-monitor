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

function calcDelay(pTime, rTime) {
  if (!pTime || !rTime || pTime === '--:--' || rTime === '--:--') return 0;
  const [ph, pm] = pTime.split(':').map(Number);
  const [rh, rm] = rTime.split(':').map(Number);
  if (isNaN(ph) || isNaN(rh)) return 0;
  let diff = (rh * 60 + rm) - (ph * 60 + pm);
  if (diff < -1200) diff += 1440;
  return diff > 0 ? diff : 0;
}

export async function onRequestGet(context) {
  const { request } = context;
  const originUrl = new URL(request.url).origin;

  const stations = [...new Set(MONITORED_TRAINS.map(x => x.station))];
  const departuresByStation = {};
  let failedRequests = 0;

  await Promise.all(
    stations.map(async (station) => {
      try {
        const url = `${originUrl}/api/departures?station=${encodeURIComponent(station)}&limit=100`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data.departures) ? data.departures : (data.trains || []);
          departuresByStation[station] = list;
          if (list.length === 0) failedRequests++;
        } else {
          departuresByStation[station] = [];
          failedRequests++;
        }
      } catch (e) {
        departuresByStation[station] = [];
        failedRequests++;
      }
    })
  );

  // Zabezpieczenie: Jeśli WSZYSTKIE stacje zwróciły puste listy (pad API PLK)
  if (failedRequests === stations.length) {
    return new Response(
      JSON.stringify({ error: "Brak odpowiedzi z API PLK", code: "PLK_DOWN" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  let foundCount = 0;

  const trains = MONITORED_TRAINS.map(item => {
    const rows = departuresByStation[item.station] || [];
    const hit = rows.find(row => 
      String(row.train || row.trainNumber || row.number || "").trim() === String(item.train).trim()
    );

    if (hit) foundCount++;

    const pTime = hit?.plannedTime ?? hit?.time ?? "--:--";
    const rTime = hit?.time ?? "--:--";
    let delayVal = Number(hit?.delay ?? 0);
    
    if (hit && delayVal === 0) {
      delayVal = calcDelay(pTime, rTime);
    }

    return {
      station: item.station,
      train: item.train,
      found: !!hit,
      reason: hit ? "" : "Brak danych w API PLK",
      delay: delayVal,
      status: hit?.status ?? "",
      plannedTime: pTime,
      time: rTime,
      platform: hit?.platform ?? "-",
      track: hit?.track ?? "-",
      category: hit?.category || "TLK",
      name: hit?.name ?? "",
      from: hit?.from || hit?.origin || "",
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
