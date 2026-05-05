export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const trainNumber = url.searchParams.get("trainNumber") || "3812";
  const date = url.searchParams.get("date") || "2026-05-05";

  const endpoint = `TU_WSTAW_ENDPOINT_PLK?trainNumber=${encodeURIComponent(trainNumber)}&date=${encodeURIComponent(date)}`;

  const resp = await fetch(endpoint, {
    headers: {
      "X-API-Key": context.env.PLK_API_KEY
    }
  });

  return new Response(await resp.text(), {
    status: resp.status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
