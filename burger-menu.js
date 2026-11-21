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
    ".burger-menu a{display:block;width:100%;box-sizing:border-box;padding:14px 16px;color:#fff;text-decoration:none;border:0;border-top:1px solid #2e4155;font-size:15px;background:transparent;text-align:left;cursor:pointer;font-family:inherit}" +
    ".burger-menu a:first-child{border-top:0}" +
    ".burger-menu a:hover{background:#253445}" +
    "@media(max-width:700px){.burger-wrap{left:5px!important;right:5px!important;bottom:53px!important}.burger-menu{width:calc(100vw - 10px)!important;max-width:none!important}}";

  var LINKS = [
    { href: "/opoznienia/tgzm.html", key: "common.burger.tgzm", fallback: "🚋 TGZM" },
    { href: "https://l.plk-sa.pl/#qr-generator", external: true, key: "common.burger.qr", fallback: "▣ Generator QR PLK" },
    { href: "/bilety/", key: "common.burger.tickets", fallback: "🎫 Dobierz bilet" },
    { action: "health", key: "common.burger.apiHealth", fallback: "🩺 API", requiresHealthBox: true },
    { action: "limit", key: "common.burger.apiLimit", fallback: "📊 Limit", requiresHealthBox: true },
    { href: "/planer/#pilnowane", key: "common.burger.guard", fallback: "🛡️ Pilnowane połączenia" },
    { href: "/jak-dziala/", key: "common.burger.howItWorks", fallback: "📖 Jak działa aplikacja" },
    { href: "/kontakt/", key: "common.burger.contact", fallback: "💬 Uwagi i kontakt" },
    { href: "/kontakt/#rodo", key: "common.burger.rodo", fallback: "🔒 RODO i prywatność" },
    { href: "/notatka/", key: "common.burger.authorNote", fallback: "📝 Notatka dla Claude", requiresBeta: true },
    { href: "/lista/", key: "common.burger.todoList", fallback: "📋 Moja lista TO DO", requiresBeta: true }
  ];

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  function linkHtml(l) {
    // Funkcje w becie — tylko w profilu autora (?wersja=1).
    if (l.requiresBeta) { try { if (localStorage.getItem("showVersionBadge") !== "1") return ""; } catch (e) { return ""; } }
    if (l.action) {
      if (l.requiresHealthBox && !document.getElementById("healthBox")) return "";
      var call = l.action === "health" ? "checkPlkHealth(true)" : "checkApiLimit(true)";
      return '<a href="#" data-i18n="' + l.key + '" onclick="event.preventDefault();closeBurgerMenu();if(typeof ' + call.split("(")[0] + '===\'function\')' + call + '">' + l.fallback + "</a>";
    }
    var attrs = l.external ? ' target="_blank" rel="noopener"' : "";
    return '<a href="' + escapeAttr(l.href) + '"' + attrs + ' data-i18n="' + l.key + '" onclick="closeBurgerMenu()">' + l.fallback + "</a>";
  }

  // ⏰ Przypomnienia dla autora (tylko profil autora: showVersionBadge) — pasek na górze strony od podanego dnia,
  // „✅ Zrobione” chowa na stałe, „⏰ <data> Przypomnij wtedy” do wybranego dnia (domyślnie jutro). Zapis tylko w tym telefonie (localStorage).
  var AUTHOR_REMINDERS = [
    { id: "domena", from: "2026-11-22", html: "🌐 <b>Domena (TODO 79):</b> wykup domenę .pl (pamiętaj: odnowienie co rok drożej niż pierwszy rok). Potem napisz Claude — podłączy ją do Cloudflare Pages i przeniesie użytkowników." },
    { id: "google-widocznosc", from: "2026-11-22", html: "🔎 <b>Google:</b> wpisz w Google <b>site:train-delay-monitor1.pages.dev</b> i sprawdź, które strony „Czy zdążę?” są już w wynikach (planer, Moje pociągi, kontakt…). Wynik napisz Claude." },
    { id: "pomiar-bytom", from: "2026-11-21", html: "⏱️ <b>Pomiar w Bytomiu:</b> zmierz stoperem dojście z peronu (zapisz numer peronu) na <b>Bytom Zamłynie</b> i na <b>Bytom Dworzec</b> (zapisz numer stanowiska). Mapa nie zna przejścia pod torami, więc aplikacja liczy teraz tylko 2–4 min. Stoper: Planer → 🚆🚌 Pociąg + GZM → Pomiar dojścia." },
    { id: "pomiar-wieczorka-szkola", from: "2026-11-18", html: "⏱️ <b>Pomiar (TODO 71):</b> na przystanku <b>Osiedle Wieczorka Szkoła</b> zmierz stoperem przejście <b>stanowisko 01 → 02</b> (przez światła przy skrzyżowaniu z Ziętka / Armii Krajowej). Stoper: Planer → 🚆🚌 Pociąg + GZM → Pomiar dojścia → ✏️ inne." }
  ];
  function authorReminders() {
    try { if (localStorage.getItem("showVersionBadge") !== "1") return; } catch (e) { return; }
    var today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
    var st = {}; try { st = JSON.parse(localStorage.getItem("authorRemindersV1") || "{}") || {}; } catch (e) {}
    // 18.11 (notatka autora): odkliknięte na jednym urządzeniu nie znikało na drugim — stan także w profilu,
    // klucz authorRem_<id> (jeden zapis na kliknięcie; odczyt profilu tylko gdy jest coś do pokazania)
    function hidden(v) { return v === "done" || (!!v && v > today); }
    function prof() { return window.ProfileSync && ProfileSync.getToken && ProfileSync.getToken() ? ProfileSync : null; }
    var bars = {};
    AUTHOR_REMINDERS.forEach(function (r) {
      var v = st[r.id];
      if (today < r.from || hidden(v)) return;
      var td = new Date(today + "T12:00:00Z"); td.setUTCDate(td.getUTCDate() + 1); var tomorrow = td.toISOString().slice(0, 10);
      var bar = document.createElement("div");
      bar.setAttribute("role", "status");
      bar.style.cssText = "position:sticky;top:0;z-index:9999;background:#3a2f00;color:#fff;border-bottom:2px solid #ffd400;padding:10px 12px;font:14px/1.45 system-ui,sans-serif";
      bar.innerHTML = '<div style="max-width:900px;margin:0 auto">' + r.html +
        '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-ar="done" style="padding:6px 12px;border-radius:8px;border:0;background:#2e7d4f;color:#fff;font-weight:700">✅ Zrobione</button>' +
        '<span style="display:inline-flex;align-items:center;gap:6px">⏰ <input type="date" data-ar-date min="' + tomorrow + '" value="' + tomorrow + '" style="padding:5px 6px;border-radius:8px;border:1px solid #6b5a10;background:#1f1a00;color:#fff;color-scheme:dark">' +
        '<button type="button" data-ar="later" style="padding:6px 12px;border-radius:8px;border:0;background:#4a5563;color:#fff;font-weight:700">Przypomnij wtedy</button></span></div></div>';
      bar.addEventListener("click", function (e) {
        var b = e.target.closest("[data-ar]"); if (!b) return;
        if (b.dataset.ar === "done") st[r.id] = "done";
        else { var di = bar.querySelector("[data-ar-date]"), v = di && di.value; st[r.id] = v && v > today ? v : tomorrow; }   // 20.11: dzień z kalendarza zamiast stałego „jutro”
        try { localStorage.setItem("authorRemindersV1", JSON.stringify(st)); } catch (e2) {}
        var P = prof(); if (P && P.push) { var patch = {}; patch["authorRem_" + r.id] = st[r.id]; try { P.push(patch); } catch (e3) {} }
        bar.remove();
      });
      document.body.insertBefore(bar, document.body.firstChild);
      bars[r.id] = bar;
    });
    var P = prof(); if (!P || !P.pull || !Object.keys(bars).length) return;
    P.pull().then(function (d) {
      if (!d) return; var ch = false;
      Object.keys(bars).forEach(function (id) { var v = d["authorRem_" + id]; if (hidden(v)) { st[id] = v; ch = true; bars[id].remove(); } });
      if (ch) try { localStorage.setItem("authorRemindersV1", JSON.stringify(st)); } catch (e) {}
    }).catch(function () {});
  }
  function ensureDom() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    try { authorReminders(); } catch (e) {}

    var wrap = document.createElement("div");
    wrap.className = "burger-wrap";
    wrap.innerHTML =
      '<button class="burger-btn" onclick="toggleBurgerMenu()">☰</button>' +
      '<div id="burgerMenu" class="burger-menu">' +
      LINKS.map(linkHtml).join("") +
      "</div>";
    document.body.appendChild(wrap);
  }

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

  // UWAGA: samo "document.body istnieje" NIE znaczy, że cała strona jest
  // już sparsowana — ten skrypt jest dołączony blisko początku <body>,
  // więc w momencie jego wykonania elementy zdefiniowane NIŻEJ w HTML
  // (np. #healthBox na index.html) jeszcze nie istnieją. Bez czekania na
  // DOMContentLoaded sprawdzenie requiresHealthBox zawsze wypadało
  // negatywnie, po cichu chowając "🩺 API"/"📊 Limit" nawet na stronie,
  // która je ma.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureDom);
  else ensureDom();
})();
