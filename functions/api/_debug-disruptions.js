const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const apiKey = env.PLK_API_KEY || env.PDP_API_KEY || "";
  if (!apiKey) return new Response(JSON.stringify({ error: "no key" }), { status: 500 });

  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || dateFrom;
  const stations = url.searchParams.get("stations") || "";

  const qp = new URLSearchParams();
  if (dateFrom) qp.set("dateFrom", dateFrom);
  if (dateTo) qp.set("dateTo", dateTo);
  if (stations) qp.set("stations", stations);

  const res = await fetch(`${PLK_BASE}/disruptions?${qp.toString()}`, {
    headers: { "X-API-Key": apiKey, "Accept": "application/json" }
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
