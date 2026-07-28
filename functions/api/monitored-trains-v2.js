export async function onRequest(context) {
  const url = new URL(context.request.url);
  const baseUrl = url.origin;

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

  // Pomocnicza funkcja do wyciągania samych cyfr z numeru pociągu (np. "IC 3815/6" -> "3815")
  const getDigits = (val) => String(val || '').replace(/\D/g, '');

  try {
    const uniqueStations = [...new Set(monitored.map(m => m.station))];
    const todayStr = new Date().toISOString().split('T')[0];

    const stationDataMap = {};

    // Pobieranie odjazdów dla każdej unikalnej stacji
    await Promise.all(uniqueStations.map(async (st) => {
      try {
        const res = await fetch(`${baseUrl}/api/departures?station=${encodeURIComponent(st)}&date=${todayStr}`);
        if (res.ok) {
          const json = await res.json();
          stationDataMap[st] = json.departures || json.trains || json.data || (Array.isArray(json) ? json : []);
        } else {
          stationDataMap[st] = [];
        }
      } catch (e) {
        stationDataMap[st] = [];
      }
    }));

    const resultTrains = monitored.map(item => {
      const departures = stationDataMap[item.station] || [];
      const targetDigits = getDigits(item.train);

      // Elastyczne szukanie pociągu po cyfrach w numerze
      const match = departures.find(d => {
        const dNum = String(d.train || d.trainNumber || d.number || d.id || '');
        const dDigits = getDigits(dNum);
        return dDigits.includes(targetDigits) || targetDigits.includes(dDigits);
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
        category: match.category || match.type || match.line || '',
        name: match.name || match.trainName || '',
        carrier: match.carrier || match.operator || (item.train.length === 5 ? 'KŚ' : 'IC'),
        origin: match.origin || match.from || match.startStation || match.firstStation || 'Stacja początkowa',
        destination: match.destination || match.to || match.endStation || 'Stacja docelowa',
        plannedTime: match.plannedTime || match.scheduleTime || match.time || '--:--',
        actualTime: match.actualTime || match.time || match.plannedTime || '--:--',
        delay: Number(match.delay || 0),
        platform: match.platform || match.peron || '—',
        track: match.track || match.tor || '—',
        via: match.via || match.viaStations || '',
        lastConfirmedStation: match.lastStation || match.lastReportedStation || match.currentStation || match.origin || 'W trasie',
        lastConfirmedTime: match.lastReportedTime || match.lastStationTime || match.actualTime || ''
      };
    });

    return new Response(JSON.stringify({
      timestamp: new Date().toISOString(),
      trains: resultTrains
    }), {
      headers: { 
        "Content-Type": "application/json;charset=UTF-8", 
        "Access-Control-Allow-Origin": "*" 
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, trains: [] }), { status: 500 });
  }
}
