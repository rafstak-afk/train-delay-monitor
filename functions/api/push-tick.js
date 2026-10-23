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

function normalizeStationText(value) {
  return String(value || "").trim().toLowerCase();
}

function minutesOf(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Etap kursu względem stacji użytkownika:
//  - "done": kurs zakończony (ostatnia stacja potwierdzona) albo stacja
//    użytkownika już potwierdzona (pociąg ją minął),
//  - "notStarted": brak jakiejkolwiek potwierdzonej stacji,
//  - "active": w trasie, przed stacją użytkownika.
function trainPhase(data, userStation) {
  const route = Array.isArray(data.route) ? data.route : [];
  if (!route.length) return "active"; // brak trasy — nie mamy podstaw, by filtrować

  const lastStop = route[route.length - 1];
  if (data.isFinished || lastStop.status === "confirmed") return "done";

  const target = route.find(s => normalizeStationText(s.stationName) === normalizeStationText(userStation));
  if (target && target.status === "confirmed") return "done";

  return route.some(s => s.status === "confirmed") ? "active" : "notStarted";
}

// Alarm ma sens tylko dla pociągu, który JEST w trasie i jeszcze NIE minął
// stacji użytkownika. Bez tego filtra train-details zwracał przez resztę
// dnia końcowe opóźnienie zakończonego kursu (journeyDone → lastStop.delay),
// a każda zmiana w innym pociągu wysyłała je ponownie w zbiorczym pushu.
// Przed startem kursu przechodzi tylko odwołanie (to jedyny moment, w którym
// jest jeszcze użyteczne); opóźnienia przed startem to prognozy PLK.
function isRelevantForUser(data, userStation) {
  const phase = trainPhase(data, userStation);
  return phase === "active" || (phase === "notStarted" && isCancelledStatus(data.status));
}

// Okno czasowe wokół planowego czasu na stacji użytkownika (item.planTime),
// poza którym w ogóle nie pytamy PLK — każdy pociąg to ~5 zapytań na tick,
// a tick jest co 5 min, więc sprawdzanie przez całą dobę zjadało ~1440
// zapytań dziennie na KAŻDY pociąg z "Moich pociągów".
const TRAIN_LOOKAHEAD_MIN = 180; // wcześniej i tak tylko ewentualne odwołanie
const TRAIN_MAX_AFTER_MIN = 240; // twardy limit, gdyby "done" nigdy nie przyszło (luki w danych PLK)

function trainKey(item) {
  return `${item.trainNum}|${normalizeStationText(item.station)}|${item.planTime || ""}`;
}

function isInCheckWindow(item, nowMinutes) {
  const plan = minutesOf(item.planTime);
  if (plan === null || nowMinutes === null) return true;
  const diff = nowMinutes - plan;
  return diff >= -TRAIN_LOOKAHEAD_MIN && diff <= TRAIN_MAX_AFTER_MIN;
}

// Dzienny stan pociągów profilu: `done` — klucze pociągów, które dziś już
// minęły stację użytkownika albo skończyły bieg; `lookups` — wynik
// smart-lookup (scheduleId/orderId), wolnozmienny, więc szukany raz na dzień
// (nowa data = nowe wyszukanie, także w weekend/święto z innym rozkładem).
// Osobny klucz KV (nie pole profilu), żeby zapis z push-tick nie nadpisywał
// równoległych zmian profilu robionych przez klienta. Inne listy kluczy
// (push-tick, stats) i tak pomijają wszystko, co nie jest samym tokenem.
const STATE_PREFIX = "pushstate:";
const STATE_TTL_SECONDS = 60 * 60 * 48;

async function readTrainState(env, token, today) {
  try {
    const raw = await env.USER_PROFILES.get(STATE_PREFIX + token);
    const state = raw ? JSON.parse(raw) : null;
    if (state && state.date === today) {
      return {
        done: new Set(Array.isArray(state.done) ? state.done : []),
        lookups: state.lookups && typeof state.lookups === "object" ? state.lookups : {}
      };
    }
  } catch (e) {}
  return { done: new Set(), lookups: {} };
}

async function writeTrainState(env, token, today, state) {
  await env.USER_PROFILES.put(STATE_PREFIX + token, JSON.stringify({ date: today, done: [...state.done], lookups: state.lookups }), {
    expirationTtl: STATE_TTL_SECONDS
  });
}

// Dokładnie te same dwa kroki co fetchTrainByNumber w moje-pociagi/index.html
// (bez warstwy cache w localStorage — ta ma sens tylko po stronie klienta).
// `cachedLookup` — wynik smart-lookup zapamiętany wcześniej tego dnia.
// Zwraca { lookup, done, alert }: `lookup` — świeży wynik smart-lookup do
// zapisania (null, gdy użyto zapamiętanego), `done` — pociąg minął stację
// użytkownika / skończył bieg, `alert` — pozycja do powiadomienia albo null.
async function checkTrain(origin, item, cachedLookup) {
  let lookup = cachedLookup;
  let freshLookup = null;
  if (!lookup) {
    const res = await fetchJson(
      origin,
      `/api/v2/smart-lookup?train=${encodeURIComponent(item.trainNum)}&station=${encodeURIComponent(item.station)}${item.planTime ? `&time=${encodeURIComponent(item.planTime)}` : ""}`
    );
    if (!res || !res.ok || !res.scheduleId || !res.orderId) return { lookup: null, done: false, alert: null };
    lookup = freshLookup = { scheduleId: res.scheduleId, orderId: res.orderId, trainOrderId: res.trainOrderId || "" };
  }
  const outcome = (done, alert) => ({ lookup: freshLookup, done, alert });

  const params = new URLSearchParams({
    train: item.trainNum,
    station: item.station,
    scheduleId: String(lookup.scheduleId),
    orderId: String(lookup.orderId)
  });
  if (lookup.trainOrderId) params.set("trainOrderId", String(lookup.trainOrderId));

  const data = await fetchJson(origin, `/api/train-details?${params.toString()}`);
  if (!data || data.error) return outcome(false, null);
  if (trainPhase(data, item.station) === "done") return outcome(true, null);
  if (!isRelevantForUser(data, item.station)) return outcome(false, null);

  const cancelled = isCancelledStatus(data.status);
  const delay = Number(data.delay || 0);
  if (!cancelled && !(delay >= 5)) return outcome(false, null);

  const label = [data.category, item.trainNum, data.name].filter(Boolean).join(" ");
  const reason = Array.isArray(data.disruptions) && data.disruptions.length
    ? data.disruptions.map(d => d.message).filter(Boolean).join(" / ")
    : "";

  const urlParams = new URLSearchParams({ train: item.trainNum, station: item.station });
  if (data.category) urlParams.set("category", data.category);
  if (data.name) urlParams.set("name", data.name);
  if (data.scheduleId) { urlParams.set("scheduleId", data.scheduleId); urlParams.set("scheduledId", data.scheduleId); }
  if (data.orderId) { urlParams.set("orderId", data.orderId); urlParams.set("trainOrderId", data.orderId); }

  return outcome(false, {
    label,
    time: item.planTime || "--:--",
    delay,
    cancelled,
    reason,
    url: `/train?${urlParams.toString()}`,
    key: `${item.trainNum}|${normalizeStationText(item.station)}|${item.planTime || ""}`
  });
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
    // departures.js pobiera operacje tylko dla TEJ stacji, więc niepusty
    // lastConfirmedStation oznacza, że pociąg już tu był — alarm spóźniony.
    if (d.lastConfirmedStation) continue;

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
      // planowa (nie bieżąca) godzina — d.time przesuwa się razem z opóźnieniem
      key: `ST|${normalizeStationText(stationName)}|${trainNum}|${d.plannedTime || d.time || ""}`
    });
  }
  return items;
}

