// ===== TODO 119 (27.11): odchudzona strona główna — NAKŁADKA na dotychczasową stronę.
// Działa tylko, gdy <html> ma klasę „home-v2” (na razie profil autora — ustawiana w <head> index.html razem z „show-version”).
// Bez tej klasy nic się nie zmienia: stare elementy zostają w kodzie i działają jak dotąd; nakładka je tylko chowa
// i dokłada nowe. Po udostępnieniu wszystkim i kilku dniach — porządek: stare elementy do usunięcia.
(function () {
  "use strict";
  var H = document.documentElement;
  if (!H.classList.contains("home-v2")) return;

  function T(k, p, def) {
    try { if (window.I18n && I18n.t) { var v = I18n.t(k, p); if (v && v !== k) return v; } } catch (e) {}
    return String(def || k).replace(/\{(\w+)\}/g, function (m, x) { return p && p[x] != null ? p[x] : m; });
  }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---------- style ----------
  var css =
    // nagłówek: samo „Czy zdążę?”, podpis i wersja w stopce
    "html.home-v2 h1 .version-badge{display:none}" +
    // stare dwa rzędy stacji — schowane (dalej się odświeżają, z nich budujemy nowy rząd)
    "html.home-v2 #stationButtons,html.home-v2 #suggestions{display:none!important}" +
    ".v2-st{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 14px}" +
    ".v2-c{display:inline-flex;border-radius:10px;overflow:hidden;background:#0b57d0}" +
    ".v2-c button{border:0;color:#fff;font:inherit;font-weight:700;cursor:pointer}" +
    ".v2-c .n{background:#0b57d0;padding:10px 14px;font-size:15px}.v2-c .n:hover{background:#084298}" +
    ".v2-c .x{background:#09449f;color:#cfe0ff;padding:10px;font-size:13px;border-left:1px solid rgba(255,255,255,.2)}.v2-c .x:hover{background:#073a87}" +
    ".v2-more{border:1px dashed #4b6584;background:none;color:#9fb0c2;border-radius:10px;padding:9px 12px;font:inherit;font-size:14px;cursor:pointer}" +
    // przyciski przy polu stacji: „Pokaż odjazdy” + mały „PLK ↗”
    "html.home-v2 .search-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px}html.home-v2 .search-actions .btn-api{order:1}html.home-v2 .search-actions .btn-official{order:2}html.home-v2 .search-actions #alertButton{order:3}html.home-v2 .search-actions #alertButton~*{order:4}" +
    // 27.11 (prośba): mniejsze „Pokaż odjazdy” i „Alarm”
    "html.home-v2 .v2-hint{display:none!important}" +
    "html.home-v2 .search-actions .v2-when{order:1;margin:0;display:inline-flex;align-items:center;gap:4px;font-size:12px}" +
    "html.home-v2 .search-actions .btn-api{font-size:12px!important;padding:6px 10px!important;min-width:0!important}" +
    "html.home-v2 #alertButton{font-size:13px!important;padding:7px 11px!important;min-width:0!important}html.home-v2 #alertButton~*{padding:6px 9px!important;min-width:0!important}html.home-v2 .search-actions .btn-official{min-width:0!important}" +
    "html.home-v2 .btn-official{background:none!important;color:#8fb8f5!important;text-decoration:underline;padding:8px 6px!important;font-weight:700}" +
    // data i godzina zwinięte
    "html.home-v2 #dateInput,html.home-v2 #timeInput{display:none}html.home-v2.v2-dt #dateInput,html.home-v2.v2-dt #timeInput{display:inline-block}" +
    ".v2-when{color:#9fb0c2;font-size:13px;margin:8px 0 10px}.v2-when b{color:#fff}.v2-when button{background:none;border:0;color:#8fb8f5;text-decoration:underline;font:inherit;font-size:13px;cursor:pointer;padding:4px}" +
    // alarm i dźwięk — razem
    "html.home-v2 #alertButton{border-radius:10px 0 0 10px;margin-right:0}html.home-v2 #alertButton+button{border-radius:0 10px 10px 0;margin-left:-1px}" +
    // „Ostatnio oglądany” mniejszy
    "html.home-v2 #lastTrainLink a,html.home-v2 #lastTrainLink button{font-size:12.5px!important;padding:5px 10px!important;font-weight:600!important}" +
    // tablica: link do wyświetlacza PLK tej stacji
    ".v2-plk{background:none;border:0;color:#8fb8f5;font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;margin-left:auto;padding:4px 6px}" +
    // rzeczy techniczne — tylko profil autora (gdy nakładka trafi do wszystkich)
    "html.home-v2:not(.show-version) .api-limits-toggle,html.home-v2:not(.show-version) #apiLimits{display:none!important}" +
    "html.home-v2:not(.show-version) #healthBox .btn-small{display:none!important}" +
    // stopka z podpisem
    ".v2-foot{color:#6b7c8f;font-size:12px;text-align:center;margin:18px 0 6px}.v2-foot .version-badge{margin:0;font-size:12px;color:inherit;font-weight:400}" +
    ".v2-when .v2-cal{background:none!important;border:0!important;text-decoration:none!important;font-size:20px!important;padding:2px 6px!important;cursor:pointer;line-height:1}" +
    // telefon: czat jako sama ikonka
    // telefon (notatka 27.11 11:14): przyciski pod polem stacji w JEDNYM wierszu — szerokie „Pokaż odjazdy”, małe „PLK ↗”, alarm i 🔊
    "@media (max-width:600px){html.home-v2 .search-actions{display:flex!important;flex-wrap:nowrap!important;gap:6px!important;align-items:center}" +
    "html.home-v2 .search-actions>*{width:auto!important;flex:0 0 auto;white-space:nowrap!important;margin:0!important}html.home-v2 .search-actions .btn-api{flex:0 0 auto!important;padding:8px 10px!important}html.home-v2 .search-actions{justify-content:center!important}" +
    "html.home-v2 .search-actions .btn-official{padding:6px 2px!important;font-size:12px!important}html.home-v2 #alertButton{padding:9px 8px!important;font-size:12px!important}}" +
    "@media (max-width:600px){html.home-v2 .ca-fab.cta .ca-fab-txt,html.home-v2 .ca-fab.cta .ca-beta{display:none}html.home-v2 .ca-fab.cta{padding:12px 14px}.v2-c .n{font-size:13px;padding:8px 10px}.v2-c .x{padding:8px 7px;font-size:12px}}";
  var st = document.createElement("style"); st.id = "home-v2-css"; st.textContent = css; document.head.appendChild(st);

  // ---------- napisy: inne klucze tłumaczeń (bez „API”) ----------
  var KEYS = { "index.header": "index.v2.header", "index.btnApi": "index.v2.btnApi", "index.btnOfficial": "index.v2.btnOfficial",
    "index.apiPanelTitle": "index.v2.title", "index.apiPanelTitleWithStation": "index.v2.titleSt", "index.apiMetaHint": "index.v2.metaHint" };
  function rekey() {
    Object.keys(KEYS).forEach(function (k) { document.querySelectorAll('[data-i18n="' + k + '"]').forEach(function (el) { el.setAttribute("data-i18n", KEYS[k]); }); });
    var t = document.getElementById("apiPanelTitle"); if (t && !t.getAttribute("data-i18n")) t.setAttribute("data-i18n", "index.v2.title");
  }
  // wywołania I18n.t z kodu strony (tytuł tablicy, podpowiedź) — przez nowe klucze
  function wrapT() {
    if (!window.I18n || I18n._v2) return;
    var t0 = I18n.t; I18n._v2 = true;
    I18n.t = function (k, p) { var nk = KEYS[k]; if (nk) { var v = t0(nk, p); if (v && v !== nk) return v; } return t0(k, p); };
  }
  wrapT(); rekey();

  // ---------- jeden rząd stacji ----------
  var favEl = document.getElementById("stationButtons"), sugEl = document.getElementById("suggestions"), row = null, open = false;
  var MAX = 2;   // 27.11 (prośba): na wierzchu tylko dwie stacje, reszta pod „▾ więcej”
  function nameOf(btn, fn) {
    var m = (btn.getAttribute("onclick") || "").match(new RegExp(fn + "\\('((?:\\\\.|[^'])*)'\\)"));
    return m ? m[1].replace(/\\(.)/g, "$1") : (btn.textContent || "").replace(/[🔔⭐★]/g, "").trim();
  }
  function collect() {
    var out = [], seen = {};
    var add = function (name, html) { var k = String(name).toLowerCase(); if (!name || seen[k]) return; seen[k] = 1; out.push({ name: name, html: html }); };
    // 27.11 (prośba): na wierzchu dwie OSTATNIO oglądane stacje — najpierw historia (od najnowszej), potem ulubione
    if (sugEl) sugEl.querySelectorAll("button").forEach(function (b) { add(nameOf(b, "chooseStation"), b.innerHTML); });
    if (favEl) favEl.querySelectorAll("button").forEach(function (b) { add(nameOf(b, "openStation"), b.innerHTML); });
    return out;
  }
  function render() {
    if (!row) return;
    var list = collect(), shown = open ? list : list.slice(0, MAX);
    row.innerHTML = shown.map(function (s, i) {
      return '<span class="v2-c"><button type="button" class="n" data-i="' + i + '">' + s.html + '</button><button type="button" class="x" data-x="' + i + '" title="' + esc(T("index.v2.plkTitle", null, "Wyświetlacz stacyjny PLK")) + '">PLK ↗</button></span>';
    }).join("") + (list.length > MAX ? '<button type="button" class="v2-more">' + esc(open ? T("index.v2.less", null, "▴ mniej") : T("index.v2.more", { n: list.length - MAX }, "▾ więcej ({n})")) + "</button>" : "");
    row._list = shown;
  }
  function buildRow() {
    if (!favEl) return;
    row = document.createElement("div"); row.className = "v2-st"; row.id = "v2Stations";
    favEl.parentNode.insertBefore(row, favEl);
    row.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.classList.contains("v2-more")) { open = !open; render(); return; }
      var s = row._list[+(b.getAttribute("data-i") || b.getAttribute("data-x"))]; if (!s) return;
      if (b.hasAttribute("data-x")) { if (typeof openStation === "function") openStation(s.name); }        // jak dotąd górny rząd: wyświetlacz PLK
      else if (typeof chooseStation === "function") chooseStation(s.name);                                   // jak dotąd dolny rząd: nasza tablica
    });
    var mo = new MutationObserver(render);
    if (favEl) mo.observe(favEl, { childList: true, subtree: true, characterData: true });
    if (sugEl) mo.observe(sugEl, { childList: true, subtree: true, characterData: true });
    render();
  }

  // ---------- data i godzina: „od teraz · 📅 inna data / godzina” ----------
  function buildWhen() {
    var d = document.getElementById("dateInput"), t = document.getElementById("timeInput"), box = document.querySelector(".search-box");
    if (!d || !t || !box) return;
    // 27.11 (prośba): ikonka 📅 tuż po prawej od „Pokaż odjazdy” (w rzędzie przycisków)
    var w = document.createElement("span"); w.className = "v2-when"; w.id = "v2When";
    var api = box.querySelector(".search-actions .btn-api");
    if (api) api.parentNode.insertBefore(w, api.nextSibling); else box.parentNode.insertBefore(w, box.nextSibling);
    var touched = false;
    var paint = function () {
      // 27.11 (prośba): bez „od teraz” — sama ikonka 📅 (rozwija datę i godzinę); po zmianie obok mała data i godzina
      var lbl = touched && (d.value || t.value) ? T("index.v2.from", { d: (d.value || "").split("-").reverse().slice(0, 2).join("."), t: t.value || "" }, "od {d} {t}") : "";
      var tip = H.classList.contains("v2-dt") ? T("index.v2.hideDt", null, "▴ schowaj datę i godzinę") : T("index.v2.otherDt", null, "📅 inna data / godzina");
      w.innerHTML = '<button type="button" class="v2-cal" title="' + esc(tip) + '" aria-label="' + esc(tip) + '">📅</button>' + (lbl ? " <b>" + esc(lbl) + "</b>" : "");
    };
    w.addEventListener("click", function (e) { if (e.target.closest("button")) { H.classList.toggle("v2-dt"); paint(); } });
    [d, t].forEach(function (el) { el.addEventListener("change", function () { touched = true; paint(); }); });
    paint();
    window.addEventListener("langchange", paint);
  }

  // ---------- 27.11 (prośba): bez podpowiedzi „Wybierz stację albo wpisz nazwę…” (nad tablicą i w tablicy) ----------
  // Chowamy tylko, gdy element pokazuje właśnie tę podpowiedź — komunikaty („Szukam tablicy…”, błędy) zostają.
  function hideHints() {
    var st = document.getElementById("status"), meta = document.getElementById("apiMeta");
    var hints = function () { return [T("index.defaultStatus", null, "Wybierz stację albo wpisz nazwę."), T("index.v2.metaHint", null, ""), T("index.apiMetaHint", null, "")].map(function (x) { return String(x || "").trim(); }).filter(Boolean); };
    var check = function (el) { if (!el) return; var tx = (el.textContent || "").trim(); el.classList.toggle("v2-hint", !tx || hints().indexOf(tx) >= 0); };
    [st, meta].forEach(function (el) { if (!el) return; check(el); new MutationObserver(function () { check(el); }).observe(el, { childList: true, characterData: true, subtree: true }); });
  }

  // ---------- tablica: link do wyświetlacza PLK tej stacji ----------
  function buildBoardLink() {
    var hd = document.querySelector(".api-panel-header"), title = document.getElementById("apiPanelTitle");
    if (!hd || !title) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "v2-plk"; b.style.display = "none";
    hd.appendChild(b);
    var paint = function () {
      var s = typeof lastLoadedStation !== "undefined" && lastLoadedStation ? lastLoadedStation : "";
      b.style.display = s ? "" : "none";
      b.textContent = T("index.v2.plkDisplay", null, "📺 Wyświetlacz PLK ↗");
      b.title = s;
    };
    b.addEventListener("click", function () { var s = typeof lastLoadedStation !== "undefined" ? lastLoadedStation : ""; if (s && typeof openStation === "function") openStation(s); });
    new MutationObserver(paint).observe(title, { childList: true, characterData: true, subtree: true });
    paint();
  }

  // ---------- stopka z podpisem i wersją ----------
  function buildFoot() {
    var c = document.querySelector(".container"); if (!c) return;
    var v = document.querySelector("h1 .version-badge"), f = document.createElement("div"); f.className = "v2-foot";
    // numer wersji w klasie „version-badge” — strona chowa go wszystkim poza profilem autora (jak w nagłówku)
    f.innerHTML = "Czy zdążę? · " + esc(T("index.v2.credit", null, "Claude Code i RafStaK")) + (v ? '<span class="version-badge v2-ver"> · ' + esc(v.textContent.trim()) + "</span>" : "");
    c.appendChild(f);
  }

  function init() {
    buildRow(); buildWhen(); buildBoardLink(); buildFoot(); hideHints();
    var again = function () { wrapT(); rekey(); if (window.I18n && I18n.applyDom) I18n.applyDom(document); render(); };
    if (window.I18n && I18n.ready && I18n.ready.then) I18n.ready.then(again); else again();
    window.addEventListener("langchange", function () { rekey(); render(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
