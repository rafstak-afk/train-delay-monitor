export async function onRequest(context) {
  const url = new URL(context.request.url);
  const baseUrl = url.origin;

  // Lista obserwowanych pociągów i odpytywanych stacji
  const monitored = [
    { station: 'Katowice', train: '3815' },
    { station: 'Bytom Karb', train: '40360' },
    { station: 'Katowice', train: '38107' },
    { station: 'Katowice', train: '40621' },
    { station: 'Katowice', train: '63102' },
    { station: 'Tarnowskie Góry', train: '40450' },
    { station: 'Miasteczko Śląskie', train: '44226' },
    { station: 'Tarnowskie Góry', train: '40250' },
    { station: 'Chorzów Batory', train: '40658' },
    { station: 'Chorzów Batory', train: '40423' },
    { station: 'Chorzów Batory', train: '40211' },
    { station: 'Chorzów Uniwersytet', train: '40468' }
  ];

  try {
    const uniqueStations = [...new Set(monitored.map(m => m.station))];
    const todayStr = new Date().toISOString().split('T')[0];

    // Pobieranie żywych danych ze stacji
    const stationDataMap = {};
    await Promise.all(uniqueStations.map(async (st) => {
      try {
        const res = await fetch(`${baseUrl}/api/departures?station=${encodeURIComponent(st)}&date=${todayStr}&limit=100`);
        if (res.ok) {
          const json = await res.json();
          stationDataMap[st] = json.departures || [];
        } else {
          stationDataMap[st] = [];
        }
      } catch (e) {
        stationDataMap[st] = [];
      }
    }));

    // Dopasowanie żywych pociągów
    const resultTrains = monitored.map(item => {
      const departures = stationDataMap[item.station] || [];
      const match = departures.find(d => {
        const num = String(d.train || d.trainNumber || d.number || d.trainNo || '').trim();
        return num === item.train;
      });

      if (!match) {
        return {
          queryStation: item.station,
          train: item.train,
          found: false
        };
      }

      return {
        queryStation: item.station,
        train: item.train,
        found: true,
        category: match.category || match.type || 'Pociąg',
        name: match.name || match.trainName || '',
        carrier: match.carrier || match.operator || 'PKP',
        origin: match.origin || match.from || match.startStation || 'Stacja początkowa',
        destination: match.destination || match.to || 'Stacja docelowa',
        plannedTime: match.plannedTime || match.scheduleTime || '--:--',
        actualTime: match.time || match.actualTime || match.plannedTime || '--:--',
        delay: Number(match.delay || 0),
        platform: match.platform || '—',
        track: match.track || '—',
        via: match.via || '',
        // Ostatnia potwierdzona stacja i czas minięcia z API PLK
        lastConfirmedStation: match.lastStation || match.lastReportedStation || match.currentStation || 'W trasie',
        lastConfirmedTime: match.lastReportedTime || match.lastStationTime || match.time || ''
      };
    });

    return new Response(JSON.stringify({
      timestamp: new Date().toISOString(),
      trains: resultTrains
    }), {
      headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
