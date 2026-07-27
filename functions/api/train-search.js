export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const trainNum = url.searchParams.get("train");
  const stationName = url.searchParams.get("station");
  const origin = url.origin;

  if (!trainNum) {
    return new Response(JSON.stringify({ found: false }), { status: 400 });
  }

  try {
    // Odpytujemy bezpośrednio o trasę/bieg pociągu po jego numerze
    const response = await fetch(`${origin}/api/route?train=${encodeURIComponent(trainNum)}`);
    if (!response.ok) {
      return new Response(JSON.stringify({ found: false }));
    }

    const data = await response.json();
    const route = data.route || data.stations || [];

    if (route.length === 0) {
      return new Response(JSON.stringify({ found: false }));
    }

    // Szukamy wybranej stacji na trasie
    let stMatch = route.find(s => 
      (s.name || s.stationName || "").toLowerCase().includes((stationName || "").toLowerCase())
    );

    // Jeśli pociąg już minął stację lub jej nie dopasowano, bierzemy pierwszą/aktualną stację z trasy
    if (!stMatch) {
      stMatch = route[0];
    }

    return new Response(
      JSON.stringify({
        found: true,
        trainData: {
          train: trainNum,
          station: stMatch.name || stationName,
          plannedTime: stMatch.plannedTime || stMatch.departureTimePlanned || stMatch.time || "--:--",
          time: stMatch.realTime || stMatch.plannedTime || stMatch.time || "--:--",
          delay: stMatch.delay !== undefined ? Number(stMatch.delay) : 0,
          platform: stMatch.platform || "-",
          track: stMatch.track || "-",
          destination: route[route.length - 1]?.name || route[route.length - 1]?.stationName || "",
          category: data.category || "IC",
          trainOrderId: data.trainOrderId || data.id || null
        }
      }),
      { headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ found: false, error: e.message }));
  }
}
