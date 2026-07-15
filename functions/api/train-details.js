export async function onRequestGet(context) {
  const train =
    new URL(context.request.url)
      .searchParams.get("train") || "";

  return new Response(
    JSON.stringify(
      {
        train,
        status: "W ruchu",
        message: "train-details działa"
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type":
          "application/json; charset=utf-8"
      }
    }
  );
}
