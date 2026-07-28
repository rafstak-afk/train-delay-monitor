export async function onRequest(context) {
  try {
    const monitoredTrains = [
      {
        train: "3815",
        category: "IC",
        name: "MATEJKO",
        station: "Katowice",
        destination: "Szczecin Główny",
        time: "14:49",
        plannedTime: "14:49",
        delay: 0,
        platform: "1",
        track: "9",
        carrier: "IC",
        via: "Bytom, Gliwice, Kędzierzyn-Koźle, Opole Główny"
      },
      {
        train: "40360",
        category: "OsP S9",
        name: "",
        station: "Bytom Karb",
        destination: "Bytom",
        time: "14:56",
        plannedTime: "14:56",
        delay: 0,
        platform: "2",
        track: "2",
        carrier: "KŚ",
        via: "Bytom Główny"
      },
      {
        train: "38107",
        category: "TLK",
        name: "OSTERWA",
        station: "Katowice",
        destination: "Szczecin Główny",
        time: "15:24",
        plannedTime: "15:24",
        delay: 0,
        platform: "1",
        track: "7",
        carrier: "IC",
        via: "Chorzów Miasto, Bytom, Tarnowskie Góry"
      },
      {
        train: "40621",
        category: "Os S1",
        name: "",
        station: "Katowice",
        destination: "Gliwice",
        time: "15:37",
        plannedTime: "15:37",
        delay: 0,
        platform: "1",
        track: "7",
        carrier: "KŚ",
        via: "Katowice Załęże, Chorzów Batory, Świętochłowice"
      },
      {
        train: "63102",
        category: "TLK",
        name: "SUDETY",
        station: "Katowice",
        destination: "Kraków Główny",
        time: "12:03",
        plannedTime: "12:03",
        delay: 19,
        platform: "1",
        track: "7",
        carrier: "IC",
        via: "Mysłowice, Jaworzno Szczakowa, Trzebinia"
      },
      { train: "40450", category: "KŚ", name: "", station: "Tarnowskie Góry", destination: "Katowice", time: "16:10", plannedTime: "16:10", delay: 0, platform: "1", track: "2", carrier: "KŚ", via: "Nakło Śląskie, Radzionków" },
      { train: "44226", category: "KŚ", name: "", station: "Miasteczko Śląskie", destination: "Tarnowskie Góry", time: "16:25", plannedTime: "16:25", delay: 0, platform: "1", track: "1", carrier: "KŚ", via: "Tarnowskie Góry" },
      { train: "40250", category: "KŚ", name: "", station: "Tarnowskie Góry", destination: "Katowice", time: "17:02", plannedTime: "17:02", delay: 0, platform: "2", track: "1", carrier: "KŚ", via: "Bytom, Chorzów Batory" },
      { train: "40658", category: "KŚ", name: "", station: "Chorzów Batory", destination: "Gliwice", time: "17:15", plannedTime: "17:15", delay: 0, platform: "1", track: "2", carrier: "KŚ", via: "Świętochłowice, Ruda Śląska" },
      { train: "40423", category: "KŚ", name: "", station: "Chorzów Batory", destination: "Katowice", time: "17:40", plannedTime: "17:40", delay: 0, platform: "2", track: "1", carrier: "KŚ", via: "Katowice Załęże" },
      { train: "40211", category: "KŚ", name: "", station: "Chorzów Batory", destination: "Katowice", time: "18:05", plannedTime: "18:05", delay: 0, platform: "2", track: "1", carrier: "KŚ", via: "Katowice Załęże" },
      { train: "40468", category: "KŚ", name: "", station: "Chorzów Uniwersytet", destination: "Bytom", time: "18:30", plannedTime: "18:30", delay: 0, platform: "1", track: "1", carrier: "KŚ", via: "Chorzów Stary" }
    ];

    return new Response(JSON.stringify({
      foundCount: monitoredTrains.length,
      trains: monitoredTrains
    }), {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
