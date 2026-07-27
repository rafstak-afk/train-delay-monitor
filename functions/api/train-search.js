export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const trainNum = url.searchParams.get("train");
  const stationName = url.searchParams.get("station");
  const origin = url.origin;

  if (!trainNum) {
    return new Response(JSON.stringify({ found: false }), { status: 400 });
  }

  try {
    // Zapytanie o trasy / rozkłady PLK dla konkretnego numeru pociągu
    const response = await fetch(`${origin}/api/route?train=${encodeURIComponent(trainNum)}`);
    if (!response.ok) {
      return new Response(JSON.stringify({ found: false }));
    }

    const data = await response.json();
    const route = data.route || data.stations || [];

    // Szukamy stacji w trasie pociągu
    const stMatch = route.find(s => 
      (s.name || s.stationName || "").toLowerCase().includes((stationName || "").toLowerCase())
    ) || route[0];

    if (stMatch) {
      return new Response(
        JSON.stringify({
          found: true,
          trainData: {
            train: trainNum,
            station: stMatch.name || stationName,
            plannedTime: stMatch.plannedTime || stMatch.departureTimePlanned || "--:--",
            time: stMatch.realTime || stMatch.plannedTime || "--:--",
            delay: stMatch.delay || 0,
            platform: stMatch.platform || "-",
            track: stMatch.track || "-",
            destination: route[route.length - 1]?.name || "",
            trainOrderId: data.trainOrderId || data.id || null
          }
        }),
        { headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    return new Response(JSON.stringify({ found: false }));
  } catch (e) {
    return new Response(JSON.stringify({ found: false, error: e.message }));
  }
}
