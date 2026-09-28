// Propozycja założenia profilu po dodaniu ulubionej stacji albo pociągu.
//
// Ulubione i lista pociągów leżą tylko w przeglądarce — bez profilu (tokenu)
// przepadną przy zmianie urządzenia albo wyczyszczeniu danych. Dlatego zaraz
// po ich dodaniu pytamy, czy założyć profil. Zgoda przenosi na /profil/,
// gdzie samouczek (tutorial.js, tryb "przewodnik") prowadzi krok po kroku:
// kliknij "Utwórz profil" -> to Twój token -> zapisz go.
//
// Zasady: tylko gdy nie ma tokenu; nie w trakcie samouczka ani ankiety;
// po "Nie teraz" ponownie dopiero za 30 dni; po dwóch odmowach już nie pytamy.
(function () {
  "use strict";

  var KEY = "profilePromptStateV1";
  var GUIDE_KEY = "profileGuideV1";
  var SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
  var MAX_REFUSALS = 2;
  var SHOW_DELAY_MS = 900;

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

  function blocked() {
    return !!(document.querySelector(".spot-tooltip") ||
      document.getElementById("profilePromptCard") ||
      document.getElementById("surveyCard"));
  }

  function injectStyle() {
    if (document.getElementById("profilePromptStyle")) return;
    var st = document.createElement("style");
    st.id = "profilePromptStyle";
    st.textContent =
      "#profilePromptCard{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9991;width:min(380px,calc(100vw - 24px));background:#1c2833;color:#fff;border:1px solid #0b57d0;border-radius:14px;padding:14px 16px 12px;box-shadow:0 14px 40px rgba(0,0,0,.55);font-family:Arial,sans-serif}" +
      "@media(max-width:700px){#profilePromptCard{bottom:84px}}" +
      "#profilePromptCard .pp-x{position:absolute;top:6px;right:8px;background:transparent;border:0;color:#8b95a1;font-size:16px;cursor:pointer;padding:4px 6px}" +
      "#profilePromptCard .pp-x:hover{color:#fff}" +
      "#profilePromptCard .pp-t{font-size:15px;font-weight:800;margin:0 20px 6px 0}" +
      "#profilePromptCard .pp-p{font-size:13px;line-height:1.5;color:#d8e2ee;margin:0 0 12px}" +
      "#profilePromptCard .pp-row{display:flex;gap:8px}" +
      "#profilePromptCard button.pp-b{flex:1;border:0;border-radius:9px;padding:10px 12px;font-size:13px;font-weight:800;cursor:pointer}" +
      "#profilePromptCard .pp-yes{background:#0b57d0;color:#fff}" +
      "#profilePromptCard .pp-yes:hover{background:#084298}" +
      "#profilePromptCard .pp-no{background:#374151;color:#fff}" +
      "#profilePromptCard .pp-no:hover{background:#4b5563}";
    document.head.appendChild(st);
  }

  function remove() {
    var c = document.getElementById("profilePromptCard");
    if (c) c.remove();
  }

  function refuse() {
    var s = load();
    s.refusals = (s.refusals || 0) + 1;
    s.snoozeUntil = Date.now() + SNOOZE_MS;
    save(s);
    remove();
  }

  function accept() {
    try { localStorage.setItem(GUIDE_KEY, "pending"); } catch (e) {}
    remove();
    location.href = "/profil/";
  }

  function render(reason) {
    injectStyle();
    var what = reason === "train" ? "Twoje pociągi" : "Twoje ulubione stacje";
    var card = document.createElement("div");
    card.id = "profilePromptCard";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Propozycja założenia profilu");
    card.innerHTML =
      '<button type="button" class="pp-x" aria-label="Zamknij" title="Nie teraz">✕</button>' +
      '<div class="pp-t">Zachować to na każdym urządzeniu?</div>' +
      '<p class="pp-p">' + what + ' są teraz tylko w tej przeglądarce. Załóż profil — bez hasła i e-maila, zajmie kilkanaście sekund — a wszystko będzie dostępne także na innych urządzeniach. Poprowadzę Cię krok po kroku.</p>' +
      '<div class="pp-row">' +
      '<button type="button" class="pp-b pp-yes">Tak, poprowadź mnie</button>' +
      '<button type="button" class="pp-b pp-no">Nie teraz</button>' +
      '</div>';
    card.querySelector(".pp-x").addEventListener("click", refuse);
    card.querySelector(".pp-no").addEventListener("click", refuse);
    card.querySelector(".pp-yes").addEventListener("click", accept);
    document.body.appendChild(card);
  }

  // reason: "favorite" (dodana ulubiona stacja) albo "train" (dodany pociąg)
  function ask(reason) {
    if (hasToken()) return;
    var s = load();
    if ((s.refusals || 0) >= MAX_REFUSALS) return;
    if (s.snoozeUntil && Date.now() < s.snoozeUntil) return;
    setTimeout(function () {
      if (hasToken() || blocked()) return;
      render(reason);
    }, SHOW_DELAY_MS);
  }

  window.ProfilePrompt = { ask: ask };
})();
