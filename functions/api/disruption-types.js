// Słownik typów utrudnień PLK (kod utr_NN → polski tekst). PLK nie ma na
// niego osobnego endpointu — przychodzi w polu `disruptionTypes` odpowiedzi
// /disruptions, więc pytamy o dzisiejsze utrudnienia jednej stacji (Tarnowskie
// Góry, id 71001) i bierzemy z niej sam słownik. Cache na dobę: push-tick
// porównuje go raz w miesiącu z listą znaną w i18n/*.json (nowe typy = brak
// tłumaczenia), więc to jedno zapytanie do PLK na miesiąc.

const PLK_BASE = "https://pdp-api.plk-sa.pl/api/v1";
const PROBE_STATION_ID = 71001;
const CACHE_TTL = 86400;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function warsawDate() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
}

export async function onRequestGet(context) {
  const apiKey = context.env.PLK_API_KEY || context.env.PDP_API_KEY || "";
  if (!apiKey) return json({ ok: false, error: "Brak klucza PLK" }, 500);
  const date = warsawDate();
  try {
    const res = await fetch(`${PLK_BASE}/disruptions?dateFrom=${date}&dateTo=${date}&stations=${PROBE_STATION_ID}`, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      cf: { cacheTtlByStatus: { "200-299": CACHE_TTL, "300-599": -1 }, cacheEverything: true }
    });
    if (!res.ok) return json({ ok: false, error: `PLK HTTP ${res.status}` }, 502);
    const data = await res.json();
    const types = data && typeof data.disruptionTypes === "object" && data.disruptionTypes ? data.disruptionTypes : {};
    return json({ ok: true, date, count: Object.keys(types).length, types });
  } catch (e) {
    return json({ ok: false, error: e.message }, 502);
  }
}
