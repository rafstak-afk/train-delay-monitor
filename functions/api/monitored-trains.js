export async function onRequestGet() {
  return new Response(
    JSON.stringify(
      {
        ok: true,
        message: "monitored-trains endpoint działa",
        monitored: [
          { station: "Katowice", train: "3815" },
          { station: "Tarnowskie Góry", train: "40450" },
          { station: "Miasteczko Śląskie", train: "44226" },
          { station: "Tarnowskie Góry", train: "40250" },
          { station: "Chorzów Batory", train: "40658" },
          { station: "Chorzów Batory", train: "40423" },
          { station: "Katowice", train: "38107" },
          { station: "Katowice", train: "40621" },
          { station: "Chorzów Batory", train: "40211" },
          { station: "Chorzów Uniwersytet", train: "40468" },
          { station: "Katowice", train: "63102" }
        ]
      },
      null,
      2
    ),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );
}