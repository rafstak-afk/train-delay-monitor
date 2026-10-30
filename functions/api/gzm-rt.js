// /api/gzm-rt — pośrednik do danych na żywo ZTM GZM (GTFS-Realtime, CC BY).
// Przeglądarka nie pobierze ich sama (CORS, port 5443), więc robimy to tu:
// pobieramy cały feed, trzymamy go 20 s w pamięci podręcznej Cloudflare
// (żeby wielu użytkowników nie obciążało serwera GZM) i oddajemy odchudzony
// JSON: dla każdego kursu numer przystanku w kursie (stop_sequence), do
// którego odnosi się opóźnienie, opóźnienie w sekundach i pozycję pojazdu.
//   GET /api/gzm-rt            → { ok, ts, age, trips: { tripId: [seq, delayS, lat, lon, posTs] } }
//   GET /api/gzm-rt?diag=1     → diagnostyka połączenia (status, bajty, czas)
import GzmRtCoreMod from "../../gzm-rt-core.js";
const GzmRtCore = (GzmRtCoreMod && GzmRtCoreMod.decodeFeed) ? GzmRtCoreMod : globalThis.GzmRtCore;

const FEED_URL = "https://gtfsrt.transportgzm.pl:5443/gtfsrt/gzm/all";
const CACHE_S = 20;
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };

function json(data, status, maxAge) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: Object.assign({ "Cache-Control": "public, max-age=" + (maxAge || 0) }, HEADERS) });
}

async function fetchFeed() {
  const started = Date.now();
  const res = await fetch(FEED_URL, { headers: { Accept: "application/x-protobuf" }, cf: { cacheTtl: CACHE_S, cacheEverything: true } });
  const buf = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, bytes: buf.length, ms: Date.now() - started, buf };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get("diag") === "1") {
    try {
      const r = await fetchFeed();
      let entities = null, ts = null;
      try { const f = GzmRtCore.decodeFeed(r.buf); entities = f.entities.length; ts = f.timestamp; } catch (e) { entities = "błąd dekodowania: " + e.message; }
      return json({ ok: r.status === 200, http: r.status, bytes: r.bytes, ms: r.ms, entities, feedTs: ts, age: ts ? Math.round(Date.now() / 1000 - ts) : null });
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e) }, 502);
    }
  }

  // Odpowiedź gotowa (JSON) w pamięci podręcznej krawędzi — 20 s.
  const cache = caches.default;
  const key = new Request(url.origin + "/api/gzm-rt?v=1");
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const r = await fetchFeed();
    if (r.status !== 200) return json({ ok: false, error: "feed HTTP " + r.status }, 502);
    const feed = GzmRtCore.decodeFeed(r.buf);
    const trips = {};
    for (const e of feed.entities) {
      if (e.tripUpdate && e.tripUpdate.trip && e.tripUpdate.trip.tripId) {
        const u = e.tripUpdate, s = u.stu[0] || {}, ev = s.arr || s.dep || {};
        const t = trips[u.trip.tripId] || (trips[u.trip.tripId] = [null, null, null, null, null]);
        t[0] = s.seq != null ? s.seq : null;
        t[1] = ev.delay != null ? ev.delay : (u.delay != null ? u.delay : null);
        if (u.trip.rel === 3) t[1] = "X";              // odwołany (dziś GZM tego nie podaje, ale obsłużone)
      }
      if (e.vehicle && e.vehicle.trip && e.vehicle.trip.tripId) {
        const v = e.vehicle;
        const t = trips[v.trip.tripId] || (trips[v.trip.tripId] = [null, null, null, null, null]);
        t[2] = v.lat != null ? Math.round(v.lat * 1e5) / 1e5 : null;
        t[3] = v.lon != null ? Math.round(v.lon * 1e5) / 1e5 : null;
        t[4] = v.timestamp || null;
      }
    }
    const out = json({ ok: true, ts: feed.timestamp, age: feed.timestamp ? Math.round(Date.now() / 1000 - feed.timestamp) : null, trips }, 200, CACHE_S);
    context.waitUntil(cache.put(key, out.clone()));
    return out;
  } catch (e) {
    return json({ ok: false, error: String(e && e.message || e) }, 502);
  }
}
