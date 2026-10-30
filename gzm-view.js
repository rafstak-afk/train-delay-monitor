// Widok „🚌 Przesiadki GZM” (zakładka w planerze). Wymaga gzm-core.js.
//   var v = GzmView.mount(element, { stationId, arr: "HH:MM", date, train: {number, scheduleId, orderId, station} });
//   v.start() — pokazany: odświeżanie na żywo co 25 s, licznik co 5 s
//   v.stop()  — ukryty: bez odpytywania
//   v.open({ stationId, arr, date, train }) — nowa przesiadka (np. z karty pociągu)
// Dane: /api/gzm-data/index.json + stations/<id>.json (raz na godzinę),
// opóźnienia GZM: /api/gzm-rt, pociąg: /api/train-details (co 60 s).
(function () {
  "use strict";
  var C = window.GzmCore;
  var CSS =
    '.gz .gz-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin:8px 0}' +
    '.gz .gz-bar label{font-size:12px;color:var(--muted);display:block;margin-bottom:3px}' +
    '.gz .gz-bar select,.gz .gz-bar input{width:auto;min-width:0;padding:9px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:#fff;font-size:15px;font-family:inherit}' +
    '.gz .gz-st{flex:1 1 180px}.gz .gz-st select{width:100%}' +
    '.gz .gz-head{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:10px 0}' +
    '.gz .gz-head b{font-size:15px}.gz .gz-sub{color:var(--muted);font-size:12.5px;margin-top:3px;line-height:1.45}' +
    '.gz .gz-live{font-size:12px;margin-top:4px}.gz .gz-live.on{color:var(--green)}.gz .gz-live.off{color:var(--yellow)}' +
    '.gz .gz-btn{border:0;border-radius:10px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer;font-family:inherit;padding:8px 12px;font-size:13px}' +
    '.gz .gz-btn.sec{background:var(--grey)}' +
    '.gz h3{font-size:14px;margin:14px 2px 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}' +
    '.gz .gz-dep{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:4px 10px;align-items:center;background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--grey);border-radius:12px;padding:9px 11px;margin:6px 0;transition:transform .25s,opacity .25s}' +
    '.gz .gz-dep.ok{border-left-color:var(--green)}.gz .gz-dep.tight{border-left-color:var(--yellow);box-shadow:0 0 0 1px rgba(255,204,0,.35)}' +
    '.gz .gz-dep.missed{opacity:.5}.gz .gz-dep.cancelled{opacity:.6}.gz .gz-dep.cancelled .gz-t{text-decoration:line-through}' +
    '.gz .gz-dep.flash{animation:gzFlash 1.4s ease-out}@keyframes gzFlash{0%{box-shadow:0 0 0 3px #ffd400}100%{box-shadow:none}}' +
    '.gz .gz-line{font-weight:900;font-size:16px;text-align:center;border-radius:8px;padding:5px 2px;background:#2b3e52}' +
    '.gz .gz-line.tram{background:#7a1f2b}.gz .gz-line.trolley{background:#1f5a3a}.gz .gz-line small{display:block;font-size:10px;font-weight:700;opacity:.85}' +
    '.gz .gz-main{min-width:0}.gz .gz-dir{font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.gz .gz-stop{color:var(--muted);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.gz .gz-right{text-align:right;white-space:nowrap}.gz .gz-t{font-weight:900;font-size:16px}.gz .gz-in{font-size:12px;color:var(--muted)}' +
    '.gz .gz-st-ok{color:var(--green)}.gz .gz-st-tight{color:var(--yellow)}.gz .gz-st-missed{color:var(--red)}' +
    '.gz .plan-strike{text-decoration:line-through;color:var(--muted);font-weight:400;font-size:13px}' +
    '.gz .gz-fav{border:0;background:none;color:#ffd400;font-size:18px;cursor:pointer;padding:0 2px}' +
    '.gz .gz-group{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 10px;margin:6px 0}' +
    '.gz .gz-group-h{display:flex;align-items:center;gap:8px}.gz .gz-group-h .gz-line{min-width:46px}' +
    '.gz .gz-group-times{font-size:13px;margin-top:5px;color:var(--muted)}.gz .gz-group-times b{color:#fff}' +
    '.gz .gz-chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}' +
    '.gz .gz-chip{border:1px solid var(--line);background:var(--card);color:#fff;border-radius:16px;padding:6px 10px;font-size:12.5px;cursor:pointer}' +
    '.gz .gz-chip.on{border-color:var(--blue);background:#173055}' +
    '.gz .gz-warn{background:rgba(255,204,0,.08);border:1px solid rgba(255,204,0,.5);color:#ffe27a;border-radius:12px;padding:9px 12px;font-size:13px;margin:8px 0}' +
    '.gz .gz-empty{color:var(--muted);text-align:center;padding:18px 8px;font-size:14px;line-height:1.5}' +
    '.gz .gz-lic{color:var(--muted);font-size:11.5px;margin:16px 2px 4px;line-height:1.5}.gz .gz-lic a{color:var(--cyan)}' +
    '@media (prefers-reduced-motion:reduce){.gz .gz-dep{transition:none}.gz .gz-dep.flash{animation:none}}';

  var LS = "gzmViewV1", FAV = "gzmFavLinesV1", DEST = "gzmDestV1";
  function normName(x) { return String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").trim(); }
  function T(k, p, fb) { if (window.I18n) { var v = I18n.t(k, p); if (v !== k) return v; } return fb != null ? fb.replace(/\{(\w+)\}/g, function (_, n) { return p && p[n] != null ? p[n] : ""; }) : k; }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function warsawNow() {
    var p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
    var g = function (t) { return (p.find(function (x) { return x.type === t; }) || {}).value; };
    return { date: g("year") + "-" + g("month") + "-" + g("day"), min: (+g("hour") % 24) * 60 + +g("minute") + (+g("second")) / 60 };
  }
  function nowOn(date) { var n = warsawNow(); var dd = Math.round((Date.parse(n.date) - Date.parse(date)) / 86400000); return n.min + dd * 1440; }
  var TYPE_ICON = { bus: "🚌", tram: "🚋", trolley: "🚎" };

  function mount(root, opts) {
    opts = opts || {};
    if (!document.getElementById("gzm-view-css")) { var s = document.createElement("style"); s.id = "gzm-view-css"; s.textContent = CSS; document.head.appendChild(s); }
    root.classList.add("gz");
    var st = load(LS, { windowMin: 60, mode: "line", types: [], onlyFavs: true });
    var favs = load(FAV, {});
    var dests = load(DEST, {});   // stacja → wpisany cel (nazwa albo fragment, np. „AWF”)
    var index = null, file = null, rt = null, rtAt = 0, rtOk = false, train = null, trainInfo = null;
    var cfg = { stationId: opts.stationId || st.stationId || null, arr: opts.arr || null, date: opts.date || null, train: opts.train || null, alighted: false };
    var shown = false, tRt = null, tTick = null, tTrain = null, showMore = 0, lastOrder = "";

    function dataUrl(p) { return "/api/gzm-data/" + p; }
    function getIndex() {
      if (index) return Promise.resolve(index);
      return fetch(dataUrl("index.json")).then(function (r) { if (!r.ok) throw new Error("index " + r.status); return r.json(); }).then(function (j) { index = j; return j; });
    }
    function getStation(id) {
      if (file && file.id === +id) return Promise.resolve(file);
      return fetch(dataUrl("stations/" + id + ".json")).then(function (r) { if (!r.ok) throw new Error("brak danych stacji"); return r.json(); }).then(function (j) { file = j; return j; });
    }
    function getRt() {
      return fetch("/api/gzm-rt", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
        rtOk = !!(j && j.ok && j.age != null && j.age < 120); rt = rtOk ? j : null; rtAt = Date.now();
      }).catch(function () { rtOk = false; rt = null; });
    }
    // Pociąg: planowy przyjazd + opóźnienie na stacji wysiadki, peron.
    function getTrain() {
      var t = cfg.train; if (!t || !t.orderId) return Promise.resolve();
      var q = new URLSearchParams({ scheduleId: t.scheduleId || "", orderId: t.orderId, operatingDate: cfg.date || warsawNow().date, train: t.number || "" });
      return fetch("/api/train-details?" + q, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || !file || !window.GuardCore) return;
        // ta sama logika co strażnik przesiadek: potwierdzone → prognoza PLK → bieżące opóźnienie
        var r = GuardCore.readLeg({ board: { stationName: t.from || file.name, time: "" }, alight: { stationName: file.name, time: cfg.arr || "" } }, d);
        if (r.noData) return;
        trainInfo = { plan: C.hm(r.plannedArr), delay: Number(r.delayArr) || 0, platform: r.platformArr || null, arrived: r.arrived, source: r.arrSource };
      }).catch(function () {});
    }

    function arrMin() {
      if (trainInfo && trainInfo.plan != null) return trainInfo.plan + trainInfo.delay;
      return cfg.arr ? C.hm(cfg.arr) : nowOn(cfg.date || warsawNow().date);
    }

    function stationOptions() {
      var list = (index.stations || []).filter(function (s) { return s.s && s.s.length; }).sort(function (a, b) { return a.n.localeCompare(b.n, "pl"); });
      return '<option value="">' + esc(T("gzm.pickStation", null, "Wybierz stację…")) + "</option>" + list.map(function (s) { return '<option value="' + s.id + '"' + (+cfg.stationId === s.id ? " selected" : "") + ">" + esc(s.n) + "</option>"; }).join("");
    }

    function shell() {
      var n = warsawNow();
      root.innerHTML =
        '<div class="gz-bar">' +
        '<div class="gz-st"><label for="gzSt">' + esc(T("gzm.station", null, "Stacja wysiadki")) + '</label><select id="gzSt">' + stationOptions() + "</select></div>" +
        '<div><label for="gzArr">' + esc(T("gzm.arrival", null, "Przyjazd")) + '</label><input id="gzArr" type="time" value="' + esc(cfg.arr || C.fmt(n.min)) + '"></div>' +
        '<div class="gz-st"><label for="gzDest">' + esc(T("gzm.dest", null, "Dokąd (przystanek GZM, opcjonalnie)")) + '</label><input id="gzDest" list="gzDestList" autocomplete="off" placeholder="' + esc(T("gzm.destPh", null, "np. AWF")) + '" style="width:100%"><datalist id="gzDestList"></datalist></div>' +
        '<div><label for="gzWin">' + esc(T("gzm.window", null, "Pokaż")) + '</label><select id="gzWin"><option value="30">30 min</option><option value="60">60 min</option><option value="120">120 min</option></select></div>' +
        "</div>" +
        '<div id="gzBody"></div>' +
        '<div class="gz-lic">' + esc(T("gzm.license", null, "Źródło danych rozkładowych: ZTM GZM (CC BY 4.0)")) + ' — <a href="' + esc(index.dataset || "#") + '" target="_blank" rel="noopener">' + esc(T("gzm.dataset", null, "zbiór danych")) + "</a>. " + esc(T("gzm.walkNote", null, "Czas dojścia z peronu wg mapy OpenStreetMap (© OpenStreetMap contributors).")) + "</div>";
      root.querySelector("#gzWin").value = String(st.windowMin);
      root.querySelector("#gzSt").addEventListener("change", function () { cfg.stationId = this.value; cfg.train = null; trainInfo = null; st.stationId = this.value; save(LS, st); showMore = 0; load1(); });
      root.querySelector("#gzArr").addEventListener("change", function () { cfg.arr = this.value; cfg.train = null; trainInfo = null; cfg.alighted = false; render(); });
      root.querySelector("#gzWin").addEventListener("change", function () { st.windowMin = +this.value; save(LS, st); render(); });
      root.querySelector("#gzDest").addEventListener("change", function () { dests[cfg.stationId] = this.value.trim(); save(DEST, dests); showMore = 0; render(); });
      root.addEventListener("click", onClick);
      root.addEventListener("input", function (e) { if (e.target.id === "gzQ") { st.q = e.target.value; render(true); } });
    }

    function load1() {
      var body = root.querySelector("#gzBody");
      if (!cfg.stationId) { body.innerHTML = '<div class="gz-empty">' + esc(T("gzm.intro", null, "Wybierz stację, na której wysiadasz, i godzinę przyjazdu — pokażę autobusy i tramwaje GZM, na które zdążysz dojść z peronu.")) + "</div>"; return; }
      var meta = (index.stations || []).find(function (s) { return s.id === +cfg.stationId; });
      if (meta && !meta.s.length) { body.innerHTML = '<div class="gz-empty">' + esc(T("gzm.noStops", null, "Brak przystanków GZM w pobliżu tej stacji.")) + "</div>"; return; }
      body.innerHTML = '<div class="gz-empty">' + esc(T("gzm.loading", null, "Wczytuję rozkład…")) + "</div>";
      getStation(cfg.stationId).then(function () {
        var dl = root.querySelector("#gzDestList"), di = root.querySelector("#gzDest");
        if (dl) dl.innerHTML = C.destinations(file).map(function (n) { return '<option value="' + esc(n) + '">'; }).join("");
        if (di) di.value = dests[cfg.stationId] || "";
        return Promise.all([getRt(), getTrain()]);
      }).then(function () { render(); }).catch(function (e) {
        body.innerHTML = '<div class="gz-empty">' + esc(T("gzm.noData", null, "Nie udało się wczytać rozkładu GZM dla tej stacji.")) + "</div>";
      });
    }

    function depHtml(x, cls, noFav) {
      var d = x.dep, inMin = Math.round(x.real - nowOn(cfg.date || warsawNow().date));
      var tTxt = (x.live && x.delay) ? '<span class="plan-strike">' + C.fmt(d.min) + "</span> " + C.fmt(x.real) : C.fmt(x.real);
      var stTxt = x.status === "ok" ? "🟢 " + T("gzm.st.ok", null, "zdążysz") : x.status === "tight" ? "🟡 " + T("gzm.st.tight", null, "na styk") : x.status === "cancelled" ? "⚫ " + T("gzm.st.cancelled", null, "odwołany") : "🔴 " + T("gzm.st.missed", null, "nie zdążysz");
      var liveTxt = x.live ? (x.delay ? (x.delay > 0 ? "+" : "") + x.delay + " min, " + T("gzm.live", null, "na żywo") : T("gzm.onTimeLive", null, "punktualnie, na żywo")) : T("gzm.sched", null, "wg rozkładu");
      var key = C.favKey(d), isF = (favs[cfg.stationId] || []).indexOf(key) >= 0;
      return '<div class="gz-dep ' + x.status + (cls || "") + '" data-k="' + esc(d.trip + "|" + d.stopIdx) + '">' +
        '<div class="gz-line ' + d.type + '">' + esc(d.line) + "<small>" + TYPE_ICON[d.type] + "</small></div>" +
        '<div class="gz-main"><div class="gz-dir">→ ' + esc(d.head) + ' ' + (noFav ? "" : '<button type="button" class="gz-fav" data-fav="' + esc(key) + '" title="' + esc(T("gzm.favTitle", null, "Ulubiona linia w tym kierunku na tej stacji")) + '">' + (isF ? "★" : "☆") + "</button>") + "</div>" +
        '<div class="gz-stop">' + esc(d.stop.n) + " · 🚶 " + esc(x.walk.exact ? x.walk.min : (d.stop.w[0] === d.stop.w[1] ? d.stop.w[1] : d.stop.w[0] + "–" + d.stop.w[1])) + " min" + (d.stop.stairs ? " 🪜" : "") + " · " + esc(liveTxt) + "</div>" +
        (x.arrDest != null ? '<div class="gz-stop" style="color:#fff">🏁 ' + esc(T("gzm.arrDest", { t: C.fmt(x.arrDest), n: x.destName, m: x.travel }, "{t} {n} (jazda {m} min)")) + "</div>" : "") +        "</div>" +
        '<div class="gz-right"><div class="gz-t">' + tTxt + '</div><div class="gz-in">' + (inMin > 180 || inMin < -1 ? "" : inMin <= 0 ? esc(T("gzm.now", null, "teraz")) : esc(T("gzm.inMin", { n: inMin }, "za {n} min"))) + '</div><div class="gz-in gz-st-' + x.status + '">' + esc(stTxt) + "</div></div></div>";
    }

    function render(keepFocus) {
      var body = root.querySelector("#gzBody"); if (!body || !file) return;
      var date = cfg.date || warsawNow().date, now = nowOn(date);
      if (cfg.alighted && cfg._alightedAt == null) cfg._alightedAt = now;
      var arr = cfg.alighted ? cfg._alightedAt : arrMin();
      var myFavs = favs[cfg.stationId] || [];
      var types = new Set(st.types || []);
      var destTxt = dests[cfg.stationId] || "", destNames = null;
      if (destTxt) {
        var exact = (file.ds || []).filter(function (n) { return normName(n) === normName(destTxt); });
        destNames = exact.length ? exact : (file.ds || []).filter(function (n) { return normName(n).indexOf(normName(destTxt)) >= 0; });
      }
      var r = C.compute({ dest: destNames && destNames.length ? destNames : (destTxt ? ["\u0000brak"] : null), file: file, date: date, arrMin: arr, nowMin: now, platform: trainInfo && trainInfo.platform, rt: rt, favs: myFavs, onlyFavs: st.onlyFavs && myFavs.length > 0, windowMin: st.windowMin, types: types, q: st.q });
      var age = (Date.now() - Date.parse(file.generated)) / 86400000;
      var warn = "";
      if (destTxt && (!destNames || !destNames.length)) warn += '<div class="gz-warn">' + esc(T("gzm.destNone", { d: destTxt }, "Z tej stacji nic nie dojeżdża bez przesiadki do „{d}”.")) + "</div>";
      if (age > 3) warn += '<div class="gz-warn">⚠️ ' + esc(T("gzm.stale", { d: Math.floor(age) }, "Rozkład GZM ma {d} dni — może być nieaktualny.")) + "</div>";
      if (!file.days[date]) warn += '<div class="gz-warn">⚠️ ' + esc(T("gzm.outOfRange", null, "Ten dzień jest poza zakresem pobranego rozkładu GZM.")) + "</div>";
      var head = '<div class="gz-head"><b>🚉 ' + esc(file.name) + "</b>" +
        '<div class="gz-sub">' + (trainInfo ? esc(T("gzm.trainArr", { plan: C.fmt(trainInfo.plan), real: C.fmt(trainInfo.plan + trainInfo.delay), d: trainInfo.delay }, "Pociąg: przyjazd {plan}" + (trainInfo.delay ? " → {real} (+{d} min)" : ""))) + (trainInfo.platform ? " · " + esc(T("gzm.platform", { p: trainInfo.platform }, "peron {p}")) : "") + " · " : "") +
        esc(cfg.alighted || arr <= now ? T("gzm.fromNow", null, "liczę od teraz + dojście z peronu") : T("gzm.fromArr", { t: C.fmt(arr) }, "liczę od przyjazdu {t} + dojście z peronu")) + "</div>" +
        '<div class="gz-live ' + (rtOk ? "on" : "off") + '">' + (rtOk ? "● " + esc(T("gzm.liveOn", null, "na żywo")) : "○ " + esc(T("gzm.liveOff", null, "dane na żywo niedostępne, pokazuję rozkład"))) + "</div>" +
        (!cfg.alighted && arr > now - 1 && arr - now < 120 ? '<div style="margin-top:8px"><button type="button" class="gz-btn" data-act="alight">🚶 ' + esc(T("gzm.alighted", null, "Już wysiadłem")) + "</button></div>" : "") +
        "</div>";
      // 5 propozycji (+ „pokaż kolejne 5”)
      var n = 5 + showMore * 5, top = r.catchable.slice(0, n);
      var order = top.map(function (x) { return x.dep.trip + "|" + x.dep.stopIdx; }).join(",");
      var flashKey = lastOrder && top[0] && lastOrder.split(",")[0] !== order.split(",")[0] ? order.split(",")[0] : null;
      lastOrder = order;
      var favNote = destNames && destNames.length ? '<div class="gz-sub" style="margin:4px 2px">🏁 ' + esc(T("gzm.destOn", { d: destNames.join(", ") }, "Kursy, które dowiozą do: {d} — według godziny dojazdu.")) + "</div>" : myFavs.length ? '<div class="gz-chips"><button type="button" class="gz-chip' + (st.onlyFavs ? " on" : "") + '" data-act="onlyFavs">★ ' + esc(T("gzm.onlyFavs", { n: myFavs.length }, "tylko ulubione ({n})")) + '</button><button type="button" class="gz-chip' + (!st.onlyFavs ? " on" : "") + '" data-act="allDeps">' + esc(T("gzm.allDeps", null, "wszystkie odjazdy")) + "</button></div>" : '<div class="gz-sub" style="margin:4px 2px">' + esc(T("gzm.favHint", null, "☆ przy odjeździe oznacza ulubioną linię w danym kierunku — wtedy propozycje pokażą tylko je.")) + "</div>";
      var props = "<h3>" + esc(T("gzm.proposals", null, "Zdążysz na")) + "</h3>" + favNote +
        (top.length ? top.map(function (x) { return depHtml(x, x.dep.trip + "|" + x.dep.stopIdx === flashKey ? " flash" : ""); }).join("") : '<div class="gz-empty">' + esc(T("gzm.none", null, "Brak odjazdów, na które zdążysz w tym oknie.")) + "</div>") +
        (r.catchable.length > n ? '<button type="button" class="gz-btn sec" data-act="more">' + esc(T("gzm.more", null, "Pokaż kolejne 5")) + "</button>" : "") +
        (r.missed.length ? "<h3>" + esc(T("gzm.missed", null, "Uciekły")) + "</h3>" + r.missed.map(function (x) { return depHtml(x); }).join("") : "");
      // pełna lista: filtry + grupowanie
      var typesHtml = ["bus", "tram", "trolley"].map(function (t) { return '<button type="button" class="gz-chip' + (types.has(t) ? " on" : "") + '" data-type="' + t + '">' + TYPE_ICON[t] + " " + esc(T("gzm.type." + t, null, { bus: "autobus", tram: "tramwaj", trolley: "trolejbus" }[t])) + "</button>"; }).join("");
      var all;
      if (st.mode === "line") {
        all = C.groupByLine(r.items, 3).map(function (g) {
          return '<div class="gz-group"><div class="gz-group-h"><div class="gz-line ' + g.type + '">' + esc(g.line) + "<small>" + TYPE_ICON[g.type] + '</small></div><div class="gz-dir">→ ' + esc(g.head) + "</div></div>" +
            '<div class="gz-group-times">' + g.items.map(function (x) { return "<b>" + C.fmt(x.real) + "</b> " + (x.status === "tight" ? "🟡" : "🟢") + " " + esc(x.dep.stop.n.replace(file.name.split(" ")[0] + " ", "")); }).join(" · ") + "</div></div>";
        }).join("");
      } else {
        all = r.items.filter(function (x) { return x.status !== "missed"; }).map(function (x) { return depHtml(x); }).join("");
      }
      var full = "<h3>" + esc(T("gzm.allTitle", { m: st.windowMin }, "Wszystkie odjazdy ({m} min)")) + "</h3>" +
        '<div class="gz-chips">' + typesHtml + '<button type="button" class="gz-chip' + (st.mode === "line" ? " on" : "") + '" data-act="modeLine">' + esc(T("gzm.byLine", null, "po liniach")) + '</button><button type="button" class="gz-chip' + (st.mode === "time" ? " on" : "") + '" data-act="modeTime">' + esc(T("gzm.byTime", null, "chronologicznie")) + "</button></div>" +
        '<input id="gzQ" class="gz-q" placeholder="' + esc(T("gzm.search", null, "Szukaj linii albo kierunku…")) + '" value="' + esc(st.q || "") + '" style="width:100%;padding:9px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:#fff;font-size:15px;margin:4px 0 6px">' +
        (all || '<div class="gz-empty">' + esc(T("gzm.noneAll", null, "Brak odjazdów w tym oknie.")) + "</div>");
      var scrollY = window.scrollY;
      body.innerHTML = warn + head + props + full;
      if (keepFocus) { var q = root.querySelector("#gzQ"); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
      if (Math.abs(window.scrollY - scrollY) > 2) window.scrollTo(0, scrollY);
    }

    function onClick(e) {
      var b = e.target.closest("button"); if (!b || !root.contains(b)) return;
      if (b.dataset.fav) {
        var list = favs[cfg.stationId] = favs[cfg.stationId] || [], i = list.indexOf(b.dataset.fav);
        if (i >= 0) list.splice(i, 1); else list.push(b.dataset.fav);
        save(FAV, favs); render(); return;
      }
      if (b.dataset.type) { var ts = st.types || []; var j = ts.indexOf(b.dataset.type); if (j >= 0) ts.splice(j, 1); else ts.push(b.dataset.type); st.types = ts; save(LS, st); render(); return; }
      var a = b.dataset.act;
      if (a === "alight") { cfg.alighted = true; cfg._alightedAt = null; render(); }
      else if (a === "more") { showMore++; render(); }
      else if (a === "onlyFavs") { st.onlyFavs = true; save(LS, st); render(); }
      else if (a === "allDeps") { st.onlyFavs = false; save(LS, st); render(); }
      else if (a === "modeLine") { st.mode = "line"; save(LS, st); render(); }
      else if (a === "modeTime") { st.mode = "time"; save(LS, st); render(); }
    }

    function schedule() {
      clearTimeout(tRt); clearInterval(tTick); clearTimeout(tTrain);
      if (!shown || document.visibilityState !== "visible") return;
      tTick = setInterval(function () { if (st.dir === "B") renderB(); else if (st.dir === "C") renderC(); else render(); }, 5000);
      (function rtLoop() { tRt = setTimeout(function () { getRt().then(function () { render(); rtLoop(); }); }, 25000); })();
      if (st.dir === "C") (function tcLoop() { tTrain = setTimeout(function () { trainLiveC().then(tcLoop); }, 60000); })();
      else if (cfg.train) (function trLoop() { tTrain = setTimeout(function () { getTrain().then(function () { render(); trLoop(); }); }, 60000); })();
    }
    document.addEventListener("visibilitychange", function () { if (shown && document.visibilityState === "visible" && file) { getRt().then(function () { render(); }); } schedule(); });

    // ===== Tryb B: przystanek GZM → pociąg =====
    var feeders = null, bState = null;
    function getFeeders() {
      if (feeders) return Promise.resolve(feeders);
      return fetch(dataUrl("feeders.json")).then(function (r) { if (!r.ok) throw new Error("feeders"); return r.json(); }).then(function (j) { feeders = j.stops || {}; return feeders; });
    }
    var arrFiles = {};
    function getArr(id) {
      if (arrFiles[id]) return Promise.resolve(arrFiles[id]);
      return fetch(dataUrl("stations/" + id + "-arr.json")).then(function (r) { if (!r.ok) throw new Error("arr"); return r.json(); }).then(function (j) { arrFiles[id] = j; return j; });
    }
    function initModes() {
      var tg = document.createElement("div"); tg.className = "gz-chips"; tg.id = "gzModes";
      tg.innerHTML = '<button type="button" class="gz-chip" data-mode="A">🚆 → 🚌 ' + esc(T("gzm.modeA", null, "Wysiadam z pociągu")) + '</button><button type="button" class="gz-chip" data-mode="B">🚌 → 🚆 ' + esc(T("gzm.modeB", null, "Jadę na pociąg")) + "</button>" +
        '<button type="button" class="gz-chip" data-mode="C">🧭 ' + esc(T("gzm.modeC", null, "Cała podróż")) + "</button>";
      var a = document.createElement("div"); a.id = "gzA";
      var lic = root.querySelector(".gz-lic");
      while (root.firstChild && root.firstChild !== lic) a.appendChild(root.firstChild);
      var b = document.createElement("div"); b.id = "gzB"; b.hidden = true;
      var n = warsawNow();
      b.innerHTML = '<div class="gz-bar">' +
        '<div class="gz-st"><label for="gzFrom">' + esc(T("gzm.bFrom", null, "Skąd (przystanek GZM)")) + '</label><input id="gzFrom" list="gzFromList" autocomplete="off" placeholder="' + esc(T("gzm.bFromPh", null, "np. AWF")) + '" style="width:100%"><datalist id="gzFromList"></datalist></div>' +
        '<div class="gz-st"><label for="gzTo">' + esc(T("gzm.bTo", null, "Dokąd (stacja kolejowa)")) + '</label><input id="gzTo" list="gzToList" autocomplete="off" placeholder="' + esc(T("gzm.bToPh", null, "np. Tarnowskie Góry")) + '" style="width:100%"><datalist id="gzToList"></datalist></div>' +
        '<div><label for="gzFromT">' + esc(T("gzm.bTime", null, "Wyjście")) + '</label><input id="gzFromT" type="time" value="' + C.fmt(n.min) + '"></div>' +
        '<div><button type="button" class="gz-btn" id="gzGo" style="padding:10px 14px">🔎 ' + esc(T("gzm.bGo", null, "Szukaj")) + "</button></div></div>" +
        '<div id="gzBRes"></div>';
      var c = document.createElement("div"); c.id = "gzC"; c.hidden = true;
      c.innerHTML = '<div class="gz-bar">' +
        '<div class="gz-st"><label for="gzCFrom">' + esc(T("gzm.cFrom", null, "Skąd (przystanek GZM albo stacja)")) + '</label><input id="gzCFrom" list="gzCList" autocomplete="off" placeholder="' + esc(T("gzm.cFromPh", null, "np. AWF")) + '" style="width:100%"></div>' +
        '<div class="gz-st"><label for="gzCTo">' + esc(T("gzm.cTo", null, "Dokąd (przystanek GZM albo stacja)")) + '</label><input id="gzCTo" list="gzCList" autocomplete="off" placeholder="' + esc(T("gzm.cToPh", null, "np. Tarnowskie Góry Plac Zembali")) + '" style="width:100%"></div>' +
        '<datalist id="gzCList"></datalist>' +
        '<div><label for="gzCTime">' + esc(T("gzm.bTime", null, "Wyjście")) + '</label><input id="gzCTime" type="time" value="' + C.fmt(n.min) + '"></div>' +
        '<div><button type="button" class="gz-btn" id="gzCGo" style="padding:10px 14px">🔎 ' + esc(T("gzm.bGo", null, "Szukaj")) + "</button></div></div>" +
        '<div id="gzCRes"></div>';
      root.insertBefore(tg, lic); root.insertBefore(a, lic); root.insertBefore(b, lic); root.insertBefore(c, lic);
      c.querySelector("#gzCFrom").value = st.cFrom || ""; c.querySelector("#gzCTo").value = st.cTo || "";
      c.querySelector("#gzCGo").addEventListener("click", searchC);
      ["#gzCFrom", "#gzCTo"].forEach(function (q) { c.querySelector(q).addEventListener("keydown", function (e) { if (e.key === "Enter") searchC(); }); });
      c.addEventListener("click", function (e) {
        var g = e.target.closest("[data-guard]"); if (g) { guardTrip(g); return; }
        var mo = e.target.closest("[data-cmore]"); if (mo && cState) { cState.more[mo.dataset.cmore] = (cState.more[mo.dataset.cmore] || 0) + 1; renderC(); return; }
        var fv = e.target.closest("[data-fav]"); if (fv) e.stopPropagation();
      });
      var fi = b.querySelector("#gzFrom"), ti = b.querySelector("#gzTo");
      fi.value = st.bFrom || ""; ti.value = st.bTo || "";
      b.querySelector("#gzToList").innerHTML = (index.stations || []).map(function (x) { return '<option value="' + esc(x.n) + '">'; }).join("");
      tg.addEventListener("click", function (e) { var m = e.target.closest("[data-mode]"); if (m) setMode(m.dataset.mode); });
      b.querySelector("#gzGo").addEventListener("click", searchB);
      [fi, ti].forEach(function (el) { el.addEventListener("keydown", function (e) { if (e.key === "Enter") searchB(); }); });
      setMode(st.dir || "A");
    }
    function setMode(m) {
      st.dir = m; save(LS, st);
      root.querySelectorAll("#gzModes [data-mode]").forEach(function (x) { x.classList.toggle("on", x.dataset.mode === m); });
      var A = root.querySelector("#gzA"), B = root.querySelector("#gzB"), Cc = root.querySelector("#gzC"); if (A) A.hidden = m !== "A"; if (B) B.hidden = m !== "B"; if (Cc) Cc.hidden = m !== "C";
      if (m === "C") Promise.all([getFeeders(), getEgress()]).then(function (r) {
        var dl = root.querySelector("#gzCList"); if (!dl || dl.childElementCount) return;
        var all = new Set(Object.keys(r[0]).concat(Object.keys(r[1])));
        (index.stations || []).forEach(function (x) { all.add(x.n); });
        dl.innerHTML = Array.from(all).sort(function (x, y) { return x.localeCompare(y, "pl"); }).map(function (k) { return '<option value="' + esc(k) + '">'; }).join("");
      }).catch(function () {});
      if (m === "B") getFeeders().then(function (fz) {
        var dl = root.querySelector("#gzFromList");
        if (dl && !dl.childElementCount) dl.innerHTML = Object.keys(fz).sort(function (x, y) { return x.localeCompare(y, "pl"); }).map(function (k) { return '<option value="' + esc(k) + '">'; }).join("");
      }).catch(function () {});
    }
    function searchB() {
      var res = root.querySelector("#gzBRes"), from = root.querySelector("#gzFrom").value.trim(), to = root.querySelector("#gzTo").value.trim();
      var tmin = C.hm(root.querySelector("#gzFromT").value) || Math.floor(warsawNow().min);
      st.bFrom = from; st.bTo = to; save(LS, st);
      if (!from || !to) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.bNeed", null, "Wpisz przystanek startowy i stację docelową.")) + "</div>"; return; }
      res.innerHTML = '<div class="gz-empty">' + esc(T("gzm.bSearching", null, "Szukam przejazdu i pociągów…")) + "</div>";
      getFeeders().then(function (fz) {
        var names = Object.keys(fz).filter(function (k) { return normName(k) === normName(from); });
        if (!names.length) names = Object.keys(fz).filter(function (k) { return normName(k).indexOf(normName(from)) >= 0; });
        if (!names.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.bNoFrom", { d: from }, "Nie znam przystanku „{d}” albo z niego nic nie dojeżdża pod stację kolejową.")) + "</div>"; return; }
        // stacje przesiadkowe: najkrótsza jazda z przystanku, najwyżej 2 (= najwyżej 2 zapytania do PLK)
        var cand = new Map();
        names.forEach(function (n) { (fz[n] || []).forEach(function (e) { if (!cand.has(e[0]) || cand.get(e[0]) > e[1]) cand.set(e[0], e[1]); }); });
        var toN = normName(to);
        var ids = Array.from(cand.entries()).sort(function (x, y) { return x[1] - y[1]; }).map(function (e) { return e[0]; })
          .filter(function (id) { var sx = index.stations.find(function (x) { return x.id === id; }); return sx && normName(sx.n) !== toN; }).slice(0, 2);
        if (!ids.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.bNoStation", null, "Z tego przystanku nie dojedziesz bez przesiadki pod żadną stację kolejową.")) + "</div>"; return; }
        var date = warsawNow().date;
        return getRt().then(function () {
          return Promise.all(ids.map(function (id) {
            var sx = index.stations.find(function (x) { return x.id === id; });
            return getArr(id).then(function (af) {
              var rides = C.ridesToStation({ arrFile: af, origin: names, date: date, fromMin: tmin, maxMin: 120, rt: rt });
              if (!rides.length) return null;
              var q = new URLSearchParams({ from: sx.n, to: to, date: date, time: C.fmt(rides[0].platform), transferMinutes: "3" });
              return fetch("/api/planner?" + q, { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (pl) {
                var its = (pl && pl.itineraries) || [];
                var trains = its.map(function (it) {
                  var dep = C.hm(it.departureTime), arr = C.hm(it.arrivalTime);
                  if (dep < tmin - 60) dep += 1440;
                  if (arr < dep % 1440 || it.arrivalNextDay) arr += 1440;
                  return { dep: dep, arr: arr, it: it, station: sx };
                });
                return { station: sx, rides: rides, trains: trains, dest: (pl && pl.resolvedTo && pl.resolvedTo.name) || to };
              });
            }).catch(function () { return null; });
          }));
        }).then(function (parts) {
          bState = { parts: parts.filter(Boolean), names: names, tmin: tmin, date: date };
          renderB();
        });
      }).catch(function () { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.noIndex", null, "Dane GZM są chwilowo niedostępne.")) + "</div>"; });
    }
    function renderB() {
      var res = root.querySelector("#gzBRes"); if (!res || !bState) return;
      var all = [];
      bState.parts.forEach(function (p) {
        // na żywo: przelicz przejazdy GZM bez ponownego pytania PLK
        var rides = C.ridesToStation({ arrFile: arrFiles[p.station.id], origin: bState.names, date: bState.date, fromMin: bState.tmin, maxMin: 120, rt: rt });
        C.matchTrains(rides, p.trains, 3).forEach(function (m) { all.push(Object.assign(m, { part: p })); });
      });
      all.sort(function (a, b) { return a.train.arr - b.train.arr || a.train.dep - b.train.dep; });
      var seen = new Set();
      all = all.filter(function (m) { var k = m.train.it.departureTime + "|" + m.train.it.arrivalTime + "|" + m.part.station.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
      if (!all.length) { res.innerHTML = '<div class="gz-empty">' + esc(T("gzm.bNone", null, "Nie znalazłem pociągu, na który zdążysz z tego przystanku w ciągu 2 godzin.")) + "</div>"; return; }
      var liveTxt = '<div class="gz-live ' + (rtOk ? "on" : "off") + '" style="margin:4px 2px">' + (rtOk ? "● " + esc(T("gzm.liveOn", null, "na żywo")) : "○ " + esc(T("gzm.liveOff", null, "dane na żywo niedostępne, pokazuję rozkład"))) + "</div>";
      res.innerHTML = liveTxt + all.map(function (m) {
        var it = m.train.it, L = m.latest;
        var legs = (it.legs || []).map(function (l) { return esc(((l.train && l.train.category) || "") + " " + ((l.train && l.train.number) || "")); }).join(" + ");
        var via = (it.legs || []).length > 1 ? " · " + esc(T("gzm.bVia", { s: it.legs.slice(0, -1).map(function (l) { return l.alight.stationName; }).join(", ") }, "przez {s}")) : "";
        var rideRow = function (r) {
          return '<div class="gz-stop" style="white-space:normal;margin-top:3px">' + (r.status === "ok" ? "🟢" : "🟡") + " <b>" + C.fmt(r.dep) + "</b> " + TYPE_ICON[r.type] + " <b>" + esc(r.line) + "</b> " + esc(r.from) + " → " + esc(r.stop.n) + " " + C.fmt(r.arrStop) + " · 🚶 " + r.walk + " min · " + esc(T("gzm.bSlack", { n: r.slack }, "zapas {n} min")) + (r.live ? (r.delay ? " · " + (r.delay > 0 ? "+" : "") + r.delay + " min" : " · " + esc(T("gzm.live", null, "na żywo"))) : "") + "</div>";
        };
        return '<div class="gz-dep ' + (L && L.status === "ok" ? "ok" : "tight") + '" style="grid-template-columns:minmax(0,1fr) auto">' +
          '<div class="gz-main"><div class="gz-dir" style="white-space:normal">🚆 ' + esc(it.departureTime) + " " + esc((it.legs && it.legs[0] && it.legs[0].board && it.legs[0].board.stationName) || m.part.station.n) + " → " + esc(it.arrivalTime) + " " + esc(m.part.dest) + "</div>" +
          '<div class="gz-stop" style="white-space:normal">' + legs + via + "</div>" +
          (L ? '<div class="gz-stop" style="white-space:normal;color:#fff;margin-top:5px">⏰ ' + esc(T("gzm.bLatest", { t: C.fmt(L.dep), l: L.line, s: L.from }, "najpóźniej wyjdź: {t} — {l} z {s}")) + "</div>" : "") +
          m.rides.map(rideRow).join("") + "</div>" +
          '<div class="gz-right"><div class="gz-t">' + esc(it.arrivalTime) + '</div><div class="gz-in">' + esc(T("gzm.bArrive", null, "na miejscu")) + "</div></div></div>";
      }).join("") + '<div class="gz-sub" style="margin:6px 2px">' + esc(T("gzm.bNote", null, "Pociągi z planera PLK. Dojście z przystanku na peron wg mapy, liczone ostrożnie (najdalszy peron).")) + "</div>";
    }

    // ===== Tryb C: cała podróż (przystanek/stacja → przystanek/stacja) =====
    var egressIx = null, depFiles = {}, cState = null;
    function getEgress() {
      if (egressIx) return Promise.resolve(egressIx);
      return fetch(dataUrl("egress.json")).then(function (r) { if (!r.ok) throw new Error("egress"); return r.json(); }).then(function (j) { egressIx = j.stops || {}; return egressIx; });
    }
    function getDep(id) {
      if (depFiles[id]) return Promise.resolve(depFiles[id]);
      return fetch(dataUrl("stations/" + id + ".json")).then(function (r) { if (!r.ok) throw new Error("dep"); return r.json(); }).then(function (j) { depFiles[id] = j; return j; });
    }
    function stationByName(name) { var n = normName(name); return (index.stations || []).find(function (x) { return normName(x.n) === n; }) || null; }
    // przystanek (dokładna nazwa albo fragment) → lista nazw ze słownika
    function stopNames(dict, txt) {
      var keys = Object.keys(dict), n = normName(txt);
      var ex = keys.filter(function (k) { return normName(k) === n; });
      return ex.length ? ex : keys.filter(function (k) { return normName(k).indexOf(n) >= 0; });
    }
    function topStations(dict, names, k) {
      var m = new Map();
      names.forEach(function (nm) { (dict[nm] || []).forEach(function (e) { if (!m.has(e[0]) || m.get(e[0]) > e[1]) m.set(e[0], e[1]); }); });
      return Array.from(m.entries()).sort(function (a, b) { return a[1] - b[1]; }).slice(0, k).map(function (e) { return { st: (index.stations || []).find(function (x) { return x.id === e[0]; }), ride: e[1] }; }).filter(function (x) { return x.st; });
    }
    function searchC() {
      var res = root.querySelector("#gzCRes"), fromTxt = root.querySelector("#gzCFrom").value.trim(), toTxt = root.querySelector("#gzCTo").value.trim();
      var tmin = C.hm(root.querySelector("#gzCTime").value) || Math.floor(warsawNow().min);
      st.cFrom = fromTxt; st.cTo = toTxt; save(LS, st);
      if (!fromTxt || !toTxt) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNeed", null, "Wpisz skąd i dokąd.")) + "</div>"; return; }
      res.innerHTML = '<div class="gz-empty">' + esc(T("gzm.cSearching", null, "Układam podróż: dojazd, pociąg, dojazd do celu…")) + "</div>";
      var date = warsawNow().date;
      Promise.all([getFeeders(), getEgress(), getRt()]).then(function (r) {
        var fz = r[0], ez = r[1];
        // Skąd: stacja (dokładna nazwa) albo przystanek GZM
        var fromSt = stationByName(fromTxt), fromNames = fromSt ? null : stopNames(fz, fromTxt);
        var toSt = stationByName(toTxt), toNames = toSt ? null : stopNames(ez, toTxt);
        if (!fromSt && !fromNames.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.bNoFrom", { d: fromTxt }, "Nie znam przystanku „{d}” albo z niego nic nie dojeżdża pod stację kolejową.")) + "</div>"; return; }
        if (!toSt && !toNames.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoTo", { d: toTxt }, "Nie znam przystanku „{d}” albo spod żadnej stacji nic do niego nie dojeżdża.")) + "</div>"; return; }
        if (!fromSt && !toSt && fromNames.some(function (x) { return toNames.indexOf(x) >= 0; })) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cSame", null, "Start i cel to ten sam przystanek.")) + "</div>"; return; }
        // stacje dostępu i wyjścia: najwyżej 2 + 2, kombinacji najwyżej 3 (= najwyżej 3 zapytania do PLK)
        var acc = fromSt ? [{ st: fromSt, ride: 0 }] : topStations(fz, fromNames, 2);
        var egr = toSt ? [{ st: toSt, ride: 0 }] : topStations(ez, toNames, 2);
        // cel przy samej stacji (jej własny przystanek) → wystarczy dojść pieszo
        if (!toSt) (index.stations || []).forEach(function (x) {
          var own = (x.s || []).filter(function (p) { return toNames.indexOf(p[1]) >= 0; });
          if (own.length && !egr.some(function (e) { return e.st.id === x.id; })) egr.unshift({ st: x, ride: 0, walkOnly: Math.min.apply(null, own.map(function (p) { return p[3]; })), walkName: own[0][1] });
          else if (own.length) egr.forEach(function (e) { if (e.st.id === x.id) { e.ride = 0; e.walkOnly = Math.min.apply(null, own.map(function (p) { return p[3]; })); e.walkName = own[0][1]; } });
        });
        egr.sort(function (a, b) { return a.ride - b.ride; }); egr = egr.slice(0, 2);
        var combos = [];
        acc.forEach(function (a) { egr.forEach(function (e) { if (a.st.id !== e.st.id) combos.push({ a: a, e: e, cost: a.ride + e.ride }); }); });
        combos.sort(function (x, y) { return x.cost - y.cost; }); combos = combos.slice(0, 3);
        if (!combos.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoCombo", null, "Nie znalazłem stacji kolejowych, przez które da się to połączyć.")) + "</div>"; return; }
        return Promise.all(combos.map(function (cb) {
          var accP = fromSt ? Promise.resolve(null) : getArr(cb.a.st.id);
          var egrP = (toSt || cb.e.walkOnly != null) ? Promise.resolve(null) : getDep(cb.e.st.id);
          return Promise.all([accP, egrP]).then(function (files) {
            var rides = files[0] ? C.ridesToStation({ arrFile: files[0], origin: fromNames, date: date, fromMin: tmin, maxMin: 120, rt: rt }) : null;
            if (files[0] && !rides.length) return null;
            var q = new URLSearchParams({ from: cb.a.st.n, to: cb.e.st.n, date: date, time: C.fmt(rides ? rides[0].platform : tmin), transferMinutes: "3" });
            return fetch("/api/planner?" + q, { headers: { Accept: "application/json" } }).then(function (x) { return x.json(); }).then(function (pl) {
              return { cb: cb, accFile: files[0], egrFile: files[1], its: (pl && pl.itineraries) || [], query: pl && pl.query };
            });
          }).catch(function () { return null; });
        })).then(function (parts) {
          cState = { parts: parts.filter(Boolean), fromNames: fromNames, toNames: toNames, fromSt: fromSt, toSt: toSt, tmin: tmin, date: date, more: {}, tDelay: {} };
          renderC(); trainLiveC();
        });
      }).catch(function () { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.noIndex", null, "Dane GZM są chwilowo niedostępne.")) + "</div>"; });
    }
    function cKey(p, it) { return p.cb.a.st.id + "|" + p.cb.e.st.id + "|" + it.departureTime + "|" + it.arrivalTime; }
    // Opóźnienie pociągu (ostatni odcinek) na stacji wysiadki — dla 2 pierwszych propozycji, co 60 s.
    function trainLiveC() {
      if (!cState || !cState.shown || !window.GuardCore) return Promise.resolve();
      return Promise.all(cState.shown.slice(0, 2).map(function (x) {
        var l = x.it.legs && x.it.legs[x.it.legs.length - 1]; if (!l || !l.orderId) return null;
        var q = new URLSearchParams({ scheduleId: l.scheduleId || "", orderId: l.orderId, operatingDate: cState.date, train: (l.train && l.train.number) || "" });
        return fetch("/api/train-details?" + q, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
          if (!d) return;
          var rd = GuardCore.readLeg({ board: { stationName: l.board.stationName, time: l.board.time }, alight: { stationName: l.alight.stationName, time: l.alight.time } }, d);
          if (!rd.noData) cState.tDelay[cKey(x.p, x.it)] = { d: Number(rd.delayArr) || 0, src: rd.arrSource, arrived: rd.arrived };
        }).catch(function () {});
      })).then(function () { renderC(); });
    }
    function renderC() {
      var res = root.querySelector("#gzCRes"); if (!res || !cState) return;
      var S = cState, out = [], now = nowOn(S.date);
      S.parts.forEach(function (p) {
        var rides = p.accFile ? C.ridesToStation({ arrFile: p.accFile, origin: S.fromNames, date: S.date, fromMin: S.tmin, maxMin: 120, rt: rt }) : null;
        p.its.slice(0, 6).forEach(function (it) {
          var dep = C.hm(it.departureTime), arr = C.hm(it.arrivalTime);
          if (dep < S.tmin - 60) dep += 1440;
          if (arr < dep % 1440 || it.arrivalNextDay) arr += 1440;
          var tl = S.tDelay && S.tDelay[cKey(p, it)], tDelay = tl ? tl.d : 0;
          arr += tDelay;
          if (!rides && dep < S.tmin) return;
          var acc = null;
          if (rides) { var m = C.matchTrains(rides, [{ dep: dep }], 3)[0]; if (!m) return; acc = m; }
          var egr = null, final = arr;
          if (p.cb.e.walkOnly != null) { egr = { walkOnly: true, walk: p.cb.e.walkOnly, name: p.cb.e.walkName }; final = arr + p.cb.e.walkOnly; }
          else if (p.egrFile) {
            var r = C.compute({ file: p.egrFile, date: S.date, arrMin: arr, nowMin: Math.min(now, arr), windowMin: 120, dest: S.toNames, rt: rt });
            egr = r.catchable[0]; if (!egr) return;
            final = egr.arrDest;
          }
          out.push({ p: p, it: it, dep: dep, arr: arr, tDelay: tDelay, tl: tl, acc: acc, egr: egr, egrR: r || null, final: final, start: acc && acc.latest ? acc.latest.dep : dep });
        });
      });
      out.sort(function (a, b) { return a.final - b.final || b.start - a.start; });
      var seen = new Set();
      out = out.filter(function (x) { var k = x.final + "|" + x.it.departureTime + "|" + x.p.cb.a.st.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
      if (!out.length) { res.innerHTML = '<div class="gz-empty">' + esc(T("gzm.cNone", null, "Nie udało się ułożyć podróży w ciągu 2 godzin od wyjścia.")) + "</div>"; return; }
      var guardOk = !!(window.GuardStore && window.GuardCore && GuardStore.enabled && GuardStore.enabled());
      res.innerHTML = '<div class="gz-live ' + (rtOk ? "on" : "off") + '" style="margin:4px 2px">' + (rtOk ? "● " + esc(T("gzm.liveOn", null, "na żywo")) : "○ " + esc(T("gzm.liveOff", null, "dane na żywo niedostępne, pokazuję rozkład"))) + "</div>" +
        out.map(function (x, i) {
          var it = x.it, L = x.acc && x.acc.latest, E = x.egr;
          var legs = (it.legs || []).map(function (l) { return esc(((l.train && l.train.category) || "") + " " + ((l.train && l.train.number) || "")); }).join(" + ");
          var steps = [];
          if (L) steps.push((L.status === "ok" ? "🟢" : "🟡") + " " + TYPE_ICON[L.type] + " <b>" + esc(L.line) + "</b> " + C.fmt(L.dep) + " " + esc(L.from) + " → " + esc(L.stop.n) + " " + C.fmt(L.arrStop) + " · 🚶 " + L.walk + " min · " + esc(T("gzm.bSlack", { n: L.slack }, "zapas {n} min")));
          steps.push("🚆 <b>" + esc(it.departureTime) + "</b> " + esc((it.legs && it.legs[0] && it.legs[0].board.stationName) || x.p.cb.a.st.n) + " → " + (x.tDelay ? '<span class="plan-strike">' + esc(it.arrivalTime) + "</span> <b>" + C.fmt(x.arr) + "</b> (+" + x.tDelay + " min)" : "<b>" + esc(it.arrivalTime) + "</b>") + " " + esc((it.legs && it.legs[it.legs.length - 1].alight.stationName) || x.p.cb.e.st.n) + " · " + legs);
          if (E && E.walkOnly) steps.push("🚶 " + esc(T("gzm.cWalk", { n: E.walk, s: E.name }, "{n} min pieszo do: {s}")));
          var key = cKey(x.p, it), more = (S.more && S.more[key]) || 0, list = "";
          if (E && !E.walkOnly && x.egrR) {
            var n5 = 5 + more * 5, cat = x.egrR.catchable;
            list = '<div style="margin:-6px 0 14px 12px;padding-left:8px;border-left:2px solid var(--line)">' +
              '<div class="gz-sub" style="margin:4px 2px 2px">🚌 ' + esc(T("gzm.cNext", { d: (S.toNames || []).join(", ") }, "Dalej do: {d} — po przyjeździe pociągu")) + "</div>" +
              cat.slice(0, n5).map(function (y) { return depHtml(y, "", true); }).join("") +
              (cat.length > n5 ? '<button type="button" class="gz-btn sec" data-cmore="' + esc(key) + '">' + esc(T("gzm.more", null, "Pokaż kolejne 5")) + "</button>" : "") +
              (x.egrR.missed.length ? '<div class="gz-sub" style="margin:8px 2px 2px">' + esc(T("gzm.missed", null, "Uciekły")) + "</div>" + x.egrR.missed.slice(-2).map(function (y) { return depHtml(y, "", true); }).join("") : "") +
              "</div>";
          }
          if (E && !E.walkOnly) steps.push("🏁 " + esc(T("gzm.cBest", { t: C.fmt(E.arrDest), l: E.dep.line, s: C.fmt(E.real) }, "najszybciej do celu: {l} o {s}, na miejscu {t}")));
          var worst = [L && L.status, E && !E.walkOnly && E.status].indexOf("tight") >= 0 ? "tight" : "ok";
          return '<div class="gz-dep ' + worst + '" style="grid-template-columns:minmax(0,1fr) auto">' +
            '<div class="gz-main">' + (L ? '<div class="gz-dir" style="white-space:normal">⏰ ' + esc(T("gzm.cLeave", { t: C.fmt(L.dep), s: L.from }, "wyjdź: {t} z {s}")) + "</div>" : '<div class="gz-dir" style="white-space:normal">🚆 ' + esc(T("gzm.cTrainAt", { t: it.departureTime, s: x.p.cb.a.st.n }, "pociąg {t} z {s}")) + "</div>") +
            steps.map(function (h) { return '<div class="gz-stop" style="white-space:normal;margin-top:4px">' + h + "</div>"; }).join("") +
            (guardOk ? '<div style="margin-top:8px"><button type="button" class="gz-btn sec" data-guard="' + i + '">🛡️ ' + esc(T("gzm.cGuard", null, "Pilnuj pociągów tej podróży")) + "</button></div>" : "") +
            "</div>" +
            '<div class="gz-right"><div class="gz-t">' + C.fmt(x.final) + '</div><div class="gz-in">' + esc(T("gzm.bArrive", null, "na miejscu")) + "</div></div></div>" + list;
        }).join("") +
        '<div class="gz-sub" style="margin:6px 2px">' + esc(T("gzm.cNote", null, "Pociągi z planera PLK, autobusy i tramwaje z rozkładu GZM z opóźnieniami na żywo. Strażnik pilnuje na razie pociągów; części GZM pilnuj w tej zakładce.")) + "</div>";
      cState.shown = out;
    }
    function guardTrip(btn) {
      var x = cState && cState.shown && cState.shown[+btn.dataset.guard];
      if (!x || !window.GuardStore || !window.GuardCore) return;
      var q = x.p.query || { from: x.p.cb.a.st.n, to: x.p.cb.e.st.n, date: cState.date };
      if (!q.date) q.date = cState.date;
      btn.disabled = true;
      GuardStore.add(GuardCore.fromItinerary(x.it, q)).then(function () { btn.textContent = "🛡️ " + T("gzm.cGuarded", null, "Pilnowane"); });
    }

    var ready = (window.I18n ? I18n.ready : Promise.resolve()).then(getIndex).then(function () { shell(); initModes(); load1(); }).catch(function () {
      root.innerHTML = '<div class="gz-empty">' + esc(T("gzm.noIndex", null, "Dane GZM są chwilowo niedostępne.")) + "</div>";
    });

    return {
      start: function () { shown = true; ready.then(function () { if (file) getRt().then(function () { render(); }); schedule(); }); },
      stop: function () { shown = false; schedule(); },
      open: function (o) {
        cfg = { stationId: o.stationId, arr: o.arr || null, date: o.date || null, train: o.train || null, alighted: false };
        trainInfo = null; showMore = 0;
        ready.then(function () { var s = root.querySelector("#gzSt"); if (s) s.value = String(cfg.stationId || ""); var a = root.querySelector("#gzArr"); if (a && cfg.arr) a.value = cfg.arr; load1(); });
      }
    };
  }

  window.GzmView = { mount: mount };
})();
