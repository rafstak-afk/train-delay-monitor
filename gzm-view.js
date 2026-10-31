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
    '.gz .gz-dt{display:flex;gap:10px;width:100%}.gz .gz-dt input{flex:1 1 0;min-width:0;padding:14px!important;border-radius:10px!important;border:0!important;font-size:16px!important;background:#fff!important;color:#102027!important;color-scheme:light}' +
    '.gz .gz-ddw{position:relative}' +
    '.gz .gz-far{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#a855f7;color:#fff;font-weight:900;font-size:12px;margin-right:5px;vertical-align:middle;flex:0 0 auto}' +
    '.gz .gz-farbox{margin:10px 0;padding:12px;border:1px solid #a855f7;border-radius:12px;background:rgba(168,85,247,.1);font-size:13.5px;line-height:1.45}' +
    '.gz .gz-farrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}' +
    '.gz .gz-searching{margin:10px 0;padding:16px 14px;border-radius:12px;border:2px solid #ffd400;background:rgba(255,212,0,.1);color:#ffe8a3;font-size:17px;font-weight:900;text-align:center;animation:gzPulse 1.1s ease-in-out infinite}' +
    '@keyframes gzPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,212,0,.45)}50%{transform:scale(1.035);box-shadow:0 0 22px 4px rgba(255,212,0,.35)}}' +
    '@media (prefers-reduced-motion:reduce){.gz .gz-searching{animation:none}}' +
    '.gz .gz-stack{position:relative;width:100%;display:flex;flex-direction:column;gap:8px}.gz .gz-stack>.gz-st{width:100%;flex:0 0 auto!important;min-width:0}.gz .gz-stack #gzCFrom,.gz .gz-stack #gzCTo{padding-right:54px}' +
    '.gz .gz-swap{position:absolute;right:10px;top:50%;transform:translateY(-50%);z-index:6;border:1px solid var(--line);background:var(--panel);color:#fff;border-radius:50%;width:38px;height:38px;font-size:16px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}.gz .gz-swap:hover{background:#2a3b4d}' +
    '.gz .gz-dd{display:none;position:absolute;z-index:10000;top:calc(100% + 4px);left:0;right:0;background:#172433;border:1px solid #48627c;border-radius:12px;box-shadow:0 14px 35px rgba(0,0,0,.45);max-height:280px;overflow:auto;text-align:left}' +
    '.gz .gz-dd.open{display:block}' +
    '.gz .gz-dd-item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;width:100%;border:0;border-bottom:1px solid rgba(255,255,255,.07);background:transparent;color:#fff;padding:10px 12px;text-align:left;cursor:pointer;font-family:inherit;font-size:14px}' +
    '.gz .gz-dd-item:hover,.gz .gz-dd-item.active{background:#223244}' +
    '.gz .gz-dd-name{font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gz .gz-dd-kind{opacity:.65;font-size:12px}' +
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
    '.gz .gz-main{min-width:0}.gz .gz-dir{font-weight:800;font-size:14px;overflow-wrap:anywhere;line-height:1.3}' +
    '.gz .gz-stop{color:var(--muted);font-size:12.5px;overflow-wrap:anywhere;line-height:1.35}' +
    '.gz .gz-dep[data-tripx]{cursor:pointer}' +
    '.gz .gz-trip{background:#141f2b;border:1px solid var(--line);border-top:0;border-radius:0 0 12px 12px;margin:-8px 0 8px;padding:8px 11px 10px;font-size:13px}' +
    '.gz .gz-trip-pos{color:var(--cyan);font-weight:700;margin:2px 0 6px}.gz .gz-trip-pos a{color:var(--cyan)}' +
    '.gz .gz-tr{display:grid;grid-template-columns:56px 1fr;gap:6px;padding:3px 0;border-left:3px solid var(--line);padding-left:8px}' +
    '.gz .gz-tr.past{opacity:.45}.gz .gz-tr.me{border-left-color:var(--yellow);font-weight:800}.gz .gz-tr.here{border-left-color:var(--cyan)}' +
    '.gz .gz-legs{display:flex;flex-direction:column;gap:5px}' +
    '.gz .gz-leg{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:baseline;font-size:13.5px;color:#fff}' +
    '.gz .gz-leg .ln{font-weight:900;min-width:34px;text-align:center;background:#24384c;border-radius:6px;padding:1px 5px;font-size:12.5px}' +
    '.gz .gz-leg .tm{font-weight:800}.gz .gz-leg .to{grid-column:2;color:var(--muted)}' +
    '.gz .gz-walk{font-size:12.5px;color:var(--muted);padding-left:4px}' +
    '.gz .gz-fin{font-size:13px;color:#fff;font-weight:700;margin-top:3px}' +
    '.gz .gz-tap{font-size:11.5px;color:var(--cyan);margin-top:3px}' +
    '.gz .gz-trip h5{margin:8px 0 4px;font-size:13px;color:#fff}' +
    '.gz .gz-total{font-size:12px;color:var(--cyan);font-weight:700;margin-top:2px}' +
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
      if (meta && !meta.s.length) {
        if (!uniOn()) { body.innerHTML = '<div class="gz-empty">' + esc(T("gzm.noStops", null, "Brak przystanków GZM w pobliżu tej stacji.")) + "</div>"; return; }
        body.innerHTML = '<div class="gz-empty">' + esc(T("gzm.loading", null, "Wczytuję rozkład…")) + "</div>";
        getNet(cfg.date || warsawNow().date).then(function (net) {
          var r = farStops(net, meta), h = '<div class="gz-farbox"><b>' + esc(T("gzm.farHead", { st: meta.n, n: index.maxWalkMin || 8 }, "Przy stacji {st} nie ma przystanku ZTM w zwykłym zasięgu pieszym (do {n} min).")) + "</b>";
          if (r.list.length) {
            h += "<div>" + esc(T("gzm.farNear", null, "Najbliższe przystanki — dalej niż zwykle:")) + "</div>" + r.list.map(function (o) {
              return '<div class="gz-farrow">' + farBadge() + "<b>" + esc(o.name) + "</b> · " + esc(T("gzm.farRow", { d: kmTxt(o.d), n: o.walk }, "{d}, ok. {n} min pieszo")) +
                ' <button type="button" class="gz-chip" data-farfrom="' + esc(o.name) + '">' + esc(T("gzm.farUse", null, "Skąd: ten przystanek")) + "</button></div>";
            }).join("") + '<div class="gz-sub" style="margin-top:8px">' + esc(T("gzm.farHint", null, "Wpisz też „Dokąd”, a ułożę podróż z dojściem do tego przystanku.")) + "</div>";
          } else if (r.nearest) {
            h += "<div>" + esc(T("gzm.farNone", { s: r.nearest.name, d: kmTxt(r.nearest.d) }, "ZTM tu nie dojeżdża — najbliższy przystanek: {s}, {d} od stacji.")) + "</div>";
          }
          body.innerHTML = h + "</div>";
          body.querySelectorAll("[data-farfrom]").forEach(function (b) { b.addEventListener("click", function () { var fi = root.querySelector("#gzCFrom"), ti = root.querySelector("#gzCTo"); if (fi) fi.value = b.dataset.farfrom; if (ti) { ti.focus(); ti.scrollIntoView({ block: "center" }); } }); });
        }).catch(function () { body.innerHTML = '<div class="gz-empty">' + esc(T("gzm.noStops", null, "Brak przystanków GZM w pobliżu tej stacji.")) + "</div>"; });
        return;
      }
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

    // ===== Rozwinięcie odjazdu: cały bieg kursu i gdzie jest teraz pojazd (TEST — tylko profil autora) =====
    var tripOpen = {};
    function tripExpandOn() { return true; }   // dla wszystkich od v5.25
    function tripIndex(net, tid) {
      if (!net._tripIx) { net._tripIx = {}; net.j.trips.forEach(function (t, i) { net._tripIx[t[2]] = i; }); }
      var i = net._tripIx[tid]; return i == null ? -1 : i;
    }
    function tripHtml(tid, date, boardName, alightName, inner) {
      var p = netP[date], net = null;
      if (!p) { getNet(date).then(function () { rerender(); }).catch(function () {}); return '<div class="gz-trip">' + esc(T("gzm.tLoading", null, "Wczytuję bieg kursu…")) + "</div>"; }
      p.then(function (n) { net = n; });
      if (!p._net) { p.then(function (n) { p._net = n; rerender(); }); return '<div class="gz-trip">' + esc(T("gzm.tLoading", null, "Wczytuję bieg kursu…")) + "</div>"; }
      net = p._net;
      var ti = tripIndex(net, tid);
      if (ti < 0) return '<div class="gz-trip">' + esc(T("gzm.tNone", null, "Brak danych o biegu tego kursu.")) + "</div>";
      var tr = net.j.trips[ti], pat = net.j.pats[tr[0]], seq = pat[1], off = pat[2];
      var rtT = rt && rt.trips && rt.trips[tid], dl = rtT && rtT[1] !== "X" ? Math.round((rtT[1] || 0) / 60) : 0, curSeq = rtT ? rtT[0] : null;
      var nearIdx = -1;
      if (rtT && rtT[2] != null) {
        var bd = 1e9; seq.forEach(function (sx, i) { var d2 = Math.pow(net.lat[sx] - rtT[2], 2) + Math.pow((net.lon[sx] - rtT[3]) * 0.64, 2); if (d2 < bd) { bd = d2; nearIdx = i; } });
      }
      var pos = "";
      if (rtT && rtT[2] != null) {
        var ago = rtT[4] ? Math.max(0, Math.round((Date.now() / 1000 - rtT[4]) / 60)) : null;
        pos = '<div class="gz-trip-pos">📍 ' + esc(T("gzm.tPos", { s: net.name[seq[nearIdx]] }, "pojazd teraz w pobliżu: {s}")) + (ago != null ? " · " + esc(T("gzm.tAgo", { n: ago }, "{n} min temu")) : "") +
          ' · <a href="https://www.openstreetmap.org/?mlat=' + rtT[2] + "&mlon=" + rtT[3] + "#map=17/" + rtT[2] + "/" + rtT[3] + '" target="_blank" rel="noopener">' + esc(T("gzm.tMap", null, "mapa")) + "</a></div>";
      } else pos = '<div class="gz-trip-pos" style="color:var(--muted)">' + esc(T("gzm.tNoPos", null, "brak pozycji na żywo — godziny wg rozkładu")) + "</div>";
      var rows = seq.map(function (sx, i) {
        var plan = tr[1] + off[2 * i + 1], nm = net.name[sx];
        var cls = (curSeq != null && i < curSeq ? " past" : "") + (nm === boardName || (alightName && nm === alightName) ? " me" : "") + (i === nearIdx ? " here" : "");
        var t = dl ? '<span class="plan-strike">' + C.fmt(plan) + "</span> " + C.fmt(plan + dl) : C.fmt(plan);
        return '<div class="gz-tr' + cls + '"><div>' + t + "</div><div>" + (i === nearIdx ? "📍 " : "") + esc(nm) + "</div></div>";
      }).join("");
      return inner ? pos + rows : '<div class="gz-trip">' + pos + rows + "</div>";
    }
    // bieg wszystkich kursów podróży (po kolei), pod kartą
    function tripsOfJourney(jn) {
      var rides = jn.legs.filter(function (l) { return l.type === "ride" && l.trip; });
      var date = (cState && cState.date) || warsawNow().date;
      if (!netP[date] || !netP[date]._net) return tripHtml(rides[0].trip, date, rides[0].fromName, rides[0].toName);
      return '<div class="gz-trip">' + rides.map(function (l) {
        return "<h5>" + esc(l.line) + " → " + esc(l.head || l.toName) + "</h5>" + tripHtml(l.trip, date, l.fromName, l.toName, true);
      }).join("") + "</div>";
    }
    function jKey(jn) { return "j|" + jn.legs.map(function (l) { return l.trip || ("w" + l.min); }).join(">"); }
    // odcinki podróży: każdy kurs w osobnym wierszu, przejście słowami
    function legsHtml(jn) {
      return '<div class="gz-legs">' + jn.legs.map(function (l) {
        if (l.type === "walk") return '<div class="gz-walk">' + (l.far ? farBadge() : "") + esc(T("gzm.jWalk", { n: l.min }, "przejście pieszo {n} min")) + (l.far ? " · " + esc(T("gzm.farDist", { d: kmTxt(l.dist || 0) }, "{d} — dalej niż zwykle")) : "") + (l.fixed ? " · " + esc(T("gzm.jFixed", null, "Twój czas")) : l.measured ? " · " + esc(T("gzm.jMeasured", null, "zmierzone")) : "") + (l.toName && l.fromName && l.fromName.charAt(0) > "~" ? " · " + esc(l.fromName) + " → " + esc(l.toName) : "") + "</div>";
        var dep = (l.live && l.delay ? '<span class="plan-strike">' + C.fmt(l.depPlan) + "</span> " : "") + C.fmt(l.dep);
        return '<div class="gz-leg"><span class="ln">' + esc(l.line) + '</span><span><span class="tm">' + dep + "</span> " + esc(l.fromName) + "</span>" +
          '<span class="to">→ <b>' + C.fmt(l.arr) + "</b> " + esc(l.toName) + (l.live && l.delay ? " (+" + l.delay + " min)" : "") + "</span></div>";
      }).join("") + "</div>";
    }
    function rerender() { if (st.dir === "C" && cState) renderC(); else render(); }
    root.addEventListener("click", function (e) {
      if (!tripExpandOn()) return;
      var card = e.target.closest(".gz-dep[data-tripx]");
      if (!card || e.target.closest("button,a")) return;
      var k = card.getAttribute("data-tripx");
      if (tripOpen[k]) delete tripOpen[k]; else tripOpen[k] = true;
      rerender();
    });

    function depHtml(x, cls, noFav) {
      var d = x.dep, inMin = Math.round(x.real - nowOn(cfg.date || warsawNow().date));
      var tTxt = (x.live && x.delay) ? '<span class="plan-strike">' + C.fmt(d.min) + "</span> " + C.fmt(x.real) : C.fmt(x.real);
      var stTxt = x.status === "ok" ? "🟢 " + T("gzm.st.ok", null, "zdążysz") : x.status === "tight" ? "🟡 " + T("gzm.st.tight", null, "na styk") : x.status === "cancelled" ? "⚫ " + T("gzm.st.cancelled", null, "odwołany") : "🔴 " + T("gzm.st.missed", null, "nie zdążysz");
      var liveTxt = x.live ? (x.delay ? (x.delay > 0 ? "+" : "") + x.delay + " min, " + T("gzm.live", null, "na żywo") : T("gzm.onTimeLive", null, "punktualnie, na żywo")) : T("gzm.sched", null, "wg rozkładu");
      var key = C.favKey(d), isF = (favs[cfg.stationId] || []).indexOf(key) >= 0;
      var tk = d.trip + "|" + d.date + "|" + d.stop.n;
      return '<div class="gz-dep ' + x.status + (cls || "") + '" data-k="' + esc(d.trip + "|" + d.stopIdx) + '"' + (tripExpandOn() ? ' data-tripx="' + esc(tk) + '" title="' + esc(T("gzm.tTap", null, "Stuknij — cały bieg kursu")) + '"' : "") + '>' +
        '<div class="gz-line ' + d.type + '">' + esc(d.line) + "<small>" + TYPE_ICON[d.type] + "</small></div>" +
        '<div class="gz-main"><div class="gz-dir">→ ' + esc(d.head) + ' ' + (noFav ? "" : '<button type="button" class="gz-fav" data-fav="' + esc(key) + '" title="' + esc(T("gzm.favTitle", null, "Ulubiona linia w tym kierunku na tej stacji")) + '">' + (isF ? "★" : "☆") + "</button>") + "</div>" +
        '<div class="gz-stop">' + esc(d.stop.n) + " · 🚶 " + esc(x.walk.exact ? x.walk.min : (d.stop.w[0] === d.stop.w[1] ? d.stop.w[1] : d.stop.w[0] + "–" + d.stop.w[1])) + " min" + (d.stop.stairs ? " 🪜" : "") + " · " + esc(liveTxt) + "</div>" +
        (x.arrDest != null ? '<div class="gz-stop" style="color:#fff">🏁 ' + esc(T("gzm.arrDest", { t: C.fmt(x.arrDest), n: x.destName, m: x.travel }, "{t} {n} (jazda {m} min)")) + "</div>" : "") +        "</div>" +
        '<div class="gz-right"><div class="gz-t">' + tTxt + '</div><div class="gz-in">' + (inMin > 180 || inMin < -1 ? "" : inMin <= 0 ? esc(T("gzm.now", null, "teraz")) : esc(T("gzm.inMin", { n: inMin }, "za {n} min"))) + '</div><div class="gz-in gz-st-' + x.status + '">' + esc(stTxt) + "</div></div></div>" +
        (tripOpen[tk] ? tripHtml(d.trip, d.date, d.stop.n) : "");
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
      if (!uniOn()) { c.querySelector("#gzCFrom").value = st.cFrom || ""; c.querySelector("#gzCTo").value = st.cTo || ""; }
      if (placesOn()) {
        var pb = document.createElement("div"); pb.id = "gzPlaces"; c.insertBefore(pb, c.querySelector("#gzCRes"));
        var drawPlaces = function () {
          var P = load(PLACES, {});
          var chip = function (k, side) { return '<button type="button" class="gz-chip" data-pl="' + k + '" data-side="' + side + '">' + esc(PL_TOK[k]) + "</button>"; };
          pb.innerHTML = '<div class="gz-chips" style="align-items:center"><span class="gz-sub">' + esc(T("gzm.pFrom", null, "Skąd:")) + "</span>" + chip("dom", "f") + chip("praca", "f") + chip("gps", "f") +
            '<span class="gz-sub" style="margin-left:6px">' + esc(T("gzm.pTo", null, "Dokąd:")) + "</span>" + chip("dom", "t") + chip("praca", "t") + "</div>" +
            '<details class="gz-sub" style="margin:2px 2px 8px"><summary>' + esc(T("gzm.pMine", null, "Moje miejsca")) + "</summary>" +
            ["dom", "praca"].map(function (k) { return '<div style="margin:6px 0' + (P[k] ? ';padding-bottom:6px;border-bottom:1px solid var(--line)' : '') + '">' + esc(PL_TOK[k]) + ": " + (P[k] ? "✔ " + esc(T("gzm.pSet", null, "ustawione")) + " " : "— ") + '<button type="button" class="gz-chip" data-plset="' + k + '">📍 ' + esc(T("gzm.pSetHere", null, "ustaw tu, gdzie jestem")) + "</button>" + (P[k] ? ' <button type="button" class="gz-chip" data-plclr="' + k + '">✕</button><div data-wbox="' + k + '"></div>' : "") + "</div>"; }).join("") +
            '<div style="font-size:11.5px">' + esc(profOn() ? T("gzm.pNoteProf", null, "Miejsca zapisuję w Twoim profilu — są na każdym urządzeniu z Twoim tokenem. Dojście pieszo liczę do przystanków w promieniu ok. 900 m (i na stację, gdy jest blisko).") : T("gzm.pNote", null, "Miejsca zapisuję tylko na tym urządzeniu (z profilem — na wszystkich). Dojście pieszo liczę do przystanków w promieniu ok. 900 m (i na stację, gdy jest blisko).")) + "</div></details>";
        };
        // ⏱ czasy dojścia „na sztywno” — lista najbliższych stacji i przystanków miejsca
        var drawWalks = function (k, box) {
          var P = load(PLACES, {}), pl = P[k]; if (!pl) { box.innerHTML = ""; return; }
          box.innerHTML = '<div style="font-size:12px;margin:4px 0">' + esc(T("gzm.wLoading", null, "Szukam stacji i przystanków w pobliżu…")) + "</div>";
          getNet(warsawNow().date).then(function (net) {
            var fw = pl.walks || { st: {}, stop: {} }, rows = [];
            (index.stations || []).map(function (x) { return { x: x, d: havM(pl.lat, pl.lon, x.lat, x.lon) }; }).filter(function (o) { return o.d <= 2000; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 2)
              .forEach(function (o) { rows.push({ t: "st", n: o.x.n, est: walkMin(o.d) + 2, ic: "🚉 " }); });
            var seenN = {};
            var near = []; for (var i = 0; i < net.n; i++) { var d = havM(pl.lat, pl.lon, net.lat[i], net.lon[i]); if (d <= 900) near.push({ n: net.name[i], d: d }); }
            near.sort(function (a, b) { return a.d - b.d; }).forEach(function (o) { if (seenN[o.n] || Object.keys(seenN).length >= 5) return; seenN[o.n] = 1; rows.push({ t: "stop", n: o.n, est: walkMin(o.d), ic: "🚏 " }); });
            box.innerHTML = '<div style="font-size:12px;margin:6px 0 2px">' + esc(T("gzm.wHead", null, "Czas dojścia — wpisz swój, jeśli szacunek się nie zgadza (puste = szacunek):")) + "</div>" +
              rows.map(function (r) {
                var v = (fw[r.t] || {})[r.n];
                return '<div style="display:flex;align-items:center;gap:6px;margin:3px 0"><span style="flex:1;min-width:0">' + r.ic + esc(r.n) + (r.t === "st" ? " (" + esc(T("gzm.wPlatform", null, "peron")) + ")" : "") + '</span>' +
                  '<input type="number" min="1" max="60" inputmode="numeric" data-wk="' + k + '" data-wt="' + r.t + '" data-wn="' + esc(r.n) + '" value="' + (v != null ? v : "") + '" placeholder="~' + r.est + '" style="width:62px;padding:5px;border-radius:7px;border:1px solid var(--line);background:#223244;color:#fff"> min</div>';
              }).join("");
          }).catch(function () { box.innerHTML = ""; });
        };
        pb.addEventListener("toggle", function (e) { if (e.target.tagName === "DETAILS" && e.target.open) pb.querySelectorAll("[data-wbox]").forEach(function (bx) { drawWalks(bx.dataset.wbox, bx); }); }, true);
        pb.addEventListener("change", function (e) {
          var inp = e.target.closest("input[data-wk]"); if (!inp) return;
          var k = inp.dataset.wk, P = load(PLACES, {}), pl = P[k]; if (!pl) return;
          var w = pl.walks ? JSON.parse(JSON.stringify(pl.walks)) : { st: {}, stop: {} }; w[inp.dataset.wt] = w[inp.dataset.wt] || {};
          var val = Math.round(+inp.value);
          if (inp.value === "" || !(val >= 1 && val <= 60)) delete w[inp.dataset.wt][inp.dataset.wn]; else w[inp.dataset.wt][inp.dataset.wn] = val;
          putPlace(k, Object.assign({}, pl, { walks: w }));
          inp.style.borderColor = "#22c55e";
        });
        drawPlaces();
        syncPlaces().then(function (ch) { if (ch) drawPlaces(); });
        document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") syncPlaces().then(function (ch) { if (ch) drawPlaces(); }); });
        pb.addEventListener("click", function (e) {
          var b = e.target.closest("button"); if (!b) return;
          if (b.dataset.pl) {
            // pola formularza mogą być już przeniesione na górę (jeden formularz) — szukamy w całym widoku
            var fIn = root.querySelector("#gzCFrom"), tIn2 = root.querySelector("#gzCTo"), me = b.dataset.side === "f" ? fIn : tIn2, other = me === fIn ? tIn2 : fIn;
            me.value = PL_TOK[b.dataset.pl];
            me.style.boxShadow = "0 0 0 2px #22c55e"; setTimeout(function () { me.style.boxShadow = ""; }, 900);
            if (other.value.trim()) searchC(); else other.focus();
            return;
          }
          if (b.dataset.plclr) { putPlace(b.dataset.plclr, null); drawPlaces(); return; }
          if (b.dataset.plset) { b.disabled = true; b.textContent = "⏳"; gpsNow().then(function (g) { var old = load(PLACES, {})[b.dataset.plset] || {}; putPlace(b.dataset.plset, Object.assign({}, old, { lat: +g.lat.toFixed(6), lon: +g.lon.toFixed(6) })); drawPlaces(); }, function () { b.textContent = "⚠ GPS"; }); }
        });
      }
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
      if (uniOn()) initUni(tg, a, b, c);
      // wejście z 🚌 (strona pociągu / dzienniczek): po wczytaniu przewiń do pierwszego odjazdu, na który zdążysz
      if (uniOn() && opts.stationId) scrollToFirst(root.querySelector("#gzBody"), ".gz-dep.ok, .gz-dep.tight, .gz-warn, .gz-farbox");
      // wejście z przycisku 🚌 (pociąg / dzienniczek) — zawsze „Wysiadam z pociągu”
      setMode(opts.stationId ? "A" : uniOn() ? (st.dir === "A" && cfg.stationId ? "A" : "C") : (st.dir || "A"));
    }
    // ===== Jeden formularz (all in one) — TEST, tylko profil autora =====
    function uniOn() { return true; }   // jeden formularz — dla wszystkich od v5.25
    function initUni(tg, a, b, c) {
      tg.style.display = "none"; b.hidden = true; b.style.display = "none";
      var ph = root.parentNode && root.parentNode.querySelector(".pview-head");
      if (ph) ph.innerHTML = "<b>" + esc(T("gzm.uTitle", null, "🚆🚌 Pociąg + GZM")) + "</b> · " + esc(T("gzm.uSub", null, "od drzwi do drzwi: pociąg, autobus, tramwaj, trolejbus i dojście pieszo"));
      var u = document.createElement("div"); u.id = "gzU";
      var form = c.querySelector(".gz-bar"), pl = c.querySelector("#gzPlaces");
      u.appendChild(form); if (pl) u.appendChild(pl);
      // „Więcej opcji”: okno czasu z dawnego „Wysiadam” (ulubione linie ★ są przy wynikach)
      var more = document.createElement("details"); more.className = "gz-sub"; more.style.margin = "0 2px 8px";
      more.innerHTML = "<summary>" + esc(T("gzm.uMore", null, "Więcej opcji")) + '</summary><div style="display:flex;gap:10px;align-items:end;margin-top:6px"></div>' +
        '<div style="font-size:11.5px;margin-top:4px">' + esc(T("gzm.uMoreNote", null, "Okno czasu dotyczy listy odjazdów ze stacji (gdy „Dokąd” jest puste). Gwiazdka ☆ przy odjeździe zapamiętuje ulubioną linię.")) + "</div>";
      var win = a.querySelector("#gzWin"); if (win) more.querySelector("div").appendChild(win.parentNode);
      u.appendChild(more);
      var wm = document.getElementById("walkMeasure"); if (wm) u.appendChild(wm); // pomiar dojścia pod formularzem
      root.insertBefore(u, a);
      var aBar = a.querySelector(".gz-bar"); if (aBar) aBar.style.display = "none";
      var lbl = function (id, txt) { var l = u.querySelector('label[for="' + id + '"]'); if (l) l.textContent = txt; };
      var today = warsawNow().date, rg = index.range || [today, today];
      // data i godzina jak na tablicy głównej: dwa pola obok siebie, bez etykiet
      var tIn = u.querySelector("#gzCTime"), tDiv = tIn.parentNode, dWrap = document.createElement("div");
      dWrap.className = "gz-dt";
      dWrap.innerHTML = '<input id="gzCDate" type="date" autocomplete="off" aria-label="' + esc(T("gzm.uDate", null, "Data")) + '" title="' + esc(T("gzm.uDate", null, "Data")) + '">';
      tIn.setAttribute("aria-label", T("gzm.uWhen", null, "Kiedy")); tIn.title = T("gzm.uWhen", null, "Kiedy");
      dWrap.appendChild(tIn);
      tDiv.parentNode.insertBefore(dWrap, tDiv); tDiv.remove();
      var dIn = dWrap.querySelector("#gzCDate"); dIn.min = rg[0] > today ? rg[0] : today; dIn.max = rg[1] || today; dIn.value = today;
      tIn.setAttribute("autocomplete", "off"); tIn.value = C.fmt(warsawNow().min);
      lbl("gzCFrom", T("gzm.uFrom", null, "Skąd")); lbl("gzCTo", T("gzm.uTo", null, "Dokąd (puste = odjazdy ze stacji)")); lbl("gzCTime", T("gzm.uWhen", null, "Kiedy"));
      u.querySelector("#gzCFrom").placeholder = T("gzm.uFromPh", null, "stacja, przystanek, adres, 🏠 Dom…");
      u.querySelector("#gzCTo").placeholder = T("gzm.uToPh", null, "przystanek, stacja albo adres");
      if (cfg.stationId) {
        var sm = (index.stations || []).find(function (x) { return x.id === +cfg.stationId; });
        if (sm && opts.stationId) { u.querySelector("#gzCFrom").value = sm.n; u.querySelector("#gzCTo").value = ""; if (cfg.arr) u.querySelector("#gzCTime").value = cfg.arr; if (cfg.date && cfg.date >= dIn.min && cfg.date <= dIn.max) dIn.value = cfg.date; }
      }
      ["#gzCFrom", "#gzCTo"].forEach(function (q) { initDd(u.querySelector(q)); });
      // ⇅ zamiana Skąd ↔ Dokąd (podróż powrotna); gdy oba pola wypełnione — od razu szuka
      var fDiv = u.querySelector("#gzCFrom").closest(".gz-st"), tDiv2 = u.querySelector("#gzCTo").closest(".gz-st"), stack = document.createElement("div");
      stack.className = "gz-stack"; fDiv.parentNode.insertBefore(stack, fDiv); stack.appendChild(fDiv); stack.appendChild(tDiv2);
      var sw = document.createElement("button"); sw.type = "button"; sw.className = "gz-swap"; sw.textContent = "⇅";
      sw.title = T("gzm.uSwap", null, "Zamień miejscami (podróż powrotna)"); sw.setAttribute("aria-label", sw.title); stack.appendChild(sw);
      sw.addEventListener("click", function () {
        var a1 = u.querySelector("#gzCFrom"), b1 = u.querySelector("#gzCTo"), t = a1.value; a1.value = b1.value; b1.value = t;
        if (a1.value.trim() && b1.value.trim()) searchC();
      });
      var lic = root.querySelector(".gz-lic");
      if (lic) lic.insertAdjacentHTML("beforeend", " " + esc(T("gzm.uGeoLic", null, "Adresy: wyszukiwarka Nominatim, © OpenStreetMap contributors.")));
    }
    // Lista podpowiedzi (jak w planerze kolejowym): moje miejsca, stacje, przystanki GZM (cała sieć).
    var ddNames = null;
    function ddList() {
      if (ddNames) return Promise.resolve(ddNames);
      return getNet(warsawNow().date).then(function (net) { return Object.keys(net.byName); }, function () { return []; }).then(function (stops) {
        var stN = {}; (index.stations || []).forEach(function (x) { stN[x.n] = 1; });
        ddNames = Object.keys(stN).map(function (n) { return { n: n, k: "st" }; })
          .concat(stops.filter(function (n) { return !stN[n]; }).map(function (n) { return { n: n, k: "stop" }; }))
          .map(function (x) { x.f = normName(x.n); return x; });
        return ddNames;
      });
    }
    function ddMatch(q) {
      var f0 = normName(q), words = f0.split(/\s+/).filter(Boolean), out = [];
      if (!words.length) return out;
      Object.keys(PL_TOK).forEach(function (k) {
        var lab = normName(PL_TOK[k]).replace(/^[^a-z0-9]+/, "");
        if (lab.indexOf(f0) === 0 && (k === "gps" || load(PLACES, {})[k])) out.push({ n: PL_TOK[k], k: "pl", r: -1 });
      });
      (ddNames || []).forEach(function (x) {
        var ws = x.f.split(/[\s\-–.,()]+/), ok = words.every(function (w) { return ws.some(function (z) { return z.indexOf(w) === 0; }); });
        if (!ok) return;
        var r = (x.f.indexOf(f0) === 0 ? 0 : 2) + (x.k === "st" ? 0 : 1);
        out.push({ n: x.n, k: x.k, r: r });
      });
      return out.sort(function (a, b) { return a.r - b.r || a.n.length - b.n.length || a.n.localeCompare(b.n, "pl"); }).slice(0, 12);
    }
    function initDd(inp) {
      if (!inp) return;
      inp.removeAttribute("list");
      var w = document.createElement("div"); w.className = "gz-ddw"; inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
      var dd = document.createElement("div"); dd.className = "gz-dd"; w.appendChild(dd);
      var KIND = { st: T("gzm.ddSt", null, "stacja"), stop: T("gzm.ddStop", null, "przystanek"), pl: T("gzm.ddPl", null, "moje miejsce") };
      var timer = null;
      function close() { dd.classList.remove("open"); dd.innerHTML = ""; }
      function show() {
        var q = inp.value.trim();
        if (q.length < 2) { close(); return; }
        ddList().then(function () {
          if (inp.value.trim() !== q) return;
          var m = ddMatch(q);
          if (!m.length || (m.length === 1 && m[0].n === q)) { close(); return; }
          dd.innerHTML = m.map(function (x) { return '<button type="button" class="gz-dd-item" data-n="' + esc(x.n) + '"><span class="gz-dd-name">' + esc(x.n) + '</span><span class="gz-dd-kind">' + esc(KIND[x.k]) + "</span></button>"; }).join("");
          dd.classList.add("open");
        });
      }
      function pick(n) { inp.value = n; close(); }
      inp.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(show, 150); });
      inp.addEventListener("focus", function () { if (inp.value.trim().length >= 2) show(); });
      inp.addEventListener("blur", function () { setTimeout(close, 180); });
      // ↓/↑ zaznaczenie, Enter wybiera (wyszukiwanie uruchamia dotychczasowy Enter), Esc zamyka
      inp.addEventListener("keydown", function (e) {
        var items = dd.classList.contains("open") ? [].slice.call(dd.querySelectorAll(".gz-dd-item")) : [];
        var cur = items.findIndex(function (b) { return b.classList.contains("active"); });
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (!items.length) return; e.preventDefault();
          var nx = e.key === "ArrowDown" ? Math.min(cur + 1, items.length - 1) : Math.max(cur - 1, 0);
          items.forEach(function (b, i) { b.classList.toggle("active", i === nx); }); items[nx].scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter" && items.length && cur >= 0) { pick(items[cur].dataset.n); }
        else if (e.key === "Escape") close();
      }, true);
      dd.addEventListener("mousedown", function (e) { e.preventDefault(); });
      dd.addEventListener("click", function (e) { var b = e.target.closest(".gz-dd-item"); if (b) { pick(b.dataset.n); inp.focus(); } });
    }
    // przewinięcie do pierwszego wyniku (pod przyklejonym paskiem zakładek)
    function scrollToFirst(box, sel) {
      var t0 = Date.now();
      (function poll() {
        var el = box && box.querySelector(sel || ".gz-dep, .gz-warn, .gz-empty:not(.gz-searching)");
        if (!el || box.querySelector(".gz-searching")) { if (Date.now() - t0 < 15000) setTimeout(poll, 200); return; }
        var go = function (beh) { var y = el.getBoundingClientRect().top + window.pageYOffset - 90; window.scrollTo({ top: Math.max(0, y), behavior: beh }); };
        go("smooth");
        // płynne przewijanie bywa przerwane (np. doładowanie wyników) — po chwili korekta
        setTimeout(function () { if (Math.abs(el.getBoundingClientRect().top - 90) > 30) go("auto"); }, 900);
      })();
    }
    function announce(from, to) {
      try {
        var d = root.querySelector("#gzCDate"), t = root.querySelector("#gzCTime");
        window.dispatchEvent(new CustomEvent("gzmsearch", { detail: { from: from, to: to || "", date: (d && d.value) || warsawNow().date, time: (t && t.value) || C.fmt(warsawNow().min) } }));
      } catch (e) {}
    }
    function clearAll() {
      cState = null; tripOpen = {};
      var r1 = root.querySelector("#gzCRes"), r2 = root.querySelector("#gzBody");
      if (r1) r1.innerHTML = ""; if (r2) r2.innerHTML = "";
    }
    function searchBusy(on) {
      var b = root.querySelector("#gzCGo"); if (!b) return;
      if (on) { b.dataset.lbl = b.dataset.lbl || b.innerHTML; b.innerHTML = "⏳ " + esc(T("gzm.uBusy", null, "Szukam…")); b.disabled = true; }
      else if (b.dataset.lbl) { b.innerHTML = b.dataset.lbl; b.disabled = false; }
    }
    // stacja + puste „Dokąd” → lista odjazdów ze stacji (dawne „Wysiadam z pociągu”)
    function goA(stn, tmin) {
      cfg.stationId = String(stn.id); st.stationId = cfg.stationId; cfg.arr = C.fmt(tmin); cfg.train = null; trainInfo = null; cfg.alighted = false;
      dests[cfg.stationId] = ""; save(DEST, dests); save(LS, st);
      clearAll();
      var sel = root.querySelector("#gzSt"); if (sel) sel.value = cfg.stationId;
      var ar = root.querySelector("#gzArr"); if (ar) ar.value = cfg.arr;
      var di = root.querySelector("#gzDest"); if (di) di.value = "";
      showMore = 0; setMode("A"); load1();
      scrollToFirst(root.querySelector("#gzBody"), ".gz-dep.ok, .gz-dep.tight, .gz-warn, .gz-farbox");
    }
    // ===== Adres → współrzędne (OSM Nominatim, tylko po kliknięciu Szukaj; wyniki zapamiętane na urządzeniu) =====
    var GEO = "gzmGeoCacheV2";
    function looksAddress(txt) { return /\d|,|^\s*(ul\.|al\.|pl\.|os\.)/i.test(txt); }
    function geocode(txt) {
      var key = normName(txt), cache = load(GEO, {});
      if (cache[key]) return Promise.resolve(cache[key]);
      var q = new URLSearchParams({ format: "jsonv2", q: txt, addressdetails: "1", countrycodes: "pl", viewbox: "18.2,50.75,19.75,49.9", bounded: "1", limit: "1", "accept-language": "pl" });
      return fetch("https://nominatim.openstreetmap.org/search?" + q, { headers: { Accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : []; }).then(function (j) {
        if (!j || !j[0]) return null;
        var ad = j[0].address || {}, street = [ad.road || ad.pedestrian || ad.square || j[0].name || "", ad.house_number || ""].join(" ").trim(), town = ad.city || ad.town || ad.village || ad.suburb || "";
        var lab = [street, town].filter(Boolean).join(", ") || String(j[0].display_name || txt).split(",").slice(0, 2).join(",");
        var v = { lat: +(+j[0].lat).toFixed(6), lon: +(+j[0].lon).toFixed(6), label: "📍 " + lab };
        cache[key] = v; var ks = Object.keys(cache); if (ks.length > 40) delete cache[ks[0]]; save(GEO, cache);
        return v;
      }).catch(function () { return null; });
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
    var egressIx = null, depFiles = {}, cState = null, netP = {};
    // cała sieć GZM na dzień (≈ 300 KB po kompresji) — raz na dzień, przygotowana do wyszukiwania
    function getNet(date) {
      if (!window.GzmRaptor) return Promise.reject(new Error("raptor"));
      if (!netP[date]) netP[date] = fetch(dataUrl("network/" + date + ".json")).then(function (r) { if (!r.ok) throw new Error("net"); return r.json(); }).then(function (j) { return GzmRaptor.prepare(j); });
      return netP[date];
    }
    function netNames(net, txt) {
      var n = normName(txt), keys = Object.keys(net.byName);
      var ex = keys.filter(function (k) { return normName(k) === n; });
      return ex.length ? ex : keys.filter(function (k) { return normName(k).indexOf(n) >= 0; });
    }
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
    // ===== Jedno wyszukiwanie pociąg + GZM (cała sieć) =====
    // ===== Moje miejsca: 🏠 Dom, 🏢 Praca, 📍 Moja lokalizacja (TEST — tylko profil autora) =====
    var PLACES = "gzmPlacesV1";
    function placesOn() { return true; }   // 🏠 Dom / 🏢 Praca / 📍 — dla wszystkich od v5.25
    var PL_TOK = { dom: "🏠 " + T("gzm.pDom", null, "Dom"), praca: "🏢 " + T("gzm.pPraca", null, "Praca"), gps: "📍 " + T("gzm.pGps", null, "Moja lokalizacja") };
    function placeKey(txt) {
      if (!placesOn()) return null;
      var n = normName(txt).replace(/^[^a-z0-9]+/, "");
      if (n === normName(T("gzm.pDom", null, "Dom")) || n === "dom") return "dom";
      if (n === normName(T("gzm.pPraca", null, "Praca")) || n === "praca") return "praca";
      if (n === normName(T("gzm.pGps", null, "Moja lokalizacja")) || n === "moja lokalizacja" || n === "tu jestem") return "gps";
      return null;
    }
    function gpsNow() {
      return new Promise(function (res, rej) {
        if (!navigator.geolocation) return rej(new Error("gps"));
        navigator.geolocation.getCurrentPosition(function (p) { res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); }, function () { rej(new Error("gps")); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
      });
    }
    function resolvePlace(txt) {
      var k = placeKey(txt);
      if (!k && uniOn() && !stationByName(txt) && looksAddress(txt)) return geocode(txt).then(function (g) {
        if (!g) throw new Error("addr:" + txt);
        return { key: "addr", label: g.label, lat: g.lat, lon: g.lon, far: true };
      });
      if (!k) return Promise.resolve(null);
      if (k === "gps") return gpsNow().then(function (g) { return { key: k, label: PL_TOK.gps, lat: g.lat, lon: g.lon }; });
      var pl = load(PLACES, {})[k];
      if (!pl) return Promise.reject(new Error("unset:" + k));
      return Promise.resolve({ key: k, label: PL_TOK[k], lat: pl.lat, lon: pl.lon, walks: pl.walks || null });
    }
    // Profil: każde miejsce to osobny klucz (zmiana jednego nie nadpisuje drugiego); null = usunięte.
    var PL_PROF = { dom: "gzmPlaceDom", praca: "gzmPlacePraca" };
    function profOn() { return !!(window.ProfileSync && ProfileSync.getToken && ProfileSync.getToken()); }
    function putPlace(k, v) {
      var P = load(PLACES, {}); if (v) P[k] = v; else delete P[k]; save(PLACES, P);
      if (profOn()) { var patch = {}; patch[PL_PROF[k]] = v || null; ProfileSync.push(patch); }
    }
    // Odczyt z profilu → to urządzenie. Miejsca ustawione tu przed zapisem w profilu
    // (klucza jeszcze nie ma) wysyłamy raz, żeby nie przepadły.
    function syncPlaces() {
      if (!profOn() || !ProfileSync.pull) return Promise.resolve(false);
      return ProfileSync.pull().then(function (d) {
        if (!d) return false;
        var P = load(PLACES, {}), up = {}, ch = false;
        Object.keys(PL_PROF).forEach(function (k) {
          var v = d[PL_PROF[k]];
          if (v === undefined) { if (P[k]) up[PL_PROF[k]] = P[k]; }
          else if (!v || typeof v.lat !== "number" || typeof v.lon !== "number") { if (P[k]) { delete P[k]; ch = true; } }
          else if (JSON.stringify(P[k] || null) !== JSON.stringify(v)) { P[k] = v; ch = true; }
        });
        if (ch) save(PLACES, P);
        if (Object.keys(up).length) ProfileSync.push(up);
        return ch;
      }).catch(function () { return false; });
    }
    var FAR_MAX = 2500;
    function farStops(net, x) {
      var by = {}, best = null;
      for (var i = 0; i < net.n; i++) {
        var d = havM(x.lat, x.lon, net.lat[i], net.lon[i]), nm = net.name[i];
        if (!best || d < best.d) best = { name: nm, d: d };
        if (d > FAR_MAX) continue;
        if (!by[nm]) by[nm] = { name: nm, d: d, idx: [] };
        by[nm].idx.push(i); if (d < by[nm].d) by[nm].d = d;
      }
      var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 3);
      list.forEach(function (o) { o.walk = walkMin(o.d); });
      return { list: list, nearest: best };
    }
    function kmTxt(m) { return m < 950 ? Math.round(m / 10) * 10 + " m" : (Math.round(m / 100) / 10).toString().replace(".", ",") + " km"; }
    function farBadge() { return '<span class="gz-far" title="' + esc(T("gzm.farTitle", null, "Dalej niż zwykle — przystanek ZTM poza typowym dojściem od stacji")) + '">' + esc(T("gzm.farLetter", null, "D")) + "</span>"; }
    // stacja jako punkt startu/celu: słupki w zasięgu albo (gdy brak) najbliższe przystanki „D”
    function stationNet(net, stn) {
      var p = polesOf(stn);
      if (p.length) return { label: stn.n, stops: p };
      var fs2 = farStops(net, stn), stops = [];
      fs2.list.forEach(function (o) { o.idx.forEach(function (i) { stops.push({ s: i, walk: walkMin(havM(stn.lat, stn.lon, net.lat[i], net.lon[i])) + 2, d: havM(stn.lat, stn.lon, net.lat[i], net.lon[i]), far: true }); }); });
      return { label: stn.n, stops: stops };
    }
    function havM(a, b, c, d) { var R = 6371000, t = Math.PI / 180, x = Math.pow(Math.sin((c - a) * t / 2), 2) + Math.cos(a * t) * Math.cos(c * t) * Math.pow(Math.sin((d - b) * t / 2), 2); return 2 * R * Math.asin(Math.sqrt(x)); }
    // ×1,15 na kluczenie ulicami, 1,2 m/s (pomiary autora 31.10: dom → stanowisko 432 m w 5:49, peron → dom 572 m w 10:08)
    function walkMin(m) { return Math.max(1, Math.ceil(m * 1.15 / 1.2 / 60)); }
    // Zmierzone dojścia (pomiar w planerze, walkMeasureV1): jeden koniec ≤ 150 m od miejsca, drugi przy przystanku
    // (ten sam przystanek — wszystkie stanowiska tej nazwy w pobliżu) albo przy stacji (pomiar „peron”).
    function measuredFor(net, pl) {
      var res = (load("walkMeasureV1", {}).results || []), stops = {}, sts = {};
      res.forEach(function (r) {
        if (!r.from || !r.to || !(r.ms > 0)) return;
        var min = Math.max(1, Math.ceil(r.ms / 60000));
        [[r.from, r.to], [r.to, r.from]].forEach(function (pq) {
          var p = pq[0], q = pq[1];
          if (havM(pl.lat, pl.lon, p.lat, p.lon) > 150) return;
          var lim = Math.max(60, Math.min(q.acc || 60, 100)), bi = -1, bd = 1e9;
          for (var i = 0; i < net.n; i++) { var d = havM(q.lat, q.lon, net.lat[i], net.lon[i]); if (d < bd) { bd = d; bi = i; } }
          var stopEnd = bi >= 0 && bd <= lim && !(/peron/.test(r.kind || "") && !/stanowisk|przystan/i.test(r.name || ""));
          if (stopEnd) {
            for (var j = 0; j < net.n; j++) if (net.name[j] === net.name[bi] && havM(q.lat, q.lon, net.lat[j], net.lon[j]) <= 200) stops[j] = Math.min(stops[j] || 1e9, min);
          } else if (/peron/.test(r.kind || "")) {
            (index.stations || []).forEach(function (x) { if (havM(q.lat, q.lon, x.lat, x.lon) <= 300) sts[x.id] = Math.min(sts[x.id] || 1e9, min); });
          }
        });
      });
      return { stops: stops, sts: sts };
    }
    // przystanki w zasięgu pieszym miejsca (≤ 900 m) + stacje w zasięgu (≤ 1,5 km, + 2 min na peron)
    function placeReach(net, pl) {
      var out = [];
      var rS = pl.far ? 1500 : 900, rT = pl.far ? 2000 : 1500;
      for (var i = 0; i < net.n; i++) { var d = havM(pl.lat, pl.lon, net.lat[i], net.lon[i]); if (d <= rS) out.push({ s: i, walk: walkMin(d), d: d }); }
      var ms = measuredFor(net, pl);
      Object.keys(ms.stops).forEach(function (k) {
        k = +k; var o = out.find(function (x) { return x.s === k; });
        if (o) { o.walk = ms.stops[k]; o.measured = true; } else out.push({ s: k, walk: ms.stops[k], d: 0, measured: true });
      });
      out.sort(function (a, b) { return a.d - b.d; });
      pl.stops = out.slice(0, 30); pl.walkSt = {};
      (index.stations || []).forEach(function (x) { var d = havM(pl.lat, pl.lon, x.lat, x.lon); if (d <= rT) pl.walkSt[x.id] = walkMin(d) + 2; });
      Object.keys(ms.sts).forEach(function (k) { pl.walkSt[k] = ms.sts[k]; });
      var fw = pl.walks || {};
      Object.keys(fw.st || {}).forEach(function (nm) { var x = stationByName(nm); if (x) pl.walkSt[x.id] = +fw.st[nm]; });
      Object.keys(fw.stop || {}).forEach(function (nm) {
        (net.byName[nm] || []).forEach(function (si) {
          var o = pl.stops.find(function (x) { return x.s === si; });
          if (o) { o.walk = +fw.stop[nm]; o.fixed = true; o.measured = false; } else pl.stops.push({ s: si, walk: +fw.stop[nm], d: 0, fixed: true });
        });
      });
      return pl;
    }
    function searchC() {
      var fromTxt = root.querySelector("#gzCFrom").value.trim(), toTxt = root.querySelector("#gzCTo").value.trim();
      var tmin = C.hm(root.querySelector("#gzCTime").value) || Math.floor(warsawNow().min);
      st.cFrom = fromTxt; st.cTo = toTxt; save(LS, st);
      if (uniOn()) {
        clearAll();
        if (fromTxt) announce(fromTxt, toTxt);
        var fsU = stationByName(fromTxt);
        if (fsU && !toTxt) { var dU = root.querySelector("#gzCDate"); cfg.date = dU && dU.value && dU.value !== warsawNow().date ? dU.value : null; goA(fsU, tmin); return; }
        setMode("C");
        if (!fromTxt || !toTxt) { root.querySelector("#gzCRes").innerHTML = '<div class="gz-warn">' + esc(T("gzm.uNeed", null, "Wpisz, skąd i dokąd jedziesz. Samą stację w „Skąd” (puste „Dokąd”) — pokażę odjazdy autobusów i tramwajów spod niej.")) + "</div>"; return; }
      }
      if (!fromTxt || !toTxt || !window.GzmRaptor) return searchCOld();
      var res = root.querySelector("#gzCRes"), date = warsawNow().date;
      var dSel = uniOn() && root.querySelector("#gzCDate");
      if (dSel && dSel.value) {
        if ((dSel.max && dSel.value > dSel.max) || dSel.value < date) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.uDateRange", { a: dSel.min, b: dSel.max }, "Rozkład GZM mam na dni {a} – {b}.")) + "</div>"; return; }
        date = dSel.value;
      }
      var uniS = uniOn();
      // każde „Szukaj” zaczyna od zera: bez starych wyników (odświeżanie co 5 s nie może ich wstawić z powrotem)
      if (uniS) { clearAll(); }
      res.innerHTML = '<div class="gz-empty' + (uniS ? " gz-searching" : "") + '">' + (uniS ? "🔎 " : "") + esc(T("gzm.cSearching", null, "Układam podróż: dojazd, pociąg, dojazd do celu…")) + "</div>";
      if (uniS) {
        searchBusy(true);
        var sr = res.querySelector(".gz-searching"), ry = sr.getBoundingClientRect();
        if (ry.top < 80 || ry.bottom > window.innerHeight) window.scrollTo({ top: Math.max(0, ry.top + window.pageYOffset - window.innerHeight / 3), behavior: "smooth" });
        scrollToFirst(res);
        var stopBusy = setInterval(function () { if (!res.querySelector(".gz-searching")) { clearInterval(stopBusy); searchBusy(false); } }, 200);
        setTimeout(function () { clearInterval(stopBusy); searchBusy(false); }, 20000);
      }
      var fromPlace = null, toPlace = null;
      Promise.all([resolvePlace(fromTxt), resolvePlace(toTxt)]).then(function (pp) { fromPlace = pp[0]; toPlace = pp[1]; return Promise.all([getNet(date), getRt()]); }, function (e) {
        var m = String(e && e.message || "");
        if (m.indexOf("addr:") === 0) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.uNoAddr", { a: m.slice(5) }, "Nie znalazłem adresu „{a}” (szukam na Śląsku). Dopisz miasto, np. „Opolska 5, Tarnowskie Góry”.")) + "</div>"; throw "handled"; }
        res.innerHTML = '<div class="gz-warn">' + esc(m.indexOf("unset:") === 0 ? T("gzm.pUnset", { p: PL_TOK[m.slice(6)] }, "Najpierw ustaw miejsce {p} — poniżej, w „Moje miejsca”.") : T("gzm.pGpsErr", null, "Nie udało się odczytać lokalizacji GPS (zgoda w przeglądarce?).")) + "</div>";
        throw "handled";
      }).then(function (r) {
        var net = r[0], code = GzmRaptor.byCode(net);
        if (fromPlace) placeReach(net, fromPlace);
        if (toPlace) placeReach(net, toPlace);
        var fromSt = fromPlace ? null : stationByName(fromTxt), toSt = toPlace ? null : stationByName(toTxt);
        var fN = fromSt || fromPlace ? (fromPlace ? [] : null) : netNames(net, fromTxt), tN = toSt || toPlace ? (toPlace ? [] : null) : netNames(net, toTxt);
        if (fromPlace && !fromPlace.stops.length && !Object.keys(fromPlace.walkSt).length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.pFar", null, "W pobliżu tego miejsca nie ma przystanku GZM ani stacji (900 m).")) + "</div>"; return; }
        if (toPlace && !toPlace.stops.length && !Object.keys(toPlace.walkSt).length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.pFar", null, "W pobliżu tego miejsca nie ma przystanku GZM ani stacji (900 m).")) + "</div>"; return; }
        if (!fromSt && !fromPlace && !fN.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoTo", { d: fromTxt }, "Nie znam przystanku „{d}”.")) + "</div>"; return; }
        if (!toSt && !toPlace && !tN.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoTo", { d: toTxt }, "Nie znam przystanku „{d}”.")) + "</div>"; return; }
        var withStops = (index.stations || []).filter(function (x) { return x.s && x.s.length; });
        // stacje przy starcie: gdzie najwcześniej będę na peronie (cała sieć, do 1 przesiadki)
        var accSt;
        if (fromSt) accSt = [fromSt];
        else {
          var star = GzmRaptor.reachAll(net, fromPlace ? { fromStops: fromPlace.stops.map(function (x) { return { s: x.s, t: tmin + x.walk }; }), dep: tmin, rt: rt, maxTransfers: 1 } : { from: fN, dep: tmin, rt: rt, maxTransfers: 1 }) || [];
          accSt = (index.stations || []).filter(function (x) { return (x.s && x.s.length) || (fromPlace && fromPlace.walkSt[x.id] != null); }).map(function (x) {
            var best = 1e9; (x.s || []).forEach(function (p) { var i = code[p[0]]; if (i != null && star[i] + p[3] < best) best = star[i] + p[3]; });
            if (fromPlace && fromPlace.walkSt[x.id] != null) best = Math.min(best, tmin + fromPlace.walkSt[x.id]);
            return { st: x, plat: best };
          }).filter(function (x) { return x.plat < 1e8 && (!toSt || x.st.id !== toSt.id); }).sort(function (a, b) { return a.plat - b.plat; }).slice(0, 2).map(function (x) { return x.st; });
        }
        // stacje przy celu: najbliższe celowi (w linii prostej) stacje z przystankami GZM
        var egrSt;
        if (toSt) egrSt = [toSt];
        else {
          var d0 = toPlace ? -1 : net.byName[tN[0]][0], la = toPlace ? toPlace.lat : net.lat[d0], lo = toPlace ? toPlace.lon : net.lon[d0];
          egrSt = (index.stations || []).filter(function (x) { return (x.s && x.s.length) || (toPlace && toPlace.walkSt[x.id] != null); }).map(function (x) { return { st: x, d: Math.pow(x.lat - la, 2) + Math.pow((x.lon - lo) * 0.64, 2) }; })
            .filter(function (x) { return !fromSt || x.st.id !== fromSt.id; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 2).map(function (x) { return x.st; });
        }
        var combos = [];
        accSt.forEach(function (a) { egrSt.forEach(function (e) { if (a.id !== e.id) combos.push({ a: { st: a }, e: { st: e } }); }); });
        combos = combos.slice(0, 3);
        var date2 = date;
        return Promise.all(combos.map(function (cb) {
          var q = new URLSearchParams({ from: cb.a.st.n, to: cb.e.st.n, date: date2, time: C.fmt(tmin), transferMinutes: "3" });
          return fetch("/api/planner?" + q, { headers: { Accept: "application/json" } }).then(function (x) { return x.json(); }).then(function (pl) {
            return { cb: cb, its: (pl && pl.itineraries) || [], query: pl && pl.query };
          }).catch(function () { return null; });
        })).then(function (parts) {
          cState = { mm: true, net: net, code: code, fN: fN, tN: tN, fromSt: fromSt, toSt: toSt, fromPlace: fromPlace, toPlace: toPlace, uni: uniOn(), parts: parts.filter(Boolean), tmin: tmin, date: date, more: {}, tDelay: {}, cache: {},
            live: date === warsawNow().date && tmin >= Math.floor(warsawNow().min) - 5, netFrom: (!fromSt && !toSt) ? fN : null, netTo: (!fromSt && !toSt) ? tN : null };
          renderC(); trainLiveC();
        });
      }).catch(function (e) { if (e !== "handled") searchCOld(); });
    }
    // słupki stacji: indeks w sieci + dojście peron ↔ słupek (górna granica)
    function polesOf(stn) { var out = []; (stn.s || []).forEach(function (p) { var i = cState.code[p[0]]; if (i != null) out.push({ s: i, walk: p[3] }); }); return out; }
    // wiersz podróży GZM (może mieć przesiadki), z dopiskiem i statusem
    function jRow(jn, extra, status) {
      if (tripExpandOn()) return jRow2(jn, extra, status);
      var rides = jn.legs.filter(function (l) { return l.type === "ride"; }), r0 = rides[0];
      var inMin = Math.round(r0.dep - nowOn(cState.date));
      var legs = jn.legs.map(function (l) {
        if (l.type === "walk") return "🚶 " + l.min + (l.fromName && !l.from && l.from !== 0 ? " " + esc(l.toName && l.fromName.charAt(0) > "~" ? "→ " + l.toName : "") : "");
        return "<b>" + esc(l.line) + "</b> " + C.fmt(l.dep) + " " + esc(l.fromName) + " → " + esc(l.toName) + " " + C.fmt(l.arr) + (l.live && l.delay ? " (+" + l.delay + ")" : "");
      }).join(" · ");
      var stTxt = status === "ok" ? "🟢 " + T("gzm.st.ok", null, "zdążysz") : status === "tight" ? "🟡 " + T("gzm.st.tight", null, "na styk") : status === "missed" ? "🔴 " + T("gzm.cTooLate", null, "za późno na ten pociąg") : "";
      return '<div class="gz-dep ' + (status || "ok") + '">' +
        '<div class="gz-line ' + r0.kind + '">' + esc(r0.line) + "<small>" + TYPE_ICON[r0.kind] + (rides.length > 1 ? " +" + (rides.length - 1) : "") + "</small></div>" +
        '<div class="gz-main"><div class="gz-stop" style="white-space:normal;color:#fff">' + legs + "</div>" + (extra ? '<div class="gz-stop" style="white-space:normal">' + extra + "</div>" : "") + "</div>" +
        '<div class="gz-right"><div class="gz-t">' + ((r0.live && r0.delay) ? '<span class="plan-strike">' + C.fmt(r0.depPlan) + "</span> " : "") + C.fmt(r0.dep) + '</div><div class="gz-in">' + (inMin > 180 || inMin < -1 ? "" : inMin <= 0 ? esc(T("gzm.now", null, "teraz")) : esc(T("gzm.inMin", { n: inMin }, "za {n} min"))) + "</div>" + (stTxt ? '<div class="gz-in gz-st-' + status + '">' + esc(stTxt) + "</div>" : "") + "</div></div>";
    }
    // podróż RAPTOR-a z miejsca/do miejsca: dopisz dojście pieszo na początku/końcu (i przesuń przyjazd)
    function withPlaceWalks(jn, fromPl, toPl) {
      if (fromPl) {
        var r0 = jn.legs.find(function (l) { return l.type === "ride"; }), w0 = fromPl.stops.find(function (x) { return x.s === (jn.legs[0].type === "walk" ? jn.legs[0].from : r0.from); });
        if (w0) { jn.legs.unshift({ type: "walk", min: w0.walk, measured: !!w0.measured, fixed: !!w0.fixed, far: !!w0.far, dist: w0.d, fromName: fromPl.label, toName: S_name(jn.legs[0].type === "walk" ? jn.legs[0].from : r0.from) }); jn.leave = (jn.legs[1].type === "walk" ? r0.dep - jn.legs[1].min : r0.dep) - w0.walk; }
      }
      if (toPl) {
        var last = jn.legs[jn.legs.length - 1], w1 = toPl.stops.find(function (x) { return x.s === last.to; });
        if (w1) { jn.legs.push({ type: "walk", min: w1.walk, measured: !!w1.measured, fixed: !!w1.fixed, far: !!w1.far, dist: w1.d, fromName: S_name(last.to), toName: toPl.label }); jn.arr += w1.walk; }
      }
      return jn;
    }
    function S_name(i) { return cState.net.name[i]; }
    function fromOpts(S, t) { return S.fromPlace ? { fromStops: S.fromPlace.stops.map(function (x) { return { s: x.s, t: t + x.walk }; }), dep: t } : { from: S.fN, dep: t }; }
    function jRow2(jn, extra, status) {
      var rides = jn.legs.filter(function (l) { return l.type === "ride"; }), r0 = rides[0], k = jKey(jn);
      var inMin = Math.round(r0.dep - nowOn(cState.date));
      var fin = String(extra || "").replace(/^🚉 /, "").replace(/^🏁 /, esc(T("gzm.bArrive", null, "na miejscu")) + " ");
      var stTxt = status === "ok" ? "🟢 " + T("gzm.st.ok", null, "zdążysz") : status === "tight" ? "🟡 " + T("gzm.st.tight", null, "na styk") : status === "missed" ? "🔴 " + T("gzm.cTooLate", null, "za późno na ten pociąg") : "";
      return '<div class="gz-dep ' + (status || "ok") + '" data-tripx="' + esc(k) + '" style="grid-template-columns:minmax(0,1fr) auto">' +
        '<div class="gz-main">' + legsHtml(jn) + (fin ? '<div class="gz-fin">' + fin + "</div>" : "") +
        '<div class="gz-tap">' + esc(tripOpen[k] ? T("gzm.tHide", null, "▲ zwiń trasę") : T("gzm.tShow", null, "▼ trasa kursu i gdzie jest teraz")) + "</div></div>" +
        '<div class="gz-right"><div class="gz-t">' + ((r0.live && r0.delay) ? '<span class="plan-strike">' + C.fmt(r0.depPlan) + "</span> " : "") + C.fmt(r0.dep) + '</div><div class="gz-in">' + (inMin > 180 || inMin < -1 ? "" : inMin <= 0 ? esc(T("gzm.now", null, "teraz")) : esc(T("gzm.inMin", { n: inMin }, "za {n} min"))) + "</div>" + (stTxt ? '<div class="gz-in gz-st-' + status + '">' + esc(stTxt) + "</div>" : "") + "</div></div>" +
        (tripOpen[k] ? tripsOfJourney(jn) : "");
    }
    // ===== Pociągi w karcie podróży (TEST — tylko profil autora) =====
    var trainRun = {};
    function trainLegsHtml(it, x) {
      var L = it.legs || [];
      var out = L.map(function (l, i) {
        var lab = ((l.train && l.train.category) || "") + " " + ((l.train && l.train.number) || "");
        var last = i === L.length - 1, arrTxt = last && x.tDelay ? '<span class="plan-strike">' + esc(l.alight.time) + "</span> " + C.fmt(x.arr) + " (+" + x.tDelay + " min)" : esc(l.alight.time);
        var row = '<div class="gz-leg"><span class="ln">🚆 ' + esc(lab.trim()) + '</span><span><span class="tm">' + esc(l.board.time) + "</span> " + esc(l.board.stationName) + "</span>" +
          '<span class="to">→ <b>' + arrTxt + "</b> " + esc(l.alight.stationName) + "</span></div>";
        if (i > 0) {
          var p = L[i - 1], ch = C.hm(l.board.time) - C.hm(p.alight.time); if (ch < 0) ch += 1440;
          row = '<div class="gz-walk">🔁 ' + esc(T("gzm.tChange", { s: l.board.stationName, n: ch }, "przesiadka: {s}, {n} min")) + "</div>" + row;
        }
        return row;
      }).join("");
      return '<div class="gz-legs" style="margin-top:2px">' + out + "</div>";
    }
    function trainRunsHtml(it, date) {
      var html = (it.legs || []).map(function (l, i) {
        var k = date + "|" + (l.scheduleId || "") + "|" + l.orderId, c = trainRun[k];
        var head = "<h5>🚆 " + esc((((l.train && l.train.category) || "") + " " + ((l.train && l.train.number) || "")).trim()) + " · " + esc(l.board.stationName) + " → " + esc(l.alight.stationName) + "</h5>";
        if (!l.orderId) return head + '<div class="gz-sub">' + esc(T("gzm.tNone", null, "Brak danych o biegu tego kursu.")) + "</div>";
        if (!c || (Date.now() - c.at > 120000 && !c.loading)) {
          trainRun[k] = { at: Date.now(), loading: true };
          var q = new URLSearchParams({ scheduleId: l.scheduleId || "", orderId: l.orderId, operatingDate: date, train: (l.train && l.train.number) || "" });
          fetch("/api/train-details?" + q, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { trainRun[k] = { at: Date.now(), d: d }; rerender(); })
            .catch(function () { trainRun[k] = { at: Date.now(), d: null }; rerender(); });
          return head + '<div class="gz-sub">' + esc(T("gzm.tLoading", null, "Wczytuję bieg kursu…")) + "</div>";
        }
        if (c.loading) return head + '<div class="gz-sub">' + esc(T("gzm.tLoading", null, "Wczytuję bieg kursu…")) + "</div>";
        var route = c.d && Array.isArray(c.d.route) ? c.d.route : null;
        if (!route || !route.length) return head + '<div class="gz-sub">' + esc(T("gzm.tNone", null, "Brak danych o biegu tego kursu.")) + "</div>";
        var nb = normName(l.board.stationName), na = normName(l.alight.stationName), lastC = -1;
        route.forEach(function (r, j) { if (r.status === "confirmed") lastC = j; });
        var pos = c.d.lastConfirmedStation ? '<div class="gz-trip-pos">📍 ' + esc(T("gzm.tTrainPos", { s: c.d.lastConfirmedStation.station || c.d.lastConfirmedStation, n: c.d.delay || 0 }, "ostatnio potwierdzony: {s} · opóźnienie {n} min")) + "</div>" : '<div class="gz-trip-pos" style="color:var(--muted)">' + esc(T("gzm.tNoPos", null, "brak pozycji na żywo — godziny wg rozkładu")) + "</div>";
        var rows = route.map(function (r, j) {
          var nm = normName(r.stationName), me = nm === nb || nm === na;
          // na stacji wysiadki — przyjazd, w pozostałych — odjazd
          var useArr = nm === na && !!r.plannedArrival;
          var plan = useArr ? r.plannedArrival : (r.plannedDeparture || r.plannedArrival || r.plannedTime || "");
          var real = r.status === "confirmed" ? (useArr ? r.actualArrival : (r.actualDeparture || r.actualArrival || r.actualTime)) : (useArr ? r.forecastArrival : (r.forecastDeparture || r.forecastArrival || ""));
          var t = real && real !== plan ? '<span class="plan-strike">' + esc(plan) + "</span> " + esc(real) : esc(plan);
          return '<div class="gz-tr' + (j <= lastC ? " past" : "") + (me ? " me" : "") + (j === lastC ? " here" : "") + '"><div>' + t + "</div><div>" + (j === lastC ? "📍 " : "") + esc(r.stationName) + (r.platform && r.platform !== "-" ? ' <span style="color:var(--muted);font-weight:400">· ' + esc(T("gzm.tPlat", { p: r.platform }, "peron {p}")) + "</span>" : "") + "</div></div>";
        }).join("");
        return head + pos + rows;
      }).join("");
      return '<div class="gz-trip">' + html + "</div>";
    }
    function renderMM() {
      var res = root.querySelector("#gzCRes"), S = cState, now = nowOn(S.date), base = S.live ? Math.max(S.tmin, now) : S.tmin, out = [];
      if ((S.fromPlace || S.toPlace) && !S.fromSt && !S.toSt && !S.netFrom) { S.netFrom = S.fN || []; S.netTo = S.tN || []; }
      // jeden formularz: stacja jako punkt z przystankami pod nią (dojście z peronu) — sama komunikacja też od/do stacji
      if (S.uni && !S.netFrom) {
        S.fromNet = S.fromPlace || (S.fromSt ? stationNet(S.net, S.fromSt) : null);
        S.toNet = S.toPlace || (S.toSt ? stationNet(S.net, S.toSt) : null);
        if ((S.fromNet ? S.fromNet.stops.length : (S.fN || []).length) && (S.toNet ? S.toNet.stops.length : (S.tN || []).length)) { S.netFrom = S.fN || []; S.netTo = S.tN || []; }
      }
      // tylko GZM (gdy oba końce to przystanki)
      if (S.netFrom && S.netTo) {
        if (S.netRtAt !== rtAt || !S.netRes) {
          S.netRtAt = rtAt;
          var fP = S.fromNet || S.fromPlace, tP = S.toNet || S.toPlace;
          var o = Object.assign(fP ? { fromStops: fP.stops.map(function (x) { return { s: x.s, t: base + x.walk }; }), dep: base } : { from: S.fN, dep: base }, { rt: rt, maxTransfers: 2, count: 5, maxDep: base + 180 });
          if (tP) o.toStops = tP.stops.map(function (x) { return { s: x.s, walk: x.walk }; }); else o.to = S.netTo;
          S.netRes = GzmRaptor.search(S.net, o).map(function (jn) { return withPlaceWalks(jn, fP, tP); });
        }
        S.netRes.forEach(function (jn) { out.push({ net: jn, final: jn.arr, start: jn.leave != null ? jn.leave : jn.dep }); });
      }
      S.parts.forEach(function (p) {
        var aP = polesOf(p.cb.a.st), eP = polesOf(p.cb.e.st), walkA = {};
        aP.forEach(function (x) { walkA[x.s] = x.walk; });
        p.its.slice(0, 5).forEach(function (it) {
          var dep = C.hm(it.departureTime), arr = C.hm(it.arrivalTime);
          if (dep < S.tmin - 60) dep += 1440;
          if (arr < dep % 1440 || it.arrivalNextDay) arr += 1440;
          var key = cKey(p, it), tl = S.tDelay[key], tD = tl ? tl.d : 0; arr += tD;
          var ck = key + "|" + rtAt + "|" + base + "|" + tD + "|" + ((S.more && S.more[key]) || 0) + "|" + ((S.more && S.more["a|" + key]) || 0);
          var c = S.cache[ck];
          if (!c) {
            c = {};
            var walkFromA = !S.fromSt && !S.fromPlace ? aP.filter(function (x) { return S.fN.indexOf(S.net.name[x.s]) >= 0; }) : [];
            var plWalkA = S.fromPlace && S.fromPlace.walkSt[p.cb.a.st.id];
            if (plWalkA != null && plWalkA <= 20) {
              if (base + plWalkA > dep) { S.cache[ck] = { skip: true }; return; }
              c.walkA = { min: plWalkA, name: S.fromPlace.label, leave: dep - plWalkA - C.OK_SLACK };
            } else if (walkFromA.length) {
              var wA = Math.min.apply(null, walkFromA.map(function (x) { return x.walk; }));
              if (base + wA > dep) { S.cache[ck] = { skip: true }; return; }
              c.walkA = { min: wA, name: S.net.name[walkFromA[0].s], leave: dep - wA - C.OK_SLACK };
            } else if (!S.fromSt) {
              if (base > dep) return;
              var J = GzmRaptor.search(S.net, Object.assign(fromOpts(S, base), { toStops: aP.map(function (x) { return x.s; }), rt: rt, maxTransfers: 1, count: 6 + 5 * ((S.more && S.more["a|" + key]) || 0), maxDep: dep })).map(function (jn) { return withPlaceWalks(jn, S.fromPlace, null); });
              c.acc = J.map(function (jn) {
                var last = jn.legs[jn.legs.length - 1], stop = last.to, plat = jn.arr + (walkA[stop] != null ? walkA[stop] : 3), sl = dep - plat;
                return { jn: jn, plat: plat, slack: sl, status: sl >= C.OK_SLACK ? "ok" : sl >= 0 ? "tight" : "missed" };
              });
              var okA = c.acc.filter(function (x) { return x.status !== "missed"; });
              if (!okA.length) { S.cache[ck] = { skip: true }; return; }
              var safe = okA.filter(function (x) { return x.status === "ok"; });
              c.latest = (safe.length ? safe : okA)[(safe.length ? safe : okA).length - 1];
            } else if (dep < base) return;
            var walkToE = !S.toSt && !S.toPlace ? eP.filter(function (x) { return S.tN.indexOf(S.net.name[x.s]) >= 0; }) : [];
            var plWalkE = S.toPlace && S.toPlace.walkSt[p.cb.e.st.id];
            if (plWalkE != null && plWalkE <= 20) c.walkE = { min: plWalkE, name: S.toPlace.label };
            else if (walkToE.length) c.walkE = { min: Math.min.apply(null, walkToE.map(function (x) { return x.walk; })), name: S.net.name[walkToE[0].s] };
            else if (!S.toSt) {
              var eo = { fromStops: eP.map(function (x) { return { s: x.s, t: arr + x.walk }; }), rt: rt, maxTransfers: 1, count: 5 + 5 * ((S.more && S.more[key]) || 0) };
              if (S.toPlace) eo.toStops = S.toPlace.stops.map(function (x) { return { s: x.s, walk: x.walk }; }); else eo.to = S.tN;
              c.egr = GzmRaptor.search(S.net, eo).map(function (jn) { return withPlaceWalks(jn, null, S.toPlace); }).sort(function (a, b) { return a.arr - b.arr; });
              if (!c.egr.length) { S.cache[ck] = { skip: true }; return; }
            }
            S.cache[ck] = c;
          }
          if (c.skip) return;
          var final = c.walkE ? arr + c.walkE.min : c.egr ? Math.min.apply(null, c.egr.map(function (x) { return x.arr; })) : arr;
          out.push({ mm: true, p: p, it: it, dep: dep, arr: arr, tDelay: tD, c: c, final: final, start: c.walkA ? c.walkA.leave : c.latest ? (c.latest.jn.leave != null ? c.latest.jn.leave : c.latest.jn.dep) : dep });
        });
      });
      out.sort(function (a, b) { return a.final - b.final || b.start - a.start; });
      var seen = new Set();
      // Ten sam pociąg (te same numery, ten sam przyjazd) z kilku stacji startowych — zostaje tylko
      // wsiadanie najpóźniej (lista posortowana: przy równym przyjeździe najpóźniejsze wyjście pierwsze).
      // Inaczej np. z Tarnowskich Gór proponowało autobus WSTECZ na Stroszek do pociągu, który i tak jedzie przez TG.
      function trainKey(x) { return "t|" + (x.it.legs || []).map(function (l) { return (l.train && l.train.number) || "?"; }).join(">") + "|" + x.it.arrivalTime + "|" + x.p.cb.e.st.id; }
      out = out.filter(function (x) {
        var k = x.net ? "n|" + x.net.legs.map(function (l) { return l.trip || l.min; }).join(">") : cKey(x.p, x.it), k2 = x.net ? null : trainKey(x);
        if (seen.has(k) || (k2 && seen.has(k2))) return false; seen.add(k); if (k2) seen.add(k2); return true;
      });
      // Bez wariantów gorszych pod każdym względem: inny wyrusza nie wcześniej, a dowozi wcześniej
      // (np. tym samym pociągiem dalej przez cel i autobusem z powrotem — wraca się na trasie).
      out = out.filter(function (x) { return !out.some(function (y) { return y !== x && y.start >= x.start && y.final < x.final; }); }).slice(0, 6);
      if (!out.length) { res.innerHTML = '<div class="gz-empty">' + esc(T("gzm.cNone", null, "Nie udało się ułożyć podróży w ciągu 2 godzin od wyjścia.")) + "</div>"; return; }
      var guardOk = !!(window.GuardStore && window.GuardCore && GuardStore.enabled && GuardStore.enabled());
      res.innerHTML = (S.date !== warsawNow().date ? '<div class="gz-live off" style="margin:4px 2px">📅 ' + esc(T("gzm.uSched", { d: S.date }, "{d} — godziny wg rozkładu")) + "</div>" : '<div class="gz-live ' + (rtOk ? "on" : "off") + '" style="margin:4px 2px">' + (rtOk ? "● " + esc(T("gzm.liveOn", null, "na żywo")) : "○ " + esc(T("gzm.liveOff", null, "dane na żywo niedostępne, pokazuję rozkład"))) + "</div>") +
        out.map(function (x, i) {
          if (x.net) return netCard(x.net);
          var it = x.it, c = x.c, key = cKey(x.p, it);
          var legs = (it.legs || []).map(function (l) { return esc(((l.train && l.train.category) || "") + " " + ((l.train && l.train.number) || "")); }).join(" + ");
          var accHtml = "", egrHtml = "";
          if (c.acc) {
            var okA = c.acc.filter(function (y) { return y.status !== "missed"; }), lateA = c.acc.filter(function (y) { return y.status === "missed"; }).slice(0, 2);
            accHtml = '<div style="margin:0 0 6px 12px;padding-left:8px;border-left:2px solid var(--line)">' +
              '<div class="gz-sub" style="margin:4px 2px 2px">🚌 ' + esc(T("gzm.cAcc", { t: it.departureTime, s: x.p.cb.a.st.n, n: okA.length }, "Dojazd na pociąg {t} ({s}) — {n} możliwości")) + "</div>" +
              okA.slice(-5).map(function (y) { return jRow(y.jn, "🚉 " + esc(T("gzm.cOnPlatform", { t: C.fmt(y.plat), n: y.slack }, "na peronie {t} · zapas {n} min")), y.status); }).join("") +
              (lateA.length ? '<div class="gz-sub" style="margin:8px 2px 2px">' + esc(T("gzm.cLate", null, "Za późno na ten pociąg")) + "</div>" + lateA.map(function (y) { return jRow(y.jn, "🚉 " + C.fmt(y.plat), "missed"); }).join("") : "") + "</div>";
          }
          if (c.egr) {
            egrHtml = '<div style="margin:-6px 0 14px 12px;padding-left:8px;border-left:2px solid var(--line)">' +
              '<div class="gz-sub" style="margin:4px 2px 2px">🚌 ' + esc(T("gzm.cNext", { d: S.toPlace ? S.toPlace.label : (S.tN || []).join(", ") }, "Dalej do: {d} — po przyjeździe pociągu")) + "</div>" +
              c.egr.map(function (y) { return jRow(y, "🏁 " + C.fmt(y.arr) + " " + esc(y.legs[y.legs.length - 1].toName), "ok"); }).join("") +
              (c.egr.length >= 5 + 5 * ((S.more && S.more[key]) || 0) ? '<button type="button" class="gz-btn sec" data-cmore="' + esc(key) + '">' + esc(T("gzm.more", null, "Pokaż kolejne 5")) + "</button>" : "") + "</div>";
          }
          var L = c.latest, steps = [];
          steps.push("🚆 <b>" + esc(it.departureTime) + "</b> " + esc((it.legs && it.legs[0] && it.legs[0].board.stationName) || x.p.cb.a.st.n) + " → " + (x.tDelay ? '<span class="plan-strike">' + esc(it.arrivalTime) + "</span> <b>" + C.fmt(x.arr) + "</b> (+" + x.tDelay + " min)" : "<b>" + esc(it.arrivalTime) + "</b>") + " " + esc((it.legs && it.legs[it.legs.length - 1].alight.stationName) || x.p.cb.e.st.n) + " · " + legs);
          if (tripExpandOn()) steps[steps.length - 1] = trainLegsHtml(it, x);
          if (c.walkA) steps.unshift("🚶 " + esc(T("gzm.cWalk", { n: c.walkA.min, s: x.p.cb.a.st.n }, "{n} min pieszo do: {s}")));
          if (c.walkE) steps.push("🚶 " + esc(T("gzm.cWalk", { n: c.walkE.min, s: c.walkE.name }, "{n} min pieszo do: {s}")));
          if (c.egr) steps.push("🏁 " + esc(T("gzm.cBest", { t: C.fmt(x.final), l: c.egr[0].legs.filter(function (l) { return l.type === "ride"; })[0].line, s: C.fmt(c.egr[0].dep) }, "najszybciej do celu: {l} o {s}, na miejscu {t}")));
          var headHtml = c.walkA ? '<div class="gz-dir" style="white-space:normal">⏰ ' + esc(T("gzm.cLeave", { t: C.fmt(c.walkA.leave), s: c.walkA.name }, "wyjdź: {t} z {s}")) + "</div>" : (L ? '<div class="gz-dir" style="white-space:normal">⏰ ' + esc(T("gzm.cLeave", { t: C.fmt(L.jn.legs[0].type === "walk" ? L.jn.dep - L.jn.legs[0].min : L.jn.dep), s: L.jn.legs[0].fromName }, "wyjdź: {t} z {s}")) + "</div>" : '<div class="gz-dir" style="white-space:normal">🚆 ' + esc(T("gzm.cTrainAt", { t: it.departureTime, s: x.p.cb.a.st.n }, "pociąg {t} z {s}")) + "</div>");
          var tKey = "t|" + key, tOpen = tripExpandOn() && tripOpen[tKey];
          var card = '<div class="gz-dep ' + (L && L.status === "tight" ? "tight" : "ok") + '"' + (tripExpandOn() ? ' data-tripx="' + esc(tKey) + '"' : "") + ' style="grid-template-columns:minmax(0,1fr) auto">' +
            '<div class="gz-main">' + headHtml +
            steps.map(function (h) { return '<div class="gz-stop" style="white-space:normal;margin-top:4px">' + h + "</div>"; }).join("") +
            (guardOk ? '<div style="margin-top:8px"><button type="button" class="gz-btn sec" data-guard="' + i + '">🛡️ ' + esc(T("gzm.cGuardAll", null, "Pilnuj całej podróży")) + "</button></div>" : "") + "</div>" +
            '<div class="gz-right"><div class="gz-t">' + C.fmt(x.final) + '</div><div class="gz-in">' + esc(T("gzm.bArrive", null, "na miejscu")) + "</div>" + totalHtml(x.final - (c.walkA ? c.walkA.leave : L ? (L.jn.leave != null ? L.jn.leave : L.jn.legs[0].type === "walk" ? L.jn.dep - L.jn.legs[0].min : L.jn.dep) : x.dep)) + "</div></div>";
          if (tripExpandOn()) {
            card = card.replace(/(<div style="margin-top:8px"><button type="button" class="gz-btn sec" data-guard=)/, '<div class="gz-tap">' + esc(tOpen ? T("gzm.tHide", null, "▲ zwiń trasę") : T("gzm.tShowTrain", null, "▼ trasa pociągu i gdzie jest teraz")) + "</div>$1");
            if (card.indexOf("gz-tap") < 0) card = card.replace(/<\/div><div class="gz-right">/, '<div class="gz-tap">' + esc(tOpen ? T("gzm.tHide", null, "▲ zwiń trasę") : T("gzm.tShowTrain", null, "▼ trasa pociągu i gdzie jest teraz")) + '</div></div><div class="gz-right">');
            if (tOpen) card += trainRunsHtml(it, S.date);
          }
          return accHtml + card + egrHtml;
        }).join("") +
        '<div class="gz-sub" style="margin:6px 2px">' + esc(T("gzm.mmNote", null, "Jedno wyszukiwanie: dojazd i dalsza podróż w całej sieci GZM (do 1 przesiadki), pociągi z planera PLK.")) + "</div>";
      cState.shown = out;
    }
    function searchCOld() {
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
        var netNeeded = !fromSt && !toSt;
        if (netNeeded && (!fromNames.length || !toNames.length)) {
          // przystanek spoza zasięgu stacji — szukamy tylko w całej sieci GZM
          return getNet(date).then(function (net) {
            var fN = netNames(net, fromTxt), tN = netNames(net, toTxt);
            if (!fN.length || !tN.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoTo", { d: !fN.length ? fromTxt : toTxt }, "Nie znam przystanku „{d}”.")) + "</div>"; return; }
            cState = { hubs: [], parts: [], fromNames: fN, toNames: tN, fromSt: null, toSt: null, tmin: tmin, date: date, more: {}, tDelay: {}, live: tmin >= Math.floor(warsawNow().min) - 5, net: net, netFrom: fN, netTo: tN };
            renderC();
          });
        }
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
        var hubs = (!fromSt && !toSt) ? topStations(fz, fromNames, 6).filter(function (a) { return topStations(ez, toNames, 6).some(function (e) { return e.st.id === a.st.id; }); }).slice(0, 2) : [];
        if (!combos.length && !hubs.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoCombo", null, "Nie znalazłem stacji kolejowych, przez które da się to połączyć.")) + "</div>"; return; }
        var hubP = Promise.all(hubs.map(function (h) {
          return Promise.all([getArr(h.st.id), getDep(h.st.id)]).then(function (fl) { return { st: h.st, arrFile: fl[0], depFile: fl[1] }; }).catch(function () { return null; });
        }));
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
        })).then(function (parts) { return Promise.all([hubP, netNeeded ? getNet(date).catch(function () { return null; }) : null]).then(function (r2) { return [parts, r2[0].filter(Boolean), r2[1]]; }); }).then(function (both) {
          var parts = both[0];
          cState = { netFrom: netNeeded ? fromNames : null, netTo: netNeeded ? toNames : null, hubs: both[1], parts: parts.filter(Boolean), fromNames: fromNames, toNames: toNames, fromSt: fromSt, toSt: toSt, tmin: tmin, date: date, more: {}, tDelay: {}, live: tmin >= Math.floor(warsawNow().min) - 5 };
          if (both[2]) cState.net = both[2];
          renderC(); trainLiveC();
        });
      }).catch(function () { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.noIndex", null, "Dane GZM są chwilowo niedostępne.")) + "</div>"; });
    }
    function rideHtml(r, cls) {
      var inMin = Math.round(r.dep - nowOn(cState.date));
      var tTxt = (r.live && r.delay) ? '<span class="plan-strike">' + C.fmt(r.depPlan) + "</span> " + C.fmt(r.dep) : C.fmt(r.dep);
      var stTxt = r.status === "ok" ? "🟢 " + T("gzm.st.ok", null, "zdążysz") : r.status === "tight" ? "🟡 " + T("gzm.st.tight", null, "na styk") : "🔴 " + T("gzm.cTooLate", null, "za późno na ten pociąg");
      var liveTxt = r.live ? (r.delay ? (r.delay > 0 ? "+" : "") + r.delay + " min, " + T("gzm.live", null, "na żywo") : T("gzm.onTimeLive", null, "punktualnie, na żywo")) : T("gzm.sched", null, "wg rozkładu");
      return '<div class="gz-dep ' + (r.status || "missed") + (cls || "") + '">' +
        '<div class="gz-line ' + r.type + '">' + esc(r.line) + "<small>" + TYPE_ICON[r.type] + "</small></div>" +
        '<div class="gz-main"><div class="gz-dir">' + esc(r.from) + " → " + esc(r.stop.n) + "</div>" +
        '<div class="gz-stop">' + C.fmt(r.arrStop) + " · 🚶 " + r.walk + " min · " + esc(liveTxt) + "</div>" +
        (r.slack != null ? '<div class="gz-stop" style="color:#fff">🚉 ' + esc(T("gzm.cOnPlatform", { t: C.fmt(r.platform), n: r.slack }, "na peronie {t} · zapas {n} min")) + "</div>" : "") + "</div>" +
        '<div class="gz-right"><div class="gz-t">' + tTxt + '</div><div class="gz-in">' + (inMin > 180 || inMin < -1 ? "" : inMin <= 0 ? esc(T("gzm.now", null, "teraz")) : esc(T("gzm.inMin", { n: inMin }, "za {n} min"))) + '</div><div class="gz-in gz-st-' + (r.status || "missed") + '">' + esc(stTxt) + "</div></div></div>";
    }
    function netCard(jn) {
      if (tripExpandOn()) {
        var f0 = jn.legs.find(function (l) { return l.type === "ride"; }), k = jKey(jn), lv = jn.leave != null ? jn.leave : jn.legs[0].type === "walk" ? f0.dep - jn.legs[0].min : jn.dep;
        return '<div class="gz-dep ok" data-tripx="' + esc(k) + '" style="grid-template-columns:minmax(0,1fr) auto">' +
          '<div class="gz-main"><div class="gz-dir" style="white-space:normal">' + esc(T("gzm.cLeave", { t: C.fmt(lv), s: jn.legs[0].fromName }, "wyjdź: {t} z {s}")) + "</div>" +
          '<div class="gz-sub" style="margin:0 0 5px">' + esc(jn.transfers ? T("gzm.nTitle", { n: jn.transfers }, "komunikacja GZM · przesiadki: {n}") : T("gzm.nDirect", null, "komunikacja GZM · bez przesiadek")) + "</div>" +
          legsHtml(jn) + '<div class="gz-tap">' + esc(tripOpen[k] ? T("gzm.tHide", null, "▲ zwiń trasę") : T("gzm.tShow", null, "▼ trasa kursu i gdzie jest teraz")) + "</div></div>" +
          '<div class="gz-right"><div class="gz-t">' + C.fmt(jn.arr) + '</div><div class="gz-in">' + esc(T("gzm.bArrive", null, "na miejscu")) + "</div>" + totalHtml(jn.arr - lv) + "</div></div>" +
          (tripOpen[k] ? tripsOfJourney(jn) : "");
      }
      var steps = jn.legs.map(function (l) {
        if (l.type === "walk") return "🚶 " + esc(T("gzm.cWalk", { n: l.min, s: l.toName }, "{n} min pieszo do: {s}"));
        return TYPE_ICON[l.kind] + " <b>" + esc(l.line) + "</b> → " + esc(l.head) + "<br>" + (l.live && l.delay ? '<span class="plan-strike">' + C.fmt(l.depPlan) + "</span> " : "") + C.fmt(l.dep) + " " + esc(l.fromName) + " → " + esc(l.toName) + " <b>" + C.fmt(l.arr) + "</b>" + (l.live ? (l.delay ? " (+" + l.delay + " min)" : " · " + esc(T("gzm.live", null, "na żywo"))) : "");
      });
      var first = jn.legs.find(function (l) { return l.type === "ride"; });
      return '<div class="gz-dep ok" style="grid-template-columns:minmax(0,1fr) auto">' +
        '<div class="gz-main"><div class="gz-dir" style="white-space:normal">🚌 ' + esc(jn.transfers ? T("gzm.nTitle", { n: jn.transfers }, "komunikacja GZM · przesiadki: {n}") : T("gzm.nDirect", null, "komunikacja GZM · bez przesiadek")) + "</div>" +
        '<div class="gz-dir" style="white-space:normal;font-size:13px">⏰ ' + esc(T("gzm.cLeave", { t: C.fmt(jn.leave != null ? jn.leave : jn.legs[0].type === "walk" ? first.dep - jn.legs[0].min : jn.dep), s: jn.legs[0].fromName }, "wyjdź: {t} z {s}")) + "</div>" +
        steps.map(function (h) { return '<div class="gz-stop" style="white-space:normal;margin-top:4px">' + h + "</div>"; }).join("") + "</div>" +
        '<div class="gz-right"><div class="gz-t">' + C.fmt(jn.arr) + '</div><div class="gz-in">' + esc(T("gzm.bArrive", null, "na miejscu")) + "</div>" + totalHtml(jn.arr - (jn.leave != null ? jn.leave : jn.legs[0].type === "walk" ? first.dep - jn.legs[0].min : jn.dep)) + "</div></div>";
    }
    // ⏱ łączny czas podróży (od wyjścia do celu, z dojściami)
    function totalHtml(min) {
      if (!(min > 0)) return "";
      var h = Math.floor(min / 60), m = min % 60;
      return '<div class="gz-total">⏱ ' + esc(T("gzm.total", { t: (h ? h + " h " : "") + m + " min" }, "w drodze {t}")) + "</div>";
    }
    function hubCard(x) {
      var o = x.o, a = o.a, b = o.b;
      var rideA = TYPE_ICON[a.type] + " <b>" + esc(a.line) + "</b> " + C.fmt(a.dep) + " " + esc(a.from) + " → " + esc(a.stopA.n) + " " + C.fmt(a.ta) + (a.live && a.delay ? " (+" + a.delay + " min)" : "");
      var steps = [rideA];
      if (o.same) steps.push("↪ " + esc(T("gzm.hSame", null, "ten sam kurs jedzie dalej — bez przesiadki")));
      else steps.push("🚶 " + esc(T("gzm.hChange", { n: o.transfer, w: o.wait, s: b.d.stop.n }, "przesiadka: {n} min do {s}, czekasz {w} min")));
      steps.push(TYPE_ICON[b.d.type] + " <b>" + esc(b.d.line) + "</b> " + C.fmt(b.real) + " " + esc(b.d.stop.n) + " → " + esc(b.destName) + " <b>" + C.fmt(o.arrDest) + "</b>" + (b.live && b.delay ? " (+" + b.delay + " min)" : ""));
      var st = o.same || o.wait >= C.OK_SLACK - 1 ? "ok" : "tight";
      return '<div class="gz-dep ' + st + '" style="grid-template-columns:minmax(0,1fr) auto">' +
        '<div class="gz-main"><div class="gz-dir" style="white-space:normal">🚌 ' + esc(T("gzm.hTitle", { s: x.hub.st.n }, "bez pociągu — przez {s}")) + "</div>" +
        '<div class="gz-dir" style="white-space:normal;font-size:13px">⏰ ' + esc(T("gzm.cLeave", { t: C.fmt(a.dep), s: a.from }, "wyjdź: {t} z {s}")) + "</div>" +
        steps.map(function (h) { return '<div class="gz-stop" style="white-space:normal;margin-top:4px">' + h + "</div>"; }).join("") + "</div>" +
        '<div class="gz-right"><div class="gz-t">' + C.fmt(o.arrDest) + '</div><div class="gz-in">' + esc(T("gzm.bArrive", null, "na miejscu")) + "</div></div></div>";
    }
    function cKey(p, it) { return p.cb.a.st.id + "|" + p.cb.e.st.id + "|" + it.departureTime + "|" + it.arrivalTime; }
    // Opóźnienie pociągu (ostatni odcinek) na stacji wysiadki — dla 2 pierwszych propozycji, co 60 s.
    function trainLiveC() {
      if (!cState || !cState.shown || !window.GuardCore) return Promise.resolve();
      return Promise.all(cState.shown.filter(function (x) { return x.it && x.it.legs; }).slice(0, 2).map(function (x) {
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
      if (cState.mm) return renderMM();
      var S = cState, out = [], now = nowOn(S.date);
      S.parts.forEach(function (p) {
        var rides = p.accFile ? C.ridesToStation({ arrFile: p.accFile, origin: S.fromNames, date: S.date, fromMin: S.live ? Math.max(S.tmin, now - 1) : S.tmin, maxMin: S.live ? 120 + Math.max(0, now - S.tmin) : 120, rt: rt }) : null;
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
          out.push({ rides: rides, p: p, it: it, dep: dep, arr: arr, tDelay: tDelay, tl: tl, acc: acc, egr: egr, egrR: r || null, final: final, start: acc && acc.latest ? acc.latest.dep : dep });
        });
      });
      if (S.net && S.netFrom && S.netTo) {
        if (S.netRtAt !== rtAt || !S.netRes) {
          S.netRtAt = rtAt;
          S.netRes = GzmRaptor.search(S.net, { from: S.netFrom, to: S.netTo, dep: S.live ? Math.max(S.tmin, now) : S.tmin, rt: rt, maxTransfers: 2, count: 5, maxDep: (S.live ? Math.max(S.tmin, now) : S.tmin) + 180 });
        }
        S.netRes.forEach(function (jn) { out.push({ net: jn, final: jn.arr, start: jn.dep, it: { departureTime: C.fmt(jn.dep), arrivalTime: C.fmt(jn.arr) }, p: { cb: { a: { st: { id: "net" } } } } }); });
      }
      if (!S.netRes || !S.netRes.length) (S.hubs || []).forEach(function (h) {
        C.hubTrips({ arrFile: h.arrFile, depFile: h.depFile, origin: S.fromNames, dest: S.toNames, date: S.date, fromMin: S.live ? Math.max(S.tmin, now - 1) : S.tmin, maxMin: 120, rt: rt }).slice(0, 4).forEach(function (o) {
          out.push({ hub: h, o: o, final: o.arrDest, start: o.dep, it: { departureTime: C.fmt(o.dep), arrivalTime: C.fmt(o.arrDest) }, p: { cb: { a: { st: h.st } } } });
        });
      });
      out.sort(function (a, b) { return a.final - b.final || b.start - a.start; });
      var seen = new Set();
      out = out.filter(function (x) { var k = (x.net ? "n|" + x.net.legs.map(function (l) { return l.trip || l.min; }).join(">") + "|" : "") + (x.hub ? "h|" + x.o.a.trip + "|" : "") + x.final + "|" + x.it.departureTime + "|" + x.p.cb.a.st.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5);
      if (!out.length) { res.innerHTML = '<div class="gz-empty">' + esc(T("gzm.cNone", null, "Nie udało się ułożyć podróży w ciągu 2 godzin od wyjścia.")) + "</div>"; return; }
      var guardOk = !!(window.GuardStore && window.GuardCore && GuardStore.enabled && GuardStore.enabled());
      res.innerHTML = '<div class="gz-live ' + (rtOk ? "on" : "off") + '" style="margin:4px 2px">' + (rtOk ? "● " + esc(T("gzm.liveOn", null, "na żywo")) : "○ " + esc(T("gzm.liveOff", null, "dane na żywo niedostępne, pokazuję rozkład"))) + "</div>" +
        out.map(function (x, i) {
          if (x.hub) return hubCard(x);
          if (x.net) return netCard(x.net);
          var it = x.it, L = x.acc && x.acc.latest, E = x.egr;
          var legs = (it.legs || []).map(function (l) { return esc(((l.train && l.train.category) || "") + " " + ((l.train && l.train.number) || "")); }).join(" + ");
          var steps = [];
          if (L) steps.push((L.status === "ok" ? "🟢" : "🟡") + " " + TYPE_ICON[L.type] + " <b>" + esc(L.line) + "</b> " + C.fmt(L.dep) + " " + esc(L.from) + " → " + esc(L.stop.n) + " " + C.fmt(L.arrStop) + " · 🚶 " + L.walk + " min · " + esc(T("gzm.bSlack", { n: L.slack }, "zapas {n} min")));
          steps.push("🚆 <b>" + esc(it.departureTime) + "</b> " + esc((it.legs && it.legs[0] && it.legs[0].board.stationName) || x.p.cb.a.st.n) + " → " + (x.tDelay ? '<span class="plan-strike">' + esc(it.arrivalTime) + "</span> <b>" + C.fmt(x.arr) + "</b> (+" + x.tDelay + " min)" : "<b>" + esc(it.arrivalTime) + "</b>") + " " + esc((it.legs && it.legs[it.legs.length - 1].alight.stationName) || x.p.cb.e.st.n) + " · " + legs);
          if (E && E.walkOnly) steps.push("🚶 " + esc(T("gzm.cWalk", { n: E.walk, s: E.name }, "{n} min pieszo do: {s}")));
          var key = cKey(x.p, it), more = (S.more && S.more[key]) || 0, list = "", accList = "";
          if (x.rides) {
            var moreA = (S.more && S.more["a|" + key]) || 0, nA = 5 + moreA * 5;
            var okR = x.rides.filter(function (r) { return r.platform <= x.dep; }).map(function (r) { var sl = x.dep - r.platform; return Object.assign({}, r, { slack: sl, status: sl >= C.OK_SLACK ? "ok" : "tight" }); });
            var lateR = x.rides.filter(function (r) { return r.platform > x.dep; }).slice(0, 2).map(function (r) { return Object.assign({}, r, { slack: null, status: "missed" }); });
            accList = '<div style="margin:0 0 6px 12px;padding-left:8px;border-left:2px solid var(--line)">' +
              '<div class="gz-sub" style="margin:4px 2px 2px">🚌 ' + esc(T("gzm.cAcc", { t: it.departureTime, s: x.p.cb.a.st.n, n: okR.length }, "Dojazd na pociąg {t} ({s}) — {n} możliwości")) + "</div>" +
              okR.slice(0, nA).map(function (r) { return rideHtml(r); }).join("") +
              (okR.length > nA ? '<button type="button" class="gz-btn sec" data-cmore="a|' + esc(key) + '">' + esc(T("gzm.more", null, "Pokaż kolejne 5")) + "</button>" : "") +
              (lateR.length ? '<div class="gz-sub" style="margin:8px 2px 2px">' + esc(T("gzm.cLate", null, "Za późno na ten pociąg")) + "</div>" + lateR.map(function (r) { return rideHtml(r); }).join("") : "") +
              "</div>";
          }
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
          return accList + '<div class="gz-dep ' + worst + '" style="grid-template-columns:minmax(0,1fr) auto">' +
            '<div class="gz-main">' + (L ? '<div class="gz-dir" style="white-space:normal">⏰ ' + esc(T("gzm.cLeave", { t: C.fmt(L.dep), s: L.from }, "wyjdź: {t} z {s}")) + "</div>" : '<div class="gz-dir" style="white-space:normal">🚆 ' + esc(T("gzm.cTrainAt", { t: it.departureTime, s: x.p.cb.a.st.n }, "pociąg {t} z {s}")) + "</div>") +
            steps.map(function (h) { return '<div class="gz-stop" style="white-space:normal;margin-top:4px">' + h + "</div>"; }).join("") +
            (guardOk ? '<div style="margin-top:8px"><button type="button" class="gz-btn sec" data-guard="' + i + '">🛡️ ' + esc(T("gzm.cGuard", null, "Pilnuj pociągów tej podróży")) + "</button></div>" : "") +
            "</div>" +
            '<div class="gz-right"><div class="gz-t">' + C.fmt(x.final) + '</div><div class="gz-in">' + esc(T("gzm.bArrive", null, "na miejscu")) + "</div></div></div>" + list;
        }).join("") +
        '<div class="gz-sub" style="margin:6px 2px">' + esc(T("gzm.cNote", null, "Pociągi z planera PLK, autobusy i tramwaje z rozkładu GZM z opóźnieniami na żywo. Strażnik pilnuje na razie pociągów; części GZM pilnuj w tej zakładce.")) + "</div>";
      cState.shown = out;
    }
    // Odcinki GZM z podróży RAPTOR-a → nogi strażnika (mode: "gzm"); walkBefore = dojście przed odcinkiem.
    var KIND_ICON = { bus: "🚌", tram: "🚋", trolley: "🚎" };
    function gzmLegs(jn, firstWalk) {
      var out = [], walk = firstWalk || 0;
      jn.legs.forEach(function (l) {
        if (l.type === "walk") { walk += l.min; return; }
        out.push({ mode: "gzm", trip: l.trip, kind: l.kind, train: { category: KIND_ICON[l.kind] || "🚌", number: l.line, name: "→ " + l.head },
          board: { stationName: l.fromName, time: C.fmt(l.depPlan) }, alight: { stationName: l.toName, time: C.fmt(l.arr - (l.delay || 0)) }, walkBefore: walk || null });
        walk = 0;
      });
      return out;
    }
    function guardWhole(x, btn) {
      var S = cState, c = x.c, q = x.p.query || { from: x.p.cb.a.st.n, to: x.p.cb.e.st.n, date: S.date };
      if (!q.date) q.date = S.date;
      var legs = [];
      if (c.latest) {
        var acc = gzmLegs(c.latest.jn, 0);
        legs = legs.concat(acc);
        var lastRide = c.latest.jn.legs.filter(function (l) { return l.type === "ride"; }).pop();
        var trainLegs = GuardCore.fromItinerary(x.it, q).legs;
        if (trainLegs.length && lastRide) trainLegs[0].walkBefore = Math.max(1, c.latest.plat - lastRide.arr);
        legs = legs.concat(trainLegs);
      } else legs = legs.concat(GuardCore.fromItinerary(x.it, q).legs);
      if (c.egr && c.egr.length) {
        var e = c.egr[0], firstRide = e.legs.filter(function (l) { return l.type === "ride"; })[0];
        var poleWalk = 3; polesOf(x.p.cb.e.st).forEach(function (p) { if (p.s === firstRide.from || S.net.name[p.s] === firstRide.fromName) poleWalk = p.walk; });
        legs = legs.concat(gzmLegs(e, poleWalk));
      }
      var conn = { id: GuardCore.connectionId(S.date, legs), date: S.date, from: legs[0].board.stationName, to: legs[legs.length - 1].alight.stationName, legs: legs, source: "multimodal", createdAt: new Date().toISOString() };
      btn.disabled = true;
      GuardStore.add(conn).then(function () { btn.textContent = "🛡️ " + T("gzm.cGuarded", null, "Pilnowane"); });
    }
    function guardTrip(btn) {
      var x = cState && cState.shown && cState.shown[+btn.dataset.guard];
      if (!x || !window.GuardStore || !window.GuardCore) return;
      if (cState.mm && x.c) return guardWhole(x, btn);
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
      rerun: function (q) {
        ready.then(function () {
          var f = root.querySelector("#gzCFrom"), t = root.querySelector("#gzCTo"), d = root.querySelector("#gzCDate"), tm = root.querySelector("#gzCTime");
          if (!f || !t) return;
          f.value = q.from || ""; t.value = q.to || "";
          if (d) { var v = q.date && q.date >= (d.min || "") && (!d.max || q.date <= d.max) ? q.date : warsawNow().date; d.value = v; }
          if (tm && q.time) tm.value = q.time;
          searchC();
        });
      },
      open: function (o) {
        cfg = { stationId: o.stationId, arr: o.arr || null, date: o.date || null, train: o.train || null, alighted: false };
        trainInfo = null; showMore = 0;
        ready.then(function () { var s = root.querySelector("#gzSt"); if (s) s.value = String(cfg.stationId || ""); var a = root.querySelector("#gzArr"); if (a && cfg.arr) a.value = cfg.arr; load1(); });
      }
    };
  }

  window.GzmView = { mount: mount };
})();
