// Współdzielony mechanizm synchronizacji profilu (token -> Cloudflare KV)
// między index.html, moje-pociagi, /train i profil/. Token jest
// jedynym "kluczem" do danych (bez hasła) — świadoma decyzja, dane są
// niskiej wrażliwości (ulubione stacje/pociągi, nie dane osobowe).
(function () {
  "use strict";

  const STORAGE_KEY = "profileToken";
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // bez 0/O/1/I/L

  function normalize(raw) {
    return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  function format(token) {
    const t = normalize(token);
    const groups = t.match(/.{1,4}/g);
    return groups ? groups.join("-") : t;
  }

  function isValid(token) {
    return /^[A-Z0-9]{16}$/.test(normalize(token));
  }

  function generateToken() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
  }

  function getToken() {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  // Token jest "zweryfikowany", gdy serwer potwierdził, że taki profil
  // istnieje (utworzony tu, wczytany albo udany zapis/odczyt). Tylko takie
  // urządzenie może odtworzyć profil, który wygasł po 180 dniach; token, którego
  // serwer nigdy nie znał (np. literówka), jest po prostu porzucany.
  const VERIFIED_KEY = "profileTokenVerified";
  let lastError = null;

  function isVerified() {
    try {
      return localStorage.getItem(VERIFIED_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markVerified() {
    try {
      localStorage.setItem(VERIFIED_KEY, "1");
    } catch (e) {}
  }

  function setToken(token) {
    const t = normalize(token);
    try {
      localStorage.setItem(STORAGE_KEY, t);
      localStorage.removeItem(VERIFIED_KEY);
    } catch (e) {}
    return t;
  }

  function clearToken() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(VERIFIED_KEY);
      localStorage.removeItem("showVersionBadge");
    } catch (e) {}
  }

  const PULL_TIMEOUT_MS = 8000;
  async function pull() {
    const token = getToken();
    if (!token) return null;

    // Limit czasu: po wybudzeniu telefonu połączenie bywa martwe i fetch()
    // nie rozstrzyga się w ogóle — strony czekające na profil (Moje pociągi)
    // stały wtedy na starych danych, aż ktoś je przeładował.
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, PULL_TIMEOUT_MS) : null;
    try {
      const res = await fetch("/api/profile", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get", token: token }),
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) return null;
      const body = await res.json();
      const data = body && body.ok ? (body.data || null) : null;
      if (data) markVerified();
      // Numer wersji w nagłówku tylko dla profilu z flagą showVersion
      // (ustawianą ręcznie w KV — profil autora), dla reszty ukryty.
      if (data) {
        try {
          if (data.showVersion === true) localStorage.setItem("showVersionBadge", "1");
          else localStorage.removeItem("showVersionBadge");
          document.documentElement.classList.toggle("show-version", data.showVersion === true);
        } catch (e) {}
      }
      // Ustawienie dźwięku alarmu (alarm-sound.js) jest wspólne dla profilu.
      if (data && typeof data.alarmVolume === "number") {
        try { localStorage.setItem("alarmVolume", String(Math.max(0, Math.min(1, data.alarmVolume)))); } catch (e) {}
      }
      if (data && typeof data.alarmSound === "boolean") {
        try { localStorage.setItem("alarmSoundEnabled", data.alarmSound ? "1" : "0"); } catch (e) {}
        try { window.dispatchEvent(new Event("alarmsoundchange")); } catch (e) {}
      }
      return data;
    } catch (e) {
      return null;
    }
  }

  // Czy profil o takim tokenie istnieje? "exists" | "missing" | "error" |
  // "invalid". Nie zmienia niczego na urządzeniu — do sprawdzenia tokenu
  // ZANIM zostanie zapisany.
  async function check(rawToken) {
    const token = normalize(rawToken);
    if (!isValid(token)) return "invalid";
    try {
      const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get", token: token }), cache: "no-store" });
      if (!res.ok) return "error";
      const body = await res.json();
      if (!body || !body.ok) return "error";
      return body.data ? "exists" : "missing";
    } catch (e) {
      return "error";
    }
  }

  // ===== TODO 112 (26.11): zgłaszanie awarii (miejsce + kod, bez danych osobowych), najwyżej raz na 10 min dla danego miejsca
  const ErrLog = {
    report: function (where, code) {
      try {
        const k = where + "|" + code, now = Date.now(), m = JSON.parse(localStorage.getItem("errLogSentV1") || "{}") || {};
        if (m[k] && now - m[k] < 600000) return;
        m[k] = now; localStorage.setItem("errLogSentV1", JSON.stringify(m));
        const body = JSON.stringify({ where: where, code: String(code) });
        if (navigator.sendBeacon) navigator.sendBeacon("/api/err-log", new Blob([body], { type: "application/json" }));
        else fetch("/api/err-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
      } catch (e) {}
    }
  };
  if (typeof window !== "undefined") window.ErrLog = ErrLog;
  // ===== TODO 112: zapis profilu przy chwilowej awarii serwera — ponowienia, a gdy nie wyjdzie, zmiana czeka w telefonie
  const PENDING_KEY = "profilePendingPatchV1";
  function savePending(patch) { try { const cur = JSON.parse(localStorage.getItem(PENDING_KEY) || "null") || {}; localStorage.setItem(PENDING_KEY, JSON.stringify(Object.assign(cur, patch))); } catch (e) {} }
  function takePending() { try { const p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); localStorage.removeItem(PENDING_KEY); return p && typeof p === "object" && Object.keys(p).length ? p : null; } catch (e) { return null; } }
  const transient = code => code === "network" || /^http_(5\d\d|429)$/.test(String(code || ""));
  async function putOnce(token, patch, create) {
    try {
      const body = JSON.stringify({ token, patch, create: !!create });
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
        // keepalive: zapis dokończy się także po przejściu na inną stronę (limit przeglądarki ~64 KB)
        keepalive: body.length < 60000
      });
      let code = null;
      if (!res.ok) {
        try {
          const j = await res.json();
          code = j && j.code ? j.code : null;
        } catch (e) {}
      }
      return { ok: res.ok, code: code || (res.ok ? null : "http_" + res.status) };
    } catch (e) {
      return { ok: false, code: "network" };
    }
  }

  // opts.create = true tylko przy świadomym zakładaniu profilu. Serwer nie
  // tworzy rekordu przy zwykłym zapisie: jeśli profilu nie ma (wygasł albo
  // token nigdy nie istniał), a urządzenie już go używało — odtwarzamy go;
  // jeśli nie — porzucamy token.
  // ---------- kolejka zapisów ----------
  let pendPatch = null, pendWaiters = [], flushTimer = null, chain = Promise.resolve();
  function enqueue(patch) {
    pendPatch = Object.assign(pendPatch || {}, patch);
    return new Promise(function (res) {
      pendWaiters.push(res);
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 150);
    });
  }
  function flush() {
    flushTimer = null;
    if (!pendPatch) return chain;
    const patch = pendPatch, waiters = pendWaiters;
    pendPatch = null; pendWaiters = [];
    chain = chain.then(function () { return pushNow(patch); }).then(
      function (ok) { waiters.forEach(function (w) { w(ok); }); return ok; },
      function () { waiters.forEach(function (w) { w(false); }); return false; });
    return chain;
  }
  // Strona się zamyka / chowa: niewysłane zmiany jednym sendBeaconem.
  function flushBeacon() {
    if (!pendPatch) return;
    const token = getToken(); if (!token) return;
    const patch = pendPatch, waiters = pendWaiters;
    pendPatch = null; pendWaiters = []; clearTimeout(flushTimer); flushTimer = null;
    let sent = false;
    try {
      if (navigator.sendBeacon) sent = navigator.sendBeacon("/api/profile", new Blob([JSON.stringify({ token, patch, create: false })], { type: "application/json" }));
    } catch (e) {}
    if (!sent) { chain = chain.then(function () { return pushNow(patch); }); }
    waiters.forEach(function (w) { w(true); });
  }
  if (typeof window !== "undefined") {
    // TODO 112: zmiany, które nie doszły przy awarii — wysyłamy przy następnej okazji
    const retryPending = function () { if (!getToken()) return; try { if (!localStorage.getItem(PENDING_KEY)) return; } catch (e) { return; } const p = takePending(); if (p) push(p); };
    setTimeout(retryPending, 4000);
    window.addEventListener("online", retryPending);
    window.addEventListener("pagehide", flushBeacon);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flushBeacon(); });
  }
  // Zwykły zapis: dołącza do kolejki (łączenie + po kolei). Zakładanie profilu — od razu.
  async function push(patch, opts) {
    if (opts && opts.create) return pushNow(patch, opts);
    if (!getToken()) return false;
    return enqueue(patch);
  }
  async function pushNow(patch, opts) {
    const token = getToken();
    if (!token) return false;
    lastError = null;

    let first = await putOnce(token, patch, !!(opts && opts.create));
    // TODO 112: chwilowa awaria (503 / 1102 / brak sieci) — dwie ponowne próby, potem zmiana czeka w telefonie
    for (let n = 0; !first.ok && transient(first.code) && n < 2; n++) {
      ErrLog.report("profile-put", first.code);
      await new Promise(function (r) { setTimeout(r, n ? 8000 : 2500); });
      first = await putOnce(token, patch, !!(opts && opts.create));
    }
    if (first.ok) {
      markVerified();
      const left = takePending(); if (left) setTimeout(function () { push(left); }, 500);
      return true;
    }
    if (transient(first.code)) { savePending(patch); lastError = first.code; return false; }

    if (first.code === "no_profile") {
      if (isVerified()) {
        const again = await putOnce(token, patch, true);
        if (again.ok) {
          markVerified();
          return true;
        }
        lastError = again.code;
        return false;
      }
      clearToken();
      lastError = "no_profile";
      return false;
    }

    lastError = first.code;
    return false;
  }

  // Zwykły push() to fetch() bez oczekiwania — jeśli użytkownik zaraz po
  // zapisie przejdzie na inną stronę (np. wraca na tablicę sprawdzić wynik),
  // przeglądarka potrafi po cichu przerwać jeszcze niedokończone zapytanie.
  // Z zewnątrz wygląda to jak udany zapis (dane są lokalnie, żadnego błędu),
  // a do profilu nic nie dociera. sendBeacon jest zaprojektowany właśnie do
  // takich zapisów "wyślij i nie czekaj" — przeglądarka gwarantuje dostarczenie
  // nawet w trakcie zamykania/nawigacji strony. Używamy go dla najcenniejszych,
  // trudnych do odtworzenia danych (wpisy dzienniczka), nie dla wszystkiego —
  // sendBeacon nie daje żadnej odpowiedzi, więc nie nadaje się tam, gdzie
  // potrzebny jest kod błędu (np. zakładanie nowego profilu).
  function pushBeacon(patch) {
    const token = getToken();
    if (!token) return false;
    // Do wspólnej kolejki (żeby nie ścigać się z innymi zapisami); przy zamykaniu strony
    // kolejka i tak wyjdzie sendBeaconem, a trwające zapytanie ma keepalive.
    enqueue(patch);
    if (document.visibilityState === "hidden") flushBeacon();
    return true;
  }

  // Lista "Moich pociągów" należy do PROFILU — strona główna i strona
  // pociągu (gwiazdki ☆/★) czytają i zapisują ją z lokalnej kopii pod tym
  // samym kluczem co moje-pociagi/index.html. Bez odświeżania ta kopia
  // potrafiła być nieaktualna (lista zmieniona na innym urządzeniu), a
  // gwiazdka zapisywała ją CAŁĄ z powrotem do profilu, kasując tamte zmiany.
  // Odświeżamy ją przy otwarciu strony i przy każdym powrocie do aplikacji.
  const MY_TRAINS_KEY = "rafstakMojePociagiV4";

  async function refreshMyTrains() {
    const profile = await pull();
    if (profile && Array.isArray(profile.trains)) {
      try { localStorage.setItem(MY_TRAINS_KEY, JSON.stringify(profile.trains)); } catch (e) {}
    }
    return profile;
  }

  // Subskrypcja push TEGO urządzenia — zapamiętana, żeby gdy przeglądarka
  // wyda nową, serwer zastąpił nią poprzednią (inaczej obie zostają w
  // profilu i urządzenie dostaje każde powiadomienie dwa razy). Jej obecność
  // mówi też stronom, że to urządzenie dostaje alarmy pushem z serwera.
  const PUSH_ENDPOINT_KEY = "pushEndpointThisDevice";

  async function registerPush(subscription) {
    const token = getToken();
    if (!token) return false;
    const json = subscription.toJSON ? subscription.toJSON() : subscription;
    let previousEndpoint = "";
    try { previousEndpoint = localStorage.getItem(PUSH_ENDPOINT_KEY) || ""; } catch (e) {}
    const res = await fetch("/api/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        subscription: json,
        previousEndpoint: previousEndpoint && previousEndpoint !== json.endpoint ? previousEndpoint : undefined
      })
    });
    if (res.ok) {
      try { localStorage.setItem(PUSH_ENDPOINT_KEY, json.endpoint); } catch (e) {}
    }
    return res.ok;
  }

  function forgetPush() {
    try { localStorage.removeItem(PUSH_ENDPOINT_KEY); } catch (e) {}
  }

  function hasDevicePush() {
    try { return !!(getToken() && localStorage.getItem(PUSH_ENDPOINT_KEY)); } catch (e) { return false; }
  }

  // Ukryty przełącznik numeru wersji w nagłówku: otwarcie dowolnej strony z
  // ?wersja=1 (albo ?wersja=0) zapisuje flagę showVersion w profilu — działa
  // wtedy na każdym urządzeniu z tym profilem. Nieszkodliwe dla innych:
  // zmienia tylko to, czy TEN profil widzi numer wersji.
  try {
    const flag = new URLSearchParams(location.search).get("wersja");
    if ((flag === "1" || flag === "0") && getToken()) {
      const on = flag === "1";
      try {
        if (on) localStorage.setItem("showVersionBadge", "1"); else localStorage.removeItem("showVersionBadge");
        document.documentElement.classList.toggle("show-version", on);
      } catch (e) {}
      push({ showVersion: on });
    }
  } catch (e) {}

  // 24.11 (notatka: po przenosinach na czyzdaze.pl telefon nie dostawał powiadomień): urządzenie ma profil i zgodę
  // przeglądarki na powiadomienia, ale nie jest zgłoszone na serwerze (np. przełącznik alarmów skopiował się jako
  // „włączony”, więc nikt go nie przełączał) — zgłaszamy je samo, bez pytania (zgoda już jest). Klucz VAPID jest publiczny.
  const VAPID = "BOVJOSGUg7ftbz0Qni3Fo15a25c08pX-OJPavIGysDlyyzYt5FW46c2p3OKu46HJB08fuBB70z5dNk9G_xMAsSA";
  function vapidBytes() { const b = (VAPID + "=".repeat((4 - VAPID.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"), r = atob(b); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); }
  async function ensureDevicePush(ask) {
    try {
      if (!getToken() || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
      if (Notification.permission !== "granted") {
        if (!ask || Notification.permission === "denied") return false;
        if ((await Notification.requestPermission()) !== "granted") return false;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes() });
      return await registerPush(sub);
    } catch (e) { return false; }
  }
  try {
    if (getToken() && !localStorage.getItem(PUSH_ENDPOINT_KEY) && "Notification" in window && Notification.permission === "granted") {
      setTimeout(function () { ensureDevicePush(false); }, 4000);
    }
  } catch (e) {}

  // ===== TODO 131 (27.11): Chrome potrafi sam odebrać stronie zgodę na powiadomienia („spam lub treści wprowadzające
  // w błąd”) — wtedy alarmy i Pilnowane przestają przychodzić bez żadnego znaku. Urządzenie było zgłoszone
  // (pushEndpointThisDevice), a zgody już nie ma → pasek z prośbą o ponowne włączenie. Gdy zgoda jest, ale subskrypcji
  // nie ma albo ma inny adres (po „Cofnij” Chrome zakłada nową) — zgłaszamy ją od nowa, bez pytania.
  function tt(k, def, p) {
    try { if (window.I18n && I18n.t) { const v = I18n.t(k, p); if (v && v !== k) return v; } } catch (e) {}
    return String(def).replace(/\{(\w+)\}/g, (m, x) => p && p[x] != null ? p[x] : m);
  }
  function showPushLost(denied) {
    if (document.getElementById("pushLostBar")) return;
    const b = document.createElement("div");
    b.id = "pushLostBar";
    b.setAttribute("role", "alert");
    b.style.cssText = "position:fixed;left:10px;right:10px;bottom:12px;z-index:99999;max-width:560px;margin:0 auto;background:#3a1d1d;border:1px solid #ff6b6b;color:#fff;border-radius:14px;padding:12px 14px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5)";
    const btn = "border:0;border-radius:10px;color:#fff;font-weight:800;padding:10px 12px;cursor:pointer;font-size:14px";
    b.innerHTML = "🔕 <b>" + esc(tt("common.pushLost.title", "Przeglądarka wyłączyła powiadomienia z Czy zdążę?")) + "</b><br>" +
      esc(tt("common.pushLost.body", "Alarmy o opóźnieniach i pilnowane przesiadki nie przyjdą na ten telefon, dopóki ich nie włączysz.")) +
      (denied ? '<div style="margin-top:6px;color:#ffd7d7">' + esc(tt("common.pushLost.how", "Stuknij ikonę obok adresu strony (🔒 albo ⓘ) → Uprawnienia → Powiadomienia → Zezwalaj, a potem odśwież stronę.")) + "</div>" : "") +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      (denied ? "" : '<button type="button" data-pl="on" style="' + btn + ';flex:1;background:#2e7d32">🔔 ' + esc(tt("common.pushLost.on", "Włącz ponownie")) + "</button>") +
      '<button type="button" data-pl="later" style="' + btn + ';background:#37474f">' + esc(tt("common.pushLost.later", "Później")) + "</button></div>";
    document.body.appendChild(b);
    const on = b.querySelector("[data-pl=on]");
    if (on) on.onclick = function () {
      on.textContent = "⏳…";
      ensureDevicePush(true).then(function (ok) {
        if (ok) { b.innerHTML = "✅ " + esc(tt("common.pushLost.ok", "Powiadomienia znów włączone na tym telefonie.")); setTimeout(function () { b.remove(); }, 4000); }
        else { b.remove(); showPushLost(true); }
      });
    };
    b.querySelector("[data-pl=later]").onclick = function () { b.remove(); try { sessionStorage.setItem("pushLostLater", "1"); } catch (e) {} };
  }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function pushHealth() {
    try {
      if (!getToken() || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const stored = localStorage.getItem(PUSH_ENDPOINT_KEY);
      if (!stored) return;
      if (Notification.permission === "granted") {
        navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => {
          if (!sub || sub.endpoint !== stored) ensureDevicePush(false);
        }).catch(() => {});
        return;
      }
      if (sessionStorage.getItem("pushLostLater") === "1") return;
      if (Date.now() < Date.parse("2026-11-27T16:00:00+01:00") && localStorage.getItem("showVersionBadge") !== "1") return;   // pasek: profil autora, dla wszystkich od 27.11 16:00
      const show = () => showPushLost(Notification.permission === "denied");
      if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);
    } catch (e) {}
  }
  setTimeout(pushHealth, 5000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") setTimeout(pushHealth, 1500); });

  window.ProfileSync = {
    ensureDevicePush,
    generateToken,
    getToken,
    setToken,
    clearToken,
    normalize,
    format,
    isValid,
    pull,
    push,
    pushBeacon,
    refreshMyTrains,
    registerPush,
    forgetPush,
    hasDevicePush,
    check,
    markVerified,
    isVerified,
    get lastError() { return lastError; }
  };

  // Zaznaczenia 🚏/🏁 z /train (niezapisane przejazdy, z których tablica
  // liczy przypomnienia). Każde leży w localStorage pod własnym kluczem
  // "dziennikZaznaczenie_<kurs>", a w profilu jako jeden obiekt
  // `journalMarks` {klucz: zaznaczenie}. Serwer robi tylko płytki merge, więc
  // całą mapę scalamy po stronie klienta: dla każdego klucza wygrywa nowszy
  // `updatedAt`. Usunięcie to "nagrobek" {deleted:true, updatedAt} — bez niego
  // zaznaczenie skasowane na jednym urządzeniu wracałoby z drugiego.
  const MARK_PREFIX = "dziennikZaznaczenie_";
  const TOMB_KEY = "dziennikZaznaczenieUsuniete";
  const MARK_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
  let markChain = Promise.resolve();

  function readTombs() {
    try {
      const v = JSON.parse(localStorage.getItem(TOMB_KEY));
      return v && typeof v === "object" ? v : {};
    } catch (e) {
      return {};
    }
  }

  function writeTombs(t) {
    try {
      localStorage.setItem(TOMB_KEY, JSON.stringify(t));
    } catch (e) {}
  }

  function readLocalMarks() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key.indexOf(MARK_PREFIX) !== 0) continue;
        try {
          const m = JSON.parse(localStorage.getItem(key));
          if (m && typeof m === "object") out[key] = m;
        } catch (e) {}
      }
    } catch (e) {}
    return out;
  }

  // Do localStorage wpuszczamy wyłącznie klucze z naszym prefiksem i
  // sensownie wyglądające wartości — profil to dane z sieci.
  function validMarkEntry(key, v) {
    if (!key || key.indexOf(MARK_PREFIX) !== 0) return false;
    if (!v || typeof v !== "object") return false;
    if (v.deleted === true) return true;
    return typeof v.board === "string" && typeof v.alight === "string" && typeof v.date === "string";
  }

  function markExpired(v, now) {
    if (v.deleted === true) return now - (v.updatedAt || 0) > MARK_MAX_AGE_MS;
    const d = Date.parse(v.date);
    return !isNaN(d) && now - d > MARK_MAX_AGE_MS;
  }

  async function doSyncMarks() {
    const token = getToken();
    if (!token) return false;

    // Pobieramy sami (a nie przez pull()), bo pull() zwraca null i przy
    // błędzie, i przy pustym profilu — a przy błędzie NIE wolno nam
    // wysyłać mapy, bo nadpisalibyśmy zaznaczenia z innych urządzeń.
    let remote = {};
    try {
      const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get", token: token }), cache: "no-store" });
      if (!res.ok) return false;
      const body = await res.json();
      if (!body || !body.ok) return false;
      const jm = body.data && body.data.journalMarks;
      if (jm && typeof jm === "object" && !Array.isArray(jm)) remote = jm;
    } catch (e) {
      return false;
    }

    const now = Date.now();
    const local = readLocalMarks();
    const tombs = readTombs();
    const localMap = {};
    Object.keys(local).forEach(function (k) { localMap[k] = local[k]; });
    Object.keys(tombs).forEach(function (k) {
      const ts = Number(tombs[k]) || 0;
      if (!localMap[k] || (localMap[k].updatedAt || 0) <= ts) {
        localMap[k] = { deleted: true, updatedAt: ts };
      }
    });

    const merged = {};
    const keys = {};
    Object.keys(localMap).forEach(function (k) { keys[k] = 1; });
    Object.keys(remote).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      const a = localMap[k];
      const b = validMarkEntry(k, remote[k]) ? remote[k] : null;
      let pick;
      if (!a) pick = b;
      else if (!b) pick = a;
      else pick = (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
      if (!pick || !validMarkEntry(k, pick) || markExpired(pick, now)) return;
      merged[k] = pick;
    });

    const newTombs = {};
    Object.keys(merged).forEach(function (k) {
      const v = merged[k];
      try {
        if (v.deleted === true) {
          newTombs[k] = v.updatedAt || now;
          localStorage.removeItem(k);
        } else {
          localStorage.setItem(k, JSON.stringify(v));
        }
      } catch (e) {}
    });
    Object.keys(local).forEach(function (k) {
      if (!merged[k]) {
        try { localStorage.removeItem(k); } catch (e) {}
      }
    });
    writeTombs(newTombs);

    const mk = Object.keys(merged);
    let differs = mk.length !== Object.keys(remote).length;
    if (!differs) {
      differs = mk.some(function (k) {
        return !remote[k] || JSON.stringify(remote[k]) !== JSON.stringify(merged[k]);
      });
    }
    if (differs) await push({ journalMarks: merged });
    return true;
  }

  function syncMarks() {
    markChain = markChain.then(doSyncMarks, doSyncMarks).catch(function () { return false; });
    return markChain;
  }

  function setMark(key, mark) {
    const v = Object.assign({}, mark, { updatedAt: Date.now() });
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
    const t = readTombs();
    if (t[key]) {
      delete t[key];
      writeTombs(t);
    }
    return getToken() ? syncMarks() : Promise.resolve(false);
  }

  function removeMark(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
    if (!getToken()) return Promise.resolve(false);
    const t = readTombs();
    t[key] = Date.now();
    writeTombs(t);
    return syncMarks();
  }

  window.JournalMarks = {
    PREFIX: MARK_PREFIX,
    sync: syncMarks,
    set: setMark,
    remove: removeMark
  };
})();