// Krótka forma etykiety do treści push — samo "IC 34015", bez nazwy
// własnej pociągu (CARPATIA/HUTNIK/...) i bez stacji/czasu, żeby zmieścić
// się w jednej linijce powiadomienia systemowego.
function shortLabel(x) {
  return x.label.split(" ").slice(0, 2).join(" ");
}

function plainText(x) {
  return x.cancelled ? `${shortLabel(x)} ODWOŁANY` : `${shortLabel(x)} +${x.delay} min`;
}

function pluralPL(n, [one, few, many]) {
  if (n === 1) return one;
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
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

// Nagłówek powiadomienia różni się w zależności od ŹRÓDŁA alarmu — pociąg
// z "Moich pociągów" czy obserwowana w tle stacja — żeby użytkownik od razu,
// bez otwierania aplikacji, wiedział którego z dwóch alarmów to dotyczy.
function buildPayload(items, kind) {
  const extra = items.length - 1;
  const title = kind === "station" ? "Alarm: stacja w tle" : "Alarm: Moje pociągi";
  const body = extra > 0
    ? `${items.length} ${pluralPL(items.length, ["opóźnienie", "opóźnienia", "opóźnień"])}: ${plainText(items[0])} i ${extra} więcej — dotknij, by zobaczyć`
    : `${plainText(items[0])} — dotknij, by zobaczyć`;
  const url = items.length === 1 ? items[0].url : (kind === "station" ? "/" : "/moje-pociagi/");
  return { title, body, url };
}

// Ponowny push o tym samym pociągu dopiero, gdy opóźnienie wzrosło o co
// najmniej tyle minut od OSTATNIEGO powiadomienia — bez tego każda zmiana
// +6 → +7 → +8 min wysyłała osobny alarm.
const RENOTIFY_DELAY_STEP = 5;

const NOTIFIED_STATE_MAX = 60;

function sameState(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => k in b && b[k] === a[k]);
}

