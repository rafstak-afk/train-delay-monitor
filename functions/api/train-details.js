export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const train =
    url.searchParams.get("train") || "";

  if (!train) {
    return new Response(
      JSON.stringify(
        {
          error: "Brak parametru train"
        },
        null,
        2
      ),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  return new Response(
    JSON.stringify(
      {
        train,
        status: "TODO",
        lastConfirmedStation: null,
        lastConfirmedTime: null,
        route: []
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store"
      }
    }
  );
}
