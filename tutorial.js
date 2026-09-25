// Współdzielony samouczek — ładowany na tablicy głównej, moje-pociagi-v2,
// /train i /profil/ (tak jak profile-sync.js). Pokazuje się automatycznie
// TYLKO gdy na tym urządzeniu nie ma jeszcze aktywnego profilu (tokenu) —
// obecność profilu sama w sobie wyłącza automatyczne pokazywanie. Po
// zamknięciu zapamiętujemy to lokalnie (żeby nie wracał co wizytę) oraz,
// jeśli profil jest aktywny, dopisujemy to też do niego (dla porządku —
// przyda się, gdyby w przyszłości reguła pokazywania zależała też od tego
// pola, nie tylko od samej obecności tokenu).
//
// Przycisk 🎓 w prawym górnym rogu pozwala wywołać samouczek ręcznie w
// dowolnym momencie, niezależnie od tego, czy już go widziano — to DEMO,
// do testowania/prezentacji, oraz zwykła "Pomoc" dla każdego, kto zechce
// go zobaczyć ponownie.
(function () {
  "use strict";

  const SEEN_KEY = "tutorialSeenV1";

  const TIPS = [
    "Wpisz nazwę stacji i kliknij „Pokaż z API”, żeby zobaczyć żywą tablicę odjazdów z realnymi opóźnieniami.",
    "Kliknij numer pociągu w tablicy albo na liście, żeby zobaczyć cały jego bieg stacja po stacji.",
    "Gwiazdka ☆ obok tytułu tablicy przypina stację do ulubionych nad wyszukiwarką — puste miejsca same wypełniają się Twoimi ostatnio przeglądanymi stacjami.",
    "Przycisk 📅 przy odjeździe dodaje przejazd do kalendarza w telefonie jednym kliknięciem.",
    "„Moje Pociągi V2” to Twoja stała lista śledzonych kursów — dodajesz je z tablicy odjazdów i widzisz ich status bez ponownego wyszukiwania.",
    "Przycisk „Alarm: OFF/ON” powiadomi Cię o opóźnieniach i odwołaniach na wybranej stacji.",
    "W „Mój profil” tworzysz token — 16-znakowy klucz bez hasła i loginu — który synchronizuje ulubione stacje, pociągi i alarmy między telefonem a komputerem.",
    "Przekreślona, szara godzina nad kolorową w nawiasie oznacza opóźnienie — kolor pokazuje jego skalę: żółty, czerwony, fioletowy.",
    "„Ostatnio oglądany” pod wyszukiwarką to szybki powrót do biegu pociągu, który ostatnio sprawdzałeś — działa nawet po ponownym otwarciu aplikacji."
  ];

  function hasToken() {
    try {
      return !!(window.ProfileSync && ProfileSync.getToken());
    } catch (e) {
      return false;
    }
  }

  function injectStyles() {
    const css = `
@keyframes tutorialFadeIn{from{opacity:0}to{opacity:1}}
@keyframes tutorialPopIn{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes tutorialRide{0%{left:-28px}100%{left:100%}}
@keyframes tutorialSectionIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes tutorialPulse{0%,100%{box-shadow:0 6px 18px rgba(0,0,0,.35)}50%{box-shadow:0 6px 18px rgba(0,0,0,.35),0 0 0 9px rgba(11,87,208,.35)}}
.tutorial-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000;display:none;align-items:center;justify-content:center;padding:16px}
.tutorial-overlay.open{display:flex;animation:tutorialFadeIn .2s ease}
.tutorial-modal{background:#1c2833;border:1px solid #34495e;border-radius:16px;max-width:560px;width:100%;max-height:88vh;overflow-y:auto;padding:22px;color:#fff;font-family:Arial,sans-serif;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.5);text-align:left;animation:tutorialPopIn .3s cubic-bezier(.2,.9,.3,1.2)}
.tutorial-close{position:absolute;top:10px;right:10px;background:transparent;border:0;color:#b8c3cf;font-size:24px;line-height:1;cursor:pointer;padding:4px 10px;border-radius:8px}
.tutorial-close:hover{background:#253445;color:#fff}
.tutorial-modal h2{margin:0 20px 6px 0;font-size:21px}
.tutorial-modal h3{margin:16px 0 6px;font-size:15px;display:flex;align-items:center;gap:8px}
.tutorial-modal p{margin:0 0 8px;font-size:13.5px;line-height:1.5;color:#d8e2ee}
.tutorial-track{position:relative;height:16px;margin:0 0 14px;overflow:hidden}
.tutorial-track .rail{position:absolute;left:0;right:0;bottom:3px;border-bottom:2px dashed #34495e}
.tutorial-track .cart{position:absolute;left:-28px;top:-4px;font-size:18px;animation:tutorialRide 3.4s linear infinite}
.tutorial-why{background:rgba(11,87,208,.14);border:1px solid rgba(11,87,208,.35);border-radius:12px;padding:12px 14px;margin-bottom:14px}
.tutorial-why p{color:#eaf1fb;margin:0}
.tutorial-section{border-top:1px solid rgba(255,255,255,.08);padding-top:10px;opacity:0;animation:tutorialSectionIn .35s ease forwards}
.tutorial-section:nth-of-type(1){animation-delay:.08s}
.tutorial-section:nth-of-type(2){animation-delay:.15s}
.tutorial-section:nth-of-type(3){animation-delay:.22s}
.tutorial-section:nth-of-type(4){animation-delay:.29s}
.tutorial-section:nth-of-type(5){animation-delay:.36s}
.tutorial-search{display:flex;align-items:center;gap:8px;background:#0f1720;border:1px solid #34495e;border-radius:10px;padding:8px 12px;margin:8px 0}
.tutorial-search input{flex:1;background:transparent;border:0;outline:0;color:#fff;font-size:13.5px;min-width:0}
.tutorial-tips{list-style:none;margin:6px 0 0;padding:0;font-size:13px;color:#d8e2ee}
.tutorial-tips li{padding:8px 10px;border-radius:8px;margin-bottom:5px;background:#223244;line-height:1.4}
.tutorial-empty{opacity:.6;font-size:13px;padding:8px 2px}
.tutorial-footer{margin-top:16px;text-align:center}
.tutorial-btn{border:0;border-radius:10px;padding:12px 22px;background:#0b57d0;color:#fff;font-weight:800;cursor:pointer;font-size:14.5px}
.tutorial-btn:hover{background:#084298}
.tutorial-demo-btn{position:fixed;top:10px;right:10px;z-index:9997;width:38px;height:38px;border-radius:50%;border:1px solid #34495e;background:#1c2833;color:#fff;font-size:17px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);transition:transform .15s ease}
.tutorial-demo-btn:hover{background:#253445;transform:scale(1.08)}
.tutorial-demo-btn.pulse{animation:tutorialPulse 1.5s ease-in-out 3}
@media(max-width:480px){.tutorial-modal{padding:16px;max-height:92vh}.tutorial-modal h2{font-size:18px}}
@media(prefers-reduced-motion:reduce){.tutorial-overlay.open,.tutorial-modal,.tutorial-section,.tutorial-demo-btn.pulse{animation:none!important}.tutorial-track .cart{animation:none!important;left:8px}.tutorial-section{opacity:1}}
`;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function tipsHtml(list) {
    if (!list.length) {
      return '<div class="tutorial-empty">Brak podpowiedzi pasujących do wyszukiwania.</div>';
    }
    return (
      '<ul class="tutorial-tips">' +
      list.map(function (t) { return "<li>" + t + "</li>"; }).join("") +
      "</ul>"
    );
  }

  let overlayEl = null;

  function buildModal() {
    const overlay = document.createElement("div");
    overlay.className = "tutorial-overlay";
    overlay.innerHTML =
      '<div class="tutorial-modal" role="dialog" aria-modal="true" aria-label="Samouczek">' +
      '<button type="button" class="tutorial-close" aria-label="Zamknij">×</button>' +
      "<h2>🚆 Witaj w Tablicy Odjazdów!</h2>" +
      '<div class="tutorial-track"><div class="rail"></div><div class="cart">🚆</div></div>' +
      '<div class="tutorial-why"><p>Ten serwis powstał z jednej, prostej potrzeby: <strong>szybkiego dostępu do rozkładów pociągów, którymi jeździsz najczęściej, i sprawdzenia, czy jadą punktualnie</strong> — bez przekopywania się przez oficjalną aplikację za każdym razem, gdy pytanie jest tak proste jak „czy zdążę i o ile jest opóźniony mój pociąg”.</p></div>' +
      '<div class="tutorial-section"><h3>🚉 Tablica odjazdów</h3><p>Wpisz dowolną stację, a zobaczysz żywą tablicę odjazdów z danych PLK — z kolorami opóźnień, kalendarzem i alarmem. Najczęściej sprawdzane stacje przypnij gwiazdką ☆, żeby mieć je zawsze pod ręką jako przyciski nad wyszukiwarką.</p></div>' +
      '<div class="tutorial-section"><h3>🚆 Moje Pociągi V2</h3><p>Zamiast wyszukiwać ten sam pociąg codziennie, dodaj go raz do własnej listy. Zobaczysz na niej status, opóźnienie i ostatnią zaliczoną stację każdego śledzonego kursu.</p></div>' +
      '<div class="tutorial-section"><h3>🛤️ Bieg pociągu</h3><p>Kliknij numer dowolnego pociągu, żeby zobaczyć całą jego trasę: stacja po stacji, z godzinami planowymi i rzeczywistymi, opóźnieniem na każdym przystanku oraz peronem i torem.</p></div>' +
      '<div class="tutorial-section"><h3>👤 Profil i synchronizacja</h3><p>Załóż token w „Mój profil”, żeby te same ulubione stacje, pociągi i alarmy widzieć zarówno na telefonie, jak i na komputerze — bez zakładania konta, samym 16-znakowym kluczem.</p></div>' +
      '<div class="tutorial-section"><h3>🔍 Podpowiedzi</h3>' +
      '<div class="tutorial-search"><span>🔍</span><input type="text" id="tutorialSearch" placeholder="Czego szukasz? np. kalendarz, alarm, token..." autocomplete="off"></div>' +
      '<div id="tutorialTipsList"></div>' +
      "</div>" +
      '<div class="tutorial-footer"><button type="button" class="tutorial-btn" id="tutorialDoneBtn">Rozumiem, zaczynajmy</button></div>' +
      "</div>";
    document.body.appendChild(overlay);

    const tipsList = overlay.querySelector("#tutorialTipsList");
    const searchInput = overlay.querySelector("#tutorialSearch");

    function refreshTips() {
      const q = (searchInput.value || "").trim().toLowerCase();
      const filtered = q
        ? TIPS.filter(function (t) { return t.toLowerCase().indexOf(q) !== -1; })
        : TIPS;
      tipsList.innerHTML = tipsHtml(filtered);
    }
    searchInput.addEventListener("input", refreshTips);
    refreshTips();

    overlay.querySelector(".tutorial-close").addEventListener("click", function () {
      hideTutorial(true);
    });
    overlay.querySelector("#tutorialDoneBtn").addEventListener("click", function () {
      hideTutorial(true);
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) hideTutorial(true);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("open")) hideTutorial(true);
    });

    return overlay;
  }

  function ensureModal() {
    if (!overlayEl) overlayEl = buildModal();
    return overlayEl;
  }

  function showTutorial() {
    ensureModal().classList.add("open");
  }

  function hideTutorial(markSeen) {
    if (overlayEl) overlayEl.classList.remove("open");
    if (markSeen) {
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
  }

  function injectDemoButton(pulse) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tutorial-demo-btn" + (pulse ? " pulse" : "");
    btn.title = "Pokaż samouczek";
    btn.setAttribute("aria-label", "Pokaż samouczek");
    btn.textContent = "🎓";
    btn.addEventListener("click", function () {
      showTutorial();
    });
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
    showTutorial();
    return true;
  }

  window.showTutorial = showTutorial;

  document.addEventListener("DOMContentLoaded", function () {
    injectStyles();
    const autoShown = maybeAutoShow();
    // Gdy samouczek się nie otworzył sam (bo już go widziano albo jest
    // profil), przycisk 🎓 delikatnie pulsuje przez kilka sekund, żeby
    // ktoś wiedział, że w ogóle tam jest — modal sam w sobie tego robić
    // nie musi, bo już przyciąga uwagę.
    injectDemoButton(!autoShown);
  });
})();
