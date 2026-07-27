export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const trainOrderId = url.searchParams.get("trainOrderId");
  const trainNum = url.searchParams.get("train");
  const origin = url.origin;

  if (!trainOrderId) {
    return new Response(
      JSON.stringify({ error: "Brak parametru trainOrderId", route: [] }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Zapytanie do wewnętrznego proxy/API PLK o pełny rozkład jazdy pociągu
    const response = await fetch(
      `${origin}/api/route?trainOrderId=${encodeURIComponent(trainOrderId)}`
    );

    if (!response.ok) {
      throw new Error(`PLK API HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Normalizacja struktury stacji z PLK
    const rawRoute = data.route || data.stations || data.stops || [];

    const route = rawRoute.map(st => ({
      name: st.stationName || st.name || st.station || "",
      plannedTime: st.plannedTime || st.departureTimePlanned || st.arrivalTimePlanned || st.time || "--:--",
      realTime: st.realTime || st.departureTimeReal || st.arrivalTimeReal || "",
      delay: st.delay !== undefined ? Number(st.delay) : 0,
      platform: st.platform || st.peron || "-",
      track: st.track || st.tor || "-"
    }));

    return new Response(
      JSON.stringify({ train: trainNum, trainOrderId, route }),
      { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, route: [] }),
      { headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