function alertLevel(x) {
  return x.cancelled ? "X" : x.delay;
}

// Czy pozycja to NOWOŚĆ względem tego, o czym subskrypcja już wie:
// nowy pociąg, odwołanie albo wzrost opóźnienia o RENOTIFY_DELAY_STEP+.
function isNews(x, notifiedLevel) {
  if (notifiedLevel === undefined) return true;
  if (notifiedLevel === "X") return false;
  if (x.cancelled) return true;
  return x.delay >= Number(notifiedLevel) + RENOTIFY_DELAY_STEP;
}

// Wysyłka dla JEDNEGO źródła (pociągi ALBO stacje) — stan per subskrypcja
// i per ŹRÓDŁO (`stateField`: { klucz pociągu: zgłoszony poziom }), żeby
// zmiana w jednym źródle nie "połykała" jeszcze niewysłanego powiadomienia
// z drugiego. Push idzie tylko, gdy jest choć jedna NOWOŚĆ (isNews); samo
// zniknięcie pozycji z listy (np. pociąg minął stację użytkownika) tylko
// czyści stan. Zwraca TĘ SAMĄ referencję `subs`, gdy nic się nie zmieniło
// (sygnał dla wywołującego, że nie trzeba zapisywać profilu).
//
// `legacyField` — pole sygnatury z poprzedniej wersji: subskrypcja, która ma
// tylko je, dostaje stan "po cichu" (bez pushu), żeby wdrożenie nie wysłało
// wszystkim jeszcze raz wszystkich trwających opóźnień.
async function notifyForSource(env, token, subs, items, stateField, legacyField, kind, summary) {
  const kept = [];
  let changed = false;
  let notified = false;
  for (const sub of subs) {
    const hasState = sub[stateField] && typeof sub[stateField] === "object";
    const prev = hasState ? sub[stateField] : {};
    const migrating = !hasState && typeof sub[legacyField] === "string";
    const news = migrating ? [] : items.filter(x => isNews(x, prev[x.key]));

    // Pozycje, które chwilowo zniknęły (np. opóźnienie spadło z 5 na 4 min),
    // zostają w stanie — inaczej powrót do 5 min liczyłby się jako nowość.
    // Limit, żeby stan w profilu nie rósł bez końca.
    const next = {};
    for (const x of items) next[x.key] = news.length || migrating ? alertLevel(x) : prev[x.key];
    for (const [k, v] of Object.entries(prev)) {
      if (Object.keys(next).length >= NOTIFIED_STATE_MAX) break;
      if (!(k in next)) next[k] = v;
    }
    const { [legacyField]: _legacy, ...rest } = sub;
    const updated = { ...rest, [stateField]: next };

    if (!news.length) {
      if (migrating || !sameState(next, prev)) { kept.push(updated); changed = true; }
      else kept.push(sub);
      continue;
    }

    // Nowości na początek listy — to je widać w jednej linijce powiadomienia.
    const ordered = [...news, ...items.filter(x => !news.includes(x))];
    changed = true;
    notified = true;
    try {
      const status = await sendPush(env, sub, buildPayload(ordered, kind));
      if (status === 404 || status === 410) {
        summary.pushPruned++;
      } else {
        kept.push(updated);
        if (status >= 200 && status < 300) summary.pushSent++;
      }
    } catch (e) {
      kept.push(sub); // błąd sieci/przejściowy — nie kasujemy subskrypcji, spróbuje ponownie przy następnym ticku
      summary.errors.push(`${token} push (${kind}): ${e.message}`);
    }
  }
  if (notified) summary.profilesNotified++;
  return changed ? kept : subs;
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
  const summary = { profilesChecked: 0, profilesNotified: 0, trainsChecked: 0, trainsSkipped: 0, stationsChecked: 0, pushSent: 0, pushPruned: 0, errors: [] };
  const now = warsawNow();
  const nowMinutes = minutesOf(now.time);

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

      // Dwa NIEZALEŻNE źródła alarmu — pociągi z "Moich pociągów" i
      // obserwowane stacje w tle — trzymane osobno (nie w jednej wspólnej
      // liście `items` jak poprzednio), żeby można było wysłać dwa różne,
      // rozpoznawalne nagłówki powiadomienia zamiast jednego uniwersalnego
      // "Alarm pociągów" dla obu przypadków naraz.
      const trainItems = [];
      if (useTrains) {
        const state = await readTrainState(env, token, now.date);
        let stateChanged = false;
        for (const item of trains) {
          if (!item || !item.station || !item.trainNum) continue;
          const key = trainKey(item);
          if (state.done.has(key) || !isInCheckWindow(item, nowMinutes)) {
            summary.trainsSkipped++;
            continue;
          }
          summary.trainsChecked++;
          try {
            const { lookup, done, alert } = await checkTrain(origin, item, state.lookups[key]);
            if (lookup) { state.lookups[key] = lookup; stateChanged = true; }
            if (done) { state.done.add(key); stateChanged = true; }
            if (alert) trainItems.push(alert);
          } catch (e) {
            summary.errors.push(`${token}:${item.trainNum}: ${e.message}`);
          }
        }
        if (stateChanged) await writeTrainState(env, token, now.date, state);
      }
      const stationItems = [];
      if (useStations) {
        for (const station of watchedStations) {
          summary.stationsChecked++;
          try {
            stationItems.push(...await checkStation(origin, station));
          } catch (e) {
            summary.errors.push(`${token}:stacja ${station}: ${e.message}`);
          }
        }
      }

      let subsNow = subs;
      subsNow = await notifyForSource(env, token, subsNow, trainItems, "notifiedTrain", "lastSignatureTrain", "train", summary);
      subsNow = await notifyForSource(env, token, subsNow, stationItems, "notifiedStation", "lastSignatureStation", "station", summary);

      if (subsNow !== subs) {
        profile.pushSubscriptions = subsNow;
        delete profile.pushLastSignature; // pole z poprzedniej, wadliwej logiki — już nieużywane

        await env.USER_PROFILES.put(token, JSON.stringify(profile), {
          expirationTtl: PROFILE_TTL_SECONDS,
          metadata: { createdAt: profile.createdAt, updatedAt: profile.updatedAt }
        });
      }
    }
  } while (cursor);

  return json({ ok: true, ...summary });
}
