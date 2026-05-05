export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Use POST' }, 405);
    }

    try {
      const body = await request.json();
      const trainNumber = clean(body.trainNumber);
      const trainDate = clean(body.trainDate);
      const stationName = clean(body.stationName);

      const targetUrl = env.PLK_API_URL;
      if (!targetUrl) {
        return json({ error: 'Missing PLK_API_URL' }, 500);
      }

      const extraBody = parseJson(env.PLK_EXTRA_BODY, {});
      const authType = (env.PLK_AUTH_TYPE || 'bearer').toLowerCase();

      const headers = {
        'Content-Type': 'application/json'
      };

      if (env.PLK_API_KEY) {
        if (authType === 'bearer') {
          headers['Authorization'] = `Bearer ${env.PLK_API_KEY}`;
        } else if (authType === 'x-api-key') {
          headers['X-API-Key'] = env.PLK_API_KEY;
        } else if (authType === 'custom-header' && env.PLK_CUSTOM_HEADER) {
          headers[env.PLK_CUSTOM_HEADER] = env.PLK_API_KEY;
        }
      }

      if (stationName) {
        const upstreamBody = {
          stationName,
          ...extraBody,
          ...body
        };

        const upstream = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(upstreamBody)
        });

        const rawText = await upstream.text();
        let parsed;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          return json({
            mode: 'station',
            stationQuery: stationName,
            error: 'PLK response is not valid JSON',
            raw: rawText
          }, upstream.status || 502);
        }

        const interpreted = interpretStationResponse(stationName, parsed);

        return new Response(JSON.stringify(interpreted, null, 2), {
          status: upstream.ok ? 200 : upstream.status,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...corsHeaders()
          }
        });
      }

      if (!trainNumber) {
        return json({ error: 'Missing trainNumber or stationName' }, 400);
      }

      const upstreamBody = {
        trainNumber,
        trainDate,
        ...extraBody,
        ...body
      };

      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(upstreamBody)
      });

      const text = await upstream.text();

      return new Response(text, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
          ...corsHeaders()
        }
      });
    } catch (error) {
      return json({ error: error.message || 'Worker error' }, 500);
    }
  }
};

function interpretStationResponse(stationName, payload) {
  const candidates = extractCandidates(payload);

  if (!candidates.length) {
    return {
      mode: 'station',
      stationQuery: stationName,
      stationFound: false,
      matchedStation: null,
      candidates: [],
      departures: [],
      message: 'Nie znaleziono danych dla podanej stacji.'
    };
  }

  const ranked = candidates
    .map(item => ({
      original: item,
      score: scoreStationMatch(stationName, item.name || item.station || item.stationName || '')
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.original || null;
  const departures = normalizeDepartures(best).slice(0, 10);

  return {
    mode: 'station',
    stationQuery: stationName,
    stationFound: !!best,
    matchedStation: best ? (best.name || best.station || best.stationName || stationName) : null,
    candidates: ranked.slice(0, 5).map(x => ({
      name: x.original.name || x.original.station || x.original.stationName || null,
      score: x.score
    })),
    departures,
    rawPreview: best || payload
  };
}

function extractCandidates(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.stations)) return payload.stations;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return payload ? [payload] : [];
}

function normalizeDepartures(candidate) {
  const list =
    candidate?.departures ||
    candidate?.trains ||
    candidate?.rows ||
    candidate?.items ||
    candidate?.schedule ||
    [];

  if (!Array.isArray(list)) return [];

  return list.map(row => ({
    trainNumber: row.trainNumber || row.number || row.train || row.id || null,
    carrier: row.carrier || row.operator || null,
    direction: row.direction || row.to || row.destination || null,
    plannedTime: row.plannedTime || row.plan || row.scheduledTime || row.departureTime || null,
    actualTime: row.actualTime || row.real || row.estimatedTime || null,
    delayMinutes: normalizeDelay(row.delayMinutes ?? row.delay ?? row.minutesLate),
    status: row.status || null
  }));
}

function normalizeDelay(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : value;
}

function scoreStationMatch(query, candidate) {
  const q = normalizeText(query);
  const c = normalizeText(candidate);

  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.startsWith(q)) return 80;
  if (c.includes(q)) return 60;

  const qWords = q.split(' ');
  const cWords = c.split(' ');
  let score = 0;

  for (const word of qWords) {
    if (cWords.includes(word)) score += 15;
    else if (c.includes(word)) score += 8;
  }

  return score;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders()
    }
  });
}
