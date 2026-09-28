// Współdzielony mechanizm synchronizacji profilu (token -> Cloudflare KV)
// między index.html, moje-pociagi-v2, /train i profil/. Token jest
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

  function setToken(token) {
    const t = normalize(token);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch (e) {}
    return t;
  }

  function clearToken() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  async function pull() {
    const token = getToken();
    if (!token) return null;

    try {
      const res = await fetch("/api/profile?token=" + encodeURIComponent(token), {
        cache: "no-store"
      });
      if (!res.ok) return null;
      const body = await res.json();
      return body && body.ok ? (body.data || null) : null;
    } catch (e) {
      return null;
    }
  }

  async function push(patch) {
    const token = getToken();
    if (!token) return false;

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, patch })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  window.ProfileSync = {
    generateToken,
    getToken,
    setToken,
    clearToken,
    normalize,
    format,
    isValid,
    pull,
    push
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
      const res = await fetch("/api/profile?token=" + encodeURIComponent(token), { cache: "no-store" });
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
