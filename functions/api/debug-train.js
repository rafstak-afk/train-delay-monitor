const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";

export async function onRequestGet(context) {
  const { request, env } = context;

  const url = new URL(request.url);

  const date = url.searchParams.get("date");
  const scheduleId = url.searchParams.get("scheduleId");
  const orderId = url.searchParams.get("orderId");
  const trainOrderId = url.searchParams.get("trainOrderId");

  const headers = {
    "X-API-Key": env.PLK_API_KEY,
    "Accept": "application/json"
  };

  try {
    const schedulesUrl =
      `${PLK_BASE}/schedules?dateFrom=${date}&dateTo=${date}`;

    const operationsUrl =
      `${PLK_BASE}/operations?withPlanned=true&pageSize=10000`;

    const [schedulesRaw, operationsRaw] = await Promise.all([
      fetch(schedulesUrl, { headers }).then(r => r.json()),
      fetch(operationsUrl, { headers }).then(r => r.json())
    ]);

    const routes = schedulesRaw.routes || [];
    const trains = operationsRaw.trains || [];

    const route = routes.find(r =>
      String(r.scheduleId) === String(scheduleId) &&
      String(r.orderId) === String(orderId) &&
      String(r.trainOrderId) === String(trainOrderId)
    );

    const operation = trains.find(t =>
      String(t.scheduleId) === String(scheduleId) &&
      String(t.orderId) === String(orderId) &&
      String(t.trainOrderId) === String(trainOrderId)
    );

    return new Response(JSON.stringify({
      foundRoute: !!route,
      foundOperation: !!operation,

      routeStationsCount: route?.stations?.length || 0,
      operationStationsCount: operation?.stations?.length || 0,

      routeStations: route?.stations || [],
      operationStations: operation?.stations || [],

      route,
      operation
    }, null, 2), {
      headers: {
        "Content-Type": "application/json"
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }, null, 2), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
}
