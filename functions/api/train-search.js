export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const trainNum = url.searchParams.get("train");
  const stationName = url.searchParams.get("station");
  const origin = url.origin;

  if (!trainNum) {
    return new Response(JSON.stringify({ found: false }), { status: 400 });
  }

  try {
    const response = await fetch(`${origin}/api/route?train=${encodeURIComponent(trainNum)}`);
    if (!response.ok) {
      return new Response(JSON.stringify({ found: false }));
    }

    const data = await response.json();
    const route = data.route || data.stations || [];

    if (route.length === 0) {
      return new Response(JSON.stringify({ found: false }));
    }

    let stMatch = route.find(s => 
      (s.name || s.stationName || "").toLowerCase().includes((stationName || "").toLowerCase())
    );

    if (!stMatch) {
      stMatch = route[0];
    }

    const lastStation = route[route.length - 1];

    return new Response(
      JSON.stringify({
        found: true,
        route: route,
        trainData: {
          train: trainNum,
          station: stMatch.name || stMatch.stationName || stationName,
          plannedTime: stMatch.plannedTime || stMatch.departureTimePlanned || stMatch.time || "--:--",
          time: stMatch.realTime || stMatch.plannedTime || stMatch.time || "--:--",
          delay: stMatch.delay !== undefined ? Number(stMatch.delay) : 0,
          platform: stMatch.platform || "-",
          track: stMatch.track || "-",
          destination: lastStation?.name || lastStation?.stationName || "",
          category: data.category || "TLK",
          trainOrderId: data.trainOrderId || data.id || null
        }
      }),
      { headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ found: false, error: e.message }));
  }
}
