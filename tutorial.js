// Współdzielony interaktywny samouczek typu "spotlight" — ładowany na
// tablicy głównej, moje-pociagi-v2, /train i /profil/ (tak jak
// profile-sync.js). Prowadzi użytkownika krok po kroku po REALNYCH
// elementach interfejsu danej strony: reszta ekranu jest przyciemniona,
// wskazany element podświetlony, obok niego dymek z opisem.
//
// Pokazuje się automatycznie TYLKO gdy na tym urządzeniu nie ma jeszcze
// aktywnego profilu (tokenu) — obecność profilu sama w sobie wyłącza
// automatyczne pokazywanie. Po zakończeniu LUB pominięciu zapamiętujemy
// to lokalnie (żeby nie wracał co wizytę) oraz, jeśli profil jest
// aktywny, dopisujemy to też do niego.
//
// Przycisk 🎓 w prawym górnym rogu pozwala wywołać samouczek ręcznie w
// dowolnym momencie (DEMO) — niezależnie od tego, czy już go widziano.
(function () {
  "use strict";

  const SEEN_KEY = "tutorialSeenV1";

  // Kroki dobrane per strona — spotlight wskazuje tylko elementy, które
  // faktycznie na niej istnieją. `sel` to selektor CSS, `title`/`text`
  // treść dymka. Krok jest pomijany w locie, jeśli w danym momencie
  // element nie istnieje albo jest niewidoczny (np. panel ukryty, bo
  // profil jest już aktywny).
  const STEPS_BY_PAGE = [
    {
      match: function (p) { return p === "/" || p === "/index.html"; },
      steps: [
        { sel: ".search-box", title: "Zacznij tutaj", text: "Wpisz nazwę dowolnej stacji, żeby sprawdzić jej odjazdy." },
        { sel: ".btn-api", title: "Żywa tablica", text: "Kliknij „Pokaż z API”, żeby zobaczyć odjazdy z realnymi opóźnieniami, nie tylko planem." },
        { sel: "#stationButtons", title: "Ulubione stacje", text: "Twoje przypięte stacje. Puste miejsca same wypełniają się ostatnio przeglądanymi — gwiazdką ☆ przy tablicy przypinasz własne." },
        { sel: "#alertButton", title: "Alarm opóźnień", text: "Włącz, żeby dostać powiadomienie o opóźnieniu lub odwołaniu na wybranej stacji." },
        { sel: '.bottom-nav button[onclick="toggleBurgerMenu()"]', title: "Dzienniczek podróży", text: "W menu (☰) znajdziesz też 📓 Dzienniczek podróży — zaznaczasz stację wsiadania i wysiadania na biegu pociągu, a on sam liczy czas przejazdu i opóźnienie." },
        { sel: '.bottom-nav a[href="/profil/"]', title: "Profil i synchronizacja", text: "Załóż tu token — 16 znaków, bez hasła i loginu — żeby zsynchronizować ulubione stacje, pociągi, alarmy i dzienniczek między urządzeniami." }
      ]
    },
    {
      match: function (p) { return p.indexOf("/moje-pociagi-v2") === 0; },
      steps: [
        { sel: "#list", title: "Twoje pociągi", text: "Tu widzisz status każdego śledzonego kursu: opóźnienie i ostatnią zaliczoną stację. Kliknij kartę, żeby zobaczyć cały bieg." },
        { sel: "#addTrainForm", title: "Dodaj pociąg", text: "Dodaj stację, numer i planową godzinę raz — od teraz zawsze zobaczysz go tu z aktualnym statusem." },
        { sel: "#refreshBtn", title: "Odśwież ręcznie", text: "Lista i tak sama się aktualizuje po powrocie po dłuższej przerwie, ale możesz też odświeżyć w każdej chwili." },
        { sel: 'a[href="/dziennik/"]', title: "Dzienniczek podróży", text: "Notuj rzeczywiste przejazdy — zaznaczasz stację wsiadania i wysiadania na biegu pociągu, a dzienniczek sam liczy czas i opóźnienie." },
        { sel: 'a[href="/profil/"]', title: "Profil i synchronizacja", text: "Token z profilu zabierze tę listę, alarmy i dzienniczek na każde Twoje urządzenie." }
      ]
    },
    {
      match: function (p) { return p.indexOf("/train") === 0; },
      steps: [
        { sel: "#status", title: "Cały bieg pociągu", text: "Trafiasz tu, klikając numer pociągu na tablicy albo na liście Moje Pociągi V2. Poniżej zobaczysz trasę stacja po stacji: godziny planowe i rzeczywiste, opóźnienie osobno dla przyjazdu i odjazdu, peron i tor." },
        { sel: ".mark-btns", title: "Dzienniczek podróży", text: "Zaznacz 🚏 stację wsiadania i 🏁 wysiadania, żeby zapisać ten przejazd do dzienniczka — z automatycznie policzonym czasem i opóźnieniem." }
      ]
    },
    {
      match: function (p) { return p.indexOf("/profil") === 0; },
      steps: [
        { sel: "#createPanel", title: "Nowy profil", text: "Jeśli nie masz jeszcze profilu, tu jednym kliknięciem tworzysz nowy token." },
        { sel: "#tokenInput", title: "Masz już token?", text: "Wklej tu token z innego urządzenia, żeby wczytać swoje ulubione stacje, pociągi i alarmy." }
      ]
    },
    {
      match: function (p) { return p.indexOf("/dziennik") === 0; },
      steps: [
        { sel: ".trip-panel", title: "Trasy typowe", text: "Zdefiniuj dom→praca i praca→dom — stacje, orientacyjną godzinę i kilometraż. Potem dodanie pasującego przejazdu to jeden klik na stronie biegu pociągu." },
        { sel: "#entryList", title: "Zapisane przejazdy", text: "Tu widzisz wszystkie zapisane wpisy: godziny, opóźnienie, czas przejazdu i sumę opóźnień narastająco." }
      ]
    }
  ];

  function hasToken() {
    try {
      return !!(window.ProfileSync && ProfileSync.getToken());
    } catch (e) {
      return false;
    }
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = window.getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  function getSteps() {
    const page = STEPS_BY_PAGE.find(function (p) { return p.match(location.pathname); });
    if (!page) return [];
    return page.steps
      .map(function (s) { return { def: s, el: document.querySelector(s.sel) }; })
      .filter(function (s) { return isVisible(s.el); });
  }

  function injectStyles() {
    const css = `
@keyframes tutorialPulse{0%,100%{box-shadow:0 6px 18px rgba(0,0,0,.35)}50%{box-shadow:0 6px 18px rgba(0,0,0,.35),0 0 0 9px rgba(11,87,208,.35)}}
@keyframes tutorialTooltipIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.spot-highlight{position:fixed;z-index:100002;pointer-events:none;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.78),0 0 0 3px #0b57d0,0 0 22px 4px rgba(11,87,208,.55);transition:top .25s ease,left .25s ease,width .25s ease,height .25s ease}
.spot-tooltip{position:fixed;z-index:100003;background:#1c2833;border:1px solid #34495e;border-radius:14px;padding:16px;width:300px;max-width:calc(100vw - 24px);color:#fff;font-family:Arial,sans-serif;text-align:left;box-shadow:0 16px 40px rgba(0,0,0,.5);animation:tutorialTooltipIn .2s ease}
.spot-tooltip .spot-progress{font-size:11px;color:#8b95a1;font-weight:800;letter-spacing:.03em;text-transform:uppercase;margin-bottom:6px}
.spot-tooltip h4{margin:0 0 6px;font-size:16px}
.spot-tooltip p{margin:0 0 14px;font-size:13.5px;line-height:1.5;color:#d8e2ee}
.spot-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}
.spot-skip{background:transparent;border:0;color:#8b95a1;font-size:12.5px;cursor:pointer;padding:6px 4px}
.spot-skip:hover{color:#fff}
.spot-nav{display:flex;gap:6px}
.spot-btn{border:0;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer}
.spot-btn-back{background:#374151;color:#fff}
.spot-btn-back:hover{background:#4b5563}
.spot-btn-back:disabled{opacity:.35;cursor:default}
.spot-btn-next{background:#0b57d0;color:#fff}
.spot-btn-next:hover{background:#084298}
.tutorial-demo-btn{position:fixed;top:10px;right:10px;z-index:9997;width:38px;height:38px;border-radius:50%;border:1px solid #34495e;background:#1c2833;color:#fff;font-size:17px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);transition:transform .15s ease}
.tutorial-demo-btn:hover{background:#253445;transform:scale(1.08)}
.tutorial-demo-btn.pulse{animation:tutorialPulse 1.5s ease-in-out 3}
@media(prefers-reduced-motion:reduce){.spot-highlight{transition:none}.spot-tooltip{animation:none}.tutorial-demo-btn.pulse{animation:none}}
`;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  let highlightEl = null;
  let tooltipEl = null;
  let currentSteps = [];
  let currentIndex = 0;
  let active = false;

  function ensureTourUI() {
    if (highlightEl) return;
    highlightEl = document.createElement("div");
    highlightEl.className = "spot-highlight";
    document.body.appendChild(highlightEl);

    tooltipEl = document.createElement("div");
    tooltipEl.className = "spot-tooltip";
    tooltipEl.innerHTML =
      '<div class="spot-progress" id="spotProgress"></div>' +
      "<h4 id=\"spotTitle\"></h4>" +
      "<p id=\"spotText\"></p>" +
      '<div class="spot-actions">' +
      '<button type="button" class="spot-skip" id="spotSkip">Pomiń</button>' +
      '<div class="spot-nav">' +
      '<button type="button" class="spot-btn spot-btn-back" id="spotBack">Wstecz</button>' +
      '<button type="button" class="spot-btn spot-btn-next" id="spotNext">Dalej</button>' +
      "</div></div>";
    document.body.appendChild(tooltipEl);

    tooltipEl.querySelector("#spotSkip").addEventListener("click", function () { endTour(); });
    tooltipEl.querySelector("#spotBack").addEventListener("click", function () { goToStep(currentIndex - 1); });
    tooltipEl.querySelector("#spotNext").addEventListener("click", function () {
      if (currentIndex >= currentSteps.length - 1) endTour();
      else goToStep(currentIndex + 1);
    });
    document.addEventListener("keydown", function (e) {
      if (!active) return;
      if (e.key === "Escape") endTour();
      else if (e.key === "ArrowRight") tooltipEl.querySelector("#spotNext").click();
      else if (e.key === "ArrowLeft" && currentIndex > 0) goToStep(currentIndex - 1);
    });
    window.addEventListener("resize", function () { if (active) positionAll(); });
    window.addEventListener("scroll", function () { if (active) positionAll(); }, true);
  }

  function positionAll() {
    const step = currentSteps[currentIndex];
    if (!step || !step.el) return;
    const rect = step.el.getBoundingClientRect();
    const pad = 8;
    highlightEl.style.top = (rect.top - pad) + "px";
    highlightEl.style.left = (rect.left - pad) + "px";
    highlightEl.style.width = (rect.width + pad * 2) + "px";
    highlightEl.style.height = (rect.height + pad * 2) + "px";

    const tw = tooltipEl.offsetWidth || 300;
    const th = tooltipEl.offsetHeight || 140;
    const margin = 14;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    let top = spaceBelow >= th + margin || spaceBelow >= spaceAbove
      ? rect.bottom + margin
      : rect.top - th - margin;
    let left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - tw - 10));
    top = Math.max(10, Math.min(top, window.innerHeight - th - 10));
    tooltipEl.style.top = top + "px";
    tooltipEl.style.left = left + "px";
  }

  function goToStep(index) {
    if (index < 0 || index >= currentSteps.length) return;
    currentIndex = index;
    const step = currentSteps[index];
    step.el.scrollIntoView({ behavior: "smooth", block: "center" });

    tooltipEl.querySelector("#spotProgress").textContent = "Krok " + (index + 1) + " z " + currentSteps.length;
    tooltipEl.querySelector("#spotTitle").textContent = step.def.title;
    tooltipEl.querySelector("#spotText").textContent = step.def.text;
    tooltipEl.querySelector("#spotBack").disabled = index === 0;
    tooltipEl.querySelector("#spotNext").textContent = index === currentSteps.length - 1 ? "Zakończ" : "Dalej";

    // Przybliżona pozycja od razu, dokładna po dojechaniu przewijania na miejsce.
    positionAll();
    setTimeout(positionAll, 260);
  }

  function startTour() {
    const steps = getSteps();
    if (!steps.length) return;
    ensureTourUI();
    currentSteps = steps;
    active = true;
    highlightEl.style.display = "block";
    tooltipEl.style.display = "block";
    goToStep(0);
  }

  function endTour() {
    active = false;
    if (highlightEl) highlightEl.style.display = "none";
    if (tooltipEl) tooltipEl.style.display = "none";
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch (e) {}
    if (hasToken()) {
      ProfileSync.push({
        tutorialSeen: true,
        tutorialSeenAt: new Date().toISOString()
      });
    }
  }

  function injectDemoButton(pulse) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tutorial-demo-btn" + (pulse ? " pulse" : "");
    btn.title = "Pokaż samouczek";
    btn.setAttribute("aria-label", "Pokaż samouczek");
    btn.textContent = "🎓";
    btn.addEventListener("click", function () { startTour(); });
    document.body.appendChild(btn);
  }

  function maybeAutoShow() {
    // "pokazuj go tylko na stronie bez profilu" — sama obecność aktywnego
    // tokenu wyłącza automatyczne pokazywanie, niezależnie od tego, czy
    // pole tutorialSeen jest ustawione.
    if (hasToken()) return false;
    try {
      if (localStorage.getItem(SEEN_KEY)) return false;
    } catch (e) {}
    startTour();
    return true;
  }

  window.showTutorial = startTour;

  document.addEventListener("DOMContentLoaded", function () {
    injectStyles();
    const autoShown = maybeAutoShow();
    injectDemoButton(!autoShown);
  });
})();
