const BASE = 'https://pdp-api.plk-sa.pl/api/v1';

const CORS_JSON = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS_JSON });
}

function getApiKey(context) {
  return context.env.PLK_API_KEY || context.env.PDP_API_KEY || '';
}

function todayIso() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
}

async function plkFetch(path, key) {
  const res = await fetch(BASE + path, {
    headers: { 'X-API-Key': key, 'Accept': 'application/json, text/plain, */*' }
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_JSON });
  }

  const url = new URL(context.request.url);
  const trainNum = (url.searchParams.get('train') || '').trim();
  const stationName = (url.searchParams.get('station') || '').trim();
  const planTime = (url.searchParams.get('time') || '').trim();
  const date = url.searchParams.get('date') || todayIso();
  const key = getApiKey(context);

  if (!trainNum) {
    return json({ ok: false, error: 'Brak numeru pociągu (parametr train)' }, 400);
  }

  try {
    if (stationName) {
      const searchTime = planTime && planTime.includes(':') ? planTime : '00:00';
      const depPath = `/departures?station=${encodeURIComponent(stationName)}&date=${date}&time=${searchTime}&limit=300`;
      const depData = await plkFetch(depPath, key);

      if (depData) {
        const departures = Array.isArray(depData.departures) ? depData.departures : (Array.isArray(depData) ? depData : []);
        const match = departures.find(d => {
          const num = String(d.train || d.trainNumber || d.number || '').replace(/\D/g, '');
          const target = String(trainNum).replace(/\D/g, '');
          return num && target && num === target;
        });

        if (match && (match.scheduleId || match.scheduledId)) {
          return json({
            ok: true,
            source: 'level1-station-departures',
            train: trainNum,
            scheduleId: match.scheduleId || match.scheduledId,
            orderId: match.orderId || match.orderID || '',
            trainOrderId: match.trainOrderId || match.trainOrderID || '',
            station: stationName,
            date: date
          });
        }
      }
    }

    const schedulesPath = `/schedules?trainNumber=${encodeURIComponent(trainNum)}&dateFrom=${date}&dateTo=${date}&pageSize=50`;
    const schedData = await plkFetch(schedulesPath, key);

    if (schedData) {
      const items = Array.isArray(schedData.items) ? schedData.items : (Array.isArray(schedData) ? schedData : []);
      
      if (items.length > 0) {
        let bestCourse = items[0];
        
        if (planTime && items.length > 1) {
          const matchByTime = items.find(item => {
            const str = JSON.stringify(item);
            return str.includes(planTime);
          });
          if (matchByTime) bestCourse = matchByTime;
        }

        return json({
          ok: true,
          source: 'level2-global-schedule',
          train: trainNum,
          scheduleId: bestCourse.scheduleId || bestCourse.id || bestCourse.scheduledId,
          orderId: bestCourse.orderId || '',
          trainOrderId: bestCourse.trainOrderId || '',
          station: stationName,
          date: date
        });
      }
    }

    return json({
      ok: false,
      error: 'Nie znaleziono kursu dla pociągu ' + trainNum + ' w podanym dniu.'
    }, 444);

  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
}
