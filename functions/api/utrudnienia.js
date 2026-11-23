// Utrudnienia PLK dla wybranych stacji (TODO 90 — archiwum komunikatów, TODO 89/91 — skrót dojazdu).
// GET /api/utrudnienia?stations=Lubliniec,Tarnowskie Góry&date=RRRR-MM-DD
// Jedno zapytanie do PLK /disruptions (pamięć podręczna 4 min) + słownik stacji (doba, wspólny z train-details).
// Zwraca komunikaty z rozwiązanym tekstem i listą kursów (orderId) z nazwami stacji, których dotyczą.
const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";
const DISRUPTIONS_TTL = 240;
const DICT_TTL = 86400;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*" } });
}
const warsawDate = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
const norm = s => String(s || "").trim().toLowerCase();

async function plkGet(path, apiKey, ttl) {
  const res = await fetch(PLK_BASE + path, {
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
    cf: { cacheTtlByStatus: { "200-299": ttl, "300-599": -1 }, cacheEverything: true }
  });
  if (!res.ok) throw new Error("PLK HTTP " + res.status);
  return res.json();
}
// Ten sam klucz pamięci co w train-details.js — słownik pobierany raz na dobę dla obu.
async function stationDict(apiKey) {
  const url = `${PLK_BASE}/dictionaries/stations?pageSize=20000`;
  const cache = caches.default, key = new Request("https://cache.local/" + btoa(url), { method: "GET" });
  let data;
  const hit = await cache.match(key);
  if (hit) data = await hit.json();
  else {
    data = await plkGet("/dictionaries/stations?pageSize=20000", apiKey, DICT_TTL);
    await cache.put(key, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=" + DICT_TTL } }));
  }
  const list = Array.isArray(data) ? data : (data?.stations || data?.items || data?.results || data?.data || []);
  const byId = new Map(), byName = new Map();
  for (const it of list) {
    const id = it.id || it.stationId || it.stopPointId, name = it.name || it.stationName || it.stopPointName;
    if (id && name) { byId.set(String(id), name); if (!byName.has(norm(name))) byName.set(norm(name), String(id)); }
  }
  return { byId, byName };
}
const scalars = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v == null || typeof v !== "object"));

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const apiKey = env.PLK_API_KEY || env.PDP_API_KEY || "";
  if (!apiKey) return json({ ok: false, error: "Brak klucza PLK" }, 500);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") || "") ? url.searchParams.get("date") : warsawDate();
  const names = (url.searchParams.get("stations") || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 30);
  if (!names.length) return json({ ok: false, error: "Brak parametru stations" }, 400);
  try {
    const dict = await stationDict(apiKey);
    const ids = [], unknown = [];
    for (const n of names) { const id = /^\d+$/.test(n) ? n : dict.byName.get(norm(n)); if (id) ids.push(id); else unknown.push(n); }
    if (!ids.length) return json({ ok: false, error: "Nie znam stacji", unknown }, 404);
    const raw = await plkGet(`/disruptions?dateFrom=${date}&dateTo=${date}&stations=${ids.join(",")}`, apiKey, DISRUPTIONS_TTL);
    const types = raw?.disruptionTypes || {};
    const isCode = v => /^utr_\d+$/.test(String(v || ""));
    const out = [];
    for (const d of raw?.disruptions || []) {
      const code = isCode(d.message) ? d.message : d.disruptionTypeCode || "";
      const message = d.message && !isCode(d.message) ? d.message : (code && types[code]) || d.message || "";
      const trains = new Map();
      for (const ar of d.affectedRoutes || []) {
        if (ar.operatingDate && String(ar.operatingDate).slice(0, 10) !== date) continue;
        const k = String(ar.orderId || "");
        const t = trains.get(k) || Object.assign(scalars(ar), { stations: [] });
        delete t.stationId;
        const st = dict.byId.get(String(ar.stationId)) || (ar.stationId ? "stacja " + ar.stationId : "");
        if (st && !t.stations.includes(st)) t.stations.push(st);
        trains.set(k, t);
      }
      if (!trains.size) continue;
      out.push(Object.assign(scalars(d), { code, message, trains: [...trains.values()] }));
    }
    // ?withTrains=1 — numer, kategoria i relacja kursu (trasa z PLK, pamięć 6 h). Najwyżej 40 kursów na wywołanie
    // (limit ok. 50 podzapytań Cloudflare); &known=orderId,orderId… — te pomijamy (wywołujący zna je z poprzednich razy).
    if (url.searchParams.get("withTrains") === "1") {
      const known = new Set((url.searchParams.get("known") || "").split(",").filter(Boolean));
      const keys = new Map();
      for (const d of out) for (const t of d.trains) if (t.scheduleId && t.orderId && !known.has(String(t.orderId))) keys.set(t.scheduleId + "/" + t.orderId, null);
      const list = [...keys.keys()].slice(0, 40);
      let i = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (i < list.length) {
          const k = list[i++];
          try {
            const r = await plkGet("/schedules/route/" + k, apiKey, 21600);
            const route = r?.route || r || {};
            const st = Array.isArray(route.stations) ? route.stations : [];
            const nm = s => s && (dict.byId.get(String(s.stationId)) || s.stationName || "");
            keys.set(k, { train: String(route.nationalNumber || route.trainNumber || ""), category: route.commercialCategorySymbol || "", name: route.name || "", carrier: route.carrierCode || "", from: nm(st[0]), to: nm(st[st.length - 1]), dep: st[0] ? String(st[0].departureTime || "").slice(0, 5) : "" });
          } catch (e) { keys.set(k, null); }
        }
      }));
      for (const d of out) for (const t of d.trains) { const m = keys.get(t.scheduleId + "/" + t.orderId); if (m) Object.assign(t, m); }
    }
    return json({ ok: true, date, at: new Date().toISOString(), stations: names, unknown, disruptions: out });
  } catch (e) {
    return json({ ok: false, error: e.message }, 502);
  }
}
