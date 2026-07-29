export async function onRequest(context) {
  const url = new URL(context.request.url);
  const trainParam = url.searchParams.get('train');

  // Baza monitorowanych pociągów z ich rzeczywistymi stacjami startowymi i trasami
  const trainDatabase = {
    "3815": { category: "IC", name: "MATEJKO", carrier: "IC", origin: "Katowice", destination: "Szczecin Główny", via: "Bytom, Gliwice, Kędzierzyn-Koźle, Opole Główny", stops: ["Katowice", "Zabrze", "Gliwice", "Kędzierzyn-Koźle", "Opole Główny", "Wrocław Główny", "Poznań Główny", "Szczecin Główny"] },
    "40360": { category: "OsP S9", name: "", carrier: "KŚ", origin: "Gliwice", destination: "Bytom", via: "Bytom Karb, Bytom Główny", stops: ["Gliwice", "Bytom Karb", "Bytom"] },
    "38107": { category: "TLK", name: "OSTERWA", carrier: "IC", origin: "Kraków Główny", destination: "Szczecin Główny", via: "Katowice, Chorzów Miasto, Bytom, Tarnowskie Góry", stops: ["Kraków Główny", "Katowice", "Chorzów Miasto", "Bytom", "Tarnowskie Góry", "Poznań Główny", "Szczecin Główny"] },
    "40621": { category: "Os S1", name: "", carrier: "KŚ", origin: "Częstochowa", destination: "Gliwice", via: "Katowice Załęże, Chorzów Batory, Świętochłowice", stops: ["Częstochowa", "Katowice", "Katowice Załęże", "Chorzów Batory", "Świętochłowice", "Ruda Śląska", "Gliwice"] },
    "63102": { category: "TLK", name: "SUDETY", carrier: "IC", origin: "Jelenia Góra", destination: "Kraków Główny", via: "Mysłowice, Jaworzno Szczakowa, Trzebinia", stops: ["Jelenia Góra", "Wałbrzych Główny", "Kłodzko Główny", "Nysa", "Prudnik", "Katowice", "Mysłowice", "Jaworzno Szczakowa", "Trzebinia", "Kraków Główny"] },
    "40450": { category: "Os S8", name: "", carrier: "KŚ", origin: "Tarnowskie Góry", destination: "Katowice", via: "Nakło Śląskie, Radzionków, Bytom", stops: ["Tarnowskie Góry", "Nakło Śląskie", "Radzionków", "Bytom", "Chorzów Batory", "Katowice"] },
    "44226": { category: "Os S8", name: "", carrier: "KŚ", origin: "Miasteczko Śląskie", destination: "Katowice", via: "Tarnowskie Góry, Bytom", stops: ["Miasteczko Śląskie", "Tarnowskie Góry", "Bytom", "Katowice"] },
    "40250": { category: "Os S8", name: "", carrier: "KŚ", origin: "Tarnowskie Góry", destination: "Katowice", via: "Bytom, Chorzów Batory", stops: ["Tarnowskie Góry", "Bytom", "Chorzów Batory", "Katowice"] },
    "40658": { category: "Os S1", name: "", carrier: "KŚ", origin: "Katowice", destination: "Gliwice", via: "Chorzów Batory, Świętochłowice, Ruda Śląska", stops: ["Katowice", "Chorzów Batory", "Świętochłowice", "Ruda Śląska", "Gliwice"] },
    "40423": { category: "Os S8", name: "", carrier: "KŚ", origin: "Tarnowskie Góry", destination: "Katowice", via: "Chorzów Batory, Katowice Załęże", stops: ["Tarnowskie Góry", "Bytom", "Chorzów Batory", "Katowice Załęże", "Katowice"] },
    "40211": { category: "Os S8", name: "", carrier: "KŚ", origin: "Lubliniec", destination: "Katowice", via: "Tarnowskie Góry, Chorzów Batory", stops: ["Lubliniec", "Tarnowskie Góry", "Bytom", "Chorzów Batory", "Katowice"] },
    "40468": { category: "Os S9", name: "", carrier: "KŚ", origin: "Katowice", destination: "Bytom", via: "Chorzów Uniwersytet, Chorzów Stary", stops: ["Katowice", "Chorzów Uniwersytet", "Chorzów Stary", "Bytom"] }
  };

  const monitoredList = [
    { station: 'Katowice', train: '3815', time: '14:49', planTime: '14:49', delay: 0, platform: '1', track: '9' },
    { station: 'Bytom Karb', train: '40360', time: '14:56', planTime: '14:56', delay: 0, platform: '2', track: '2' },
    { station: 'Katowice', train: '38107', time: '15:24', planTime: '15:24', delay: 0, platform: '1', track: '7' },
    { station: 'Katowice', train: '40621', time: '15:37', planTime: '15:37', delay: 0, platform: '1', track: '7' },
    { station: 'Katowice', train: '63102', time: '12:03', planTime: '11:44', delay: 19, platform: '1', track: '7', lastStation: 'Nysa', lastTime: '10:15' },
    { station: 'Tarnowskie Góry', train: '40450', time: '16:10', planTime: '16:10', delay: 0, platform: '1', track: '2' },
    { station: 'Miasteczko Śląskie', train: '44226', time: '16:25', planTime: '16:25', delay: 0, platform: '1', track: '1' },
    { station: 'Tarnowskie Góry', train: '40250', time: '17:02', planTime: '17:02', delay: 0, platform: '2', track: '1' },
    { station: 'Chorzów Batory', train: '40658', time: '17:15', planTime: '17:15', delay: 0, platform: '1', track: '2' },
    { station: 'Chorzów Batory', train: '40423', time: '17:40', planTime: '17:40', delay: 0, platform: '2', track: '1' },
    { station: 'Chorzów Batory', train: '40211', time: '18:05', planTime: '18:05', delay: 0, platform: '2', track: '1' },
    { station: 'Chorzów Uniwersytet', train: '40468', time: '18:30', planTime: '18:30', delay: 0, platform: '1', track: '1' }
  ];

  // Jeśli odpytujemy o konkretny pociąg (widok train.html)
  if (trainParam) {
    const info = trainDatabase[trainParam] || { category: "Pociąg", name: "", carrier: "PKP", origin: "Stacja początkowa", destination: "Stacja docelowa", stops: [] };
    const liveMatch = monitoredList.find(m => m.train === trainParam) || {};

    return new Response(JSON.stringify({
      train: trainParam,
      info: {
        category: info.category,
        name: info.name,
        carrier: info.carrier,
        origin: info.origin,
        destination: info.destination,
        delay: liveMatch.delay || 0,
        lastStation: liveMatch.lastStation || info.origin,
        lastTime: liveMatch.lastTime || liveMatch.planTime || '--:--'
      },
      stops: info.stops.map(st => ({
        name: st,
        plannedTime: '--:--',
        actualTime: '--:--',
        passed: st === (liveMatch.lastStation || info.origin),
        isCurrent: st === liveMatch.station
      }))
    }), { headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*" } });
  }

  // Widok zbiorczy całej tablicy
  const resultTrains = monitoredList.map(item => {
    const meta = trainDatabase[item.train] || {};
    return {
      queryStation: item.station,
      train: item.train,
      found: true,
      category: meta.category || 'Pociąg',
      name: meta.name || '',
      carrier: meta.carrier || 'KŚ',
      origin: meta.origin || 'Stacja początkowa',
      destination: meta.destination || 'Stacja docelowa',
      plannedTime: item.planTime,
      actualTime: item.time,
      delay: item.delay,
      platform: item.platform,
      track: item.track,
      via: meta.via || '',
      lastConfirmedStation: item.lastStation || meta.origin || item.station,
      lastConfirmedTime: item.lastTime || item.planTime
    };
  });

  return new Response(JSON.stringify({ trains: resultTrains }), {
    headers: { "Content-Type": "application/json;charset=UTF-8", "Access-Control-Allow-Origin": "*" }
  });
}
