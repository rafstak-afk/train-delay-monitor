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

  // Przyczyny opóźnień z PLK: nazwy stacji/pociągów/kategorie NIGDY się nie
  // tłumaczą (dane zewnętrzne), ale sama treść przyczyny (np. "Awaria
  // taboru") to informacja wyjaśniająca, nie nazwa własna — tłumaczymy ją,
  // gdy rozpoznamy frazę w naszym (celowo niepełnym) słowniku. Kod PLK
  // (`disruptionTypeCode`, np. "utr_40"), gdy znany serwerowi
  // (functions/api/departures.js forwarduje go w disruptionReasonItems), ma
  // pierwszeństwo nad dopasowaniem po samym tekście — stabilniejszy, gdy
  // PLK lekko zmieni sformułowanie tej samej przyczyny. Nierozpoznana
  // fraza (częste dla niestandardowych, lokalnych komunikatów PLK z nazwami
  // stacji wplecionymi w zdanie) zostaje w oryginalnym polskim brzmieniu —
  // świadomie, zamiast zgadywać tłumaczenie dowolnego wolnego tekstu.
  function translateDisruption(text, code) {
    if (code) {
      var byCode = getByPath(dict, "disruption.codes." + code) || getByPath(fallbackDict, "disruption.codes." + code);
      if (byCode) return byCode;
    }
    var byText = getByPath(dict, "disruption.texts." + text);
    if (byText) return byText;
    return text;
  }

  // Przyczyna bywa kilkoma frazami sklejonymi " / " (functions/api/*.js)
  // — tłumaczymy każdą osobno, więc jedna nierozpoznana fraza (np.
  // niestandardowy komunikat z nazwą stacji) nie blokuje tłumaczenia
  // pozostałych, znanych fraz w tej samej liście.
  function translateDisruptionReason(fullText, items) {
    if (!fullText) return fullText;
    if (Array.isArray(items) && items.length) {
      return items.map(function (it) { return translateDisruption(it.text, it.code); }).join(" / ");
    }
    return String(fullText).split(" / ").map(function (part) { return translateDisruption(part, null); }).join(" / ");
  }

  function t(key, params) {
    var val = getByPath(dict, key);
    if (val === undefined) val = getByPath(fallbackDict, key);
    if (val === undefined) return key; // widoczny-ale-bezpieczny ostatni fallback
    return typeof val === "string" ? interpolate(val, params) : val;
  }

  // Liczba mnoga zależna od języka: wpis w słowniku to obiekt z formami
  // CLDR ({one, few, many, other}), np. PL "1 stacja / 2 stacje / 5 stacji".
  // Brakująca forma → other → many → one. {n} jest zawsze dostępne.
  function tp(key, n, params) {
    var val = getByPath(dict, key);
    if (val === undefined) val = getByPath(fallbackDict, key);
    if (val === undefined) return key;
    var p = Object.assign({ n: n }, params || {});
    if (typeof val === "string") return interpolate(val, p);
    var cat = "other";
    try { cat = new Intl.PluralRules(currentLang).select(n); } catch (e) {}
    var form = val[cat] || val.other || val.many || val.one || "";
    return interpolate(form, p);
  }

  // Żadnego sessionStorage/force-cache tutaj — serwer i tak wysyła
  // Cache-Control: max-age=0, must-revalidate na /i18n/*.json, więc zwykły
  // fetch i tak najwyżej robi tani, warunkowy request (304, jeśli słownik
  // się nie zmienił). Wcześniejsza wersja cache'owała w sessionStorage na
  // całą kartę przeglądarki — po dopisaniu nowych kluczy w trakcie tej
  // samej sesji testowej, strona nadal pokazywała STARY, niepełny słownik
  // nawet po Ctrl+F5 (które czyści tylko cache sieciowy, nie sessionStorage).
  function fetchJson(lang) {
    return fetch("/i18n/" + lang + ".json").then(function (res) {
      if (!res.ok) throw new Error("i18n fetch " + lang + ": " + res.status);
      return res.json();
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

  // Przełącznik języka — osobna ikonka 🌐 w rogu ekranu, obok przycisku
  // samouczka (tutorial.js, top:10px;right:10px, 38x38px) — NIE w burgerze
  // (pierwsza wersja miała przełącznik jako listę 6 pozycji w burgerze, ale
  // to go nienaturalnie wydłużało; wydzielone, żeby burger został krótki).
  var LANGS = [
    { code: "pl", label: "Polski" },
    { code: "en", label: "English" },
    { code: "de", label: "Deutsch" },
    { code: "cs", label: "Čeština" },
    { code: "es", label: "Español" },
    { code: "uk", label: "Українська" }
  ];

  function injectSwitcherStyle() {
    var css =
      ".lang-switch-btn{position:fixed;top:10px;right:56px;z-index:9997;width:38px;height:38px;border-radius:50%;border:1px solid #34495e;background:#1c2833;color:#fff;font-size:18px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:0}" +
      ".lang-switch-btn:hover{background:#253445}" +
      ".lang-switch-menu{display:none;position:fixed;top:52px;right:10px;z-index:9997;background:#1c2833;border:1px solid #34495e;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.5);overflow:hidden;min-width:150px;font-family:Arial,sans-serif}" +
      ".lang-switch-menu.open{display:block}" +
      ".lang-switch-menu button{display:block;width:100%;box-sizing:border-box;padding:11px 16px;background:transparent;border:0;border-top:1px solid #2e4155;color:#fff;font-size:14px;text-align:left;cursor:pointer}" +
      ".lang-switch-menu button:first-child{border-top:0}" +
      ".lang-switch-menu button:hover{background:#253445}" +
      ".lang-switch-menu button.active{color:#ffd400;font-weight:800}";
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function markActiveLang() {
    document.querySelectorAll(".lang-switch-menu button").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === currentLang);
    });
  }

  function injectSwitcher() {
    if (document.getElementById("langSwitchBtn")) return;
    injectSwitcherStyle();

    var btn = document.createElement("button");
    btn.id = "langSwitchBtn";
    btn.type = "button";
    btn.className = "lang-switch-btn";
    btn.title = "Język / Language";
    btn.setAttribute("aria-label", "Język / Language");
    btn.textContent = "🌐";
    document.body.appendChild(btn);

    var menu = document.createElement("div");
    menu.id = "langSwitchMenu";
    menu.className = "lang-switch-menu";
    menu.innerHTML = LANGS.map(function (l) {
      return '<button type="button" data-lang="' + l.code + '">' + l.label + "</button>";
    }).join("");
    document.body.appendChild(menu);

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.classList.toggle("open");
    });
    menu.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        menu.classList.remove("open");
        setLang(b.getAttribute("data-lang"));
      });
    });
    window.addEventListener("click", function (e) {
      if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove("open");
    });
    window.addEventListener("langchange", markActiveLang);
    markActiveLang();
  }

  if (document.body) injectSwitcher();
  else document.addEventListener("DOMContentLoaded", injectSwitcher);

  window.I18n = {
    SUPPORTED: SUPPORTED,
    DEFAULT_LANG: DEFAULT_LANG,
    getLang: function () { return currentLang; },
    t: t,
    tp: tp,
    translateDisruption: translateDisruption,
    translateDisruptionReason: translateDisruptionReason,
    applyDom: applyDom,
    setLang: setLang,
    setLangFromProfile: setLangFromProfile,
    ready: readyPromise
  };
})();
