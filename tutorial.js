// Współdzielony interaktywny samouczek typu "spotlight" — ładowany na
// tablicy głównej, moje-pociagi, /train i /profil/ (tak jak
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
  // Przewodnik po zakładaniu profilu: profile-prompt.js ustawia "pending" po
  // zgodzie użytkownika, a na /profil/ ten plik prowadzi go krok po kroku.
  const GUIDE_KEY = "profileGuideV1";

  const GUIDED_PROFILE_STEPS = [
    { sel: "#createBtn", waitClick: true, title: "Utwórz profil", text: "Kliknij ten przycisk. Nie ma hasła ani rejestracji — dostaniesz tylko kod (token), który jest kluczem do Twoich danych." },
    { sel: "#activeToken", title: "To Twój token", text: "16 znaków. Kto go zna, ma dostęp do Twoich danych — dlatego nie udostępniaj go nikomu." },
    { sel: "#copyBtn", title: "Zapisz go", text: "Skopiuj token i schowaj w bezpiecznym miejscu, np. w notatkach. Na innym urządzeniu wpiszesz go w „Wczytaj profil” i wszystko się pojawi. Od teraz Twoje ulubione i pociągi zapisują się w profilu same." }
  ];

  // Kroki dobrane per strona — spotlight wskazuje tylko elementy, które
  // faktycznie na niej istnieją. `sel` to selektor CSS, `title`/`text`
  // treść dymka. Krok jest pomijany w locie, jeśli w danym momencie
  // element nie istnieje albo jest niewidoczny (np. panel ukryty, bo
  // profil jest już aktywny).
  const STEPS_BY_PAGE = [
    {
      id: "index",
      match: function (p) { return p === "/" || p === "/index.html"; },
      steps: [
        { sel: ".search-box", title: "Zacznij tutaj", text: "Wpisz nazwę dowolnej stacji, żeby sprawdzić jej odjazdy." },
        { sel: ".btn-api", title: "Żywa tablica", text: "Kliknij „Pokaż z API”, żeby zobaczyć odjazdy z realnymi opóźnieniami, nie tylko planem." },
        { sel: "#stationButtons", title: "Ulubione stacje", text: "Twoje przypięte stacje. Dodaj własne gwiazdką ☆ przy tablicy poniżej." },
        { sel: 'a[href="/moje-pociagi/"]', title: "Ulubione pociągi", text: "⭐ Gwiazdka przy każdym odjeździe (i w szczegółach pociągu) dodaje go do „Moich pociągów” — stamtąd jednym rzutem oka, bez dodatkowych kliknięć, zobaczysz gdzie ostatnio potwierdził się na stacji i czy jedzie punktualnie. Dodaj ich kilka, żeby śledzić całą podróż — jednorazową wycieczkę albo codzienny dojazd do pracy." },
        { sel: ".action-head", title: "Więcej opcji w jednym miejscu", text: "Przytrzymaj palcem (albo kliknij prawym przyciskiem myszy) dowolny wiersz — otworzy się menu z wszystkimi akcjami: szczegóły, ulubione, kalendarz i dzienniczek naraz." },
        { sel: "#alertButton", title: "Alarm opóźnień", text: "Włącz, żeby dostać powiadomienie o opóźnieniu lub odwołaniu na wybranej stacji — działa tylko dopóki ta karta jest otwarta. Jeśli PLK poda przyczynę (np. „Awaria taboru”), zobaczysz ją pod wpisem alarmu po kliknięciu małego ⓘ." },
        { sel: "#watchStationBtn", title: "Alarm w tle dla tej stacji", text: "👁 Obserwuj w tle — w odróżnieniu od „Alarm opóźnień” powyżej, to działa NAWET przy zamkniętej karcie albo aplikacji: dostaniesz powiadomienie push o opóźnieniu lub odwołaniu na tej stacji, gdziekolwiek będziesz. Wymaga założonego profilu — powiadomienia push mieszkają na serwerze pod Twoim tokenem." },
        { sel: '.bottom-nav button[onclick="toggleBurgerMenu()"]', title: "Dzienniczek podróży", text: "W menu (☰) jest 📓 Dzienniczek — notuje Twoje przejazdy wraz z ewentualnym opóźnieniem." },
        { id: "chat", sel: "#chatAssistantFab", news: "2026-10-27", highlight: true, title: "💬 Zapytaj, jak dojechać (BETA)", text: "Napisz albo powiedz 🎤, skąd i dokąd jedziesz, np. „z Katowic do Gliwic jutro po siedemnastej”. Wolisz klikać? Wybierz „🧭 Krok po kroku” albo wpisz samą stację — zapytam, czy stąd jedziesz, i poprowadzę dalej. Gdy czegoś nie zrozumiem, dopytam, a wyniki otworzę w planerze." },
        { id: "sound", sel: "#alarmSoundButton", news: "2026-10-27", highlight: true, title: "🔊 Prawdziwe Rp1 z Tarnowskich Gór", text: "Alarm brzmi jak syrena lokomotywy — to oryginalny sygnał Rp1 nagrany w Tarnowskich Górach przy ostatnim pociągu do Opola (grudzień 2011). Tym przyciskiem wyłączysz dźwięk; wibracje zostaną." },
        { id: "lang", sel: "#langSwitchBtn", news: "2026-10-27", highlight: true, title: "🌐 6 języków", text: "Aplikacja mówi po polsku, angielsku, niemiecku, czesku, hiszpańsku i ukraińsku. Wybierz język tutaj — zapamiętam go, a z profilem: na wszystkich Twoich urządzeniach." },
        { id: "districts", sel: ".search-box", news: "2026-10-27", newsOnly: true, title: "Szukaj też po dzielnicy", text: "Wpisz samo „Załęże”, „Ligota” albo „Płaszów” — podpowiem pełną nazwę stacji (Katowice Załęże, Kraków Płaszów). Stacje z Twoich miast pokażę najpierw." },
        { id: "watchBoard", sel: "#watchStationBtn", news: "2026-10-27", newsOnly: true, title: "Powiadomienie prowadzi do tablicy", text: "Kliknięcie powiadomienia o opóźnieniu na obserwowanej stacji otwiera od razu tablicę tej stacji." },
        { id: "guard", sel: ".btn-planer", news: "2026-10-29", highlight: true, title: "🛡️ Pilnuj połączenia", text: "Nowość w planerze: przy wyniku kliknij 🛡️ Pilnuj — sprawdzę opóźnienia, ostrzegę powiadomieniem, gdy przesiadka będzie zagrożona, i od razu podam Plan B. Po przyjeździe zapytam, czy zapisać przejazd w dzienniczku." },
        { sel: '.bottom-nav a[href="/profil/"]', title: "Profil i synchronizacja", text: "Załóż tu token — 16 znaków, bez hasła i loginu — żeby zsynchronizować ulubione stacje, pociągi, alarmy i dzienniczek między urządzeniami." }
      ]
    },
    {
      id: "mojePociagi",
      match: function (p) { return p.indexOf("/moje-pociagi") === 0; },
      steps: [
        { sel: "#list", title: "Twoje pociągi", text: "Tu widzisz status każdego śledzonego kursu: opóźnienie, peron/tor i ostatnią potwierdzoną stację. Kliknij kartę, żeby zobaczyć cały bieg." },
        { sel: ".mt-star", title: "Gwiazdka i kolejność", text: "Gwiazdka ★ usuwa pociąg z listy (bez potwierdzenia) — kliknij ponownie taki sam na tablicy, żeby dodać go z powrotem. Strzałkami ▲▼ zmienisz kolejność kart." },
        { sel: "#alertButton", title: "Alarm w tle", text: "Włącz, żeby dostać powiadomienie push o opóźnieniu lub odwołaniu KTÓREGOKOLWIEK ze śledzonych tu pociągów — działa nawet przy zamkniętej aplikacji. Wymaga założonego profilu." },
        { sel: "#addTrainForm", title: "Dodaj pociąg", text: "Dodaj stację, numer i planową godzinę raz — od teraz zawsze zobaczysz go tu z aktualnym statusem." },
        { sel: "#refreshBtn", title: "Odśwież ręcznie", text: "Lista i tak sama się aktualizuje po powrocie po dłuższej przerwie, ale możesz też odświeżyć w każdej chwili." },
        { sel: 'a[href="/dziennik/"]', title: "Dzienniczek podróży", text: "Twoje przejazdy wraz z ewentualnym opóźnieniem — dodajesz je na stronie biegu pociągu." },
        { id: "sound", sel: "#alarmSoundButton", news: "2026-10-27", highlight: true, title: "🔊 Prawdziwe Rp1 z Tarnowskich Gór", text: "Alarm brzmi jak syrena lokomotywy — to oryginalny sygnał Rp1 nagrany w Tarnowskich Górach przy ostatnim pociągu do Opola (grudzień 2011). Tym przyciskiem wyłączysz dźwięk; wibracje zostaną." },
        { sel: 'a[href="/profil/"]', title: "Profil i synchronizacja", text: "Token z profilu zabierze tę listę, alarmy i dzienniczek na każde Twoje urządzenie." }
      ]
    },
    {
      id: "train",
      match: function (p) { return p.indexOf("/train") === 0; },
      steps: [
        { sel: "#mtStarBtn", title: "Dodaj do Moich pociągów", text: "Kliknij gwiazdkę, żeby mieć ten kurs zawsze pod ręką na liście Moich pociągów — z aktualnym statusem, bez ponownego wyszukiwania. Drugie kliknięcie usuwa go z listy." },
        { sel: "#status", title: "Cały bieg pociągu", text: "Cała trasa pociągu stacja po stacji: godziny planowe i rzeczywiste, opóźnienie, peron i tor. Jeśli PLK poda przyczynę opóźnienia (np. „Awaria taboru”), zobaczysz ją w czerwonej notce pod nagłówkiem." },
        { id: "gzm", sel: ".mark-btn.gzm", title: "🚌 Autobusy i tramwaje spod stacji", text: "Przycisk 🚌 przy stacji pokazuje autobusy, tramwaje i trolejbusy ZTM, na które zdążysz po przyjeździe pociągu (z dojściem z peronu). Fioletowe „D” znaczy, że najbliższy przystanek jest dalej niż zwykle — odległość zobaczysz po najechaniu." },
        { sel: ".mark-btns", title: "Dzienniczek podróży", text: "Jedziesz tym pociągiem? Zaznacz 🚏 gdzie wsiadasz i 🏁 gdzie wysiadasz — resztę policzymy. Pływający przycisk zapisu pojawi się u dołu ekranu, gdziekolwiek przewiniesz stronę. Dla kursu, który jeszcze nie dotarł do stacji wysiadania, zamiast zapisu zobaczysz „📋 Dodaj do planu” — to wpis do planu podróży w dzienniczku, nie od razu realny przejazd." }
      ]
    },
    {
      id: "profil",
      match: function (p) { return p.indexOf("/profil") === 0; },
      steps: [
        { sel: "#createPanel", title: "Nowy profil", text: "Jeśli nie masz jeszcze profilu, tu jednym kliknięciem tworzysz nowy token." },
        { sel: "#tokenInput", title: "Masz już token?", text: "Wklej tu token z innego urządzenia, żeby wczytać swoje ulubione stacje, pociągi, alarmy, dzienniczek i ulubione trasy." },
        { sel: "#unlinkBtn", title: "Odepnij urządzenie", text: "Usuwa token TYLKO z tego urządzenia — dane w chmurze zostają i nadal można je wczytać tym samym tokenem gdziekolwiek indziej." }
      ]
    },
    {
      id: "dziennik",
      match: function (p) { return p.indexOf("/dziennik") === 0; },
      steps: [
        { sel: "#tripsToggle", title: "Ulubione trasy", text: "Ustaw raz swoją powtarzalną trasę (np. dom→praca) — wszystko zapisuje się samo w trakcie wpisywania. Potem aplikacja sama zapyta na biegu pociągu, czy zapisać pasujący kurs. Przyciskiem „➕ Dodaj kolejną trasę” dodasz ich dowolnie wiele." },
        { sel: "#planPanel", title: "Plan podróży", text: "Planujesz trasę (np. z przesiadką) i chcesz sprawdzić, czy się spina, zanim wyjedziesz? Zaznacz stacje na biegu każdego pociągu i dodaj „📋 Do planu” — zobaczysz tu wszystkie odcinki naraz. Gdy pociąg faktycznie dojedzie, wróć i kliknij „✅ Potwierdź” (przejazd trafi do wpisów poniżej) albo „❌ Odrzuć”." },
        { id: "guard", sel: "#planPanel", news: "2026-10-29", newsOnly: true, title: "🛡️ Plan jest pilnowany", text: "Przejazdy z planu podróży pilnuję sam: ostrzegę, gdy przesiadka będzie zagrożona, a po przyjeździe zapytam, czy zapisać przejazd. Wyłączysz to w planerze: 📌 Moje → ⚙️ Ustawienia pilnowania." },
        { sel: "#entryList", title: "Zapisane przejazdy", text: "Twoje zapisane, potwierdzone przejazdy, od najnowszych. Możesz je poprawić (🔓) — zmiany też zapisują się same — albo pobrać wszystko jako XLSX." }
      ]
    },
    {
      id: "planer",
      match: function (p) { return p.indexOf("/planer") === 0; },
      steps: [
        { sel: ".station-stack", title: "Planer podróży (beta)", text: "Wpisz skąd i dokąd — znajdzie połączenia bezpośrednie i z przesiadkami (nawet kilkoma) na podstawie rozkładu PLK, dla całej sieci, nie tylko wybranych stacji. Jeszcze testujemy, więc zdarzają się niedoskonałości." },
        { id: "districts", sel: ".station-stack", news: "2026-10-27", newsOnly: true, title: "Szukaj też po dzielnicy", text: "Wpisz samo „Załęże”, „Ligota” albo „Płaszów” — podpowiem pełną nazwę stacji. ↑/↓ i Enter wybierają stację, a Enter w polu od razu szuka połączeń." },
        { id: "badges", sel: ".faster-hint", news: "2026-10-27", title: "⚡ i 🔁 — można szybciej", text: "Migająca plakietka ⚡ przy wyniku znaczy, że inny pociąg bezpośredni dojedzie szybciej, a 🔁 — że szybciej będzie z przesiadką. Kliknij plakietkę, żeby zobaczyć to połączenie." },
        { id: "chat", sel: "#chatAssistantFab", news: "2026-10-27", highlight: true, title: "💬 Zapytaj, jak dojechać (BETA)", text: "Wolisz napisać albo powiedzieć 🎤 całe zdanie? Asystent wypełni ten formularz za Ciebie i od razu pokaże wyniki — albo poprowadzi krok po kroku." },
        { id: "tabs", sel: "#planTabs", news: "2026-10-29", highlight: true, title: "🧭 Wszystko o połączeniu w jednym miejscu", text: "🚆 Pociąg, 🚆🚌 Pociąg + GZM, 🛡️ Pilnowane, 📌 Zapisane i 🕘 Ostatnie — przełączasz jednym kliknięciem. Po przewinięciu pasek zostaje u góry: aktywna zakładka z nazwą, pozostałe jako ikony (nazwa w dymku)." },
        { id: "gzm", sel: "#tabGzm", title: "🚆🚌 Pociąg + GZM — od drzwi do drzwi", text: "Jeden formularz: Skąd, Dokąd, data i godzina. Wpisz stację, przystanek, adres albo 🏠 Dom / 🏢 Praca / 📍 Moja lokalizacja — ułożę podróż pociągiem, autobusem, tramwajem i trolejbusem z dojściem pieszo. ⇅ zamienia kierunek (powrót), a stuknięcie w propozycję pokazuje trasę kursu i gdzie jest teraz pojazd." },
        { id: "mine", sel: "#tabGuard", news: "2026-10-29", highlight: true, title: "🛡️ Pilnowane połączenia", text: "Przy wyniku kliknij 🛡️ Pilnuj, a pilnuję przesiadek: przeliczone godziny, ostrzeżenie push, gdy przesiadka jest zagrożona, i Plan B od stacji przesiadki. Zapisane wyniki są obok, w 📌 Zapisane." },
        { id: "remind", sel: "#tabGuard", title: "⏰ Przypomnienie o wyjściu z domu", text: "W karcie pilnowanego połączenia zaznacz ⏰ — przypomnę 30 i 15 min przed WYJŚCIEM (odjazd minus Twój czas dojścia). Gdy pociąg się spóźnia, przypomnienie przyjdzie później; przy odwołaniu — od razu. Działa też przy zamkniętej aplikacji (powiadomienia muszą być włączone)." },
        { id: "recent", sel: "#tabHistory", news: "2026-10-29", newsOnly: true, title: "🕘 Wyszukiwanie sprzed kilku dni?", text: "Przy wpisie z minionego dnia wybierasz: 🔎 dziś od tej samej godziny (albo jutro, jeśli już minęła) lub 📅 tamten dzień." },
        { sel: "#advPanel", title: "Zaawansowane", text: "Minimalny czas na przesiadkę (domyślnie 3 min), opcja „Tylko bezpośrednie” (bez przesiadek), wymuszenie konkretnej stacji „przez” oraz wykluczanie wybranych przewoźników z wyników." },
        { sel: "#planTabs", title: "Zapisz albo dodaj do dziennika", text: "Każdy wynik możesz 💾 zapisać do późniejszego przejrzenia albo 📋 dodać do planu podróży w dzienniczku — każda noga osobno. Gdy faktycznie pojedziesz, w dzienniczku potwierdzisz rzeczywisty przejazd jednym kliknięciem." }
      ]
    }
  ];

  // Tłumaczenia (i18n.js): każdy krok dostaje klucz tutorial.<strona>.s<nr>
  // ({title, text}); polski tekst w definicji kroku zostaje jako zapas,
  // gdy słownika brak (np. strona bez i18n.js).
  GUIDED_PROFILE_STEPS.forEach(function (s, i) { s.k = "tutorial.guide.s" + i; });
  STEPS_BY_PAGE.forEach(function (p) { var n = 0; p.steps.forEach(function (s) { s.k = "tutorial." + p.id + "." + (s.id || ("s" + n++)); }); });

  // „Co nowego”: kroki z news === NEWS_ID pokazują się SAME raz na wydanie
  // (także osobom z profilem i tym, które samouczek już widziały) —
  // wyróżnione (highlight) na początku, z ⭐. Nowe wydanie: zmień NEWS_ID
  // (najwyżej raz w tygodniu; przy znaczących zmianach — po zgodzie autora).
  const NEWS_ID = "2026-10-29";
  const NEWS_KEY = "tutorialNews:";
  let mode = "full";
  // „Jak to zrobić?” — krótkie samouczki uruchamiane z czatu 💬 (?jak=<temat>).
  // Krok bez elementu na stronie (np. wynik jeszcze nie wyszukany) pokazuje
  // sam dymek na środku ekranu.
  const HOWTO = {
    ulubione: { path: "/", steps: [
      { sel: ".search-box", title: "1. Wybierz stację", text: "Wpisz nazwę stacji i kliknij „Pokaż z API” — zobaczysz tablicę odjazdów." },
      { sel: "#favStar", title: "2. ☆ Ulubiona stacja", text: "Nad tablicą kliknij ☆ — stacja trafi do przycisków na górze strony. Drugie kliknięcie ją usuwa." },
      { sel: ".action-head", title: "3. ★ Ulubiony pociąg", text: "W kolumnie „Dodaj” przy odjeździe kliknij ★ — pociąg trafi do „Moich pociągów” z aktualnym statusem. Gwiazdkę masz też na stronie biegu pociągu." },
      { sel: 'a[href="/moje-pociagi/"]', title: "4. Tu je znajdziesz", text: "Wszystkie ulubione pociągi są w „Moich pociągach”, ulubione stacje — w przyciskach na górze. Z profilem są na każdym Twoim urządzeniu." }
    ] },
    pilnuj: { path: "/planer/", steps: [
      { sel: ".station-stack", title: "1. Skąd i dokąd", text: "Wpisz stację początkową i docelową (możesz też datę i godzinę)." },
      { sel: "#searchBtn", title: "2. Szukaj", text: "Kliknij „Szukaj połączeń” — pojawi się lista wyników." },
      { sel: ".itin-guard", title: "3. 🛡️ Pilnuj", text: "Przy wybranym wyniku kliknij „🛡️ Pilnuj”. Pilnuję opóźnień: ostrzegę powiadomieniem, gdy przesiadka będzie zagrożona, i podam Plan B." },
      { sel: "#tabGuard", title: "4. Pilnowane", text: "Wszystkie pilnowane połączenia są w tej zakładce. Po przyjeździe zapytam, czy zapisać przejazd w dzienniczku." }
    ] }
  };
  function pageDef() { return STEPS_BY_PAGE.find(function (p) { return p.match(location.pathname); }) || null; }
  function newsSeen() { const p = pageDef(); try { return !p || localStorage.getItem(NEWS_KEY + p.id) === NEWS_ID; } catch (e) { return true; } }
  function markNewsSeen() { const p = pageDef(); if (!p) return; try { localStorage.setItem(NEWS_KEY + p.id, NEWS_ID); } catch (e) {} }
  function tr(key, fallback, params) {
    if (!window.I18n) return fallback;
    const v = I18n.t(key, params);
    return v === key ? fallback : v;
  }

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

  function getSteps(m) {
    const page = pageDef();
    if (!page) return [];
    const defs = m === "news"
      ? page.steps.filter(function (s) { return s.news === NEWS_ID; })
          .sort(function (a, b) { return (b.highlight ? 1 : 0) - (a.highlight ? 1 : 0); })
      : page.steps.filter(function (s) { return !s.newsOnly; });
    return defs
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
  let guided = false;

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
      '<button type="button" class="spot-skip" id="spotSkip"></button>' +
      '<div class="spot-nav">' +
      '<button type="button" class="spot-btn spot-btn-back" id="spotBack"></button>' +
      '<button type="button" class="spot-btn spot-btn-next" id="spotNext"></button>' +
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
      else if (e.key === "ArrowRight") {
        const cur = currentSteps[currentIndex];
        if (!(cur && cur.def.waitClick)) tooltipEl.querySelector("#spotNext").click();
      }
      else if (e.key === "ArrowLeft" && currentIndex > 0) goToStep(currentIndex - 1);
    });
    window.addEventListener("resize", function () { if (active) positionAll(); });
    window.addEventListener("scroll", function () { if (active) positionAll(); }, true);
  }

  function positionAll() {
    const step = currentSteps[currentIndex];
    if (!step) return;
    if (!step.el || !isVisible(step.el)) {
      highlightEl.style.display = "none";
      tooltipEl.style.top = Math.max(10, (window.innerHeight - (tooltipEl.offsetHeight || 140)) / 2) + "px";
      tooltipEl.style.left = Math.max(10, (window.innerWidth - (tooltipEl.offsetWidth || 300)) / 2) + "px";
      return;
    }
    highlightEl.style.display = "block";
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
    // Kroki przewodnika mogą wskazywać elementy, które pojawiają się dopiero
    // po poprzednim kroku (np. token po utworzeniu profilu) — szukamy na bieżąco.
    if (!step.el || !isVisible(step.el)) step.el = document.querySelector(step.def.sel);
    if (step.el && isVisible(step.el)) step.el.scrollIntoView({ behavior: "smooth", block: "center" });

    const prog = tr("tutorial.ui.progress", "Krok " + (index + 1) + " z " + currentSteps.length, { n: index + 1, total: currentSteps.length });
    tooltipEl.querySelector("#spotProgress").textContent = mode === "howto" ? tr("tutorial.ui.howto", "Jak to zrobić?") + " · " + prog : mode === "news" ? tr("tutorial.ui.whatsNew", "Co nowego") + " · " + prog : prog;
    tooltipEl.querySelector("#spotTitle").textContent = (mode === "news" && step.def.highlight ? "⭐ " : "") + tr(step.def.k + ".title", step.def.title);
    tooltipEl.querySelector("#spotText").textContent = tr(step.def.k + ".text", step.def.text);
    tooltipEl.querySelector("#spotSkip").textContent = tr("tutorial.ui.skip", "Pomiń");
    tooltipEl.querySelector("#spotBack").textContent = tr("tutorial.ui.back", "Wstecz");
    tooltipEl.querySelector("#spotBack").disabled = index === 0;
    tooltipEl.querySelector("#spotNext").textContent = index === currentSteps.length - 1 ? tr("tutorial.ui.finish", "Zakończ") : tr("tutorial.ui.next", "Dalej");
    tooltipEl.querySelector("#spotBack").style.display = guided ? "none" : "";
    tooltipEl.querySelector("#spotNext").style.display = step.def.waitClick ? "none" : "";
    if (step.def.waitClick) armWaitClick(step, index);

    // Przybliżona pozycja od razu, dokładna po dojechaniu przewijania na miejsce.
    positionAll();
    setTimeout(positionAll, 260);
  }

  // Krok "kliknij podświetlony przycisk": użytkownik klika naprawdę (podświetlenie
  // nie blokuje kliknięć), a my czekamy, aż pojawi się panel aktywnego profilu.
  function waitForVisible(sel, timeoutMs, cb) {
    const t0 = Date.now();
    (function poll() {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return cb(true);
      if (Date.now() - t0 > timeoutMs) return cb(false);
      setTimeout(poll, 150);
    })();
  }

  function armWaitClick(step, index) {
    if (!step.el) return;
    const onClick = function () {
      step.el.removeEventListener("click", onClick, true);
      waitForVisible("#activePanel", 10000, function (ok) {
        if (!active || currentIndex !== index) return;
        if (ok) goToStep(index + 1);
        else armWaitClick(step, index); // np. błąd sieci — czekamy na kolejną próbę
      });
    };
    step.el.addEventListener("click", onClick, true);
  }

  function startGuidedProfile() {
    ensureTourUI();
    guided = true;
    currentSteps = GUIDED_PROFILE_STEPS.map(function (s) {
      return { def: s, el: document.querySelector(s.sel) };
    });
    active = true;
    highlightEl.style.display = "block";
    tooltipEl.style.display = "block";
    goToStep(0);
  }

  function startTour(m) {
    guided = false;
    mode = m === "news" ? "news" : "full";
    const steps = getSteps(mode);
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
    if (guided) {
      guided = false;
      try { localStorage.setItem(GUIDE_KEY, "done"); } catch (e) {}
    }
    if (highlightEl) highlightEl.style.display = "none";
    if (tooltipEl) tooltipEl.style.display = "none";
    // Pełny samouczek też pokazał nowości — nie powtarzamy ich jako „Co nowego”.
    markNewsSeen();
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
    const label = tr("tutorial.ui.show", "Pokaż samouczek");
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.textContent = "🎓";
    btn.addEventListener("click", function () { startTour("full"); });
    document.body.appendChild(btn);
  }

  function maybeAutoShow() {
    // "pokazuj go tylko na stronie bez profilu" — sama obecność aktywnego
    // tokenu wyłącza automatyczne pokazywanie, niezależnie od tego, czy
    // pole tutorialSeen jest ustawione.
    let seen = false;
    try { seen = !!localStorage.getItem(SEEN_KEY); } catch (e) {}
    if (!hasToken() && !seen) { startTour("full"); return true; }
    // Już znasz aplikację (albo masz profil) — pokażemy tylko „Co nowego”.
    if (!newsSeen() && getSteps("news").length) { startTour("news"); return true; }
    return false;
  }

  function startHowTo(topic) {
    const h = HOWTO[topic]; if (!h) return false;
    if (location.pathname !== h.path) { location.href = h.path + "?jak=" + encodeURIComponent(topic); return true; }
    ensureTourUI();
    guided = false; mode = "howto";
    currentSteps = h.steps.map(function (s, i) { s.k = s.k || "tutorial.howto." + topic + ".s" + i; return { def: s, el: document.querySelector(s.sel) }; });
    active = true;
    highlightEl.style.display = "block";
    tooltipEl.style.display = "block";
    goToStep(0);
    return true;
  }
  window.showHowTo = startHowTo;
  window.showTutorial = function () { startTour("full"); };
  window.showWhatsNew = function () { startTour("news"); };

  // Start dopiero po wczytaniu słownika — inaczej pierwszy dymek pokazałby
  // się po polsku nawet przy innym wybranym języku.
  document.addEventListener("DOMContentLoaded", function () {
    (window.I18n ? I18n.ready.catch(function () {}) : Promise.resolve()).then(init);
  });

  function init() {
    injectStyles();
    // Przewodnik po zgodzie na założenie profilu ma pierwszeństwo przed
    // zwykłym samouczkiem.
    let guide = null;
    try { guide = localStorage.getItem(GUIDE_KEY); } catch (e) {}
    if (guide === "pending" && location.pathname.indexOf("/profil") === 0 && !hasToken()) {
      try { localStorage.setItem(GUIDE_KEY, "running"); } catch (e) {}
      startGuidedProfile();
      injectDemoButton(false);
      return;
    }
    if (guide === "pending") {
      try { localStorage.removeItem(GUIDE_KEY); } catch (e) {}
    }
    var jak = null;
    try { jak = new URLSearchParams(location.search).get("jak"); } catch (e) {}
    if (jak && HOWTO[jak]) {
      try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
      setTimeout(function () { startHowTo(jak); }, 400);
      injectDemoButton(false);
      return;
    }
    function proceed() {
      const autoShown = maybeAutoShow();
      injectDemoButton(!autoShown);
    }
    // Na /train nagłówek pociągu (razem z gwiazdką #mtStarBtn) doczytuje się
    // asynchronicznie, już po DOMContentLoaded — gdyby samouczek wystartował
    // od razu, getSteps() po cichu pominąłby ten krok, bo elementu jeszcze
    // by nie było. Czekamy chwilę (z sensownym limitem), zanim policzymy kroki.
    if (location.pathname.indexOf("/train") === 0) {
      waitForVisible("#mtStarBtn", 4000, proceed);
    } else if (document.querySelector('script[src="/chat-assistant.js"]')) {
      waitForVisible("#chatAssistantFab", 3000, function () { setTimeout(proceed, 300); });
    } else if (document.querySelector('script[src="/alarm-sound.js"]')) {
      waitForVisible("#alarmSoundButton", 3000, proceed);
    } else {
      proceed();
    }
  }
})();
