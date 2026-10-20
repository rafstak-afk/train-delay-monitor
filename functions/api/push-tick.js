// Cykliczne sprawdzanie opóźnień/odwołań dla każdego profilu — dwa niezależne
// źródła: pociągi z "Moich pociągów" (profile.trains, gdy profile.alarmEnabled)
// i osobno "obserwowane stacje" (profile.watchedStations, z index.html) —
// i wysyłka prawdziwego Web Push (dociera NAWET gdy aplikacja/karta jest
// zamknięta — w odróżnieniu od lokalnego alarmu w index.html/moje-pociagi,
// który wymaga otwartej karty).
//
// Cloudflare Pages nie ma natywnych Cron Triggers (to funkcja samych
// Workerów) — ten endpoint jest więc odpytywany z zewnątrz, cyklicznie,
// przez zaplanowany workflow GitHub Actions (.github/workflows/push-tick.yml),
// chroniony współdzielonym sekretem w nagłówku Authorization.
//
// Dane o kursach pochodzą z TYCH SAMYCH endpointów co klient
// (moje-pociagi/index.html: smart-lookup + train-details) — żadnej
// osobnej logiki dopasowania pociągu do kursu PLK.

import { buildPushHTTPRequest } from "../_pushforge/main.js";

const TOKEN_RE = /^[A-Z0-9]{16}$/;
const ADMIN_CONTACT = "mailto:rafstak@gmail.com";
const PROFILE_TTL_SECONDS = 60 * 60 * 24 * 180;
const MAX_WATCHED_STATIONS = 5;

// Worker działa w UTC — bez tego "teraz" wypadałoby o 1-2h obok polskiego
// czasu ściennego (CET/CEST), co przy stacjach (inaczej niż przy pociągach
// z "Moich pociągów", gdzie czas bierzemy z zapisanego planTime) przesuwałoby
// całe okno "nadchodzące odjazdy" na tablicy stacyjnej.
function warsawNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function isCancelledStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  return s === "X" || s.includes("ODWO") || s.includes("CANCEL");
}

