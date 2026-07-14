export async function onRequestPost(context) {

  return new Response(
    JSON.stringify({
      ok: true
    }),
    {
      headers: {
        "Content-Type":
          "application/json"
      }
    }
  );

}
