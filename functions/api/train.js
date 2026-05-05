export async function onRequestGet(context) {
  return new Response(JSON.stringify({
    ok: true,
    hasKey: !!context.env.PLK_API_KEY
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
