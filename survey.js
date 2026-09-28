// Krótka ankieta zadowolenia (1-5 gwiazdek) — mała karta u dołu ekranu.
//
// Zasady:
//  - Nowi użytkownicy (bez tokenu): dopiero po 3 udanych akcjach (wczytana
//    tablica z danymi albo otwarty bieg pociągu) i po samouczku. Po ocenie
//    nigdy więcej; "Później" wraca za 7 dni, łącznie najwyżej 3 razy.
//  - Użytkownicy z tokenem: raz na 30 dni od ostatniej oceny. Data ostatniej
//    oceny leży w profilu, więc nie pytamy na każdym urządzeniu osobno.
//  - Nigdy na stronie biegu pociągu (/train) — tam ktoś patrzy na jadący
//    pociąg. Tam tylko liczymy akcje.
//  - Nie w jednym czasie z samouczkiem, banerem przypomnienia o dzienniczku
//    ani otwartym oknem dialogowym.
(function () {
  "use strict";

  var KEY = "surveyStateV1";
  var MIN_ACTIONS = 3;
  var SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
  var MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  var MAX_ANON_DISMISSALS = 3;
  var SHOW_DELAY_MS = 5000;
  var RETRY_MS = 60000;
  var MAX_RETRIES = 5;

  var onTrainPage = location.pathname.indexOf("/train") === 0;
  var counted = false;
  var timer = null;
  var retries = 0;

  function load() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY));
      return v && typeof v === "object" ? v : {};
    } catch (e) {
      return {};
    }
  }
  function save(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function hasToken() {
    try { return !!(window.ProfileSync && ProfileSync.getToken()); } catch (e) { return false; }
  }
  function pushProfile(s) {
    if (!hasToken()) return;
    try {
      ProfileSync.push({ survey: { lastRatedAt: s.lastRatedAt || 0, snoozeUntil: s.snoozeUntil || 0 } });
    } catch (e) {}
  }

  // Jedna akcja na wyświetlenie strony — auto-odświeżanie nie nabija licznika.
  function action() {
    if (counted) return;
    counted = true;
    var s = load();
    s.actions = (s.actions || 0) + 1;
    save(s);
    schedule();
  }

  function schedule() {
    if (onTrainPage || timer) return;
    timer = setTimeout(function () { timer = null; maybeShow(); }, SHOW_DELAY_MS);
  }

  function blockedByOtherUi() {
    if (document.hidden) return true;
    var tip = document.querySelector(".spot-tooltip");
    if (tip && tip.style.display !== "none") return true;
    if (document.querySelector(".confirm-overlay.open, .manual-save-overlay.open")) return true;
    var rem = document.getElementById("journalReminder");
    if (rem && rem.style.display !== "none" && rem.innerHTML.trim()) return true;
    if (document.getElementById("surveyCard")) return true;
    if (document.getElementById("profilePromptCard")) return true;
    return false;
  }

  async function maybeShow() {
    if (onTrainPage) return;
    var s = load(), now = Date.now();
    if ((s.actions || 0) < MIN_ACTIONS) return;
    if (s.snoozeUntil && now < s.snoozeUntil) return;

    if (!hasToken()) {
      if (s.lastRatedAt) return;
      if ((s.dismissals || 0) >= MAX_ANON_DISMISSALS) return;
      // Samouczek pokazujemy tylko bez profilu — poczekajmy, aż go ktoś obejrzy/pominie.
      try { if (!localStorage.getItem("tutorialSeenV1")) return; } catch (e) {}
    } else {
      if (s.lastRatedAt && now < s.lastRatedAt + MONTH_MS) return;
      // Inne urządzenie z tym profilem mogło już zapytać.
      try {
        var p = await ProfileSync.pull();
        if (p && p.survey) {
          s.lastRatedAt = Math.max(s.lastRatedAt || 0, Number(p.survey.lastRatedAt) || 0);
          s.snoozeUntil = Math.max(s.snoozeUntil || 0, Number(p.survey.snoozeUntil) || 0);
          save(s);
          if (s.lastRatedAt && now < s.lastRatedAt + MONTH_MS) return;
          if (s.snoozeUntil && now < s.snoozeUntil) return;
        }
      } catch (e) {}
    }

    if (blockedByOtherUi()) {
      if (retries++ < MAX_RETRIES) setTimeout(maybeShow, RETRY_MS);
      return;
    }
    render();
  }

  function injectStyle() {
    if (document.getElementById("surveyStyle")) return;
    var st = document.createElement("style");
    st.id = "surveyStyle";
    st.textContent =
      "#surveyCard{position:fixed;right:16px;bottom:16px;z-index:9990;width:min(320px,calc(100vw - 24px));background:#1c2833;color:#fff;border:1px solid #34495e;border-radius:14px;padding:14px 16px 12px;box-shadow:0 14px 40px rgba(0,0,0,.5);font-family:Arial,sans-serif;text-align:center}" +
      "#surveyCard.sv-lift{bottom:84px}" +
      "@media(max-width:700px){#surveyCard{right:50%;transform:translateX(50%);bottom:84px}}" +
      "#surveyCard .sv-x{position:absolute;top:6px;right:8px;background:transparent;border:0;color:#8b95a1;font-size:16px;cursor:pointer;padding:4px 6px}" +
      "#surveyCard .sv-x:hover{color:#fff}" +
      "#surveyCard .sv-q{font-size:14px;font-weight:800;margin:0 18px 8px}" +
      "#surveyCard .sv-stars{display:flex;justify-content:center;gap:4px;margin-bottom:6px}" +
      "#surveyCard .sv-star{background:transparent;border:0;font-size:34px;line-height:1;cursor:pointer;color:#4b5563;padding:2px 4px;transition:transform .12s,color .12s}" +
      "#surveyCard .sv-star.on{color:#ffcc00}" +
      "#surveyCard .sv-star:hover{transform:scale(1.15)}" +
      "#surveyCard .sv-later{background:transparent;border:0;color:#b8c3cf;text-decoration:underline;cursor:pointer;font-size:12px;padding:2px 6px}" +
      "#surveyCard .sv-msg{font-size:13px;color:#d8e2ee;margin:6px 0 2px;line-height:1.5}" +
      "#surveyCard .sv-msg a{color:#22d3ee}" +
      "#surveyCard .sv-err{color:#ff4d4d}" +
      "@media(prefers-reduced-motion:reduce){#surveyCard .sv-star{transition:none}}";
    document.head.appendChild(st);
  }

  function getVersion() {
    var badge = document.querySelector(".version-badge");
    var m = badge && badge.textContent.match(/v\.\s*0\.\d+/);
    if (m) return Promise.resolve(m[0].replace(/\s+/g, " "));
    return fetch("/", { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (t) { var x = t.match(/v\.\s*0\.\d+/); return x ? x[0].replace(/\s+/g, " ") : "inna"; })
      .catch(function () { return "inna"; });
  }

  function removeCard() {
    var c = document.getElementById("surveyCard");
    if (c) c.remove();
  }

  function later() {
    var s = load();
    s.dismissals = (s.dismissals || 0) + 1;
    s.snoozeUntil = Date.now() + SNOOZE_MS;
    save(s);
    pushProfile(s);
    removeCard();
  }

  function render() {
    injectStyle();
    var card = document.createElement("div");
    card.id = "surveyCard";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Ankieta zadowolenia");
    card.innerHTML =
      '<button type="button" class="sv-x" aria-label="Zamknij, zapytaj później" title="Później">✕</button>' +
      '<div class="sv-q">Jak oceniasz tę aplikację?</div>' +
      '<div class="sv-stars" role="radiogroup" aria-label="Ocena w gwiazdkach"></div>' +
      '<div class="sv-msg" id="svMsg"></div>' +
      '<button type="button" class="sv-later">Później</button>';
    var starsBox = card.querySelector(".sv-stars");
    var stars = [];
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "sv-star";
        b.textContent = "★";
        b.setAttribute("role", "radio");
        b.setAttribute("aria-label", n + " z 5");
        b.addEventListener("mouseenter", function () { paint(n); });
        b.addEventListener("focus", function () { paint(n); });
        b.addEventListener("click", function () { submit(n); });
        stars.push(b);
        starsBox.appendChild(b);
      })(i);
    }
    starsBox.addEventListener("mouseleave", function () { paint(0); });
    function paint(n) {
      stars.forEach(function (b, idx) { b.classList.toggle("on", idx < n); });
    }
    // Dolny pasek nawigacji jest na wierzchu — unosimy kartę nad niego.
    if (document.querySelector(".bottom-nav")) card.classList.add("sv-lift");
    card.querySelector(".sv-x").addEventListener("click", later);
    card.querySelector(".sv-later").addEventListener("click", later);
    document.body.appendChild(card);

    var busy = false;
    function submit(n) {
      if (busy) return;
      busy = true;
      paint(n);
      var msg = card.querySelector("#svMsg");
      msg.className = "sv-msg";
      msg.textContent = "Wysyłam…";
      getVersion().then(function (version) {
        return fetch("/api/survey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stars: n, hasToken: hasToken(), version: version })
        });
      }).then(function (res) {
        // 429 = dzisiejszy limit z tego adresu; nie męczymy dalej.
        if (!res.ok && res.status !== 429) throw new Error("http " + res.status);
        var s = load();
        s.lastRatedAt = Date.now();
        s.snoozeUntil = 0;
        s.dismissals = 0;
        save(s);
        pushProfile(s);
        var low = n <= 3;
        card.querySelector(".sv-stars").style.pointerEvents = "none";
        card.querySelector(".sv-later").style.display = "none";
        msg.innerHTML = "Dziękuję za ocenę! " + (low ? '<br><a href="/kontakt/">Napisz, co poprawić →</a>' : "");
        setTimeout(removeCard, low ? 12000 : 3500);
      }).catch(function () {
        busy = false;
        msg.className = "sv-msg sv-err";
        msg.textContent = "Nie udało się wysłać. Spróbuj jeszcze raz.";
      });
    }
  }

  window.Survey = { action: action };

  // Na stronach, gdzie ankieta może się pokazać, sprawdzamy też samo wejście
  // (ktoś mógł mieć już 3 akcje z wcześniejszych wizyt).
  if (!onTrainPage) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule);
    else schedule();
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule();
    });
  }
})();
