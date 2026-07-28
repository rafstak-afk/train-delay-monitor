export async function onRequest(context) {
  try {
    // Tutaj backend pobiera dane o monitorowanych pociągach
    // Możesz zamienić tę listę na własne połączenie z API PLK lub bazą
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
        found: true,
        platform: "1",
        track: "9",
        via: "Bytom, Gliwice, Kędzierzyn-Koźle, Opole Główne, Wrocław Główny"
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
