export async function onRequest(context) {
  try {
    const monitoredTrains = [
      {
        train: "3815",
        category: "IC",
        name: "MATEJKO",
        station: "Gliwice",
        destination: "Szczecin Główny",
        time: "15:13",
        plannedTime: "15:13",
        delay: 0,
        found: true,
        platform: "2",
        track: "3",
        via: "Opole Główny, Wrocław Główny, Zielona Góra"
      },
      {
        train: "3814",
        category: "IC",
        name: "MATEJKO",
        station: "Rzeszów Główny",
        destination: "Przemyśl Główny",
        time: "12:15",
        plannedTime: "12:15",
        delay: 0,
        found: true,
        platform: "2",
        track: "2",
        via: "Łańcut, Przeworsk, Jarosław"
      },
      {
        train: "61100",
        category: "IC",
        name: "ORZESZKOWA",
        station: "Wrocław Główny",
        destination: "Białystok",
        time: "16:20",
        plannedTime: "16:10",
        delay: 10,
        found: true,
        platform: "1",
        track: "4",
        via: "Ostrów Wielkopolski, Łódź Widzew, Warszawa Ctr."
      },
      {
        train: "4100",
        category: "EIP",
        name: "PENDOLINO",
        station: "Katowice",
        destination: "Warszawa Wschodnia",
        time: "17:05",
        plannedTime: "17:05",
        delay: 0,
        found: true,
        platform: "3",
        track: "1",
        via: "Sosnowiec Główny, Centralny Magistrala Kolejowa"
      },
      {
        train: "35100",
        category: "TLK",
        name: "STASZIC",
        station: "Kraków Główny",
        destination: "Lublin Główny",
        time: "18:30",
        plannedTime: "18:00",
        delay: 30,
        found: true,
        platform: "4",
        track: "2",
        via: "Kielce, Radom Główny"
      }
    ];

    return new Response(JSON.stringify({
      foundCount: monitoredTrains.length,
      trainCount: monitoredTrains.length,
      trains: monitoredTrains
    }), {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
