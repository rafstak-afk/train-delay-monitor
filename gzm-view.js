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
    '.gz .gz-main{min-width:0}.gz .gz-dir{font-weight:800;font-size:14px;overflow-wrap:anywhere;line-height:1.3}' +
    '.gz .gz-stop{color:var(--muted);font-size:12.5px;overflow-wrap:anywhere;line-height:1.35}' +
    '.gz .gz-dep[data-tripx]{cursor:pointer}' +
    '.gz .gz-trip{background:#141f2b;border:1px solid var(--line);border-top:0;border-radius:0 0 12px 12px;margin:-8px 0 8px;padding:8px 11px 10px;font-size:13px}' +
    '.gz .gz-trip-pos{color:var(--cyan);font-weight:700;margin:2px 0 6px}.gz .gz-trip-pos a{color:var(--cyan)}' +
    '.gz .gz-tr{display:grid;grid-template-columns:56px 1fr;gap:6px;padding:3px 0;border-left:3px solid var(--line);padding-left:8px}' +
    '.gz .gz-tr.past{opacity:.45}.gz .gz-tr.me{border-left-color:var(--yellow);font-weight:800}.gz .gz-tr.here{border-left-color:var(--cyan)}' +
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

    // ===== Rozwinięcie odjazdu: cały bieg kursu i gdzie jest teraz pojazd (TEST — tylko profil autora) =====
    var tripOpen = {};
    function tripExpandOn() { try { return localStorage.getItem("showVersionBadge") === "1"; } catch (e) { return false; } }
    function tripIndex(net, tid) {
      if (!net._tripIx) { net._tripIx = {}; net.j.trips.forEach(function (t, i) { net._tripIx[t[2]] = i; }); }
      var i = net._tripIx[tid]; return i == null ? -1 : i;
    }
    function tripHtml(tid, date, boardName) {
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
        var cls = (curSeq != null && i < curSeq ? " past" : "") + (nm === boardName ? " me" : "") + (i === nearIdx ? " here" : "");
        var t = dl ? '<span class="plan-strike">' + C.fmt(plan) + "</span> " + C.fmt(plan + dl) : C.fmt(plan);
        return '<div class="gz-tr' + cls + '"><div>' + t + "</div><div>" + (i === nearIdx ? "📍 " : "") + esc(nm) + "</div></div>";
      }).join("");
      return '<div class="gz-trip">' + pos + rows + "</div>";
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
      // wejście z przycisku 🚌 (pociąg / dzienniczek) — zawsze „Wysiadam z pociągu”
      setMode(opts.stationId ? "A" : (st.dir || "A"));
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
    function searchC() {
      var fromTxt = root.querySelector("#gzCFrom").value.trim(), toTxt = root.querySelector("#gzCTo").value.trim();
      var tmin = C.hm(root.querySelector("#gzCTime").value) || Math.floor(warsawNow().min);
      st.cFrom = fromTxt; st.cTo = toTxt; save(LS, st);
      if (!fromTxt || !toTxt || !window.GzmRaptor) return searchCOld();
      var res = root.querySelector("#gzCRes"), date = warsawNow().date;
      res.innerHTML = '<div class="gz-empty">' + esc(T("gzm.cSearching", null, "Układam podróż: dojazd, pociąg, dojazd do celu…")) + "</div>";
      Promise.all([getNet(date), getRt()]).then(function (r) {
        var net = r[0], code = GzmRaptor.byCode(net);
        var fromSt = stationByName(fromTxt), toSt = stationByName(toTxt);
        var fN = fromSt ? null : netNames(net, fromTxt), tN = toSt ? null : netNames(net, toTxt);
        if (!fromSt && !fN.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoTo", { d: fromTxt }, "Nie znam przystanku „{d}”.")) + "</div>"; return; }
        if (!toSt && !tN.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoTo", { d: toTxt }, "Nie znam przystanku „{d}”.")) + "</div>"; return; }
        var withStops = (index.stations || []).filter(function (x) { return x.s && x.s.length; });
        // stacje przy starcie: gdzie najwcześniej będę na peronie (cała sieć, do 1 przesiadki)
        var accSt;
        if (fromSt) accSt = [fromSt];
        else {
          var star = GzmRaptor.reachAll(net, { from: fN, dep: tmin, rt: rt, maxTransfers: 1 });
          accSt = withStops.map(function (x) {
            var best = 1e9; x.s.forEach(function (p) { var i = code[p[0]]; if (i != null && star[i] + p[3] < best) best = star[i] + p[3]; });
            return { st: x, plat: best };
          }).filter(function (x) { return x.plat < 1e8 && (!toSt || x.st.id !== toSt.id); }).sort(function (a, b) { return a.plat - b.plat; }).slice(0, 2).map(function (x) { return x.st; });
        }
        // stacje przy celu: najbliższe celowi (w linii prostej) stacje z przystankami GZM
        var egrSt;
        if (toSt) egrSt = [toSt];
        else {
          var d0 = net.byName[tN[0]][0], la = net.lat[d0], lo = net.lon[d0];
          egrSt = withStops.map(function (x) { return { st: x, d: Math.pow(x.lat - la, 2) + Math.pow((x.lon - lo) * 0.64, 2) }; })
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
          cState = { mm: true, net: net, code: code, fN: fN, tN: tN, fromSt: fromSt, toSt: toSt, parts: parts.filter(Boolean), tmin: tmin, date: date, more: {}, tDelay: {}, cache: {},
            live: tmin >= Math.floor(warsawNow().min) - 5, netFrom: (!fromSt && !toSt) ? fN : null, netTo: (!fromSt && !toSt) ? tN : null };
          renderC(); trainLiveC();
        });
      }).catch(function () { searchCOld(); });
    }
    // słupki stacji: indeks w sieci + dojście peron ↔ słupek (górna granica)
    function polesOf(stn) { var out = []; (stn.s || []).forEach(function (p) { var i = cState.code[p[0]]; if (i != null) out.push({ s: i, walk: p[3] }); }); return out; }
    // wiersz podróży GZM (może mieć przesiadki), z dopiskiem i statusem
    function jRow(jn, extra, status) {
      var rides = jn.legs.filter(function (l) { return l.type === "ride"; }), r0 = rides[0];
      var inMin = Math.round(r0.dep - nowOn(cState.date));
      var legs = jn.legs.map(function (l) {
        if (l.type === "walk") return "🚶 " + l.min;
        return "<b>" + esc(l.line) + "</b> " + C.fmt(l.dep) + " " + esc(l.fromName) + " → " + esc(l.toName) + " " + C.fmt(l.arr) + (l.live && l.delay ? " (+" + l.delay + ")" : "");
      }).join(" · ");
      var stTxt = status === "ok" ? "🟢 " + T("gzm.st.ok", null, "zdążysz") : status === "tight" ? "🟡 " + T("gzm.st.tight", null, "na styk") : status === "missed" ? "🔴 " + T("gzm.cTooLate", null, "za późno na ten pociąg") : "";
      return '<div class="gz-dep ' + (status || "ok") + '">' +
        '<div class="gz-line ' + r0.kind + '">' + esc(r0.line) + "<small>" + TYPE_ICON[r0.kind] + (rides.length > 1 ? " +" + (rides.length - 1) : "") + "</small></div>" +
        '<div class="gz-main"><div class="gz-stop" style="white-space:normal;color:#fff">' + legs + "</div>" + (extra ? '<div class="gz-stop" style="white-space:normal">' + extra + "</div>" : "") + "</div>" +
        '<div class="gz-right"><div class="gz-t">' + ((r0.live && r0.delay) ? '<span class="plan-strike">' + C.fmt(r0.depPlan) + "</span> " : "") + C.fmt(r0.dep) + '</div><div class="gz-in">' + (inMin > 180 || inMin < -1 ? "" : inMin <= 0 ? esc(T("gzm.now", null, "teraz")) : esc(T("gzm.inMin", { n: inMin }, "za {n} min"))) + "</div>" + (stTxt ? '<div class="gz-in gz-st-' + status + '">' + esc(stTxt) + "</div>" : "") + "</div></div>";
    }
    function renderMM() {
      var res = root.querySelector("#gzCRes"), S = cState, now = nowOn(S.date), base = S.live ? Math.max(S.tmin, now) : S.tmin, out = [];
      // tylko GZM (gdy oba końce to przystanki)
      if (S.netFrom && S.netTo) {
        if (S.netRtAt !== rtAt || !S.netRes) { S.netRtAt = rtAt; S.netRes = GzmRaptor.search(S.net, { from: S.netFrom, to: S.netTo, dep: base, rt: rt, maxTransfers: 2, count: 5, maxDep: base + 180 }); }
        S.netRes.forEach(function (jn) { out.push({ net: jn, final: jn.arr, start: jn.dep }); });
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
            var walkFromA = !S.fromSt ? aP.filter(function (x) { return S.fN.indexOf(S.net.name[x.s]) >= 0; }) : [];
            if (walkFromA.length) {
              var wA = Math.min.apply(null, walkFromA.map(function (x) { return x.walk; }));
              if (base + wA > dep) { S.cache[ck] = { skip: true }; return; }
              c.walkA = { min: wA, name: S.net.name[walkFromA[0].s], leave: dep - wA - C.OK_SLACK };
            } else if (!S.fromSt) {
              if (base > dep) return;
              var J = GzmRaptor.search(S.net, { from: S.fN, toStops: aP.map(function (x) { return x.s; }), dep: base, rt: rt, maxTransfers: 1, count: 6 + 5 * ((S.more && S.more["a|" + key]) || 0), maxDep: dep });
              c.acc = J.map(function (jn) {
                var last = jn.legs[jn.legs.length - 1], stop = last.to, plat = jn.arr + (walkA[stop] != null ? walkA[stop] : 3), sl = dep - plat;
                return { jn: jn, plat: plat, slack: sl, status: sl >= C.OK_SLACK ? "ok" : sl >= 0 ? "tight" : "missed" };
              });
              var okA = c.acc.filter(function (x) { return x.status !== "missed"; });
              if (!okA.length) { S.cache[ck] = { skip: true }; return; }
              var safe = okA.filter(function (x) { return x.status === "ok"; });
              c.latest = (safe.length ? safe : okA)[(safe.length ? safe : okA).length - 1];
            } else if (dep < base) return;
            var walkToE = !S.toSt ? eP.filter(function (x) { return S.tN.indexOf(S.net.name[x.s]) >= 0; }) : [];
            if (walkToE.length) c.walkE = { min: Math.min.apply(null, walkToE.map(function (x) { return x.walk; })), name: S.net.name[walkToE[0].s] };
            else if (!S.toSt) {
              c.egr = GzmRaptor.search(S.net, { fromStops: eP.map(function (x) { return { s: x.s, t: arr + x.walk }; }), to: S.tN, rt: rt, maxTransfers: 1, count: 5 + 5 * ((S.more && S.more[key]) || 0) });
              if (!c.egr.length) { S.cache[ck] = { skip: true }; return; }
            }
            S.cache[ck] = c;
          }
          if (c.skip) return;
          var final = c.walkE ? arr + c.walkE.min : c.egr ? Math.min.apply(null, c.egr.map(function (x) { return x.arr; })) : arr;
          out.push({ mm: true, p: p, it: it, dep: dep, arr: arr, tDelay: tD, c: c, final: final, start: c.latest ? c.latest.jn.dep : dep });
        });
      });
      out.sort(function (a, b) { return a.final - b.final || b.start - a.start; });
      var seen = new Set();
      out = out.filter(function (x) { var k = x.net ? "n|" + x.net.legs.map(function (l) { return l.trip || l.min; }).join(">") : cKey(x.p, x.it); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
      if (!out.length) { res.innerHTML = '<div class="gz-empty">' + esc(T("gzm.cNone", null, "Nie udało się ułożyć podróży w ciągu 2 godzin od wyjścia.")) + "</div>"; return; }
      var guardOk = !!(window.GuardStore && window.GuardCore && GuardStore.enabled && GuardStore.enabled());
      res.innerHTML = '<div class="gz-live ' + (rtOk ? "on" : "off") + '" style="margin:4px 2px">' + (rtOk ? "● " + esc(T("gzm.liveOn", null, "na żywo")) : "○ " + esc(T("gzm.liveOff", null, "dane na żywo niedostępne, pokazuję rozkład"))) + "</div>" +
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
              '<div class="gz-sub" style="margin:4px 2px 2px">🚌 ' + esc(T("gzm.cNext", { d: (S.tN || []).join(", ") }, "Dalej do: {d} — po przyjeździe pociągu")) + "</div>" +
              c.egr.map(function (y) { return jRow(y, "🏁 " + C.fmt(y.arr) + " " + esc(y.legs[y.legs.length - 1].toName), "ok"); }).join("") +
              (c.egr.length >= 5 + 5 * ((S.more && S.more[key]) || 0) ? '<button type="button" class="gz-btn sec" data-cmore="' + esc(key) + '">' + esc(T("gzm.more", null, "Pokaż kolejne 5")) + "</button>" : "") + "</div>";
          }
          var L = c.latest, steps = [];
          steps.push("🚆 <b>" + esc(it.departureTime) + "</b> " + esc((it.legs && it.legs[0] && it.legs[0].board.stationName) || x.p.cb.a.st.n) + " → " + (x.tDelay ? '<span class="plan-strike">' + esc(it.arrivalTime) + "</span> <b>" + C.fmt(x.arr) + "</b> (+" + x.tDelay + " min)" : "<b>" + esc(it.arrivalTime) + "</b>") + " " + esc((it.legs && it.legs[it.legs.length - 1].alight.stationName) || x.p.cb.e.st.n) + " · " + legs);
          if (c.walkA) steps.unshift("🚶 " + esc(T("gzm.cWalk", { n: c.walkA.min, s: x.p.cb.a.st.n }, "{n} min pieszo do: {s}")));
          if (c.walkE) steps.push("🚶 " + esc(T("gzm.cWalk", { n: c.walkE.min, s: c.walkE.name }, "{n} min pieszo do: {s}")));
          if (c.egr) steps.push("🏁 " + esc(T("gzm.cBest", { t: C.fmt(x.final), l: c.egr[0].legs.filter(function (l) { return l.type === "ride"; })[0].line, s: C.fmt(c.egr[0].dep) }, "najszybciej do celu: {l} o {s}, na miejscu {t}")));
          var headHtml = c.walkA ? '<div class="gz-dir" style="white-space:normal">⏰ ' + esc(T("gzm.cLeave", { t: C.fmt(c.walkA.leave), s: c.walkA.name }, "wyjdź: {t} z {s}")) + "</div>" : (L ? '<div class="gz-dir" style="white-space:normal">⏰ ' + esc(T("gzm.cLeave", { t: C.fmt(L.jn.legs[0].type === "walk" ? L.jn.dep - L.jn.legs[0].min : L.jn.dep), s: L.jn.legs[0].fromName }, "wyjdź: {t} z {s}")) + "</div>" : '<div class="gz-dir" style="white-space:normal">🚆 ' + esc(T("gzm.cTrainAt", { t: it.departureTime, s: x.p.cb.a.st.n }, "pociąg {t} z {s}")) + "</div>");
          var card = '<div class="gz-dep ' + (L && L.status === "tight" ? "tight" : "ok") + '" style="grid-template-columns:minmax(0,1fr) auto">' +
            '<div class="gz-main">' + headHtml +
            steps.map(function (h) { return '<div class="gz-stop" style="white-space:normal;margin-top:4px">' + h + "</div>"; }).join("") +
            (guardOk ? '<div style="margin-top:8px"><button type="button" class="gz-btn sec" data-guard="' + i + '">🛡️ ' + esc(T("gzm.cGuardAll", null, "Pilnuj całej podróży")) + "</button></div>" : "") + "</div>" +
            '<div class="gz-right"><div class="gz-t">' + C.fmt(x.final) + '</div><div class="gz-in">' + esc(T("gzm.bArrive", null, "na miejscu")) + "</div>" + totalHtml(x.final - (c.walkA ? c.walkA.leave : L ? (L.jn.legs[0].type === "walk" ? L.jn.dep - L.jn.legs[0].min : L.jn.dep) : x.dep)) + "</div></div>";
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
      var steps = jn.legs.map(function (l) {
        if (l.type === "walk") return "🚶 " + esc(T("gzm.cWalk", { n: l.min, s: l.toName }, "{n} min pieszo do: {s}"));
        return TYPE_ICON[l.kind] + " <b>" + esc(l.line) + "</b> → " + esc(l.head) + "<br>" + (l.live && l.delay ? '<span class="plan-strike">' + C.fmt(l.depPlan) + "</span> " : "") + C.fmt(l.dep) + " " + esc(l.fromName) + " → " + esc(l.toName) + " <b>" + C.fmt(l.arr) + "</b>" + (l.live ? (l.delay ? " (+" + l.delay + " min)" : " · " + esc(T("gzm.live", null, "na żywo"))) : "");
      });
      var first = jn.legs.find(function (l) { return l.type === "ride"; });
      return '<div class="gz-dep ok" style="grid-template-columns:minmax(0,1fr) auto">' +
        '<div class="gz-main"><div class="gz-dir" style="white-space:normal">🚌 ' + esc(jn.transfers ? T("gzm.nTitle", { n: jn.transfers }, "komunikacja GZM · przesiadki: {n}") : T("gzm.nDirect", null, "komunikacja GZM · bez przesiadek")) + "</div>" +
        '<div class="gz-dir" style="white-space:normal;font-size:13px">⏰ ' + esc(T("gzm.cLeave", { t: C.fmt(jn.legs[0].type === "walk" ? first.dep - jn.legs[0].min : jn.dep), s: jn.legs[0].fromName }, "wyjdź: {t} z {s}")) + "</div>" +
        steps.map(function (h) { return '<div class="gz-stop" style="white-space:normal;margin-top:4px">' + h + "</div>"; }).join("") + "</div>" +
        '<div class="gz-right"><div class="gz-t">' + C.fmt(jn.arr) + '</div><div class="gz-in">' + esc(T("gzm.bArrive", null, "na miejscu")) + "</div>" + totalHtml(jn.arr - (jn.legs[0].type === "walk" ? first.dep - jn.legs[0].min : jn.dep)) + "</div></div>";
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
      open: function (o) {
        cfg = { stationId: o.stationId, arr: o.arr || null, date: o.date || null, train: o.train || null, alighted: false };
        trainInfo = null; showMore = 0;
        ready.then(function () { var s = root.querySelector("#gzSt"); if (s) s.value = String(cfg.stationId || ""); var a = root.querySelector("#gzArr"); if (a && cfg.arr) a.value = cfg.arr; load1(); });
      }
    };
  }

  window.GzmView = { mount: mount };
})();
