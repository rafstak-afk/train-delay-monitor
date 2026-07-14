export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    return new Response(
      JSON.stringify({
        ok: true,
        train: body.train || null,
        stationId: body.stationId || null,
        receivedAt: new Date().toISOString()
      }, null, 2),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err.message
      }, null, 2),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  }
}
