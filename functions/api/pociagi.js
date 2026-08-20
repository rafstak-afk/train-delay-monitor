export async function onRequest(context) {
  const apiKey = context.env.PDP_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Brak skonfigurowanego klucza PDP_API_KEY w panelu Cloudflare." }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  try {
    const apiResponse = await fetch("https://api.rozklad-pkp.pl/v1/delays", {
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json"
      }
    });

    const data = await apiResponse.json();

    return new Response(JSON.stringify(data), {
      status: apiResponse.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Błąd połączenia z API", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