async function fetchJson(origin, path) {
  try {
    const res = await fetch(origin + path, { headers: { Accept: "application/json" }, cf: { cacheTtl: 0 } });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Dokładnie te same dwa kroki co fetchTrainByNumber w moje-pociagi/index.html
// (bez warstwy cache w localStorage — ta ma sens tylko po stronie klienta).
async function checkTrain(origin, item) {
  const lookup = await fetchJson(
    origin,
    `/api/v2/smart-lookup?train=${encodeURIComponent(item.trainNum)}&station=${encodeURIComponent(item.station)}${item.planTime ? `&time=${encodeURIComponent(item.planTime)}` : ""}`
  );
  if (!lookup || !lookup.ok || !lookup.scheduleId || !lookup.orderId) return null;

  const params = new URLSearchParams({
    train: item.trainNum,
    station: item.station,
    scheduleId: String(lookup.scheduleId),
    orderId: String(lookup.orderId)
  });
  if (lookup.trainOrderId) params.set("trainOrderId", String(lookup.trainOrderId));

  const data = await fetchJson(origin, `/api/train-details?${params.toString()}`);
  if (!data || data.error) return null;

  const cancelled = isCancelledStatus(data.status);
  const delay = Number(data.delay || 0);
  if (!cancelled && !(delay >= 5)) return null;

  const label = [data.category, item.trainNum, data.name].filter(Boolean).join(" ");
  const reason = Array.isArray(data.disruptions) && data.disruptions.length
    ? data.disruptions.map(d => d.message).filter(Boolean).join(" / ")
    : "";

  const urlParams = new URLSearchParams({ train: item.trainNum, station: item.station });
  if (data.category) urlParams.set("category", data.category);
  if (data.name) urlParams.set("name", data.name);
  if (data.scheduleId) { urlParams.set("scheduleId", data.scheduleId); urlParams.set("scheduledId", data.scheduleId); }
  if (data.orderId) { urlParams.set("orderId", data.orderId); urlParams.set("trainOrderId", data.orderId); }

  return {
    label,
    time: item.planTime || "--:--",
    delay,
    cancelled,
    reason,
    url: `/train?${urlParams.toString()}`,
    sigPart: `${label}-${item.planTime || ""}-${delay}-${cancelled ? "X" : ""}`
  };
}

// Jedno zapytanie o tablicę stacji (/api/departures) zamiast dwóch
// (smart-lookup+train-details) jak przy pojedynczym pociągu z "Moich
// pociągów" — ten endpoint sam dołącza już delay/status/disruptionReason
// dla każdego wiersza, dokładnie to, co renderuje index.html.
async function checkStation(origin, stationName) {
  const { date, time } = warsawNow();
  const params = new URLSearchParams({ station: stationName, limit: "20", date, time });
  const data = await fetchJson(origin, `/api/departures?${params.toString()}`);
  if (!data || !Array.isArray(data.departures)) return [];

  const items = [];
  for (const d of data.departures) {
    const cancelled = isCancelledStatus(d.status);
    const delay = Number(d.delay || 0);
    if (!cancelled && !(delay >= 5)) continue;

    const trainNum = String(d.train || d.trainNumber || "").trim();
    const label = [d.category, trainNum, d.name || d.carrier].filter(Boolean).join(" ");
    const reason = d.disruptionReason || "";

    const urlParams = new URLSearchParams({ train: trainNum, station: stationName });
    if (d.category) urlParams.set("category", d.category);
    if (d.name) urlParams.set("name", d.name);
    if (d.scheduleId) { urlParams.set("scheduleId", d.scheduleId); urlParams.set("scheduledId", d.scheduleId); }
    if (d.orderId) { urlParams.set("orderId", d.orderId); urlParams.set("trainOrderId", d.orderId); }

    items.push({
      label,
      time: d.time || d.plannedTime || "--:--",
      delay,
      cancelled,
      reason,
      url: `/train?${urlParams.toString()}`,
      sigPart: `ST-${stationName}-${label}-${d.time || d.plannedTime || ""}-${delay}-${cancelled ? "X" : ""}`
    });
  }
  return items;
}

function plainText(x) {
  return x.cancelled ? `${x.time} ${x.label} ODWOŁANY` : `${x.time} ${x.label} +${x.delay} min`;
}

async function sendPush(env, subscription, payload) {
  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK: env.VAPID_PRIVATE_KEY,
    subscription,
    message: {
      payload,
      adminContact: ADMIN_CONTACT,
      options: { ttl: 600 }
    }
  });
  const res = await fetch(endpoint, { method: "POST", headers, body });
  return res.status;
}

