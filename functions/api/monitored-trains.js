export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;

  const url =
    `${origin}/api/departures?station=` +
    encodeURIComponent("Katowice") +
    "&limit=100";

  const r = await fetch(url);
  const data = await r.json();

  return new Response(
    JSON.stringify(data, null, 2),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );
}
