const MONITORED_TRAINS = [
  { station: "Katowice", train: "3815" },
  { station: "Tarnowskie Góry", train: "40450" },
  { station: "Miasteczko Śląskie", train: "44226" },
  { station: "Tarnowskie Góry", train: "40250" },

  // objazdy do 31.07.2026
  { station: "Tarnowskie Góry", train: "40423" },
  { station: "Tarnowskie Góry", train: "40211" },
  { station: "Tarnowskie Góry", train: "40468" },

  { station: "Katowice", train: "38107" },
  { station: "Chorzów Uniwersytet", train: "40621" },

  { station: "Bytom Karb", train: "40658" },

  { station: "Katowice", train: "63102" }
];

export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;

  const response = await fetch(
    `${origin}/api/monitored-trains-v2`
  );

  const data = await response.json();

  const dashboard = data.trains.map(t => ({
    train: t.train,
    found: t.found,
    name: t.name || "",
    destination: t.destination || "",
    delay: t.delay ?? null,
    platform: t.platform || "",
    track: t.track || "",
    station: t.station,
    trainOrderId: t.trainOrderId
  }));

  return new Response(
    JSON.stringify(
      {
        generatedAt: data.generatedAt,
        trainCount: dashboard.length,
        foundCount: dashboard.filter(t => t.found).length,
        dashboard
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