// Tymczasowa diagnostyka jednego profilu (bez zapisu) — do usunięcia po
// zdiagnozowaniu, czemu testowy profil nie dostaje powiadomień mimo
// poprawnych danych w KV. GET /api/push-tick?token=...&debugSecret=...
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.searchParams.get("debugSecret") !== env.PUSH_TICK_SECRET) {
    return json({ ok: false, error: "Nieautoryzowany" }, 401);
  }
  const token = (url.searchParams.get("token") || "").toUpperCase();
  const raw = await env.USER_PROFILES.get(token);
  if (!raw) return json({ ok: true, found: false });
  const profile = JSON.parse(raw);
  const origin = url.origin;
  const subs = Array.isArray(profile.pushSubscriptions) ? profile.pushSubscriptions : [];
  const trains = Array.isArray(profile.trains) ? profile.trains : [];
  const watchedStations = (Array.isArray(profile.watchedStations) ? profile.watchedStations : []).filter(Boolean).slice(0, MAX_WATCHED_STATIONS);
  const useTrains = !!profile.alarmEnabled && trains.length > 0;
  const useStations = watchedStations.length > 0;
  const items = [];
  if (useStations) {
    for (const station of watchedStations) {
      try { items.push(...await checkStation(origin, station)); }
      catch (e) { items.push({ error: String(e && e.message || e) }); }
    }
  }
  return json({
    ok: true, found: true,
    subsCount: subs.length, trainsCount: trains.length, watchedStations,
    useTrains, useStations,
    alarmEnabled: !!profile.alarmEnabled,
    pushLastSignature: profile.pushLastSignature || null,
    items
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.USER_PROFILES) return json({ ok: false, error: "Brak magazynu profili (KV USER_PROFILES)" }, 500);
  if (!env.VAPID_PRIVATE_KEY) return json({ ok: false, error: "Brak VAPID_PRIVATE_KEY" }, 500);
  if (!env.PUSH_TICK_SECRET) return json({ ok: false, error: "Brak PUSH_TICK_SECRET" }, 500);

  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${env.PUSH_TICK_SECRET}`) {
    return json({ ok: false, error: "Nieautoryzowany" }, 401);
  }

  const origin = new URL(request.url).origin;
  const summary = { profilesChecked: 0, profilesNotified: 0, trainsChecked: 0, stationsChecked: 0, pushSent: 0, pushPruned: 0, errors: [] };

  let cursor;
  do {
    const page = await env.USER_PROFILES.list({ cursor });
    cursor = page.cursor;

    for (const entry of page.keys) {
      const token = entry.name;
      if (!TOKEN_RE.test(token)) continue; // pomija klucze limitu tworzenia profili (profilecreate:...)

      let profile;
      try {
        const raw = await env.USER_PROFILES.get(token);
        profile = raw ? JSON.parse(raw) : null;
      } catch (e) {
        continue;
      }
      if (!profile) continue;

      const subs = Array.isArray(profile.pushSubscriptions) ? profile.pushSubscriptions : [];
      const trains = Array.isArray(profile.trains) ? profile.trains : [];
      const watchedStations = (Array.isArray(profile.watchedStations) ? profile.watchedStations : [])
        .filter(Boolean).slice(0, MAX_WATCHED_STATIONS);

      const useTrains = !!profile.alarmEnabled && trains.length > 0;
      const useStations = watchedStations.length > 0;
      if (!subs.length || (!useTrains && !useStations)) continue;

      summary.profilesChecked++;

      const items = [];
      if (useTrains) {
        for (const item of trains) {
          if (!item || !item.station || !item.trainNum) continue;
          summary.trainsChecked++;
          try {
            const result = await checkTrain(origin, item);
            if (result) items.push(result);
          } catch (e) {
            summary.errors.push(`${token}:${item.trainNum}: ${e.message}`);
          }
        }
      }
      if (useStations) {
        for (const station of watchedStations) {
          summary.stationsChecked++;
          try {
            items.push(...await checkStation(origin, station));
          } catch (e) {
            summary.errors.push(`${token}:stacja ${station}: ${e.message}`);
          }
        }
      }

      const sig = items.map(x => x.sigPart).join("|");
      if (!sig || sig === profile.pushLastSignature) continue;

      const top = items.slice(0, 5);
      const payload = {
        title: "Alarm pociągów",
        body: top.map(plainText).join(" | "),
        url: top.length === 1 ? top[0].url : "/moje-pociagi/"
      };

      let prunedAny = false;
      const keptSubs = [];
      for (const sub of subs) {
        try {
          const status = await sendPush(env, sub, payload);
          if (status === 404 || status === 410) {
            prunedAny = true;
            summary.pushPruned++;
          } else {
            keptSubs.push(sub);
            if (status >= 200 && status < 300) summary.pushSent++;
          }
        } catch (e) {
          keptSubs.push(sub); // błąd sieci/przejściowy — nie kasujemy subskrypcji
          summary.errors.push(`${token} push: ${e.message}`);
        }
      }

      profile.pushLastSignature = sig;
      if (prunedAny) profile.pushSubscriptions = keptSubs;

      await env.USER_PROFILES.put(token, JSON.stringify(profile), {
        expirationTtl: PROFILE_TTL_SECONDS,
        metadata: { createdAt: profile.createdAt, updatedAt: profile.updatedAt }
      });

      summary.profilesNotified++;
    }
  } while (cursor);

  return json({ ok: true, ...summary });
}
