// Wspólne menu "burger" — dotąd istniało tylko na index.html (ręcznie
// wpisany HTML+CSS+JS w tamtym pliku). Wydzielone tutaj, żeby KAŻDA strona,
// która dołączy ten jeden <script>, dostała identyczny burger automatycznie,
// bez kopiowania znaczników do każdego pliku z osobna — ten sam wzorzec co
// profile-sync.js/tutorial.js (jeden plik, dołączany wszędzie).
//
// Pozycje "🩺 API"/"📊 Limit" (sprawdzenie stanu API PLK) mają sens TYLKO
// na stronach z panelem #healthBox (dziś: wyłącznie index.html) — na
// pozostałych stronach po prostu ich nie pokazujemy, zamiast renderować
// przycisk, który i tak nic by nie zrobił (checkPlkHealth/checkApiLimit
// tam nie istnieją).
(function () {
  "use strict";

  if (document.getElementById("burgerMenu")) return; // już wstrzyknięte (np. podwójne dołączenie skryptu)

  var CSS =
    ".burger-wrap{position:fixed!important;left:8px!important;right:8px!important;bottom:62px!important;top:auto!important;z-index:9999!important;pointer-events:none!important}" +
    ".burger-btn{display:none!important}" +
    ".burger-menu{display:none;pointer-events:auto!important;margin:0 auto!important;max-width:420px!important;min-width:0!important;width:min(420px,calc(100vw - 16px))!important;background:#1c2833!important;border:1px solid #34495e!important;border-radius:14px!important;box-shadow:0 12px 32px rgba(0,0,0,.5)!important;overflow:hidden!important;text-align:left!important;font-family:Arial,sans-serif!important}" +
    ".burger-menu.open{display:block!important}" +
    ".burger-menu a,.burger-menu .burger-lang-btn{display:block;width:100%;box-sizing:border-box;padding:14px 16px;color:#fff;text-decoration:none;border:0;border-top:1px solid #2e4155;font-size:15px;background:transparent;text-align:left;cursor:pointer;font-family:inherit}" +
    ".burger-menu a:first-child{border-top:0}" +
    ".burger-menu a:hover,.burger-menu .burger-lang-btn:hover{background:#253445}" +
    ".burger-lang-label{padding:10px 16px 4px;font-size:12px;color:#8b95a1;font-weight:800;text-transform:uppercase;letter-spacing:.03em;border-top:1px solid #2e4155}" +
    ".burger-lang-btn.active{color:#ffd400;font-weight:800}" +
    "@media(max-width:700px){.burger-wrap{left:5px!important;right:5px!important;bottom:53px!important}.burger-menu{width:calc(100vw - 10px)!important;max-width:none!important}}";

  var LINKS = [
    { href: "/opoznienia/tgzm.html", key: "common.burger.tgzm", fallback: "🚋 TGZM" },
    { href: "https://l.plk-sa.pl/#qr-generator", external: true, key: "common.burger.qr", fallback: "▣ Generator QR PLK" },
    { href: "/bilety/", key: "common.burger.tickets", fallback: "🎫 Dobierz bilet" },
    { action: "health", key: "common.burger.apiHealth", fallback: "🩺 API", requiresHealthBox: true },
    { action: "limit", key: "common.burger.apiLimit", fallback: "📊 Limit", requiresHealthBox: true },
    { href: "/jak-dziala/", key: "common.burger.howItWorks", fallback: "📖 Jak działa aplikacja" },
    { href: "/kontakt/", key: "common.burger.contact", fallback: "💬 Uwagi i kontakt" },
    { href: "/kontakt/#rodo", key: "common.burger.rodo", fallback: "🔒 RODO i prywatność" }
  ];

  var LANGS = [
    { code: "pl", label: "Polski" },
    { code: "en", label: "English" },
    { code: "de", label: "Deutsch" },
    { code: "cs", label: "Čeština" },
    { code: "es", label: "Español" },
    { code: "uk", label: "Українська" }
  ];

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function linkHtml(l) {
    if (l.action) {
      if (l.requiresHealthBox && !document.getElementById("healthBox")) return "";
      var call = l.action === "health" ? "checkPlkHealth(true)" : "checkApiLimit(true)";
      return '<a href="#" data-i18n="' + l.key + '" onclick="event.preventDefault();closeBurgerMenu();if(typeof ' + call.split("(")[0] + '===\'function\')' + call + '">' + l.fallback + "</a>";
    }
    var attrs = l.external ? ' target="_blank" rel="noopener"' : "";
    return '<a href="' + escapeAttr(l.href) + '"' + attrs + ' data-i18n="' + l.key + '" onclick="closeBurgerMenu()">' + l.fallback + "</a>";
  }

  function ensureDom() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement("div");
    wrap.className = "burger-wrap";
    wrap.innerHTML =
      '<button class="burger-btn" onclick="toggleBurgerMenu()">☰</button>' +
      '<div id="burgerMenu" class="burger-menu">' +
      LINKS.map(linkHtml).join("") +
      '<div class="burger-lang-label" data-i18n="common.burger.language">Język</div>' +
      LANGS.map(function (l) {
        return '<button type="button" class="burger-lang-btn" data-lang="' + l.code + '">' + l.label + "</button>";
      }).join("") +
      "</div>";
    document.body.appendChild(wrap);

    wrap.querySelectorAll(".burger-lang-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeBurgerMenu();
        if (window.I18n) I18n.setLang(btn.getAttribute("data-lang"));
      });
    });
    markActiveLang();
  }

  function markActiveLang() {
    var current = window.I18n ? I18n.getLang() : "pl";
    document.querySelectorAll(".burger-lang-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === current);
    });
  }
  window.addEventListener("langchange", markActiveLang);

  window.toggleBurgerMenu = function () {
    var m = document.getElementById("burgerMenu");
    if (m) m.classList.toggle("open");
  };
  window.closeBurgerMenu = function () {
    var m = document.getElementById("burgerMenu");
    if (m) m.classList.remove("open");
  };
  window.addEventListener("click", function (e) {
    var m = document.getElementById("burgerMenu");
    var nav = document.querySelector(".bottom-nav");
    if (m && !m.contains(e.target) && !(nav && nav.contains(e.target)) && !e.target.closest(".burger-btn")) {
      m.classList.remove("open");
    }
  });

  if (document.body) ensureDom();
  else document.addEventListener("DOMContentLoaded", ensureDom);
})();
