// Asystent wyszukiwania połączeń („💬 Zapytaj”) — wariant bez AI: reguły
// języka polskiego w przeglądarce. Rozumie zdania typu „z Tarnowskich Gór do
// Krakowa jutro o 7 bez Intercity, przez Bytom, 10 minut na przesiadkę”,
// sprawdza stacje w słowniku PLK (data/stations-pl.json, ładowany dopiero po
// otwarciu rozmowy) i — gdy czegoś nie jest pewien — DOPYTUJE zamiast
// zgadywać. Na końcu otwiera planer z wypełnionym formularzem i wynikami.
//
// Rozmowa jest na razie tylko po polsku; elementy okna (przyciski, podpowiedzi)
// tłumaczy i18n.js, a na tekst w innym języku odpowiadamy „Nie rozumiem w
// Twoim języku.” w języku interfejsu.
(function () {
  "use strict";

  function T(k, p) { return window.I18n ? I18n.t(k, p) : k; }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]; }); }

  // ---------- normalizacja i odmiana ----------
  function fold(s) {
    return String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  // Prymitywne „odcięcie końcówki” — wystarcza, by „Tarnowskich Gór” i
  // „Tarnowskie Góry” miały wspólne rdzenie (tarnowsk, gor).
  // Bez „-ów/-owie”: w nazwach miast to zwykle część mianownika (Chorzów,
  // Kraków, Tarnów), a nie końcówka do odcięcia.
  var ENDINGS = ["ami", "ach", "ego", "emu", "iej", "ich", "ych", "ymi", "imi", "om", "ie", "ia", "iu", "ej", "ym", "im", "a", "e", "i", "o", "u", "y"];
  // Nazwy stacji w słowniku są w mianowniku — dla nich obcinamy tylko
  // końcówki mianownika (inaczej „Bytom” tracił „-om” i robił się „byt”).
  var ENDINGS_NOM = ["ie", "ia", "a", "e", "i", "o", "u", "y"];
  function stemWith(w, list) {
    w = fold(w);
    if (/^\d+$/.test(w)) return w;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (w.length - e.length >= 3 && w.slice(-e.length) === e) return w.slice(0, -e.length);
    }
    return w;
  }
  function stem(w) { return stemWith(w, ENDINGS); }
  // Słowo wpisane przez użytkownika może być w dowolnym przypadku (albo w
  // mianowniku) — porównujemy oba warianty rdzenia.
  function queryForms(w) { var a = stemWith(w, ENDINGS), b = stemWith(w, ENDINGS_NOM); return a === b ? [a] : [a, b]; }
  // Rdzenie pasują, gdy są równe albo jeden jest początkiem drugiego, ale
  // różnią się najwyżej o 3 litery — bez tego „Tarnogór” (tarnogor)
  // dopasowywało się „na siłę” do „Tarnów” (tarn).
  function stemsMatch(a, b) {
    if (a === b) return true;
    var n = Math.min(a.length, b.length);
    if (n < 3 || Math.abs(a.length - b.length) > 3) return false;
    return a.indexOf(b) === 0 || b.indexOf(a) === 0;
  }

  // ---------- słownik stacji ----------
  var stations = null, stationsPromise = null;
  function loadStations() {
    if (stations) return Promise.resolve(stations);
    if (!stationsPromise) {
      stationsPromise = fetch("/data/stations-pl.json").then(function (r) { return r.json(); }).then(function (d) {
        stations = (d.stations || []).map(function (s) {
          var words = fold(s[1]).split(" ").filter(Boolean);
          // Drugi wariant rdzenia dla „-iec” (Lubliniec → Lublińca: lublinc).
          var forms = words.map(function (w) { var st = [stemWith(w, ENDINGS_NOM)]; if (/iec$/.test(w)) st.push(w.slice(0, -3) + "c"); return st; });
          return { id: s[0], name: s[1], words: words, stems: forms.map(function (f) { return f[0]; }), forms: forms };
        });
        return stations;
      });
    }
    return stationsPromise;
  }

  // Dopasowanie frazy (w dowolnej odmianie) do stacji. Zwraca:
  // {exact: stacja} — jedna pewna; {options: [..]} — kilka, trzeba dopytać;
  // {none: true} — nic.
  // Dopasowanie frazy (w dowolnej odmianie) do stacji. Pewna („exact”) jest
  // tylko stacja, której KAŻDE słowo nazwy ma w frazie dokładnie ten sam
  // rdzeń — dopasowanie „po początku słowa” wystarcza jedynie do pokazania
  // stacji na liście do wyboru. Zwraca {exact} | {options, more} | {none}.
  function matchStation(phrase) {
    var q = fold(phrase).split(" ").filter(Boolean).map(queryForms);
    if (!q.length || !stations) return { none: true };
    function pre(qf, x) { return qf.some(function (a) { return stemsMatch(a, x); }); }
    function eq(qf, x) { return qf.indexOf(x) >= 0; }
    var hits = [];
    stations.forEach(function (s) {
      var ok = q.every(function (qs) {
        return s.forms.some(function (fs) { return fs.some(function (x) { return pre(qs, x); }); });
      });
      if (!ok) return;
      var eqCovered = s.forms.filter(function (fs) { return q.some(function (qs) { return fs.some(function (x) { return eq(qs, x); }); }); }).length;
      var anyCovered = s.forms.filter(function (fs) { return q.some(function (qs) { return fs.some(function (x) { return pre(qs, x); }); }); }).length;
      var first = q.some(function (qs) { return s.forms[0].some(function (x) { return pre(qs, x); }); });
      hits.push({ s: s, fullEq: eqCovered === s.forms.length, eq: eqCovered, extra: s.forms.length - anyCovered, first: first });
    });
    if (!hits.length) return { none: true };
    var exact = hits.filter(function (h) { return h.fullEq; });
    if (exact.length === 1) return { exact: exact[0].s };
    var pool = hits.slice();
    // Nazwa miasta na początku nazwy stacji („Warszawa Centralna”) ma
    // pierwszeństwo — przymiotnikowe odmiany („Łódź Warszawska”) odpadają,
    // jeśli są takie stacje.
    if (pool.some(function (h) { return h.first; })) pool = pool.filter(function (h) { return h.first; });
    pool.sort(function (a, b) {
      var ma = /glown|centraln/.test(a.s.words.join(" ")) ? 0 : 1, mb = /glown|centraln/.test(b.s.words.join(" ")) ? 0 : 1;
      return (b.fullEq - a.fullEq) || (b.eq - a.eq) || ma - mb || a.extra - b.extra || a.s.name.localeCompare(b.s.name, "pl");
    });
    return { options: pool.slice(0, 6).map(function (h) { return h.s; }), more: pool.length > 6 };
  }

  // Podobne nazwy przy literówce („Tarnogór”) — podobieństwo par liter
  // (Dice). Tylko PODPOWIEDŹ do kliknięcia, nigdy automatyczne dopasowanie.
  function bigrams(x) { var out = {}; for (var i = 0; i < x.length - 1; i++) { var b = x.slice(i, i + 2); out[b] = (out[b] || 0) + 1; } return out; }
  function dice(a, b) {
    var A = bigrams(a), B = bigrams(b), inter = 0, na = 0, nb = 0, k;
    for (k in A) { na += A[k]; if (B[k]) inter += Math.min(A[k], B[k]); }
    for (k in B) nb += B[k];
    return na + nb ? (2 * inter) / (na + nb) : 0;
  }
  function similarStations(phrase, limit) {
    var q = fold(phrase).replace(/ /g, "");
    if (q.length < 3 || !stations) return [];
    return stations.map(function (s) {
      var n = s.words.join("");
      return { s: s, score: Math.max(dice(q, n), dice(q, s.words[0] || "")) };
    }).filter(function (x) { return x.score >= 0.45; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, limit || 6).map(function (x) { return x.s; });
  }
  // Stacje użytkownika (ulubione + ostatnio szukane z tablicy) — do szybkiego wyboru.
  function myStations() {
    var names = [];
    ["plkFavoriteStations", "plkStationHistory"].forEach(function (k) {
      try { var v = JSON.parse(localStorage.getItem(k)); if (Array.isArray(v)) v.forEach(function (n) { if (typeof n === "string" && names.indexOf(n) < 0) names.push(n); }); } catch (e) {}
    });
    if (!stations) return [];
    var byName = {};
    stations.forEach(function (s) { byName[fold(s.name)] = s; });
    return names.map(function (n) { return byName[fold(n)]; }).filter(Boolean).slice(0, 6);
  }
  function stationChips(kind, list, extraLabel) {
    var opts = list.map(function (s) { return { label: s.name, onClick: function () { addMsg(s.name, "user"); st[kind] = s; st.pending = null; next(); } }; });
    opts.push({ label: extraLabel || "✏️ Wpiszę sam", onClick: function () { addMsg(extraLabel || "Wpiszę sam", "user"); st.pending = { kind: kind }; addMsg("Wpisz nazwę stacji.", "bot"); if (inputEl) inputEl.focus(); } });
    addOptions(opts);
  }
  function askStation(kind, question) {
    st.pending = { kind: kind };
    addMsg(question, "bot");
    var mine = myStations().filter(function (s) { return !(st.from && kind === "to" && s.id === st.from.id); });
    if (mine.length) stationChips(kind, mine);
  }
  function askTime(question, withTomorrow) {
    st.pending = { kind: "time" };
    addMsg(question, "bot");
    var opts = [{ label: "Teraz", onClick: function () { addMsg("Teraz", "user"); st.time = null; if (!withTomorrow) st.date = null; st.pending = null; next(); } }];
    ["06:00", "07:00", "08:00", "12:00", "15:00", "16:00", "17:00", "18:00"].forEach(function (t) {
      opts.push({ label: t, onClick: function () { addMsg(t, "user"); st.time = t; st.pending = null; next(); } });
    });
    if (withTomorrow) ["07:00", "16:00"].forEach(function (t) {
      opts.push({ label: "Jutro " + t, onClick: function () { var d = today(); d.setDate(d.getDate() + 1); addMsg("Jutro " + t, "user"); st.date = iso(d); st.time = t; st.pending = null; next(); } });
    });
    opts.push({ label: "✏️ Inna godzina", onClick: function () { addMsg("Inna godzina", "user"); addMsg("Wpisz godzinę, np. „7:45”.", "bot"); if (inputEl) inputEl.focus(); } });
    addOptions(opts);
  }
  function askTransfer(question) {
    st.pending = { kind: "transfer" };
    addMsg(question, "bot");
    addOptions(TRANSFER_OPTIONS.map(function (n) { return { label: n + " min", onClick: function () { addMsg(n + " min", "user"); st.transfer = n; st.pending = null; next(); } }; }));
  }

  // ---------- przewoźnicy ----------
  var CARRIER_ALIASES = [
    [/\b(pkp\s+)?inter\s?city\b|\bic\b|\bintercity\w*/, "IC", "PKP Intercity"],
    [/\bkolej\w*\s+slask\w*|\bks\b/, "KS", "Koleje Śląskie"],
    [/\bpolregio\w*|\bprzewoz\w*\s+regional\w*|\bregio\b/, "PR", "POLREGIO"],
    [/\bregiojet\w*|\brj\b/, "RJ", "RegioJet"],
    [/\bleo\s*express\w*/, "LEO", "LEO Express"],
    [/\bkolej\w*\s+malopolsk\w*|\bkml\b/, "KMŁ", "Koleje Małopolskie"],
    [/\bkolej\w*\s+mazowieck\w*|\bkm\b/, "KM", "Koleje Mazowieckie"],
    [/\bkolej\w*\s+dolnoslask\w*|\bkd\b/, "KD", "Koleje Dolnośląskie"],
    [/\bkolej\w*\s+wielkopolsk\w*|\bkw\b/, "KW", "Koleje Wielkopolskie"],
    [/\blodzk\w*\s+kolej\w*|\blka\b/, "ŁKA", "Łódzka Kolej Aglomeracyjna"],
    [/\barriv\w*/, "AR", "Arriva"],
    [/\bskm\w*\s+trojmiast\w*|\bskmt\b/, "SKMT", "SKM Trójmiasto"],
    [/\bskm\b|\bszybk\w*\s+kolej\w*\s+miejsk\w*/, "SKM", "Szybka Kolej Miejska"],
    [/\bwkd\b|\bwarszawsk\w*\s+kolej\w*\s+dojazdow\w*/, "WKD", "WKD"]
  ];
  function matchCarrier(text) {
    var f = fold(text);
    for (var i = 0; i < CARRIER_ALIASES.length; i++) if (CARRIER_ALIASES[i][0].test(f)) return { code: CARRIER_ALIASES[i][1], name: CARRIER_ALIASES[i][2] };
    return null;
  }

  // ---------- daty i godziny ----------
  var TRANSFER_OPTIONS = [0, 3, 5, 10, 15, 20, 25, 30, 60, 90, 120];
  var WEEKDAYS = [["niedziel"], ["poniedzial"], ["wtor", "wtorek"], ["srod"], ["czwart"], ["piat"], ["sobot"]];
  var MONTHS = ["stycz", "lut", "marc", "kwie", "maj", "czerw", "lip", "sierp", "wrzes", "pazdziernik", "listopad", "grud"];
  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { var d = new Date(); d.setHours(12, 0, 0, 0); return d; }
  function plDate(isoStr) {
    var p = isoStr.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
  }

  // ---------- parser jednej wypowiedzi ----------
  // Zwraca {from, to, via, date, time, transfer, direct, exclude[], vague[]}
  // — tylko to, co faktycznie padło. Frazy stacji jako surowy tekst (do dopasowania).
  var MARKERS = /^(z|ze|od|do|przez|bez|o|około|okolo|ok|po|w|we|jutro|dzis|dzisiaj|pojutrze|rano|wieczorem|wieczor|poludniu|popoludniu|i|oraz|a|tylko|minut|minuty|min|przesiadk\w*|na|jak|chce|chcialbym|chcialabym|jechac|pojechac|dojechac|dostac|sie|pociagiem|prosze|szukam|polaczenia|polaczenie|teraz|zaraz|najblizszym|najblizszy)$/;
  function parse(raw) {
    var r = { exclude: [], vague: [] };
    var text = " " + raw.replace(/[→–—]/g, " - ") + " ";
    var f = " " + fold(raw) + " ";

    // bez przesiadek / tylko bezpośrednie
    if (/ bez przesiad| bezposredni| tylko bezposredn/.test(f)) r.direct = true;
    // czas na przesiadkę
    var tm = f.match(/ (\d{1,3}) ?min\w*(?: na)? przesiad/) || f.match(/ przesiad\w*(?: \w+)?(?: co najmniej| minimum| min)? (\d{1,3}) ?min/);
    if (tm) r.transfer = Number(tm[1]);
    // wykluczeni przewoźnicy: „bez X” (poza „bez przesiadek”)
    var bez = f.split(/ bez /).slice(1);
    bez.forEach(function (chunk) {
      if (/^przesiad/.test(chunk)) return;
      var c = matchCarrier(chunk.split(/ (?:przez|do|z|ze|o|i|oraz|jutro|dzis|dzisiaj)( |$)/)[0]);
      if (c) r.exclude.push(c);
      else r.vague.push({ kind: "carrier", text: chunk.trim().split(" ").slice(0, 3).join(" ") });
    });
    // data
    if (/ (dzis|dzisiaj|teraz|zaraz) /.test(f)) r.date = iso(today());
    if (/ jutro /.test(f)) { var d1 = today(); d1.setDate(d1.getDate() + 1); r.date = iso(d1); }
    if (/ pojutrze /.test(f)) { var d2 = today(); d2.setDate(d2.getDate() + 2); r.date = iso(d2); }
    var wd = f.match(/ we? (niedziel\w*|poniedzial\w*|wtor\w*|srod\w*|czwart\w*|piat\w*|sobot\w*)/);
    if (wd) {
      var idx = WEEKDAYS.findIndex(function (arr) { return arr.some(function (p) { return wd[1].indexOf(p) === 0; }); });
      var d3 = today(); var delta = (idx - d3.getDay() + 7) % 7; d3.setDate(d3.getDate() + delta); r.date = iso(d3);
    }
    // „28.10” / „28.10.2026” — tylko z kropką (dwukropek to godzina) i z sensownym miesiącem
    var dm = raw.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b/);
    if (dm && (+dm[2] < 1 || +dm[2] > 12 || +dm[1] < 1 || +dm[1] > 31)) dm = null;
    if (dm) {
      var y = dm[3] ? +dm[3] : today().getFullYear();
      var dd = new Date(y, +dm[2] - 1, +dm[1], 12);
      if (!dm[3] && dd < today()) dd.setFullYear(y + 1);
      if (dd.getDate() === +dm[1]) r.date = iso(dd);
    }
    var mn = f.match(/ (\d{1,2}) (stycz\w*|lut\w*|marc\w*|kwie\w*|maj\w*|czerw\w*|lip\w*|sierp\w*|wrzes\w*|pazdziernik\w*|listopad\w*|grud\w*)/);
    if (mn) {
      var mi = MONTHS.findIndex(function (p) { return mn[2].indexOf(p) === 0; });
      var y2 = today().getFullYear(); var dd2 = new Date(y2, mi, +mn[1], 12);
      if (dd2 < today()) dd2.setFullYear(y2 + 1);
      r.date = iso(dd2);
    }
    // godzina: „o 7”, „o 7:30”, „od 16”, „po 16”, „7:30”
    var t1 = f.match(/ (?:o|od|po|okolo|ok) (?:godz\w* )?(\d{1,2})(?: (\d{2}))? /) || raw.match(/\b(\d{1,2}):(\d{2})\b/);
    if (t1 && +t1[1] <= 23 && (!t1[2] || +t1[2] <= 59)) r.time = pad(+t1[1]) + ":" + pad(t1[2] ? +t1[2] : 0);
    else if (/ (rano|wieczorem|wieczor|po poludniu|popoludniu|w nocy|przed poludniem) /.test(f)) r.vague.push({ kind: "time" });

    // stacje — frazy po „z/ze/od”, „do”, „przez”
    var tokens = text.replace(/[,;!?]/g, " ").split(/\s+/).filter(Boolean);
    function phraseAfter(markerTest) {
      for (var i = 0; i < tokens.length; i++) {
        if (markerTest(fold(tokens[i]))) {
          var words = [];
          for (var j = i + 1; j < tokens.length && words.length < 5; j++) {
            var w = fold(tokens[j]);
            if (!w || MARKERS.test(w) || /^\d/.test(w) || /^(poniedzial|wtor|srod|czwart|piat|sobot|niedziel)/.test(w)) break;
            words.push(tokens[j]);
          }
          if (words.length) return words.join(" ");
        }
      }
      return null;
    }
    r.from = phraseAfter(function (w) { return w === "z" || w === "ze" || w === "od"; });
    r.to = phraseAfter(function (w) { return w === "do"; });
    r.via = phraseAfter(function (w) { return w === "przez"; });
    // „Tarnowskie Góry - Katowice” bez przyimków
    if (!r.from && !r.to) {
      var m = raw.split(/\s+-\s+|\s*->\s*/);
      if (m.length === 2 && m[0].trim() && m[1].trim()) { r.from = m[0].trim(); r.to = m[1].trim(); }
    }
    return r;
  }

  // Czy to w ogóle polski? Cyrylica albo znaki obce dla polszczyzny, albo
  // typowe słowa innych języków — wtedy odpowiadamy „Nie rozumiem…”.
  function looksForeign(raw) {
    if (/[Ѐ-ӿ]/.test(raw)) return true;
    if (/[řěůťďňäöüßñ¿¡áéíú]/i.test(raw)) return true;
    var f = " " + fold(raw) + " ";
    return / (from|the|please|train|trains|when|to go|von|nach|bitte|zug|und|desde|hasta|para|quiero|tren|vlak|chci|odkud|kam) /.test(f);
  }

  // ---------- stan rozmowy ----------
  var st = null;
  function resetState() {
    st = { from: null, to: null, via: null, date: null, time: null, transfer: null, direct: false, exclude: [],
      pending: null }; // pending: {kind:'from'|'to'|'via', options:[stations]} | {kind:'time'} | {kind:'transfer'} | {kind:'carrier'} | {kind:'viaAsk'}
  }

  // ---------- pamięć rozmowy (to urządzenie + profil) ----------
  // Ustalona trasa/ustawienia i ostatnie wiadomości — po otwarciu asystenta
  // na dowolnym urządzeniu z tym samym profilem rozmowa toczy się dalej
  // (np. „powrót” po wyszukaniu trasy w tamtą stronę).
  var CTX_KEY = "chatContextV1", LOG_MAX = 40, memLog = [], saveTimer = null;
  function slim(stn) { return stn ? { id: stn.id, name: stn.name } : null; }
  function ctxNow() {
    return { savedAt: new Date().toISOString(), log: memLog.slice(-LOG_MAX),
      st: { from: slim(st.from), to: slim(st.to), via: slim(st.via), date: st.date, time: st.time, transfer: st.transfer, direct: st.direct, exclude: st.exclude } };
  }
  function saveCtxSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var c = ctxNow();
      try { localStorage.setItem(CTX_KEY, JSON.stringify(c)); } catch (e) {}
      if (window.ProfileSync && ProfileSync.getToken()) ProfileSync.push({ chatContext: c });
    }, 700);
  }
  function readLocalCtx() { try { return JSON.parse(localStorage.getItem(CTX_KEY)); } catch (e) { return null; } }
  // Nowszy z dwóch: lokalny albo z profilu (inne urządzenie).
  function loadCtx() {
    var local = readLocalCtx();
    if (!(window.ProfileSync && ProfileSync.getToken())) return Promise.resolve(local);
    return ProfileSync.pull().then(function (p) {
      var remote = p && p.chatContext;
      if (!remote) return local;
      if (!local) return remote;
      return (Date.parse(remote.savedAt) || 0) > (Date.parse(local.savedAt) || 0) ? remote : local;
    }).catch(function () { return local; });
  }

  // ---------- UI ----------
  var panel, logEl, inputEl, micBtn, recog = null;
  function injectStyles() {
    if (document.getElementById("chatAssistantStyle")) return;
    var s = document.createElement("style");
    s.id = "chatAssistantStyle";
    s.textContent =
      ".ca-fab{position:fixed;right:14px;bottom:84px;z-index:9990;width:54px;height:54px;border-radius:50%;border:0;background:#0b57d0;color:#fff;font-size:24px;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.45)}" +
      ".ca-fab:hover{background:#084298}" +
      // Wyróżnienie przy wejściu: szeroka, pulsująca chmurka z zachętą.
      ".ca-fab.cta{width:auto;height:auto;padding:12px 18px 12px 14px;border-radius:999px;font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,#0b57d0,#0ea5e9);animation:caPulse 1.8s ease-in-out infinite}" +
      ".ca-fab.cta .ca-fab-ico{font-size:22px;line-height:1}" +
      ".ca-fab .ca-fab-txt{display:none}.ca-fab.cta .ca-fab-txt{display:inline}" +
      "@keyframes caPulse{0%,100%{box-shadow:0 8px 22px rgba(0,0,0,.45),0 0 0 0 rgba(34,211,238,.55)}50%{box-shadow:0 8px 22px rgba(0,0,0,.45),0 0 0 10px rgba(34,211,238,0)}}" +
      "@media(prefers-reduced-motion:reduce){.ca-fab.cta{animation:none}}" +
      ".ca-panel{position:fixed;right:12px;bottom:12px;z-index:100001;width:min(420px,calc(100vw - 24px));height:min(600px,calc(100vh - 24px));background:#1c2833;color:#fff;border:1px solid #0b57d0;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.6);display:none;flex-direction:column;font-family:Arial,sans-serif;overflow:hidden}" +
      ".ca-panel.open{display:flex}" +
      ".ca-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #34495e;font-weight:800}" +
      ".ca-head .ca-x{background:transparent;border:0;color:#b8c3cf;font-size:18px;cursor:pointer}" +
      ".ca-head .ca-clear{margin-left:auto;background:transparent;border:1px solid #48627c;border-radius:999px;color:#b8c3cf;font-size:12px;padding:4px 10px;cursor:pointer}" +
      ".ca-head .ca-clear:hover{color:#fff;border-color:#ff4d4d}" +
      ".ca-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}" +
      ".ca-msg{max-width:88%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap}" +
      ".ca-bot{background:#223244;align-self:flex-start;border-top-left-radius:4px}" +
      ".ca-user{background:#0b57d0;align-self:flex-end;border-top-right-radius:4px}" +
      ".ca-opts{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:100%}" +
      ".ca-opt{border:1px solid #48627c;background:#172433;color:#fff;border-radius:999px;padding:7px 12px;font-size:13px;cursor:pointer}" +
      ".ca-opt:hover{border-color:#22d3ee}.ca-opt.primary{background:#0b57d0;border-color:#0b57d0;font-weight:800}" +
      ".ca-form{display:flex;gap:6px;padding:10px;border-top:1px solid #34495e;align-items:stretch}" +
      ".ca-form input{flex:1;min-width:0;padding:10px 12px;border-radius:10px;border:1px solid #48627c;background:#223244;color:#fff;font-size:15px}" +
      ".ca-form button{border:0;border-radius:10px;padding:0 12px;background:#0b57d0;color:#fff;font-size:16px;cursor:pointer}" +
      ".ca-form button.ca-mic{background:#374151}.ca-form button.ca-mic.on{background:#dc3545}" +
      "@media(max-width:700px){.ca-panel{right:0;bottom:0;width:100vw;height:100dvh;border-radius:0;border:0}}";
    document.head.appendChild(s);
  }

  function addMsg(text, who, noSave) {
    if (!noSave) { memLog.push({ w: who === "user" ? "u" : "b", t: text }); saveCtxSoon(); }
    var d = document.createElement("div");
    d.className = "ca-msg " + (who === "user" ? "ca-user" : "ca-bot");
    d.textContent = text;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function addOptions(list) {
    var box = document.createElement("div");
    box.className = "ca-opts";
    list.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ca-opt" + (o.primary ? " primary" : "");
      b.textContent = o.label;
      b.addEventListener("click", function () { box.remove(); o.onClick(); });
      box.appendChild(b);
    });
    logEl.appendChild(box);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function openPanel() {
    injectStyles();
    try { sessionStorage.setItem("chatFabQuiet", "1"); } catch (e) {}
    var fab = document.getElementById("chatAssistantFab"); if (fab) fab.className = "ca-fab";
    if (!panel) buildPanel();
    panel.classList.add("open");
    if (!logEl.childNodes.length) restoreOrGreet();
    setTimeout(function () { inputEl.focus(); }, 50);
    loadStations().catch(function () {});
  }
  function closePanel() { if (panel) panel.classList.remove("open"); stopMic(); maybeAskProfile(); }

  // Czyszczenie historii — zawsze z potwierdzeniem. Kasuje rozmowę na tym
  // urządzeniu i w profilu.
  function askClear() {
    logEl.querySelectorAll(".ca-opts").forEach(function (b) { b.remove(); });
    addMsg(T("chat.clearConfirm"), "bot", true);
    addOptions([
      { label: "🗑️ " + T("chat.clearYes"), primary: true, onClick: clearHistory },
      { label: T("chat.clearNo"), onClick: function () { addMsg(T("chat.clearKept"), "bot", true); } }
    ]);
  }
  function clearHistory() {
    clearTimeout(saveTimer);
    memLog = [];
    try { localStorage.removeItem(CTX_KEY); } catch (e) {}
    if (window.ProfileSync && ProfileSync.getToken()) ProfileSync.push({ chatContext: null });
    logEl.innerHTML = "";
    resetState();
    addMsg(T("chat.cleared"), "bot", true);
    addMsg(T("chat.greeting"), "bot", true);
  }

  // Zachęta do założenia profilu po skorzystaniu z czatu (rozmowa jest wtedy
  // tylko w tej przeglądarce). Same zasady co reszta zachęt (profile-prompt.js:
  // „Nie teraz” = 30 dni przerwy, po 2 odmowach koniec). Przy przejściu do
  // planera prosimy o nią na kolejnej stronie (sessionStorage).
  var ASK_FLAG = "chatAskProfile";
  function chatUsed() { return memLog.some(function (m) { return m.w === "u"; }); }
  function maybeAskProfile() {
    if (!chatUsed()) return;
    if (window.ProfileSync && ProfileSync.getToken()) return;
    if (window.ProfilePrompt) ProfilePrompt.ask("chat");
  }

  function buildPanel() {
    panel = document.createElement("div");
    panel.className = "ca-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", T("chat.title"));
    panel.innerHTML =
      '<div class="ca-head">💬 <span>' + esc(T("chat.title")) + '</span><button type="button" class="ca-clear" title="' + esc(T("chat.clear")) + '">🗑️ ' + esc(T("chat.clear")) + '</button><button type="button" class="ca-x" aria-label="' + esc(T("chat.close")) + '">✕</button></div>' +
      '<div class="ca-log" aria-live="polite"></div>' +
      '<form class="ca-form"><input type="text" autocomplete="off" placeholder="' + esc(T("chat.placeholder")) + '">' +
      '<button type="button" class="ca-mic" title="' + esc(T("chat.mic")) + '" aria-label="' + esc(T("chat.mic")) + '">🎤</button>' +
      '<button type="submit" title="' + esc(T("chat.send")) + '" aria-label="' + esc(T("chat.send")) + '">➤</button></form>';
    document.body.appendChild(panel);
    logEl = panel.querySelector(".ca-log");
    inputEl = panel.querySelector("input");
    micBtn = panel.querySelector(".ca-mic");
    panel.querySelector(".ca-x").addEventListener("click", closePanel);
    panel.querySelector(".ca-clear").addEventListener("click", askClear);
    panel.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = inputEl.value.trim();
      if (!v) return;
      inputEl.value = "";
      onUser(v);
    });
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) micBtn.style.display = "none";
    else micBtn.addEventListener("click", function () { recog ? stopMic() : startMic(SR); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) closePanel(); });
  }

  function startMic(SR) {
    try {
      recog = new SR();
      recog.lang = "pl-PL";
      recog.interimResults = false;
      recog.maxAlternatives = 1;
      recog.onresult = function (ev) { var t = ev.results[0][0].transcript; stopMic(); if (t) onUser(t); };
      recog.onerror = function () { stopMic(); };
      recog.onend = function () { stopMic(); };
      micBtn.classList.add("on");
      recog.start();
    } catch (e) { stopMic(); }
  }
  function stopMic() { if (recog) { try { recog.stop(); } catch (e) {} } recog = null; if (micBtn) micBtn.classList.remove("on"); }

  function greet() {
    resetState();
    memLog = [];
    addMsg(T("chat.greeting"), "bot");
  }
  function restoreOrGreet() {
    resetState();
    loadCtx().then(function (c) {
      if (!c || !c.st || !Array.isArray(c.log) || !c.log.length) return greet();
      memLog = c.log.slice(-LOG_MAX);
      memLog.forEach(function (m) { addMsg(m.t, m.w === "u" ? "user" : "bot", true); });
      var cs = c.st;
      st.from = cs.from; st.to = cs.to; st.via = cs.via; st.time = cs.time; st.transfer = cs.transfer;
      st.direct = !!cs.direct; st.exclude = Array.isArray(cs.exclude) ? cs.exclude : [];
      st.date = cs.date && cs.date >= iso(today()) ? cs.date : null; // przeszła data nie ma sensu
      if (st.from && st.to) {
        addMsg("Kontynuujemy. Ostatnia trasa: " + st.from.name + " → " + st.to.name + ".", "bot", true);
        addOptions([
          { label: "🔁 Podróż powrotna", primary: true, onClick: function () { addMsg("Podróż powrotna", "user"); returnTrip(null); } },
          { label: "🔎 Szukaj ponownie", onClick: function () { addMsg("Szukaj ponownie", "user"); summary(); } },
          { label: "↺ Nowe wyszukiwanie", onClick: function () { logEl.innerHTML = ""; greet(); } }
        ]);
      }
    });
  }

  // ---------- logika rozmowy ----------
  function onUser(text) {
    // Stare przyciski wyboru (z poprzednich pytań) przestają obowiązywać.
    logEl.querySelectorAll(".ca-opts").forEach(function (b) { b.remove(); });
    addMsg(text, "user");
    loadStations().then(function () { handle(text); }).catch(function () { addMsg("Nie udało się wczytać listy stacji. Spróbuj ponownie za chwilę.", "bot"); });
  }

  // „Powrót” — ta sama trasa w drugą stronę; termin z wypowiedzi albo pytamy.
  var RETURN_RE = / (powrot\w*|z powrotem|wracam|wracamy|wrocic|wroce|wrocimy|droga powrotna) /;
  function returnTrip(text) {
    if (!st.from || !st.to) { addMsg("Najpierw napisz, skąd i dokąd jedziesz — wtedy znajdę też powrót.", "bot"); return; }
    var a = st.from; st.from = st.to; st.to = a;
    var p = text ? parse(text) : { exclude: [], vague: [] };
    if (p.date) st.date = p.date;
    st.time = p.time || null;
    addMsg("Podróż powrotna: " + st.from.name + " → " + st.to.name + ".", "bot");
    if (!st.time) { askTime("Kiedy wracasz? Kliknij albo napisz np. „dziś o 16”, „jutro o 8”.", true); return; }
    next();
  }

  function handle(text) {
    var f = fold(text);
    if (RETURN_RE.test(" " + f + " ")) return returnTrip(text);
    // odpowiedź na pytanie o godzinę
    if (st.pending && st.pending.kind === "time") {
      var pt = parse(" o " + text);
      if (pt.date) st.date = pt.date;
      if (pt.time) { st.time = pt.time; st.pending = null; return next(); }
      var tt = text.match(/(\d{1,2})(?:[:. ](\d{2}))?/);
      if (tt && +tt[1] <= 23) { st.time = pad(+tt[1]) + ":" + pad(tt[2] ? +tt[2] : 0); st.pending = null; return next(); }
    }
    if (st.pending && st.pending.kind === "transfer") {
      var tn = text.match(/(\d{1,3})/);
      if (tn) { return applyTransfer(+tn[1]) && next(); }
    }
    if (st.pending && (st.pending.kind === "from" || st.pending.kind === "to" || st.pending.kind === "via") && !/ (z|ze|od|do|przez) /.test(" " + f + " ")) {
      // użytkownik dopisał samą nazwę stacji w odpowiedzi na pytanie
      return resolveStation(st.pending.kind, text, true) && next();
    }
    if (st.pending && st.pending.kind === "carrier") {
      var c0 = matchCarrier(text);
      if (c0) { addExclude(c0); st.pending = null; return next(); }
      askCarrier("Nie rozpoznałem przewoźnika „" + text + "”. Wybierz z listy albo wpisz inaczej.");
      return;
    }

    var p = parse(text);
    var any = p.from || p.to || p.via || p.date || p.time || p.transfer != null || p.direct || p.exclude.length || p.vague.length;
    if (!any) {
      if (looksForeign(text) || (window.I18n && I18n.getLang() !== "pl")) { addMsg(T("chat.notUnderstood"), "bot"); return; }
      addMsg("Nie zrozumiałem. Napisz np. „z Tarnowskich Gór do Katowic jutro o 7” albo — po wyszukaniu — „powrót o 16”.", "bot");
      if (!st.from) askStation("from", "Albo zacznijmy po kolei: skąd jedziesz?");
      return;
    }
    if (p.date) st.date = p.date;
    if (p.time) st.time = p.time;
    if (p.direct) st.direct = true;
    if (p.transfer != null && !applyTransfer(p.transfer)) return;
    p.exclude.forEach(addExclude);
    var vagueCarrier = p.vague.filter(function (v) { return v.kind === "carrier"; })[0];
    if (vagueCarrier) { askCarrier("Nie rozpoznałem przewoźnika „" + vagueCarrier.text + "”. Którego wykluczyć?"); return; }
    if (p.vague.some(function (v) { return v.kind === "time"; }) && !st.time) { askTime("O której godzinie mniej więcej? Kliknij albo napisz np. „7:30”."); return; }
    if (p.from && !resolveStation("from", p.from)) return;
    if (p.to && !resolveStation("to", p.to)) return;
    if (p.via && !resolveStation("via", p.via)) return;
    next();
  }

  // Przewoźnicy do kliknięcia (zamiast wpisywania nazwy).
  function askCarrier(msg) {
    st.pending = { kind: "carrier" };
    addMsg(msg || "Którego przewoźnika wykluczyć? Kliknij albo wpisz nazwę.", "bot");
    var seen = {};
    var opts = CARRIER_ALIASES.filter(function (a) {
      if (seen[a[1]] || st.exclude.some(function (x) { return x.code === a[1]; })) return false;
      seen[a[1]] = true; return true;
    }).map(function (a) {
      var c = { code: a[1], name: a[2] };
      return { label: c.name, onClick: function () { addMsg(c.name, "user"); addExclude(c); st.pending = null; next(); } };
    });
    opts.push({ label: "✏️ Inny — wpiszę", onClick: function () { addMsg("Inny", "user"); addMsg("Wpisz nazwę przewoźnika.", "bot"); if (inputEl) inputEl.focus(); } });
    addOptions(opts);
  }

  function applyTransfer(n) {
    if (TRANSFER_OPTIONS.indexOf(n) < 0) {
      askTransfer("Czas na przesiadkę mogę ustawić tylko na jedną z tych wartości — wybierz:");
      return false;
    }
    st.transfer = n; st.pending = null; return true;
  }
  function addExclude(c) { if (!st.exclude.some(function (x) { return x.code === c.code; })) st.exclude.push(c); }

  var KIND_LABEL = { from: "skąd jedziesz", to: "dokąd jedziesz", via: "przez którą stację" };
  // Zwraca true, gdy stacja ustalona; false, gdy trzeba dopytać (pytanie już zadane).
  function resolveStation(kind, phrase, fromAnswer) {
    // odpowiedź może być numerem opcji albo dokładną nazwą z listy
    if (fromAnswer && st.pending && st.pending.options) {
      var pick = st.pending.options.filter(function (o) { return fold(o.name) === fold(phrase); })[0];
      if (pick) { st[kind] = pick; st.pending = null; return true; }
    }
    var m = matchStation(phrase);
    if (m.exact) { st[kind] = m.exact; st.pending = null; return true; }
    if (m.options) {
      st.pending = { kind: kind, options: m.options };
      addMsg("„" + phrase + "” — którą stację masz na myśli" + (kind === "via" ? " (przez)" : kind === "from" ? " (skąd)" : " (dokąd)") + "?" + (m.more ? " Jeśli nie ma jej na liście, wpisz pełniejszą nazwę." : ""), "bot");
      var opts = m.options.map(function (s) { return { label: s.name, onClick: function () { addMsg(s.name, "user"); st[kind] = s; st.pending = null; next(); } }; });
      opts.push({ label: "✏️ Żadne z powyższych — wpiszę jeszcze raz", onClick: function () {
        addMsg("Żadne z powyższych", "user");
        st.pending = { kind: kind };
        addMsg("Wpisz jeszcze raz, " + KIND_LABEL[kind] + " — możliwie pełną nazwą stacji, np. „Kraków Płaszów”.", "bot");
        if (inputEl) inputEl.focus();
      } });
      addOptions(opts);
      return false;
    }
    st.pending = { kind: kind };
    var sim = similarStations(phrase, 6);
    if (sim.length) {
      addMsg("Nie znalazłem stacji „" + phrase + "”. Czy chodziło o którąś z tych?", "bot");
      stationChips(kind, sim, "✏️ Żadna — wpiszę jeszcze raz");
    } else {
      addMsg("Nie znalazłem stacji „" + phrase + "”. Napisz, " + KIND_LABEL[kind] + " — pełną nazwą stacji, np. „Tarnowskie Góry”.", "bot");
    }
    return false;
  }

  function next() {
    if (!st.from) { askStation("from", "Skąd jedziesz? Kliknij albo wpisz nazwę stacji."); return; }
    if (!st.to) { askStation("to", "Dokąd jedziesz? Kliknij albo wpisz nazwę stacji."); return; }
    if (st.from.id === st.to.id) { st.to = null; askStation("to", "Stacja docelowa jest taka sama jak początkowa. Dokąd jedziesz?"); return; }
    summary();
  }

  function summary() {
    st.pending = null;
    var date = st.date || iso(today());
    var when = (st.date ? plDate(date) : "dziś") + ", " + (st.time ? "od " + st.time : "od teraz");
    var lines = ["🚆 " + st.from.name + " → " + st.to.name, "📅 " + when];
    if (st.via) lines.push("🔀 przez " + st.via.name);
    if (st.direct) lines.push("🚫 tylko bezpośrednie");
    if (st.exclude.length) lines.push("🚫 bez: " + st.exclude.map(function (c) { return c.name; }).join(", "));
    if (st.transfer != null) lines.push("⏱️ " + st.transfer + " min na przesiadkę");
    addMsg(lines.join("\n") + "\n\nSzukać? Możesz też coś dodać, np. „przez Bytom”, „10 minut na przesiadkę”, „o 8” albo kliknąć poniżej.", "bot");
    addOptions([
      { label: "🔎 Szukaj", primary: true, onClick: go },
      { label: "🔀 Przez stację", onClick: function () { askStation("via", "Przez którą stację? Kliknij albo wpisz nazwę."); } },
      { label: "🚫 Wyklucz przewoźnika", onClick: function () { askCarrier(); } },
      { label: "⏱️ Czas na przesiadkę", onClick: function () { askTransfer("Ile minut na przesiadkę?"); } },
      { label: "🔁 Podróż powrotna", onClick: function () { addMsg("Podróż powrotna", "user"); returnTrip(null); } },
      { label: "↺ Od nowa", onClick: function () { logEl.innerHTML = ""; greet(); } }
    ]);
  }

  function go() {
    var q = new URLSearchParams();
    q.set("from", st.from.name); q.set("fromId", st.from.id);
    q.set("to", st.to.name); q.set("toId", st.to.id);
    if (st.date) q.set("date", st.date);
    if (st.time) q.set("time", st.time);
    if (st.via) { q.set("via", st.via.name); q.set("viaId", st.via.id); }
    if (st.exclude.length) q.set("exclude", st.exclude.map(function (c) { return c.code; }).join(","));
    if (st.transfer != null) q.set("transfer", String(st.transfer));
    if (st.direct) q.set("direct", "1");
    q.set("auto", "1");
    addMsg("Otwieram planer z wynikami…", "bot");
    if (!(window.ProfileSync && ProfileSync.getToken())) { try { sessionStorage.setItem(ASK_FLAG, "1"); } catch (e) {} }
    location.href = "/planer/?" + q.toString();
  }

  // ---------- przycisk ----------
  function injectButton() {
    if (document.getElementById("chatAssistantFab")) return;
    injectStyles();
    var b = document.createElement("button");
    b.type = "button";
    b.id = "chatAssistantFab";
    var label = function () { return T("chat.open"); };
    // Na wejściu wyróżniona chmurka z zachętą; gdy pasażer sam zacznie
    // klikać po serwisie — zwijamy do zwykłej ikony (do końca tej wizyty).
    var QUIET_KEY = "chatFabQuiet";
    var quiet = false;
    try { quiet = sessionStorage.getItem(QUIET_KEY) === "1"; } catch (e) {}
    // Zawartość budujemy raz, a wygaszenie to tylko zmiana klasy — podmiana
    // innerHTML w trakcie kliknięcia gubiła cel i czat się nie otwierał.
    b.innerHTML = '<span class="ca-fab-ico">💬</span><span class="ca-fab-txt"></span>';
    function render() {
      b.className = quiet ? "ca-fab" : "ca-fab cta";
      b.querySelector(".ca-fab-txt").textContent = T("chat.cta");
      b.title = label(); b.setAttribute("aria-label", label());
    }
    function goQuiet(e) {
      if (quiet) return;
      // Kliknięcie w samą chmurkę otwiera czat — to nie jest „samodzielne klikanie po serwisie”.
      if (e && e.target && b.contains(e.target)) return;
      quiet = true;
      try { sessionStorage.setItem(QUIET_KEY, "1"); } catch (e) {}
      render();
      document.removeEventListener("pointerdown", goQuiet, true);
      document.removeEventListener("keydown", goQuiet, true);
    }
    if (!quiet) {
      document.addEventListener("pointerdown", goQuiet, true);
      document.addEventListener("keydown", goQuiet, true);
    }
    render();
    b.addEventListener("click", openPanel);
    window.addEventListener("langchange", function () { render(); if (panel) { panel.remove(); panel = null; } });
    document.body.appendChild(b);
  }
  function start() {
    (window.I18n ? I18n.ready : Promise.resolve()).then(function () {
      injectButton();
      var pending = false;
      try { pending = sessionStorage.getItem(ASK_FLAG) === "1"; sessionStorage.removeItem(ASK_FLAG); } catch (e) {}
      if (pending && window.ProfilePrompt && !(window.ProfileSync && ProfileSync.getToken())) setTimeout(function () { ProfilePrompt.ask("chat"); }, 1500);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.ChatAssistant = { open: openPanel, _state: function () { return st; }, _parse: parse, _matchStation: matchStation, _loadStations: loadStations };
})();
