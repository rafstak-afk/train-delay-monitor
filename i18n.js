// Wspólny runtime i18n — dołączany <script src="/i18n.js"> jako PIERWSZY
// współdzielony skrypt (przed profile-sync.js/burger-menu.js/...) na każdej
// stronie w zakresie. Brak jakiegokolwiek kroku budowania w tym repo (patrz
// README) — to świadomie czysty, zależny-od-niczego JS, ładujący gotowe
// słowniki JSON w locie, a nie wynik kompilacji.
(function () {
  "use strict";

  var SUPPORTED = ["pl", "en", "de", "cs", "es", "uk"];
  var DEFAULT_LANG = "pl";

  var currentLang = DEFAULT_LANG;
  var dict = null;
  var fallbackDict = null; // pl.json — zawsze wczytany, na wypadek brakującego klucza/języka

  function normalizeLang(v) {
    v = String(v || "").toLowerCase();
    return SUPPORTED.indexOf(v) >= 0 ? v : null;
  }

  function readStoredLang() {
    try {
      var v = normalizeLang(localStorage.getItem("lang"));
      if (v) return v;
    } catch (e) {}
    return DEFAULT_LANG;
  }

  function writeStoredLang(code) {
    try { localStorage.setItem("lang", code); } catch (e) {}
    // Ciasteczko — potrzebne dla stron renderowanych po stronie serwera
    // (functions/train.js), które nie mają dostępu do localStorage w
    // momencie budowania pierwszej odpowiedzi HTML.
    try { document.cookie = "lang=" + code + "; path=/; max-age=31536000; SameSite=Lax"; } catch (e) {}
  }

  function getByPath(obj, path) {
    if (!obj) return undefined;
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function interpolate(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (_, k) {
      var v = params[k];
      return v === undefined || v === null ? "" : String(v);
    });
  }

  function t(key, params) {
    var val = getByPath(dict, key);
    if (val === undefined) val = getByPath(fallbackDict, key);
    if (val === undefined) return key; // widoczny-ale-bezpieczny ostatni fallback
    return typeof val === "string" ? interpolate(val, params) : val;
  }

  function fetchJson(lang) {
    var cacheKey = "i18nCache:" + lang;
    try {
      var cached = sessionStorage.getItem(cacheKey);
      if (cached) return Promise.resolve(JSON.parse(cached));
    } catch (e) {}
    return fetch("/i18n/" + lang + ".json", { cache: "force-cache" }).then(function (res) {
      if (!res.ok) throw new Error("i18n fetch " + lang + ": " + res.status);
      return res.json();
    }).then(function (data) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
      return data;
    });
  }

  function ensureFallback() {
    if (fallbackDict) return Promise.resolve(fallbackDict);
    return fetchJson(DEFAULT_LANG).then(function (d) {
      fallbackDict = d;
      return d;
    }).catch(function () {
      fallbackDict = {};
      return fallbackDict;
    });
  }

  function applyDom(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    // Format: data-i18n-attr="placeholder:key,title:key2"
    root.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(",").forEach(function (pair) {
        var bits = pair.split(":");
        var attr = bits[0] && bits[0].trim();
        var key = bits[1] && bits[1].trim();
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
    document.documentElement.lang = currentLang;
  }

  function load(lang) {
    return ensureFallback().then(function () {
      if (lang === DEFAULT_LANG) {
        dict = fallbackDict;
        currentLang = lang;
        return;
      }
      return fetchJson(lang).then(function (d) {
        dict = d;
        currentLang = lang;
      }).catch(function () {
        dict = fallbackDict;
        currentLang = DEFAULT_LANG;
      });
    });
  }

  function applyAndNotify() {
    applyDom(document);
    window.dispatchEvent(new CustomEvent("langchange", { detail: { lang: currentLang } }));
  }

  // Zmiana wywołana PRZEZ UŻYTKOWNIKA (przełącznik w burgerze) — zapisuje
  // wybór i, jeśli jest profil, synchronizuje go na inne urządzenia; bez
  // profilu zachęca do jego założenia (ten sam wzorzec co ulubione
  // stacje/pociągi — profile-prompt.js, patrz ProfilePrompt.ask).
  function setLang(code) {
    code = normalizeLang(code);
    if (!code) return Promise.resolve();
    writeStoredLang(code);
    return load(code).then(function () {
      applyAndNotify();
      if (window.ProfileSync && ProfileSync.getToken()) {
        ProfileSync.push({ language: code });
      } else if (window.ProfilePrompt) {
        ProfilePrompt.ask("language");
      }
    });
  }

  // Zmiana wywołana PRZEZ ODCZYT z profilu (inne urządzenie ustawiło inny
  // język) — bez ponownego zapisu do profilu i bez zachęty do jego
  // założenia (profil już przecież jest, skoro stamtąd czytamy).
  function setLangFromProfile(code) {
    code = normalizeLang(code);
    if (!code || code === currentLang) return Promise.resolve();
    writeStoredLang(code);
    return load(code).then(applyAndNotify);
  }

  var readyPromise = load(readStoredLang()).then(function () {
    if (document.readyState === "loading") {
      return new Promise(function (resolve) {
        document.addEventListener("DOMContentLoaded", function () {
          applyDom(document);
          resolve();
        });
      });
    }
    applyDom(document);
  });

  window.I18n = {
    SUPPORTED: SUPPORTED,
    DEFAULT_LANG: DEFAULT_LANG,
    getLang: function () { return currentLang; },
    t: t,
    applyDom: applyDom,
    setLang: setLang,
    setLangFromProfile: setLangFromProfile,
    ready: readyPromise
  };
})();
