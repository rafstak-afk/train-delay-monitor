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
    '.gzmap-ov{position:fixed;inset:0;z-index:100020;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:10px}' +
    '.gzmap-box{background:#1c2833;border:1px solid #34495e;border-radius:14px;width:min(560px,100%);max-height:96vh;display:flex;flex-direction:column;overflow:hidden;color:#fff;font-family:Arial,sans-serif}' +
    '.gzmap-top{display:flex;gap:6px;padding:10px;align-items:center}.gzmap-top input{flex:1;min-width:0;padding:9px;border-radius:9px;border:1px solid #48627c;background:#223244;color:#fff;font-size:15px}' +
    '.gzmap-btn{border:0;border-radius:9px;padding:9px 12px;font-weight:800;cursor:pointer;background:#374151;color:#fff;font-size:14px}.gzmap-btn.ok{background:#15803d}.gzmap-btn.pri{background:#0b57d0}' +
    '.gzmap{position:relative;height:min(60vh,460px);overflow:hidden;background:#aad3df;touch-action:none;cursor:grab}.gzmap img{position:absolute;width:256px;height:256px;user-select:none;-webkit-user-drag:none;pointer-events:none}' +
    '.gzmap-x{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-34px 0 0 -17px;font-size:32px;line-height:34px;text-align:center;pointer-events:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.6))}' +
    '.gzmap-z{position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:6px}.gzmap-z button{width:38px;height:38px;border-radius:9px;border:0;background:#fff;color:#111;font-size:22px;font-weight:900;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.35)}' +
    '.gzmap-attr{position:absolute;right:4px;bottom:2px;font-size:10.5px;background:rgba(255,255,255,.8);color:#333;padding:1px 4px;border-radius:4px}' +
    '.gzmap-bot{display:flex;gap:8px;justify-content:space-between;align-items:center;padding:10px;flex-wrap:wrap}.gzmap-bot small{color:#b8c3cf}' +
    '.gz .gz-fardeps{margin:4px 0 2px 26px}.gz .gz-fardep{padding:6px 8px;border-radius:8px;cursor:pointer;font-size:13.5px}.gz .gz-fardep:hover{background:rgba(255,255,255,.05)}' +
    '.gz .gv .v2-tap{cursor:pointer}' +
    '.gz .gv .card{margin:10px 0}.gz .gv .c-route{font-size:15px}.gz .gv .c-sub{font-size:13px;margin-top:3px;color:#fff}.gz .gv .c-sub b{color:var(--yellow)}' +
    '.gz .gv .leg.v2-walk{padding:5px 0}.gz .gv .leg.v2-walk .leg-t{font-weight:400;color:var(--muted);font-size:12.5px}.gz .gv .leg.v2-walk .leg-st{font-size:12.5px}' +
    '.gz .gv .chip .ct{display:block;font-size:17px;font-weight:900;color:#fff}' +
    '.gz .gv details.v2-more{margin-top:8px;border-top:1px dashed var(--line);padding-top:6px}.gz .gv details.v2-more summary{cursor:pointer;font-size:13px;font-weight:800;color:var(--cyan)}' +
    '.gz .gv .c-actions .btn-sm{font-size:12.5px}' +
    '.gz .gv .v2-gtimes{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.gz .gv .v2-gtimes .chip{cursor:pointer;font-size:11.5px;text-align:center;min-width:72px}.gz .gv .v2-gtimes .chip .ct{font-size:15px}.gz .gv .v2-gtimes .chip.on{outline:2px solid var(--cyan)}' +
    '.gz .gv .v2c{cursor:pointer;padding:10px 14px}.gz .gv .v2c-r1{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:18px}.gz .gv .v2c-r1 b{font-size:19px}.gz .gv .v2c-dur{font-size:14px;color:#cfe0f5;white-space:nowrap}' +
    '.gz .gv .v2c-r2{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px;font-size:14px}.gz .gv .v2c-l{background:#22344a;border-radius:7px;padding:2px 7px;font-weight:700}.gz .gv .v2c-t{background:#1d3a66}.gz .gv .v2c-w{color:#9fb0c2}.gz .gv .v2c-sep{color:#6b7c90}' +
    '.gz .gv .v2c-r3{margin-top:5px;font-size:12.5px;color:#9fb0c2}.gz .gv .v2c-hide{background:#22344a;border:1px solid #34495e;border-radius:8px;color:#cfe0f5;cursor:pointer;font-size:14px;font-weight:700;padding:6px 12px;margin-top:4px}.gz .gv .v2c-open .c-head{cursor:pointer}.gz .gv .v2c-open{margin:10px 0}' +
    '.gz .gv .v2-dep{cursor:pointer;padding:10px 12px}.gz .gv .v2-dep .c-route{font-size:14.5px}' +
    '.gz .gv .gz-fav{background:none;border:0;color:var(--yellow);font-size:16px;cursor:pointer;padding:0 2px;vertical-align:middle}' +
    '.gz .gz-plk{font-size:12.5px;font-weight:700;color:var(--cyan,#5dade2);text-decoration:none;white-space:nowrap}.gz .gz-plk:hover{text-decoration:underline}' +
    '.gz .gz-nod{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#f39c12;color:#111;font-weight:900;font-size:11px;margin-left:5px;cursor:pointer;vertical-align:middle}' +
    '.gz .gz-nodbox{margin:6px 0;padding:10px 12px;border:1px solid #f39c12;border-radius:10px;background:rgba(243,156,18,.1);font-size:13px;line-height:1.45}.gz .gz-nodbox a{display:inline-block;margin-top:6px;font-weight:700;color:#ffd400}' +
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
    '@keyframes gzEdgeB{50%{background:rgba(255,77,77,.45)}}.gz .gv .ce-mu{color:#93a4b8;font-size:13px}' +
    '.gz .gv .ce-ok{color:#5dd39e;font-weight:800}.gz .gv .ce-tight{color:#ffcc00;font-weight:800}.gz .gv .ce-missed,.gz .gv .ce-edge{color:#ff6b6b;font-weight:800}' +
    '.gz .gv .f-r1{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.gz .gv .f-r1 b{font-size:21px}.gz .gv .f-st{font-weight:800;font-size:15px;white-space:nowrap}' +
    '.gz .gv .f-how{margin-top:6px;font-size:15.5px;line-height:1.4}.gz .gv .f-how b{font-weight:800}.gz .gv .f-meta{margin-top:4px;font-size:13.5px;color:#9fb0c2;line-height:1.4}' +
    '.gz .gv .f-tt{width:100%;border-collapse:collapse;margin-top:8px}.gz .gv .f-tt td{padding:9px 0;vertical-align:top;border-top:1px solid #2a3a4c}.gz .gv .f-tt tr:first-child td{border-top:0}' +
    '.gz .gv .f-tt .h{width:60px;font-weight:800;font-size:17px;white-space:nowrap}.gz .gv .f-tt .w{font-size:16px;line-height:1.4;overflow-wrap:anywhere}.gz .gv .f-tt .w b{font-weight:800}.gz .gv .f-sm{display:block;font-size:13.5px;color:#9fb0c2;margin-top:1px}' +
    '.gz .gv .f-tt tr.x-ok td{background:rgba(93,211,158,.08)}.gz .gv .f-tt tr.x-tight td{background:rgba(255,204,0,.10)}.gz .gv .f-tt tr.x-missed td,.gz .gv .f-tt tr.x-edge td{background:rgba(255,77,77,.14)}.gz .gv .f-tt tr.x-edge td{animation:gzEdgeB 1s steps(2) infinite}' +
    '.gz .gv .f-tt tr[class^="x-"] .h{padding-left:6px;border-radius:10px 0 0 10px}.gz .gv .f-tt tr[class^="x-"] .w{padding-right:6px;border-radius:0 10px 10px 0}' +
    '.xfer.edge{border:1px solid rgba(255,77,77,.8)!important;animation:gzEdge 1s ease-in-out infinite}@keyframes gzEdge{50%{background:rgba(255,77,77,.35)}}@media(prefers-reduced-motion:reduce){.xfer.edge{animation:none;background:rgba(255,77,77,.25)}}' +
    '.gz-rt-more{margin:2px 0}.gz-rt-more>summary{cursor:pointer;color:var(--muted,#9fb0c2);font-size:13px;padding:6px 2px;list-style:none}.gz-rt-more>summary::-webkit-details-marker{display:none}.gz-rt-more[open]>summary{color:#cfe0f5}' +
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
  // /api/planner z ponowieniem: pierwsze zapytanie na „zimnym” serwerze potrafi przekroczyć limit procesora Cloudflare
  // (błąd 1102 → HTTP 503, odpowiedź nie-JSON). Bez ponowienia trasa przepadała po cichu (TODO 64: „cofanie się”).
  function plannerFetch(q, n) {
    n = n || 0;
    return fetch("/api/planner?" + q, { headers: { Accept: "application/json" } }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if ((!r.ok || !j) && !(j && j.error) && n < 2) return new Promise(function (ok) { setTimeout(ok, n ? 3000 : 1200); }).then(function () { return plannerFetch(q, n + 1); });
        if (!j) throw new Error("planner " + r.status);
        return j;
      });
    });
  }
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
          if (netP[cfg.date || warsawNow().date]) netP[cfg.date || warsawNow().date]._net = net;   // dla rozwijanych kursów (tripHtml)
          var r = farStops(net, meta), h = '<div class="gz-farbox"><b>' + esc(T("gzm.farHead", { st: meta.n, n: index.maxWalkMin || 8 }, "Przy stacji {st} nie ma przystanku ZTM w zwykłym zasięgu pieszym (do {n} min).")) + "</b>";
          if (r.list.length) {
            h += "<div>" + esc(T("gzm.farNear", null, "Najbliższe przystanki — dalej niż zwykle:")) + "</div>" + r.list.map(function (o) {
              return '<div class="gz-farrow">' + farBadge() + "<b>" + esc(o.name) + "</b> · " + esc(T("gzm.farRow", { d: kmTxt(o.d), n: o.walk }, "{d}, ok. {n} min pieszo")) +
                ' <button type="button" class="gz-chip" data-fardeps="' + esc(o.name) + '">🕒 ' + esc(T("gzm.farDeps", null, "Odjazdy")) + "</button>" +
                ' <button type="button" class="gz-chip" data-farfrom="' + esc(o.name) + '">' + esc(T("gzm.farUse", null, "Skąd: ten przystanek")) + '</button></div><div class="gz-fardeps" data-for="' + esc(o.name) + '" hidden></div>';
            }).join("") + '<div class="gz-sub" style="margin-top:8px">' + esc(T("gzm.farHint", null, "Wpisz też „Dokąd”, a ułożę podróż z dojściem do tego przystanku.")) + "</div>";
          } else if (r.nearest) {
            h += "<div>" + esc(T("gzm.farNone", { s: r.nearest.name, d: kmTxt(r.nearest.d) }, "ZTM tu nie dojeżdża — najbliższy przystanek: {s}, {d} od stacji.")) + "</div>";
          }
          body.innerHTML = h + "</div>";
          var depDate = cfg.date || warsawNow().date, depFrom = cfg.arr ? C.hm(cfg.arr) : nowOn(depDate);
          body.querySelectorAll("[data-fardeps]").forEach(function (b) {
            b.addEventListener("click", function () {
              var row = b.closest(".gz-farrow"), box = row && row.nextElementSibling; if (!box || !box.classList.contains("gz-fardeps")) return;   // (bez CSS.escape — w tym pliku „CSS” to zmienna ze stylami)
              if (!box.hidden) { box.hidden = true; return; }
              getRt().catch(function () {}).then(function () { box.innerHTML = stopDepsHtml(stopDeps(net, b.dataset.fardeps, depFrom, 8), depDate); box.hidden = false; });
            });
          });
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
      } else {
        // bez pozycji na żywo: gdzie POWINIEN być wg rozkładu (dziś, w trakcie kursu)
        var schedIdx = -1, nowT = nowOn(date);
        if (date === warsawNow().date) seq.forEach(function (sx, i) { if (tr[1] + off[2 * i + 1] <= nowT) schedIdx = i; });
        var inRun = schedIdx >= 0 && schedIdx < seq.length - 1 && tr[1] <= nowT;
        if (inRun) { curSeq = schedIdx + 1; nearIdx = -2; }
        pos = '<div class="gz-trip-pos" style="color:var(--muted)">' + esc(T("gzm.tNoPos", null, "brak pozycji na żywo — godziny wg rozkładu")) +
          (inRun ? '<br><span style="color:#ffd400">🕒 ' + esc(T("gzm.tSched", { a: net.name[seq[schedIdx]], b: net.name[seq[schedIdx + 1]] }, "wg rozkładu teraz między: {a} → {b}")) + "</span>" : "") + "</div>";
        var schedBetween = inRun ? schedIdx : -1;
      }
      var rows = seq.map(function (sx, i) {
        var plan = tr[1] + off[2 * i + 1], nm = net.name[sx];
        var cls = (curSeq != null && i < curSeq ? " past" : "") + (nm === boardName || (alightName && nm === alightName) ? " me" : "") + (i === nearIdx || (schedBetween != null && schedBetween >= 0 && i === schedBetween) ? " here" : "");
        var t = dl ? '<span class="plan-strike">' + C.fmt(plan) + "</span> " + C.fmt(plan + dl) : C.fmt(plan);
        return '<div class="gz-tr' + cls + '"><div>' + t + "</div><div>" + (i === nearIdx ? "📍 " : "") + esc(nm + stTag(net.j.stops[sx][3])) + "</div></div>";
      });
      // TODO 60 (dla wszystkich od v6.32): także kursy GZM — przystanki przed wsiadaniem i po wysiadce schowane
      var ib = -1, ia = -1;
      if (alightName) seq.forEach(function (sx, i) { var nm = net.name[sx]; if (ib < 0 && nm === boardName) ib = i; else if (ib >= 0 && ia < 0 && nm === alightName) ia = i; });
      rows = ib >= 0 && ia > ib ? foldRoute(rows, ib, ia, "g|" + tid, "stop") : rows.join("");
      return inner ? pos + rows : '<div class="gz-trip">' + pos + rows + "</div>";
    }
    // TODO 60: odcinek od wsiadania do wysiadki widoczny, reszta trasy pod „▸ …” (stan rozwinięcia przeżywa odświeżanie)
    function foldRoute(rows, ib, ia, key, kind) {
      if (ib <= 0 && ia >= rows.length - 1) return rows.join("");
      var fold = function (part, side, n) {
        if (!part.length) return "";
        var mk = "rt|" + side + "|" + key, txt = kind === "stop" ?
          (side === "b" ? T("gzm.tBeforeStop", { n: n }, "▸ wcześniejsze przystanki ({n})") : T("gzm.tAfterStop", { n: n }, "▸ dalsze przystanki ({n})")) :
          (side === "b" ? T("gzm.tBefore", { n: n }, "▸ wcześniejsze stacje pociągu ({n})") : T("gzm.tAfter", { n: n }, "▸ dalsze stacje pociągu ({n})"));
        return '<details class="gz-rt-more" data-mk="' + esc(mk) + '"' + (moreOpen[mk] ? " open" : "") + "><summary>" + esc(txt) + "</summary>" + part.join("") + "</details>";
      };
      return fold(rows.slice(0, ib), "b", ib) + rows.slice(ib, ia + 1).join("") + fold(rows.slice(ia + 1), "a", rows.length - 1 - ia);
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
        return '<div class="gz-leg"><span class="ln">' + esc(l.line) + '</span><span><span class="tm">' + dep + "</span> " + esc(l.fromName + stTag(l.fromCode)) + "</span>" +
          '<span class="to">→ <b>' + C.fmt(l.arr) + "</b> " + esc(l.toName + stTag(l.toCode)) + (l.live && l.delay ? " (+" + l.delay + " min)" : "") + "</span></div>";
      }).join("") + "</div>";
    }
    function rerender() { if (st.dir === "C" && cState) renderC(); else render(); }
    root.addEventListener("click", function (e) { var wm = e.target.closest("[data-wmap]"); if (wm) { e.stopPropagation(); openWalkMap(wm.getAttribute("data-wmap")); } });   // 🗺️ TODO 20
    root.addEventListener("click", function (e) {
      if (!tripExpandOn()) return;
      // karta podróży (v2): stuknięcie w kartę — poza przyciskami, sekcjami „Inne…” i rozwiniętą trasą — jak „▼ Trasa”
      var cxe = e.target.closest("[data-cx]");
      if (cxe && !e.target.closest("button,a,summary,details,.gz-trip,input")) { var ck = cxe.getAttribute("data-cx"); if (tripOpen[ck]) delete tripOpen[ck]; else tripOpen[ck] = true; rerender(); return; }
      var tx = e.target.closest("[data-tx]");
      if (tx) { var kk = tx.getAttribute("data-tx"); if (tripOpen[kk]) delete tripOpen[kk]; else tripOpen[kk] = true; rerender(); return; }
      var card = e.target.closest(".gz-dep[data-tripx], .v2-dep[data-tripx]");
      if (!card || e.target.closest("button,a")) return;
      var k = card.getAttribute("data-tripx");
      if (tripOpen[k]) delete tripOpen[k]; else tripOpen[k] = true;
      rerender();
    });

    function depHtml(x, cls, noFav) {
      return depHtmlV2(x, cls, noFav);
    }

    // 🗺️ Droga peron → przystanek na mapce (TODO 20) — na razie profil autora; dane: stations/<id>-walk.json
    var walkFiles = {};
    function walkMapBtn(stop) {
      if (!rel27() || !stop || !stop.c) return "";   // mapki: dla wszystkich od 27.11 16:00
      return ' <button type="button" class="gz-wmap" data-wmap="' + esc(stop.c) + '" title="' + esc(T("gzm.wmapTitle", null, "Droga z peronu na mapie")) + '" style="border:0;background:none;cursor:pointer;font-size:1em;padding:0 2px">🗺️</button>';
    }
    function openWalkMap(code) {
      var sid = cfg.stationId, f0 = file, stop = f0 && (f0.stops || []).find(function (s) { return s.c === code; });
      if (!stop) return;
      var get = walkFiles[sid] || (walkFiles[sid] = fetch(dataUrl("stations/" + sid + "-walk.json")).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
      get.then(function (wj) {
        var pts = wj && wj.stops && wj.stops[code];
        drawWalkMap((f0.name || "") + " → " + stop.n + stTag(stop.c), pts, { lat: stop.lat, lon: stop.lon }, "🚆", "🚏",
          pts ? T("gzm.wmapNote", null, "Droga policzona z mapy OpenStreetMap z najbliższego peronu — w terenie może się różnić.") : T("gzm.wmapNone", null, "Dla tego przystanku nie mam przebiegu drogi — pokazuję tylko przystanek."));
      });
    }
    // TODO 20: mapka przejścia — przebieg z mapy OSM (pts od startu do celu), koniec = przystanek docelowy
    function drawWalkMap(title, pts, stop, iconA, iconB, note) {
      {
        var ov = document.createElement("div"); ov.className = "gzmap-ov";
        ov.innerHTML = '<div class="gzmap-box"><div class="gzmap-top" style="justify-content:space-between"><b style="padding:6px">🚶 ' + esc(title) + '</b><button type="button" class="gzmap-btn" data-x="1">✕</button></div>' +
          '<div class="gzmap" style="cursor:default"><div class="gzmap-tiles"></div><svg class="gzw-svg" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none"></svg></div>' +
          '<div class="gzmap-bot"><small>' + esc(note) +
          ' · <a href="https://www.openstreetmap.org/?mlat=' + stop.lat + "&mlon=" + stop.lon + "#map=18/" + stop.lat + "/" + stop.lon + '" target="_blank" rel="noopener">OpenStreetMap ↗</a> · © OpenStreetMap contributors</small></div></div>';
        document.body.appendChild(ov);
        ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest("[data-x]")) ov.remove(); });
        var mapEl = ov.querySelector(".gzmap"), tiles = ov.querySelector(".gzmap-tiles"), svg = ov.querySelector(".gzw-svg"), T2 = 256;
        var lx = function (lon, z) { return (lon + 180) / 360 * T2 * Math.pow(2, z); };
        var ly = function (lat, z) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * T2 * Math.pow(2, z); };
        var all = (pts || []).concat([[stop.lat, stop.lon]]);
        var w = mapEl.clientWidth || 320, h = mapEl.clientHeight || 320, z = 19;
        for (; z > 13; z--) { var xs = all.map(function (p) { return lx(p[1], z); }), ys = all.map(function (p) { return ly(p[0], z); }); if (Math.max.apply(null, xs) - Math.min.apply(null, xs) < w - 60 && Math.max.apply(null, ys) - Math.min.apply(null, ys) < h - 60) break; }
        var xs2 = all.map(function (p) { return lx(p[1], z); }), ys2 = all.map(function (p) { return ly(p[0], z); });
        var cx = (Math.max.apply(null, xs2) + Math.min.apply(null, xs2)) / 2, cy = (Math.max.apply(null, ys2) + Math.min.apply(null, ys2)) / 2, x0 = cx - w / 2, y0 = cy - h / 2, n = Math.pow(2, z), html = "";
        for (var tx = Math.floor(x0 / T2); tx <= Math.floor((x0 + w) / T2); tx++) for (var ty = Math.floor(y0 / T2); ty <= Math.floor((y0 + h) / T2); ty++) {
          if (ty < 0 || ty >= n) continue;
          html += '<img alt="" src="https://tile.openstreetmap.org/' + z + "/" + (((tx % n) + n) % n) + "/" + ty + '.png" style="left:' + Math.round(tx * T2 - x0) + "px;top:" + Math.round(ty * T2 - y0) + 'px">';
        }
        tiles.innerHTML = html;
        var P = function (p) { return Math.round(lx(p[1], z) - x0) + "," + Math.round(ly(p[0], z) - y0); };
        var s = "";
        if (pts) {
          s += '<polyline points="' + pts.map(P).join(" ") + '" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>';
          s += '<polyline points="' + pts.map(P).join(" ") + '" fill="none" stroke="#0b57d0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>';
          var a = P(pts[0]).split(","); s += '<circle cx="' + a[0] + '" cy="' + a[1] + '" r="8" fill="#f59e0b" stroke="#fff" stroke-width="3"/><text x="' + (+a[0] + 11) + '" y="' + (+a[1] + 5) + '" font-size="14" font-weight="700" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">' + iconA + '</text>';
        }
        var b = P([stop.lat, stop.lon]).split(","); s += '<circle cx="' + b[0] + '" cy="' + b[1] + '" r="8" fill="#16a34a" stroke="#fff" stroke-width="3"/><text x="' + (+b[0] + 11) + '" y="' + (+b[1] + 5) + '" font-size="14" font-weight="700" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">' + iconB + '</text>';
        svg.innerHTML = s;
      }
    }
    // TODO 20 (profil autora): mapki w kartach połączeń — przejście między przystankami (przebieg z OSM)
    var swFiles = {};
    function openStopMap(ia, ib) {
      var net = cState && cState.net; if (!net) return;
      var ca = String(net.j.stops[ia][3] || ""), cb = String(net.j.stops[ib][3] || ""), key = ca < cb ? ca + "|" + cb : cb + "|" + ca, g = key.slice(0, 7);
      var get = swFiles[g] || (swFiles[g] = fetch(dataUrl("stopwalk/" + g + ".json")).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
      get.then(function (wj) {
        var p = wj && wj.w && wj.w[key], pts = p ? (ca < cb ? p : p.slice().reverse()) : [[net.lat[ia], net.lon[ia]], [net.lat[ib], net.lon[ib]]];
        drawWalkMap(net.name[ia] + stTag(ca) + " → " + net.name[ib] + stTag(cb), pts, { lat: net.lat[ib], lon: net.lon[ib] }, "🚏", "🚏",
          p ? T("gzm.wmapStops", null, "Droga policzona z mapy OpenStreetMap (przez jezdnię tylko na przejściach) — w terenie może się różnić.") : T("gzm.wmapStraight", null, "Dla tego przejścia nie mam drogi z mapy — linia prosta między przystankami."));
      });
    }
    // … i z peronu na przystanek (oraz z przystanku na peron) przy pociągu
    // droga między dwoma przystankami (z mapy albo linia prosta) — do sklejania z dojściem z peronu
    function stopPath(ia, ib) {
      var net = cState.net, ca = String(net.j.stops[ia][3] || ""), cb = String(net.j.stops[ib][3] || ""), key = ca < cb ? ca + "|" + cb : cb + "|" + ca, g = key.slice(0, 7);
      var get = swFiles[g] || (swFiles[g] = fetch(dataUrl("stopwalk/" + g + ".json")).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
      return get.then(function (wj) { var p = wj && wj.w && wj.w[key]; return p ? (ca < cb ? p : p.slice().reverse()) : [[net.lat[ia], net.lon[ia]], [net.lat[ib], net.lon[ib]]]; });
    }
    function openPlatMap(sid, sName, si, toStation, chain) {
      var net = cState && cState.net; if (!net) return;
      var code = String(net.j.stops[si][3] || ""), nm = net.name[si];
      // TODO 66: scalony krok — jedna mapka: peron → przystanek przy stacji → kolejne przejścia
      if (chain && !toStation) {
        var segs = chain.split(",").map(function (q) { return q.split(">").map(Number); });
        var gw = walkFiles[sid] || (walkFiles[sid] = fetch(dataUrl("stations/" + sid + "-walk.json")).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
        Promise.all([gw].concat(segs.map(function (q) { return stopPath(q[0], q[1]); }))).then(function (all) {
          var wj = all[0], p0 = wj && wj.stops && wj.stops[code], pts = (p0 || [[net.lat[si], net.lon[si]]]).slice();
          all.slice(1).forEach(function (p) { pts = pts.concat(p); });
          var last = segs[segs.length - 1][1], lc = String(net.j.stops[last][3] || "");
          drawWalkMap(sName + " → " + net.name[last] + stTag(lc), pts, { lat: net.lat[last], lon: net.lon[last] }, "🚆", "🚏",
            T("gzm.wmapNote", null, "Droga policzona z mapy OpenStreetMap z najbliższego peronu — w terenie może się różnić."));
        });
        return;
      }
      var get = walkFiles[sid] || (walkFiles[sid] = fetch(dataUrl("stations/" + sid + "-walk.json")).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
      get.then(function (wj) {
        var pts = wj && wj.stops && wj.stops[code], end = { lat: net.lat[si], lon: net.lon[si] };
        if (pts && toStation) { pts = pts.slice().reverse(); end = { lat: pts[pts.length - 1][0], lon: pts[pts.length - 1][1] }; }
        drawWalkMap(toStation ? nm + stTag(code) + " → " + sName : sName + " → " + nm + stTag(code), pts || null, end, toStation ? "🚏" : "🚆", toStation && pts ? "🚆" : "🚏",
          pts ? T("gzm.wmapNote", null, "Droga policzona z mapy OpenStreetMap z najbliższego peronu — w terenie może się różnić.") : T("gzm.wmapNone", null, "Dla tego przystanku nie mam przebiegu drogi — pokazuję tylko przystanek."));
      });
    }
    window.GzmPlatMap = function (stName, stopName, code, toStation) {
      getIndex().then(function (idx) {
        var st = (idx.stations || []).find(function (y) { return y.n === stName; }); if (!st) return;
        var cand = (st.s || []).filter(function (p) { return code ? p[0] === code : p[1] === stopName; }).sort(function (a, b) { return a[2] - b[2]; })[0]; if (!cand) return;
        var c = cand[0], sid = st.id;
        var get = walkFiles[sid] || (walkFiles[sid] = fetch(dataUrl("stations/" + sid + "-walk.json")).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }));
        get.then(function (wj) {
          var pts = wj && wj.stops && wj.stops[c];
          var end = pts ? { lat: pts[pts.length - 1][0], lon: pts[pts.length - 1][1] } : { lat: st.lat, lon: st.lon };
          if (pts && toStation) { pts = pts.slice().reverse(); end = { lat: pts[pts.length - 1][0], lon: pts[pts.length - 1][1] }; }
          drawWalkMap(toStation ? stopName + stTag(c) + " → " + stName : stName + " → " + stopName + stTag(c), pts || null, end, toStation ? "🚏" : "🚆", toStation && pts ? "🚆" : "🚏",
            pts ? T("gzm.wmapNote", null, "Droga policzona z mapy OpenStreetMap z najbliższego peronu — w terenie może się różnić.") : T("gzm.wmapNone", null, "Dla tego przystanku nie mam przebiegu drogi — pokazuję tylko przystanek."));
        });
      }).catch(function () {});
    };
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-swmap],[data-pwmap]"); if (!b) return;
      e.stopPropagation();
      if (b.dataset.swmap) { var q = b.dataset.swmap.split("|"); openStopMap(+q[0], +q[1]); }
      else { var r = b.dataset.pwmap.split("|"); openPlatMap(r[0], r[1], +r[2], r[3] === "1", r[4] || ""); }
    }, true);
    // TODO 111 (26.11, profil autora): 🗺️ także przy dojściu od/do miejsca (adres, 🏠 Dom, 💼 Praca, 📍 GPS) — do przystanku albo stacji.
    // Przebiegu drogi z mapy dla miejsc nie mamy (czas liczony z odległości) — mapka pokazuje oba punkty i linię prostą.
    var ptReg = {};
    function ptMapBtn(a, b) {
      if (!a || !b || a.lat == null || b.lat == null || a.lon == null || b.lon == null) return "";
      var k = [a.lat, a.lon, b.lat, b.lon].map(function (v) { return (+v).toFixed(5); }).join(",");
      ptReg[k] = { a: a, b: b };
      return mapBtn("data-ptmap", k);
    }
    function placePt(pl) { return pl ? { lat: pl.lat, lon: pl.lon, name: pl.label || "", icon: "📍" } : null; }
    function stopPt(i) { var net = cState && cState.net; return net && net.lat[i] != null ? { lat: net.lat[i], lon: net.lon[i], name: net.name[i] + stTag(String(net.j.stops[i][3] || "")), icon: "🚏" } : null; }
    function stationPt(st) { return st && st.lat != null ? { lat: st.lat, lon: st.lon, name: st.n || "", icon: "🚆" } : null; }
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ptmap]"); if (!b) return;
      e.stopPropagation();
      var r = ptReg[b.getAttribute("data-ptmap")]; if (!r) return;
      drawWalkMap(r.a.name + " → " + r.b.name, [[r.a.lat, r.a.lon], [r.b.lat, r.b.lon]], { lat: r.b.lat, lon: r.b.lon }, r.a.icon, r.b.icon,
        T("gzm.wmapPlace", null, "Dla tego dojścia nie mam drogi z mapy — linia prosta, czas wg odległości. W terenie droga może być dłuższa."));
    }, true);
    function mapBtn(attr, val) { return rel27() ? ' <button type="button" ' + attr + '="' + esc(val) + '" title="' + esc(T("gzm.wmapTitle2", null, "Droga na mapie")) + '" style="border:0;background:none;cursor:pointer;font-size:1em;padding:0 2px">🗺️</button>' : ""; }
    function depHtmlV2(x, cls, noFav) {
      var d = x.dep, inMin = Math.round(x.real - nowOn(cfg.date || warsawNow().date));
      var tTxt = (x.live && x.delay) ? '<span class="plan-strike">' + C.fmt(d.min) + "</span> " + C.fmt(x.real) : C.fmt(x.real);
      var key = C.favKey(d), isF = (favs[cfg.stationId] || []).indexOf(key) >= 0;
      var tk = d.trip + "|" + d.date + "|" + d.stop.n, open = !!tripOpen[tk];
      var walk = x.walk.exact ? x.walk.min : (d.stop.w[0] === d.stop.w[1] ? d.stop.w[1] : d.stop.w[0] + "–" + d.stop.w[1]);
      var inTxt = inMin > 180 || inMin < -1 ? "" : inMin <= 0 ? T("gzm.now", null, "teraz") : T("gzm.inMin", { n: inMin }, "za {n} min");
      return '<div class="card v2-dep ' + (V2ST[x.status] || "s-ok") + (cls || "") + '" data-k="' + esc(d.trip + "|" + d.stopIdx) + '" data-tripx="' + esc(tk) + '" title="' + esc(T("gzm.tTap", null, "Stuknij — cały bieg kursu")) + '">' +
        '<div class="c-head"><div><div class="c-route">' + (TYPE_ICON[d.type] || "🚌") + " " + esc(d.line) + " → " + esc(d.head) +
        (noFav ? "" : ' <button type="button" class="gz-fav" data-fav="' + esc(key) + '" title="' + esc(T("gzm.favTitle", null, "Ulubiona linia w tym kierunku na tej stacji")) + '">' + (isF ? "★" : "☆") + "</button>") + "</div>" +
        '<div class="c-date">' + esc(d.stop.n + stTag(d.stop.c)) + " · 🚶 " + esc(walk) + " min" + (d.stop.stairs ? " 🪜" : "") + walkMapBtn(d.stop) + (modesOn() ? crossIcons(d.stop) : "") + (nodOn() ? nodBadge(d.stop) : "") + (x.walk.warn ? ' <span title="' + esc(T("gzm.stairsWarn", null, "Z części peronów albo w ogóle tylko po schodach")) + '">⚠️♿</span>' : "") + v2Dl(x.live, x.delay) + "</div>" +
        (x.arrDest != null ? '<div class="c-sub">🏁 ' + esc(T("gzm.arrDest", { t: C.fmt(x.arrDest), n: x.destName, m: x.travel }, "{t} {n} (jazda {m} min)")) + "</div>" : "") + "</div>" +
        '<span class="chip ' + (V2ST[x.status] || "s-ok") + '"><span class="ct">' + tTxt + "</span>" + esc(inTxt ? inTxt + " · " : "") + esc(v2StTxt(x.status)) + "</span></div>" +
        (open ? tripHtml(d.trip, d.date, d.stop.n) : "") + "</div>";
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
      var head = '<div class="gz-head"><b>🚉 ' + esc(file.name) + "</b> " + plkLink(file.name) +
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
          // v2: linia jako karta (jak „Zdążysz na”), godziny jako stukane plakietki
          return '<div class="card s-ok" style="padding:10px 12px"><div class="c-route">' + (TYPE_ICON[g.type] || "🚌") + " " + esc(g.line) + " → " + esc(g.head) + '</div><div class="v2-gtimes">' +
            g.items.map(function (x) {
              var tk = x.dep.trip + "|" + x.dep.date + "|" + x.dep.stop.n;
              return '<span class="chip ' + (V2ST[x.status] || "s-ok") + (tripOpen[tk] ? " on" : "") + '" data-tx="' + esc(tk) + '" role="button" tabindex="0" title="' + esc(T("gzm.tTap", null, "Stuknij — cały bieg kursu")) + '"><span class="ct">' + C.fmt(x.real) + "</span>" + esc(x.dep.stop.n.replace(file.name.split(" ")[0] + " ", "") + stTag(x.dep.stop.c)) + (x.live && x.delay ? " · " + (x.delay > 0 ? "+" : "") + x.delay : "") + "</span>";
            }).join("") + "</div>" +
            g.items.map(function (x) { var tk = x.dep.trip + "|" + x.dep.date + "|" + x.dep.stop.n; return tripOpen[tk] ? tripHtml(x.dep.trip, x.dep.date, x.dep.stop.n) : ""; }).join("") + "</div>";
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
        // gdzie jest zapisane miejsce: link do mapy + najbliższa stacja (do sprawdzenia, czy punkt jest dobry)
        var placeWhere = function (pl) {
          if (!pl || typeof pl.lat !== "number") return "";
          var best = null; (index.stations || []).forEach(function (x) { var d = havM(pl.lat, pl.lon, x.lat, x.lon); if (!best || d < best.d) best = { n: x.n, d: d }; });
          return ' · <a href="https://www.openstreetmap.org/?mlat=' + pl.lat + "&mlon=" + pl.lon + "#map=17/" + pl.lat + "/" + pl.lon + '" target="_blank" rel="noopener" style="color:var(--cyan)">📍 ' + esc(T("gzm.pOnMap", null, "na mapie")) + "</a>" +
            (best ? " · " + esc(T("gzm.pNearest", { s: best.n, d: kmTxt(best.d) }, "najbliższa stacja: {s}, {d}")) : "");
        };
        // 🗺️ wybór punktu na mapie (kafelki OSM, bez bibliotek)
        var mapPick = function (k) {
          var P0 = load(PLACES, {}), cur = P0[k] || P0.dom || { lat: 50.4449, lon: 18.8615 };
          var z = 16, T2 = 256;
          var lx = function (lon, zz) { return (lon + 180) / 360 * T2 * Math.pow(2, zz); };
          var ly = function (lat, zz) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * T2 * Math.pow(2, zz); };
          var ilon = function (x, zz) { return x / (T2 * Math.pow(2, zz)) * 360 - 180; };
          var ilat = function (y, zz) { var n = Math.PI - 2 * Math.PI * y / (T2 * Math.pow(2, zz)); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
          var cx = lx(cur.lon, z), cy = ly(cur.lat, z);
          var ov = document.createElement("div"); ov.className = "gzmap-ov";
          ov.innerHTML = '<div class="gzmap-box"><div class="gzmap-top"><input placeholder="' + esc(T("gzm.mapSearch", null, "Szukaj adresu, np. Opolska 5, Tarnowskie Góry")) + '"><button type="button" class="gzmap-btn pri" data-m="find">🔎</button></div>' +
            '<div class="gzmap"><div class="gzmap-tiles"></div><div class="gzmap-x">📍</div><div class="gzmap-z"><button type="button" data-m="in">+</button><button type="button" data-m="out">−</button></div><div class="gzmap-attr">© OpenStreetMap contributors</div></div>' +
            '<div class="gzmap-bot"><small>' + esc(T("gzm.mapHint", { p: PL_TOK[k] }, "Przesuń mapę tak, żeby 📍 stała na miejscu: {p}")) + '</small><span style="display:flex;gap:8px"><button type="button" class="gzmap-btn" data-m="cancel">' + esc(T("gzm.mapCancel", null, "Anuluj")) + '</button><button type="button" class="gzmap-btn ok" data-m="save">✔ ' + esc(T("gzm.mapSave", null, "Zapisz tutaj")) + "</button></span></div></div>";
          document.body.appendChild(ov);
          var mapEl = ov.querySelector(".gzmap"), tiles = ov.querySelector(".gzmap-tiles");
          var draw = function () {
            var w = mapEl.clientWidth, h = mapEl.clientHeight, x0 = cx - w / 2, y0 = cy - h / 2, n = Math.pow(2, z), html = "";
            for (var tx = Math.floor(x0 / T2); tx <= Math.floor((x0 + w) / T2); tx++) for (var ty = Math.floor(y0 / T2); ty <= Math.floor((y0 + h) / T2); ty++) {
              if (ty < 0 || ty >= n) continue; var wx = ((tx % n) + n) % n;
              html += '<img alt="" src="https://tile.openstreetmap.org/' + z + "/" + wx + "/" + ty + '.png" style="left:' + Math.round(tx * T2 - x0) + "px;top:" + Math.round(ty * T2 - y0) + 'px">';
            }
            tiles.innerHTML = html;
          };
          var zoom = function (dz) { var nz = Math.max(5, Math.min(19, z + dz)); if (nz === z) return; var lat = ilat(cy, z), lon = ilon(cx, z); z = nz; cx = lx(lon, z); cy = ly(lat, z); draw(); };
          var drag = null;
          mapEl.addEventListener("pointerdown", function (e) { if (e.target.closest("button")) return; drag = { x: e.clientX, y: e.clientY }; mapEl.setPointerCapture(e.pointerId); mapEl.style.cursor = "grabbing"; });
          mapEl.addEventListener("pointermove", function (e) { if (!drag) return; cx -= e.clientX - drag.x; cy -= e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; draw(); });
          mapEl.addEventListener("pointerup", function () { drag = null; mapEl.style.cursor = "grab"; });
          mapEl.addEventListener("wheel", function (e) { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
          var close = function () { ov.remove(); };
          var find = function () {
            var q = ov.querySelector("input").value.trim(); if (!q) return;
            geocode(q).then(function (g) { if (!g) { ov.querySelector("small").textContent = T("gzm.uNoAddr", { a: q }, "Nie znalazłem adresu „{a}”."); return; } z = 17; cx = lx(g.lon, z); cy = ly(g.lat, z); draw(); });
          };
          ov.addEventListener("click", function (e) {
            if (e.target === ov) return close();
            var b = e.target.closest("[data-m]"); if (!b) return;
            var m = b.dataset.m;
            if (m === "in") zoom(1); else if (m === "out") zoom(-1); else if (m === "cancel") close(); else if (m === "find") find();
            else if (m === "save") {
              var old = load(PLACES, {})[k] || {};
              putPlace(k, Object.assign({}, old, { lat: +ilat(cy, z).toFixed(6), lon: +ilon(cx, z).toFixed(6) }));
              close(); drawPlaces();
            }
          });
          ov.querySelector("input").addEventListener("keydown", function (e) { if (e.key === "Enter") find(); });
          requestAnimationFrame(draw);
        };
        var drawPlaces = function () {
          var P = load(PLACES, {});
          var chip = function (k, side) { return '<button type="button" class="gz-chip" data-pl="' + k + '" data-side="' + side + '">' + esc(PL_TOK[k]) + "</button>"; };
          // przyciski 🏠/🏢/📍 pokazujemy dopiero po kliknięciu w pole Skąd / Dokąd (plRow)
          pb.innerHTML = '<details class="gz-sub" style="margin:2px 2px 8px"><summary>' + esc(T("gzm.pMine", null, "Moje miejsca")) + "</summary>" +
            ["dom", "praca"].map(function (k) { return '<div style="margin:6px 0' + (P[k] ? ';padding-bottom:6px;border-bottom:1px solid var(--line)' : '') + '">' + esc(PL_TOK[k]) + ": " + (P[k] ? "✔ " + esc(T("gzm.pSet", null, "ustawione")) + placeWhere(P[k]) + " " : "— ") + '<button type="button" class="gz-chip" data-plset="' + k + '">📍 ' + esc(T("gzm.pSetHere", null, "ustaw tu, gdzie jestem")) + "</button>" + ' <button type="button" class="gz-chip" data-plmap="' + k + '">🗺️ ' + esc(T("gzm.pSetMap", null, "ustaw na mapie")) + "</button>" + (P[k] ? ' <button type="button" class="gz-chip" data-plclr="' + k + '">✕</button><div data-wbox="' + k + '"></div>' : "") + "</div>"; }).join("") +
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
        // wiersz 🏠 Dom / 🏢 Praca / 📍 Moja lokalizacja pod polami — tylko dla aktywnego pola
        var plRow = function (side) {
          var r = root.querySelector("#gzPlRow");
          if (!r) {
            r = document.createElement("div"); r.id = "gzPlRow"; r.className = "gz-chips"; r.style.cssText = "align-items:center;margin:0 2px 8px";
            var anchor = root.querySelector(".gz-dt"), host = anchor ? anchor.parentNode : root.querySelector("#gzCTo").closest(".gz-st").parentNode;
            host.insertBefore(r, anchor || null);
            r.addEventListener("mousedown", function (e) { e.preventDefault(); });   // nie zabieraj fokusu polu
            r.addEventListener("click", function (e) {
              var b = e.target.closest("button[data-pl]"); if (!b) return;
              var fIn = root.querySelector("#gzCFrom"), tIn2 = root.querySelector("#gzCTo"), me = b.dataset.side === "f" ? fIn : tIn2, other = me === fIn ? tIn2 : fIn;
              // notatka 20.11: po wyborze 🏠/🏢/📍 lista podpowiedzi pola zostawała rozwinięta
              if (me._ddPick) me._ddPick(PL_TOK[b.dataset.pl]); else me.value = PL_TOK[b.dataset.pl];
              r.style.display = "none";
              me.style.boxShadow = "0 0 0 2px #22c55e"; setTimeout(function () { me.style.boxShadow = ""; }, 900);
              if (other.value.trim()) { try { me.blur(); } catch (er) {} searchC(); } else other.focus();
            });
          }
          var chip = function (k) { return '<button type="button" class="gz-chip" data-pl="' + k + '" data-side="' + side + '">' + esc(PL_TOK[k]) + "</button>"; };
          r.innerHTML = '<span class="gz-sub">' + esc(side === "f" ? T("gzm.pFrom", null, "Skąd:") : T("gzm.pTo", null, "Dokąd:")) + "</span>" + chip("dom") + chip("praca") + (side === "f" ? chip("gps") : "");
          r.style.display = "";
        };
        root.addEventListener("focusin", function (e) { if (e.target.id === "gzCFrom") plRow("f"); else if (e.target.id === "gzCTo") plRow("t"); });
        document.addEventListener("click", function (e) {
          var r = root.querySelector("#gzPlRow"); if (!r || r.style.display === "none") return;
          if (r.contains(e.target) || e.target.id === "gzCFrom" || e.target.id === "gzCTo") return;
          r.style.display = "none";
        });
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
          if (b.dataset.plmap) { mapPick(b.dataset.plmap); return; }
          if (b.dataset.plset) { b.disabled = true; b.textContent = "⏳"; gpsNow().then(function (g) { var old = load(PLACES, {})[b.dataset.plset] || {}; putPlace(b.dataset.plset, Object.assign({}, old, { lat: +g.lat.toFixed(6), lon: +g.lon.toFixed(6) })); drawPlaces(); }, function () { b.textContent = "⚠ GPS"; }); }
        });
      }
      c.querySelector("#gzCGo").addEventListener("click", searchC);
      ["#gzCFrom", "#gzCTo"].forEach(function (q) { c.querySelector(q).addEventListener("keydown", function (e) { if (e.key === "Enter") searchC(); }); });
      c.addEventListener("click", function (e) {
        var g = e.target.closest("[data-guard]"); if (g) { guardTrip(g); return; }
        var rb = e.target.closest("[data-remind]"); if (rb) { remindTrip(rb); return; }
        var sh = e.target.closest("[data-shift]");
        if (sh) { var tm = +sh.dataset.shift; tm = Math.max(0, Math.min(1439, tm)); var ti = root.querySelector("#gzCTime"); if (ti) ti.value = C.fmt(tm); searchC(); return; }
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
      var wm = document.getElementById("walkMeasure");
      if (wm) more.appendChild(wm); // pomiar dojścia — w „⚙️ Więcej opcji”
      more.querySelector("summary").textContent = "⚙️ " + T("gzm.uMore", null, "Więcej opcji");
      root.insertBefore(u, a);
      var aBar = a.querySelector(".gz-bar"); if (aBar) aBar.style.display = "none";
      var lbl = function (id, txt) { var l = u.querySelector('label[for="' + id + '"]'); if (l) l.textContent = txt; };
      var today = warsawNow().date, rg = index.range || [today, today];
      // data i godzina jak na tablicy głównej: dwa pola obok siebie, bez etykiet
      var tIn = u.querySelector("#gzCTime"), tDiv = tIn.parentNode, dWrap = document.createElement("div");
      dWrap.className = "gz-dt";
      if (!document.getElementById("gzModesCss")) { var mcss = document.createElement("style"); mcss.id = "gzModesCss"; mcss.textContent = ".gz-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#e74c3c;vertical-align:middle;margin-left:4px;box-shadow:0 0 0 2px rgba(231,76,60,.25)}.gz-prefs > summary{cursor:pointer}.gz-modes{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:2px 2px 10px;font-size:13.5px}.gz-modes-l{color:var(--muted,#9fb0cf);font-size:12.5px;width:100%}.gz-mode{display:inline-flex;align-items:center;gap:5px;cursor:pointer;padding:6px 10px;border:1px solid var(--line,#34495e);border-radius:10px;background:var(--panel,#1c2833)}.gz-mode input{width:18px;height:18px;margin:0;accent-color:#2ecc71}"; document.head.appendChild(mcss); }
      dWrap.innerHTML = '<input id="gzCDate" type="date" autocomplete="off" aria-label="' + esc(T("gzm.uDate", null, "Data")) + '" title="' + esc(T("gzm.uDate", null, "Data")) + '">';
      tIn.setAttribute("aria-label", T("gzm.uWhen", null, "Kiedy")); tIn.title = T("gzm.uWhen", null, "Kiedy");
      dWrap.appendChild(tIn);
      tDiv.parentNode.insertBefore(dWrap, tDiv); tDiv.remove();
      if (modesOn()) {
        var pBox = document.createElement("details"); pBox.className = "gz-prefs gz-sub"; pBox.style.margin = "0 2px 8px";
        pBox.innerHTML = "<summary>" + prefsHead() + "</summary>";
        var mWrap = document.createElement("div"); mWrap.className = "gz-modes"; mWrap.style.marginTop = "8px"; mWrap.innerHTML = modesHtml();
        pBox.appendChild(mWrap);
        if (more && more.parentNode) more.parentNode.insertBefore(pBox, more); else dWrap.parentNode.insertBefore(pBox, dWrap.nextSibling);
        // w środku: środki transportu i tempo, potem „Moje miejsca” i „⚙️ Więcej opcji” (okno czasu, pomiar dojścia)
        var pbEl = root.querySelector("#gzPlaces"); if (pbEl) { pbEl.style.marginTop = "6px"; pBox.appendChild(pbEl); }
        if (more) pBox.appendChild(more);
        var refreshHead = function () { pBox.querySelector("summary").innerHTML = prefsHead(); };
        var hideRedo = function () {
          mWrap.innerHTML = modesHtml(); refreshHead();
          var fH = root.querySelector("#gzCFrom"), rH = root.querySelector("#gzCRes");
          if (fH && fH.value.trim() && rH && rH.innerHTML.trim()) searchC();
        };
        mWrap.addEventListener("click", function (ev) {
          var un = ev.target.closest("[data-unhide]");
          if (un) { setHidden(hiddenLines().filter(function (x) { return x !== un.getAttribute("data-unhide"); })); hideRedo(); return; }
          if (ev.target.closest("[data-hideadd]")) { var inp = mWrap.querySelector("#gzHideIn"); if (inp && inp.value.trim()) { setHidden(hiddenLines().concat(inp.value.split(/[ ,;]+/))); hideRedo(); } }
        });
        mWrap.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && ev.target.id === "gzHideIn") { ev.preventDefault(); var b = mWrap.querySelector("[data-hideadd]"); if (b) b.click(); } });
        mWrap.addEventListener("change", function (ev) {
          var pc = ev.target.closest("input[data-pace], input[data-nostairs]");
          if (pc) {
            var wp = walkPrefs();
            if (pc.dataset.pace) wp.pace = pc.dataset.pace; else wp.noStairs = pc.checked;
            if (defWalk(wp)) { try { localStorage.removeItem(WP_LS); } catch (e) {} } else save(WP_LS, wp);
            if (profOn()) ProfileSync.push({ gzmWalkPrefs: defWalk(wp) ? null : wp });   // do profilu tylko inne niż domyślne
            mWrap.innerHTML = modesHtml(); refreshHead();
            var fA = root.querySelector("#gzCFrom"), rA = root.querySelector("#gzCRes");
            if (fA && fA.value.trim() && rA && rA.innerHTML.trim()) searchC();
            return;
          }
          var cb = ev.target.closest("input[data-mode]"); if (!cb) return;
          var m = modes(); m[cb.dataset.mode] = cb.checked;
          if (!m.train && !m.bus && !m.tram && !m.trolley) { cb.checked = true; m[cb.dataset.mode] = true; var r0 = root.querySelector("#gzCRes"); if (r0) r0.innerHTML = '<div class="gz-warn">' + esc(T("gzm.modesMin", null, "Zostaw zaznaczony co najmniej jeden środek transportu.")) + "</div>"; return; }
          if (defModes(m)) { try { localStorage.removeItem(MODES_LS); } catch (e) {} } else save(MODES_LS, m);
          if (profOn()) ProfileSync.push({ gzmModes: defModes(m) ? null : m });   // do profilu tylko inne niż domyślne
          refreshHead();
          // są wyniki → od razu przelicz z nowym filtrem
          var f0 = root.querySelector("#gzCFrom"), r1 = root.querySelector("#gzCRes");
          if (f0 && f0.value.trim() && r1 && r1.innerHTML.trim()) searchC();
        });
      }
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
      ["#gzCRes", "#gzBody"].forEach(function (q) { var el = root.querySelector(q); if (el) el.classList.add("gv"); });
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
      var timer = null, nearBusy = false, picked = false;   // picked: po wyborze z listy nie otwieraj jej od nowa (notatka 20.11)
      function close() { if (nearBusy) return; dd.classList.remove("open"); dd.innerHTML = ""; }
      var nearOpt = function () { return window.NearestStations ? NearestStations.optionHtml("gz-dd-item") : ""; };
      function show() {
        if (picked) return;
        var q = inp.value.trim();
        if (q.length < 2) { if (nearOpt() && document.activeElement === inp) { dd.innerHTML = nearOpt(); dd.classList.add("open"); } else close(); return; }
        ddList().then(function () {
          if (inp.value.trim() !== q || picked) return;   // notatka 24.11: w międzyczasie wybór z listy — lista ma zostać zwinięta
          var m = ddMatch(q);
          if (!m.length || (m.length === 1 && m[0].n === q)) {
            close();
            // TODO 81: brak w GZM — może to stacja PLK spoza GZM (np. Lubliniec)
            if (!(m.length === 1 && m[0].n === q)) plkStations(q).then(function () {
              if (inp.value.trim() !== q || picked) return;
              var ext = Object.keys(extSt).map(function (k) { return extSt[k]; }).filter(function (x) { return normName(x.n).indexOf(normName(q)) === 0; }).slice(0, 8);
              if (!ext.length || (ext.length === 1 && ext[0].n === q)) return;
              dd.innerHTML = nearOpt() + ext.map(function (x) { return '<button type="button" class="gz-dd-item" data-n="' + esc(x.n) + '"><span class="gz-dd-name">' + esc(x.n) + '</span><span class="gz-dd-kind">' + esc(KIND.st) + "</span></button>"; }).join("");
              dd.classList.add("open");
            });
            return;
          }
          if (!m.some(function (x) { return x.k === "st" && normName(x.n) === normName(q); })) plkStations(q).then(function () {
            if (inp.value.trim() !== q || picked) return;
            var ext = Object.keys(extSt).map(function (k) { return extSt[k]; }).filter(function (x) { return normName(x.n).indexOf(normName(q)) === 0 && !m.some(function (y) { return y.n === x.n; }); }).slice(0, 6);
            if (!ext.length) return;
            var m2 = m.concat(ext.map(function (x) { return { n: x.n, k: "st", r: 1 }; }));
            dd.innerHTML = nearOpt() + m2.map(function (x) { return '<button type="button" class="gz-dd-item" data-n="' + esc(x.n) + '"><span class="gz-dd-name">' + esc(x.n) + '</span><span class="gz-dd-kind">' + esc(KIND[x.k] || "") + "</span></button>"; }).join("");
            dd.classList.add("open");
          });
          dd.innerHTML = nearOpt() + m.map(function (x) { return '<button type="button" class="gz-dd-item" data-n="' + esc(x.n) + '"><span class="gz-dd-name">' + esc(x.n) + '</span><span class="gz-dd-kind">' + esc(KIND[x.k]) + "</span></button>"; }).join("");
          dd.classList.add("open");
        });
      }
      var pickedVal = null, pickedAt = 0;
      function pick(n) { clearTimeout(timer); inp.value = n; picked = true; pickedVal = n; pickedAt = Date.now(); close(); }
      inp._ddPick = pick;   // wybór z zewnątrz (🏠/🏢/📍 pod polami) — też zwija listę
      // notatka 20.11: klawiatura Androida po stuknięciu w podpowiedź zatwierdza jeszcze wpisywany tekst (zdarzenie „input”) — to nie jest nowe wpisywanie
      inp.addEventListener("input", function () { if (picked && (inp.value === pickedVal || Date.now() - pickedAt < 800)) { if (inp.value !== pickedVal) inp.value = pickedVal; return; } picked = false; nearBusy = false; clearTimeout(timer); timer = setTimeout(show, 150); });
      // notatka 25.11 (14:10, „nie zwija się lista w polu dokąd”): zwijamy też po stuknięciu poza listą i po schowaniu klawiatury
      // (Android: wstecz / „Gotowe” chowa klawiaturę, ale pole zostaje aktywne, więc „blur” nie przychodzi)
      document.addEventListener("pointerdown", function (e) { if (dd.classList.contains("open") && !w.contains(e.target)) { nearBusy = false; close(); } }, true);
      if (window.visualViewport) { var vvH = visualViewport.height; visualViewport.addEventListener("resize", function () { var h = visualViewport.height; if (h > vvH + 120 && dd.classList.contains("open") && !nearBusy) close(); vvH = h; }); }
      inp.addEventListener("focus", function () { show(); });
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
        else if (e.key === "Enter") { var ex = items.filter(function (b) { return normName(b.dataset.n || "") === normName(inp.value); })[0]; if (ex) pick(ex.dataset.n); else { nearBusy = false; close(); } }
        else if (e.key === "Escape") close();
      }, true);
      dd.addEventListener("mousedown", function (e) { e.preventDefault(); });
      dd.addEventListener("click", function (e) {
        // 📍 Najbliższe stacje — lista w tym samym okienku; po wyborze „Skąd” przejście do pustego „Dokąd”
        if (e.target.closest("[data-near-open]")) {
          e.stopPropagation(); nearBusy = true;
          var otherInp = root.querySelector(inp.id === "gzCFrom" ? "#gzCTo" : "#gzCFrom");
          NearestStations.openIn(dd, function (s) {
            nearBusy = false; pick(s.name);
            try { inp.dispatchEvent(new Event("input", { bubbles: true })); } catch (er) {}
            // notatka 20.11: zdarzenie „input” otwierało listę od nowa i zasłaniało „Dokąd” — po wyborze lista zostaje zwinięta
            clearTimeout(timer); picked = true; close();
            var to = root.querySelector("#gzCTo"); if (inp.id === "gzCFrom" && to && !to.value.trim()) to.focus(); else { try { inp.blur(); } catch (er) {} }
          }, null, otherInp ? otherInp.value : "", function (pos) {   // dla wszystkich od 24.11 (v6.84)
            // TODO 62: do najbliższych stacji także najbliższe przystanki GZM (do 4, w promieniu 2 km, bez powtórzeń nazw)
            return getNet(warsawNow().date).then(function (net) {
              var best = {};
              for (var i = 0; i < net.n; i++) { var d = NearestStations.km(pos.lat, pos.lon, net.lat[i], net.lon[i]); if (d <= 2 && (!best[net.name[i]] || d < best[net.name[i]])) best[net.name[i]] = d; }
              return Object.keys(best).map(function (nm) { return { name: nm, km: best[nm], kind: "stop" }; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 4);
            });
          });
          return;
        }
        // wybór z listy: lista się zwija; ze „Skąd” przejście do pustego „Dokąd”, inaczej chowamy klawiaturę
        var b = e.target.closest(".gz-dd-item");
        if (b) { try { inp.blur(); } catch (er) {} pick(b.dataset.n); var to2 = root.querySelector("#gzCTo"); if (inp.id === "gzCFrom" && to2 && !to2.value.trim()) to2.focus(); else inp.blur(); }
      });
    }
    // przewinięcie do pierwszego wyniku (pod przyklejonym paskiem zakładek)
    function scrollToFirst(box, sel) {
      var t0 = Date.now();
      (function poll() {
        var el = box && box.querySelector(sel || ".card, .gz-dep, .gz-warn, .gz-empty:not(.gz-searching)");
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
    function looksAddress(txt) { return /\d|,|(^|\s)(ul|al|pl|os)\.|(^|\s)(ulica|ulicy|aleja|alei|plac|osiedle)(\s|$)/i.test(txt); }
    // Nominatim bywa wybredny („ul. Księdza …”, miasto na początku) — próbujemy kilku zapisów, po kolei (max 1 zapytanie/s).
    function geoVariants(txt) {
      var t = String(txt).trim(), out = [t];
      var clean = t.replace(/(^|\s)(ul|al|pl|os)\.\s*/gi, " ").replace(/(^|\s)(ulica|ulicy)\s+/gi, " ")
        .replace(/(^|\s)(księdza|ks\.|świętego|św\.|generała|gen\.|biskupa|bpa|doktora|dr\.?|profesora|prof\.|marszałka|marsz\.|kardynała|kard\.|króla|majora|mjr\.?|pułkownika|płk\.?)\s+/gi, " ")
        .replace(/\s+/g, " ").trim();
      if (clean && clean !== t) out.push(clean);
      var w = clean.replace(/,/g, " ").split(" ").filter(Boolean);
      if (clean.indexOf(",") < 0 && w.length >= 3) {
        out.push(w.slice(2).join(" ") + ", " + w.slice(0, 2).join(" "));   // „Piekary Śląskie Piotra Skargi” → „Piotra Skargi, Piekary Śląskie”
        out.push(w.slice(1).join(" ") + ", " + w[0]);                      // „Bytom Piłsudskiego 5” → „Piłsudskiego 5, Bytom”
      }
      // ulica w dopełniaczu („Dworcowej 3”, „Wolności”) → mianownik („Dworcowa 3”)
      var nom = clean.replace(/([A-Za-zżźćńółęąśŻŹĆŃÓŁĘĄŚ]{3,}?)(owej|skiej|ckiej|nej|iej)(?=[\s,]|$)/g, function (m0, st, en) { return st + ({ owej: "owa", skiej: "ska", ckiej: "cka", nej: "na", iej: "ia" })[en]; });
      var cfOn = true;   // dla wszystkich od v5.56
      if (cfOn && nom !== clean) out.splice(2, 0, nom);
      return out.filter(function (x, i) { return out.indexOf(x) === i; }).slice(0, 5);
    }
    function geoOnce(q) {
      var p = new URLSearchParams({ format: "jsonv2", q: q, addressdetails: "1", countrycodes: "pl", viewbox: "18.2,50.75,19.75,49.9", bounded: "1", limit: "1", "accept-language": "pl" });
      return fetch("https://nominatim.openstreetmap.org/search?" + p, { headers: { Accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    }
    function geocode(txt) {
      var key = normName(txt), cache = load(GEO, {});
      if (cache[key]) return Promise.resolve(cache[key]);
      var vars = geoVariants(txt), i = 0;
      var next = function () {
        if (i >= vars.length) return Promise.resolve(null);
        var q = vars[i++];
        return geoOnce(q).then(function (j) {
          if (!j || !j[0]) return i < vars.length ? new Promise(function (r) { setTimeout(r, 1100); }).then(next) : null;
          var ad = j[0].address || {}, street = [ad.road || ad.pedestrian || ad.square || j[0].name || "", ad.house_number || ""].join(" ").trim(), town = ad.city || ad.town || ad.village || ad.suburb || "";
          var lab = [street, town].filter(Boolean).join(", ") || String(j[0].display_name || txt).split(",").slice(0, 2).join(",");
          var v = { lat: +(+j[0].lat).toFixed(6), lon: +(+j[0].lon).toFixed(6), label: "📍 " + lab };
          cache[key] = v; var ks = Object.keys(cache); if (ks.length > 40) delete cache[ks[0]]; save(GEO, cache);
          return v;
        });
      };
      return next();
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
              return plannerFetch(q).then(function (pl) {
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
    function stationByName(name) { var n = normName(name); return (index.stations || []).find(function (x) { return normName(x.n) === n; }) || extSt[n] || null; }
    // TODO 81 (profil autora): każda stacja PKP PLK — spoza GZM bez przystanków komunikacji (s: []), tylko pociąg na tym końcu
    var extSt = {}, extQ = {};
    function plkStations(q) {
      q = String(q || "").trim(); if (q.length < 2) return Promise.resolve([]);
      var k = normName(q);
      if (!extQ[k]) extQ[k] = fetch("/api/dictionaries/stations?search=" + encodeURIComponent(q) + "&pageSize=12", { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          var a = (j && (j.stations || j.data || j.items)) || (Array.isArray(j) ? j : []);
          return a.map(function (x) { return { id: x.id || x.stationId, n: x.name || x.stationName, lat: +x.latitude || +x.lat || null, lon: +x.longitude || +x.lon || null }; })
            .filter(function (x) { return x.n && x.lat && x.lon; })
            .map(function (x) { var nn = normName(x.n); if (!(index.stations || []).some(function (y) { return normName(y.n) === nn; })) extSt[nn] = { id: "plk" + x.id, plkId: x.id, n: x.n, lat: x.lat, lon: x.lon, s: [], ext: true }; return x; });
        }).catch(function () { delete extQ[k]; return []; });
      return extQ[k];
    }
    // przed wyszukiwaniem: nazwy wpisane ręcznie (bez wyboru z listy) — sprawdzić w słowniku PLK
    function ensureExt(names) {
      if (!authorOn()) return Promise.resolve();
      return Promise.all(names.filter(function (t) { return t && !placeKey(t) && !stationByName(t); }).map(plkStations)).then(function () {}, function () {});
    }
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
    // Najpierw dokładny GPS (10 s), a gdy nie zdąży lub nie ma sygnału — lokalizacja przybliżona z sieci/Wi-Fi (8 s).
    // Błąd niesie przyczynę: gps:none / gps:denied / gps:unavail / gps:timeout (komunikat w gpsErrHtml).
    function gpsTry(high, ms, maxAge) {
      return new Promise(function (res, rej) {
        navigator.geolocation.getCurrentPosition(function (p) { res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, approx: !high }); }, rej, { enableHighAccuracy: high, timeout: ms, maximumAge: maxAge });
      });
    }
    function gpsNow() {
      if (!navigator.geolocation) return Promise.reject(new Error("gps:none"));
      var fail = function (e) { return new Error(e && e.code === 1 ? "gps:denied" : e && e.code === 3 ? "gps:timeout" : "gps:unavail"); };
      return gpsTry(true, 10000, 30000).catch(function (e) {
        if (e && e.code === 1) throw fail(e);
        return gpsTry(false, 8000, 120000).catch(function (e2) { throw fail(e2); });
      });
    }
    function gpsErrHtml(m) {
      var why = String(m || "").split(":")[1];
      var txt = why === "denied" ? T("gzm.pGpsDenied", null, "Przeglądarka nie ma zgody na lokalizację. Włącz ją w ustawieniach tej strony i spróbuj ponownie.") :
        why === "timeout" ? T("gzm.pGpsTimeout", null, "Telefon nie zdążył ustalić położenia. Spróbuj ponownie albo wpisz przystanek.") :
        why === "none" ? T("gzm.pGpsNone", null, "Ta przeglądarka nie udostępnia lokalizacji. Wpisz przystanek albo adres.") :
        why === "unavail" ? T("gzm.pGpsUnavail", null, "Telefon nie podał położenia. Sprawdź, czy lokalizacja jest włączona, albo wpisz przystanek.") :
        T("gzm.pGpsErr", null, "Nie udało się odczytać lokalizacji GPS (zgoda w przeglądarce?).");
      return '<div class="gz-warn">' + esc(txt) + (why === "none" ? "" : '<div style="margin-top:8px"><button type="button" class="gz-btn" data-gpsretry="1">' + esc(T("gzm.pGpsRetry", null, "🔄 Spróbuj ponownie")) + "</button></div>") + "</div>";
    }
    root.addEventListener("click", function (ev) {
      if (!ev.target.closest("[data-gpsretry]")) return;
      var go = root.querySelector("#gzCGo"); if (go) go.click();
    });
    // Miejsce dalej niż 900 m od przystanku i stacji (TODO 51): zamiast ślepej uliczki — najbliższe stacje PLK i przystanki GZM
    // z odległością w linii prostej; wybór wpisuje je w pole i od razu szuka.
    function farPlace(res, net, pl, sel) {
      var isFrom = sel === "#gzCFrom";
      res.innerHTML = '<div class="gz-sub" style="margin:6px 2px">' + esc(T(isFrom ? "near.farFrom" : "near.farTo", null, isFrom ? "Najbliższa stacja albo przystanek jest dalej niż ok. 900 m pieszo. Wybierz, skąd jedziesz:" : "Najbliższa stacja albo przystanek jest dalej niż ok. 900 m pieszo. Wybierz, dokąd jedziesz:")) + '</div><div class="gz-near"></div>';
      if (!window.NearestStations || pl.lat == null) return;
      var best = {};
      for (var i = 0; i < net.n; i++) { var d = NearestStations.km(pl.lat, pl.lon, net.lat[i], net.lon[i]); if (d <= 5 && (!best[net.name[i]] || d < best[net.name[i]])) best[net.name[i]] = d; }
      var extra = Object.keys(best).map(function (n) { return { name: n, km: best[n], kind: "stop" }; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 3);
      // jak w planerze: po wyborze tej strony, gdy druga („Dokąd”/„Skąd”) jest pusta albo to też „Moja lokalizacja”, pytamy i o nią
      var box = res.querySelector(".gz-near"), asked = false;
      function set(q, name) { var inp = root.querySelector(q); if (!inp) return; inp.value = name; try { inp.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {} }
      function step(q, title) {
        NearestStations.render(box, { lat: pl.lat, lon: pl.lon, extra: extra, title: title, onPick: function (s) {
          set(q, s.name);
          var otherQ = q === "#gzCFrom" ? "#gzCTo" : "#gzCFrom", other = root.querySelector(otherQ), ov = other ? other.value.trim() : "";
          if (!asked && (!ov || placeKey(ov) === "gps")) { asked = true; step(otherQ, T(otherQ === "#gzCTo" ? "near.pickTo" : "near.pickFrom", null, otherQ === "#gzCTo" ? "Teraz wybierz stację „Dokąd” (albo wpisz ją sam)" : "Wybierz stację „Skąd”")); return; }
          var go = root.querySelector("#gzCGo"); if (go) go.click();
        } });
      }
      step(sel, " ");
    }
    function resolvePlace(txt) {
      var k = placeKey(txt);
      if (!k && uniOn() && !stationByName(txt) && looksAddress(txt)) return geocode(txt).then(function (g) {
        if (!g) throw new Error("addr:" + txt);
        return { key: "addr", label: g.label, lat: g.lat, lon: g.lon, far: true };
      });
      // nie stacja, nie przystanek, nie moje miejsce → spróbuj jeszcze jako adres (zanim powiemy „nie znam”)
      if (!k && uniOn() && !stationByName(txt)) return getNet(warsawNow().date).then(function (net) {
        if (netNames(net, txt).length) return null;
        return geocode(txt).then(function (g) { return g ? { key: "addr", label: g.label, lat: g.lat, lon: g.lon, far: true } : null; });
      }, function () { return null; });
      if (!k) return Promise.resolve(null);
      if (k === "gps") return gpsNow().then(function (g) {
        var o = { key: k, label: PL_TOK.gps + (g.approx ? " (" + T("gzm.pGpsApprox", null, "przybliżona") + ")" : ""), lat: g.lat, lon: g.lon, acc: g.acc != null ? Math.round(g.acc) : null };
        // TODO 73 (profil autora): jesteś przy 🏠 Domu / 🏢 Pracy — liczymy z Twoich czasów dojścia zapisanych przy tym miejscu
        if (authorOn() && !(o.acc > 150)) { var P = load(PLACES, {}); ["praca", "dom"].some(function (pk) { var x = P[pk]; if (x && x.walks && havM(o.lat, o.lon, x.lat, x.lon) <= 150) { o.walks = x.walks; o.nearPlace = pk; return true; } return false; }); }
        return o;
      });
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
        applyProfileModes(d);
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
    // ---------- środki transportu (filtr wyszukiwania) — TEST: tylko profil autora ----------
    var MODES_LS = "gzmModesV1", MODE_KIND = { 0: "tram", 3: "bus", 11: "trolley" };
    function modesOn() { return true; }   // filtry, tempo, bez schodów, przejścia — dla wszystkich od v5.56
    function modes() { var m = { train: true, bus: true, tram: true, trolley: true }; if (!modesOn()) return m; var v = load(MODES_LS, null); if (v && typeof v === "object") Object.keys(m).forEach(function (k) { if (v[k] === false) m[k] = false; }); return m; }
    var WP_LS = "gzmWalkPrefsV1", PACE = { fast: 0.8, normal: 1, slow: 1.3 };
    function walkPrefs() { var d = { pace: "normal", noStairs: false }; if (!modesOn()) return d; var v = load(WP_LS, null); if (v && typeof v === "object") { if (PACE[v.pace]) d.pace = v.pace; d.noStairs = !!v.noStairs; } return d; }
    function paceF() { return PACE[walkPrefs().pace]; }
    // min = dojście z mapy; ns = bez schodów ([min,max] | liczba | null/-1 = tylko po schodach | -2/undefined = nie wiadomo)
    window.GzmWalkAdj = function (min, ns, part) {
      var p = walkPrefs(), m = min, warn = "";
      if (p.noStairs) {
        if (ns === null || ns === -1) warn = "stairs";
        else if (Array.isArray(ns)) { m = Math.max(m, ns[1]); if (part) warn = "part"; }
        else if (typeof ns === "number" && ns >= 0) { m = Math.max(m, ns); if (part) warn = "part"; }
      }
      return { min: PACE[p.pace] === 1 ? m : Math.max(1, Math.round(m * PACE[p.pace])), warn: warn };
    };
    // Katalog Stacji PKP PLK (Portal Pasażera): dostępność, windy, pochylnie
    function plkLink(name) { return name ? '<a class="gz-plk" href="https://portalpasazera.pl/KatalogStacji/Index?stacja=' + encodeURIComponent(name) + '" target="_blank" rel="noopener">' + esc(T("gzm.plkCatalog", null, "ℹ️ Dostępność stacji (PKP PLK)")) + "</a>" : ""; }
    // „B” — brak danych o drodze z peronu (TEST: profil autora)
    function nodOn() { return true; }   // dla wszystkich od v5.58
    function nodBadge(s) {
      if (s.ns !== undefined && s.src !== "fallback" && s.src !== "osm-stacja") return "";   // brak danych albo perony nieznane (liczone od punktu stacji)
      var st = (index.stations || []).find(function (x) { return x.id === +cfg.stationId; }) || {};
      return ' <span class="gz-nod" role="button" tabindex="0" data-nod="' + esc((st.n || "") + "|" + s.n) + '" title="' + esc(T("gzm.nodTitle", null, "Brak danych o drodze z peronu na ten przystanek — czas jest szacunkowy. Stuknij, żeby dowiedzieć się więcej.")) + '">' + esc(T("gzm.nodLetter", null, "B")) + "</span>";
    }
    root.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-nod]"); if (!b) return;
      ev.stopPropagation(); ev.preventDefault();
      var host = b.closest(".card, .gz-dep, div"), nx = host && host.nextElementSibling;
      if (nx && nx.classList.contains("gz-nodbox")) { nx.remove(); return; }
      var p = b.dataset.nod.split("|"), q = new URLSearchParams({ kind: "place", station: p[0], stop: p.slice(1).join("|") });
      host.insertAdjacentHTML("afterend", '<div class="gz-nodbox">' + esc(T("gzm.nodBody", null, "Mapa OpenStreetMap nie zna drogi z peronu na ten przystanek (brak narysowanych peronów albo przejścia). Czas dojścia szacujemy w linii prostej, a o schodach, windach i światłach nic nie wiemy.")) +
        '<br>' + plkLink(p[0]) + '<br><a href="/kontakt/?' + esc(q.toString()) + '">' + esc(T("gzm.nodAsk", null, "✉️ Znasz to miejsce? Napisz, ile minut się idzie i czy są schody")) + "</a></div>");
    }, true);
    // 🚦 przejścia ze światłami, 🚸 bez świateł, 🛤️ przez tory — na trasie peron → przystanek
    function crossIcons(s) {
      var z = (s.cx || 0) - (s.sig || 0), out = "";
      if (s.sig) out += " 🚦" + (s.sig > 1 ? s.sig : "");
      if (z > 0) out += " 🚸" + (z > 1 ? z : "");
      if (s.rx) out += " 🛤️";
      return out ? '<span title="' + esc(T("gzm.crossTitle", { s: s.sig || 0, z: Math.max(0, z), r: s.rx || 0 }, "Na trasie: przejścia ze światłami {s}, bez świateł {z}, przez tory {r} (czekanie na światłach wliczone)")) + '">' + out + "</span>" : "";
    }
    // „tylko pociągi”: do stacji i od stacji wyłącznie pieszo — wtedy dalej: 3 km w linii prostej (ok. 3,5 km drogą, ~45 min).
    // dla wszystkich od v5.68
    var TRAIN_ONLY_M = 3000;
    function trainOnlyFar() { var m = modes(); return !!(m.train && !m.bus && !m.tram && !m.trolley); }
    function exclOf() { var m = modes(), e = null; ["bus", "tram", "trolley"].forEach(function (k) { if (!m[k]) { e = e || {}; e[k] = 1; } }); return e; }
    function modesHtml() {
      var m = modes(), L = { train: T("gzm.mTrain", null, "🚆 Pociąg"), bus: T("gzm.mBus", null, "🚌 Autobus"), tram: T("gzm.mTram", null, "🚋 Tramwaj"), trolley: T("gzm.mTrolley", null, "🚎 Trolejbus") };
      return '<span class="gz-modes-l">' + esc(T("gzm.modesLbl", null, "Środki transportu:")) + "</span>" + ["train", "bus", "tram", "trolley"].map(function (k) {
        return '<label class="gz-mode"><input type="checkbox" data-mode="' + k + '"' + (m[k] ? " checked" : "") + "> " + esc(L[k]) + "</label>";
      }).join("") + walkPrefsHtml() + hideHtml();
    }
    function defModes(m) { return m.train && m.bus && m.tram && m.trolley; }
    // Ukryte linie (TODO 16): lista nazw linii, np. ["M3","6"]; dla wszystkich od v6.17
    var HIDE_LS = "gzmHideLinesV1";
    function hiddenLines() { if (!modesOn()) return []; var v = load(HIDE_LS, null); return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string" && x; }).slice(0, 30) : []; }
    function hideOf() { var h = hiddenLines(), o = null; h.forEach(function (x) { o = o || {}; o[x.toUpperCase()] = 1; }); return o; }
    function setHidden(list) {
      var seen = {}, l = list.map(function (x) { return String(x).trim().toUpperCase().replace(/\s+/g, ""); }).filter(function (x) { if (!x || x.length > 8 || seen[x]) return false; seen[x] = 1; return true; }).slice(0, 30);
      if (l.length) save(HIDE_LS, l); else { try { localStorage.removeItem(HIDE_LS); } catch (e) {} }
      if (profOn()) ProfileSync.push({ gzmHideLines: l.length ? l : null });
      return l;
    }
    function hideHtml() {
      if (!modesOn()) return "";
      var h = hiddenLines();
      return '<div class="gz-hide" style="margin-top:8px"><span class="gz-modes-l">' + esc(T("gzm.hideLbl", null, "🚫 Nie pokazuj linii:")) + "</span> " +
        h.map(function (x) { return '<button type="button" class="gz-btn sec" data-unhide="' + esc(x) + '" style="padding:4px 9px;margin:2px">' + esc(x) + " ✕</button>"; }).join("") +
        '<input type="text" id="gzHideIn" maxlength="8" placeholder="' + esc(T("gzm.hidePh", null, "np. M3")) + '" style="width:80px;margin:2px 4px;padding:5px 7px;border-radius:7px;border:1px solid #34495e;background:#16212c;color:#fff">' +
        '<button type="button" class="gz-btn" data-hideadd="1" style="padding:4px 10px">' + esc(T("gzm.hideAdd", null, "Dodaj")) + "</button></div>";
    }
    function defWalk(p) { return p.pace === "normal" && !p.noStairs; }
    function prefsSummary() {
      var m = modes(), p = walkPrefs(), bits = [], L = { train: T("gzm.mTrain", null, "🚆 Pociąg"), bus: T("gzm.mBus", null, "🚌 Autobus"), tram: T("gzm.mTram", null, "🚋 Tramwaj"), trolley: T("gzm.mTrolley", null, "🚎 Trolejbus") };
      var off = ["train", "bus", "tram", "trolley"].filter(function (k) { return !m[k]; });
      if (off.length) bits.push(T("gzm.prefsWithout", null, "bez") + ": " + off.map(function (k) { return L[k]; }).join(", "));
      if (p.pace !== "normal") bits.push(T(p.pace === "fast" ? "gzm.paceFast" : "gzm.paceSlow", null, p.pace === "fast" ? "🏃 szybkie" : "🐢 spokojne"));
      if (p.noStairs) bits.push("♿");
      var hl = hiddenLines(); if (hl.length) bits.push("🚫 " + hl.join(", "));
      return bits;
    }
    function prefsHead() {
      var bits = prefsSummary();
      return "🎛️ " + esc(T("gzm.prefs", null, "Moje preferencje")) + (bits.length ? ' <span class="gz-dot" title="' + esc(T("gzm.prefsChanged", null, "Ustawienia inne niż domyślne") + ": " + bits.join(" · ")) + '"></span>' : "");
    }
    // odjazdy z przystanku przy odznaczonych środkach transportu: co jest ukryte + „pokaż wszystkie”
    function depsModesNote(anyDep) {
      var m = modes(); if (defModes(m)) return "";
      var L = { bus: T("gzm.mBus", null, "🚌 Autobus"), tram: T("gzm.mTram", null, "🚋 Tramwaj"), trolley: T("gzm.mTrolley", null, "🚎 Trolejbus") };
      var off = ["bus", "tram", "trolley"].filter(function (k) { return !m[k]; }).map(function (k) { return L[k]; }).join(", ");
      if (!off) return "";
      return '<div class="' + (anyDep ? "gz-sub" : "gz-warn") + '" style="margin:8px 2px">🎛️ ' + esc(T("gzm.depsModesOff", { m: off }, "Nie pokazuję: {m} — tak masz ustawione w Moich preferencjach.")) +
        ' <button type="button" class="gz-btn' + (anyDep ? " sec" : "") + '" data-modesall="1" style="margin-top:6px">' + esc(T("gzm.depsModesAll", null, "Pokaż wszystkie środki transportu")) + "</button></div>";
    }
    // brak wyników przy odznaczonych środkach transportu — wyjaśnienie + przycisk „włącz wszystkie”
    function noResModes() {
      var m = modes(); if (defModes(m)) return "";
      var L = { train: T("gzm.mTrain", null, "🚆 Pociąg"), bus: T("gzm.mBus", null, "🚌 Autobus"), tram: T("gzm.mTram", null, "🚋 Tramwaj"), trolley: T("gzm.mTrolley", null, "🚎 Trolejbus") };
      var off = ["train", "bus", "tram", "trolley"].filter(function (k) { return !m[k]; }).map(function (k) { return L[k]; }).join(", ");
      var txt = m.train && !m.bus && !m.tram && !m.trolley ? T("gzm.noResTrainOnly", { km: trainOnlyFar() ? "3,5" : "2" }, "Szukasz tylko pociągów — do stacji i od stacji liczę wtedy wyłącznie dojście pieszo (najwyżej ok. {km} km). Start albo cel jest dalej od stacji, więc bez autobusu lub tramwaju nie da się tam dotrzeć.") : T("gzm.noResModes", { m: off }, "Wyłączone w preferencjach: {m}. Bez nich nie znalazłem trasy.");
      return '<div class="gz-warn" style="margin-top:8px">🎛️ ' + esc(txt) + '<div style="margin-top:8px"><button type="button" class="gz-btn" data-modesall="1">' + esc(T("gzm.modesAllBtn", null, "🚆🚌 Włącz wszystkie środki transportu i szukaj")) + "</button></div></div>";
    }
    root.addEventListener("click", function (ev) {
      if (!ev.target.closest("[data-modesall]")) return;
      try { localStorage.removeItem(MODES_LS); } catch (e) {}
      if (profOn()) ProfileSync.push({ gzmModes: null });
      var box = root.querySelector(".gz-modes"); if (box) box.innerHTML = modesHtml();
      var sm = root.querySelector(".gz-prefs > summary"); if (sm) sm.innerHTML = prefsHead();
      searchC();
    });
    function walkPrefsHtml() {
      var p = walkPrefs(), L = { fast: T("gzm.paceFast", null, "🏃 szybkie"), normal: T("gzm.paceNormal", null, "🚶 zwykłe"), slow: T("gzm.paceSlow", null, "🐢 spokojne") };
      return '<span class="gz-modes-l">' + esc(T("gzm.paceLbl", null, "Tempo chodzenia:")) + "</span>" + ["fast", "normal", "slow"].map(function (k) {
        return '<label class="gz-mode"><input type="radio" name="gzPace" data-pace="' + k + '"' + (p.pace === k ? " checked" : "") + "> " + esc(L[k]) + "</label>";
      }).join("") + '<label class="gz-mode"><input type="checkbox" data-nostairs="1"' + (p.noStairs ? " checked" : "") + "> " + esc(T("gzm.noStairs", null, "♿ Unikaj schodów (wózek, wózek dziecięcy)")) + "</label>" +
        (p.noStairs ? '<span class="gz-modes-l">' + esc(T("gzm.noStairsNote", null, "Wybieram drogę bez schodów, gdy mapa ją zna (windy, pochylnie). ⚠️ przy przystanku = z części peronów tylko po schodach.")) + "</span>" : "");
    }
    function applyProfileModes(d) {
      if (!modesOn() || !d) return false;
      var chg = false;
      if (d.gzmWalkPrefs && typeof d.gzmWalkPrefs === "object" && JSON.stringify(load(WP_LS, null)) !== JSON.stringify(d.gzmWalkPrefs)) { save(WP_LS, d.gzmWalkPrefs); chg = true; }
      else if (d.gzmWalkPrefs === null && load(WP_LS, null)) { try { localStorage.removeItem(WP_LS); } catch (e) {} chg = true; }
      if (Array.isArray(d.gzmHideLines) && JSON.stringify(load(HIDE_LS, null)) !== JSON.stringify(d.gzmHideLines)) { save(HIDE_LS, d.gzmHideLines); chg = true; }
      else if (d.gzmHideLines === null && load(HIDE_LS, null)) { try { localStorage.removeItem(HIDE_LS); } catch (e) {} chg = true; }
      if (d.gzmModes && typeof d.gzmModes === "object" && JSON.stringify(load(MODES_LS, null)) !== JSON.stringify(d.gzmModes)) { save(MODES_LS, d.gzmModes); chg = true; }
      else if (d.gzmModes === null && load(MODES_LS, null)) { try { localStorage.removeItem(MODES_LS); } catch (e) {} chg = true; }
      if (!chg) return false;
      var box = root.querySelector(".gz-modes"); if (box) box.innerHTML = modesHtml();
      var sm = root.querySelector(".gz-prefs > summary"); if (sm) sm.innerHTML = prefsHead();
      return true;
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
    var NET_KIND = { 0: "tram", 3: "bus", 11: "trolley", 800: "trolley" };
    // Numer stanowiska (słupka) z kodu ZTM: 2469011-00105 → „05”, 2466011-07601t → „01t”. TEST: profil autora.
    function standOn() { return true; }   // dla wszystkich od v5.79
    // 24.11 (v6.85): wszystkie funkcje testowane dotąd na profilu autora — dla wszystkich (karty F, mapki dojść, oznaczenia
    // przybliżonych przejść, stacje wysiadania, stacje spoza GZM, czasy dojścia z Dom/Praca). Nowe testy: wrócić do warunku showVersionBadge.
    function authorOn() { return true; }
    function standOf(code) { var m = String(code || "").split("-")[1]; return m && m.length >= 5 ? m.slice(3) : ""; }
    function stTag(code) { if (!standOn()) return ""; var s = standOf(code); return s ? " · " + T("gzm.stand", { n: s }, "stan. {n}") : ""; }
    function stopDeps(net, name, fromMin, limit) {
      return stopDepsWin(net, name, fromMin - 1, fromMin + 120, true).slice(0, limit || 8);
    }
    // wszystkie odjazdy z przystanku w oknie [lo, hi] (godzina rzeczywista; planF — górna granica wg planu)
    function stopDepsWin(net, name, lo, hi, planHi) {
      if (!net._patTrips) { net._patTrips = {}; net.j.trips.forEach(function (t) { (net._patTrips[t[0]] = net._patTrips[t[0]] || []).push(t); }); }
      var idx = {}; (net.byName[name] || []).forEach(function (si) { idx[si] = 1; });
      var out = [];
      net.j.pats.forEach(function (pat, pi) {
        var seq = pat[1], off = pat[2], flags = String(pat[3] || "");
        for (var i = 0; i < seq.length - 1; i++) {
          if (!idx[seq[i]]) continue;
          if ((+flags.charAt(i) || 0) & 1) continue;   // tu nie wsiada się
          var ln = net.j.lines[pat[0]] || ["?", 3, ""];
          if (net._excl && net._excl[MODE_KIND[ln[1]] || "bus"]) continue;
          (net._patTrips[pi] || []).forEach(function (tr) {
            var plan = tr[1] + off[2 * i + 1], rtT = rt && rt.trips && rt.trips[tr[2]], dl = rtT && rtT[1] !== "X" ? Math.round((rtT[1] || 0) / 60) : 0;
            if (plan + dl < lo || (planHi ? plan : plan + dl) > hi) return;
            out.push({ trip: tr[2], line: ln[0], kind: NET_KIND[ln[1]] || "bus", head: ln[2], plan: plan, real: plan + dl, live: !!rtT, delay: dl, stop: net.name[seq[i]], code: net.j.stops[seq[i]][3] });
          });
        }
      });
      out.sort(function (a, b) { return a.real - b.real; });
      return out;
    }
    function stopDepsHtml(list, date) {
      if (!list.length) return '<div class="gz-sub" style="margin:6px 0">' + esc(T("gzm.farNoDeps", null, "Brak odjazdów w najbliższych 2 godzinach.")) + "</div>";
      var now = nowOn(date);
      if (standOn()) return list.map(function (x) {
        var tk = x.trip + "|" + date + "|" + x.stop, inMin = Math.round(x.real - now);
        var tTxt = (x.live && x.delay ? '<span class="plan-strike">' + C.fmt(x.plan) + "</span> " : "") + C.fmt(x.real);
        var inTxt = inMin > 180 || inMin < -1 ? "" : inMin <= 0 ? T("gzm.now", null, "teraz") : T("gzm.inMin", { n: inMin }, "za {n} min");
        return '<div class="card v2-dep s-ok" data-fx="' + esc(tk) + '" role="button" tabindex="0" title="' + esc(T("gzm.tTap", null, "Stuknij — cały bieg kursu")) + '">' +
          '<div class="c-head"><div><div class="c-route">' + (TYPE_ICON[x.kind] || "🚌") + " " + esc(x.line) + " → " + esc(x.head) + "</div>" +
          '<div class="c-date">' + esc(x.stop + stTag(x.code)) + v2Dl(x.live, x.delay) + "</div></div>" +
          '<span class="chip s-ok"><span class="ct">' + tTxt + "</span>" + esc(inTxt) + "</span></div></div>";
      }).join("");
      return list.map(function (x) {
        var tk = x.trip + "|" + date + "|" + x.stop, inMin = Math.round(x.real - now);
        return '<div class="gz-fardep" data-fx="' + esc(tk) + '" role="button" tabindex="0"><b>' + (x.live && x.delay ? '<span class="plan-strike">' + C.fmt(x.plan) + "</span> " : "") + C.fmt(x.real) + "</b> " +
          (TYPE_ICON[x.kind] || "🚌") + " <b>" + esc(x.line) + "</b> → " + esc(x.head) + ' <span class="gz-sub">' + esc(inMin <= 0 ? T("gzm.now", null, "teraz") : T("gzm.inMin", { n: inMin }, "za {n} min")) + (x.live ? " · " + esc(T("gzm.liveOn", null, "na żywo")) : "") + "</span></div>";
      }).join("");
    }
    // rozwijanie odjazdu z listy przystanku ([data-fx] = kurs|data|przystanek)
    root.addEventListener("click", function (ev) {
      var row = ev.target.closest("[data-fx]"); if (!row) return;
      var nx = row.nextElementSibling;
      if (nx && nx.classList.contains("gz-trip")) { nx.remove(); return; }
      var p = row.dataset.fx.split("|");
      if (netP[p[1]] && !netP[p[1]]._net) netP[p[1]].then(function (n) { netP[p[1]]._net = n; });
      row.insertAdjacentHTML("afterend", tripHtml(p[0], p[1], p.slice(2).join("|")));
    });
    // „Skąd” bez „Dokąd”: przystanek, miejsce (🏠/🏢/📍) albo adres → najbliższe odjazdy z przystanków
    function fromOnlyDeps(fromTxt, tmin, date) {
      var res = root.querySelector("#gzCRes");
      res.innerHTML = '<div class="gz-empty gz-searching">🔎 ' + esc(T("gzm.loading", null, "Wczytuję rozkład…")) + "</div>";
      Promise.all([getNet(date), getRt(), resolvePlace(fromTxt).catch(function (e) { if (/^gps/.test(String(e && e.message))) throw e; return null; })]).then(function (r) {
        var net = r[0], pl = r[2]; if (netP[date]) netP[date]._net = net;
        net._excl = exclOf(); net._hide = hideOf();
        var groups = [];
        if (pl) {
          placeReach(net, pl);
          var seenN = {};
          pl.stops.slice().sort(function (a, b) { return a.walk - b.walk; }).forEach(function (x) { var nm = net.name[x.s]; if (seenN[nm] || groups.length >= 3) return; seenN[nm] = 1; groups.push({ name: nm, walk: x.walk, mark: x.fixed ? T("gzm.jFixed", null, "Twój czas") : x.measured ? T("gzm.jMeasured", null, "zmierzone") : "" }); });
        } else netNames(net, fromTxt).slice(0, 3).forEach(function (nm) { groups.push({ name: nm, walk: 0 }); });
        if (!groups.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoTo", { d: fromTxt }, "Nie znam przystanku „{d}”.")) + "</div>"; return; }
        var anyDep = false;
        depBoxes = groups.map(function (g) {
          var t0 = tmin + (g.walk || 0), all = stopDepsWin(net, g.name, t0 - 360, t0 + 480);
          var a = 0; while (a < all.length && all[a].real < t0 - 1) a++;
          var b = a; while (b < all.length && b - a < 8 && all[b].plan <= t0 + 120) b++;
          if (b > a) anyDep = true;
          return { g: g, all: all, a: a, b: b, date: date };
        });
        res.innerHTML = depBoxes.map(function (bx, i) {
          var g = bx.g;
          return '<div class="gz-farbox" data-depbox="' + i + '" style="border-color:var(--line);background:var(--panel)"><b>🚏 ' + esc(g.name) + "</b>" + (g.walk ? ' <span class="gz-sub">· 🚶 ' + g.walk + " min" + (g.mark ? " · " + esc(g.mark) : "") + "</span>" : "") +
            '<div class="gz-fardeps" style="margin-left:0">' + depBoxInner(bx) + "</div></div>";
        }).join("") + (standOn() ? depsModesNote(anyDep) : "") + '<div class="gz-sub" style="margin:6px 2px">' + esc(T("gzm.fromOnlyHint", null, "Wpisz też „Dokąd”, żeby ułożyć całą podróż.")) + "</div>";
        scrollToFirst(res, ".gz-farbox");
      }).catch(function (e) { res.innerHTML = /^gps/.test(String(e && e.message)) ? gpsErrHtml(e.message) : '<div class="gz-warn">' + esc(T("gzm.noIndex", null, "Dane GZM są chwilowo niedostępne.")) + "</div>"; });
    }
    var depBoxes = [];
    function depBoxInner(bx) {
      var btn = function (dir, key, def) { return '<button type="button" class="gz-btn sec" data-depmore="' + dir + '" style="margin:6px 0;width:100%">' + esc(T(key, null, def)) + "</button>"; };
      return (bx.a > 0 ? btn("up", "gzm.depsEarlier", "⬆ Wcześniejsze odjazdy") : "") +
        stopDepsHtml(bx.all.slice(bx.a, bx.b), bx.date) +
        (bx.b < bx.all.length ? btn("down", "gzm.depsLater", "⬇ Późniejsze odjazdy") : "");
    }
    root.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-depmore]"); if (!b) return;
      var box = b.closest("[data-depbox]"), bx = box && depBoxes[+box.getAttribute("data-depbox")]; if (!bx) return;
      ev.preventDefault();
      if (b.getAttribute("data-depmore") === "up") bx.a = Math.max(0, bx.a - 8); else bx.b = Math.min(bx.all.length, bx.b + 8);
      var inner = box.querySelector(".gz-fardeps"); inner.innerHTML = depBoxInner(bx);
      if (window.I18n && I18n.apply) try { I18n.apply(inner); } catch (e) {}
    });
    // dla 🛡️ Pilnowanych i innych widoków: trasa kursu GZM (HTML w opakowaniu .gz)
    window.GzmTripHtml = function (tid, date, board, alight) {
      return Promise.all([getNet(date), getRt().catch(function () {})]).then(function (r) { netP[date]._net = r[0]; return '<div class="gz">' + tripHtml(tid, date, board, alight) + "</div>"; });
    };
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
    function walkMin(m) { return Math.max(1, Math.ceil(m * 1.15 / 1.2 / 60 * paceF())); }
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
          // GPS tuż przy przystanku (≤ 35 m) — to przystanek, nawet gdy pomiar opisano jako „peron”
          var stopEnd = bi >= 0 && (bd <= 35 || (bd <= lim && !(/peron/.test(r.kind || "") && !/stanowisk|przystan/i.test(r.name || ""))));
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
      var rS = pl.far ? 1500 : 900, rT = trainOnlyFar() ? TRAIN_ONLY_M : 2000;
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
      // TODO 73 (profil autora): przystanek ZA stacją, do której znamy czas (zmierzony / „Twój czas”) — dojście nie krótsze niż do stacji − 2 min
      // (linia prosta nie widzi torów: np. Piotra Skargi wychodziło 9 min, a na perony jest 15 min)
      if (authorOn()) {
        var known = {}; Object.keys(ms.sts).forEach(function (k) { known[k] = ms.sts[k]; });
        Object.keys(fw.st || {}).forEach(function (nm) { var x = stationByName(nm); if (x) known[x.id] = +fw.st[nm]; });
        Object.keys(known).forEach(function (id) {
          var x = (index.stations || []).find(function (y) { return String(y.id) === String(id); }); if (!x) return;
          var dS = havM(pl.lat, pl.lon, x.lat, x.lon);
          pl.stops.forEach(function (o) {
            if (o.fixed || o.measured) return;
            var la = net.lat[o.s], lo = net.lon[o.s];
            if (havM(pl.lat, pl.lon, la, lo) > dS && havM(x.lat, x.lon, la, lo) <= 500 && o.walk < known[id] - 2) { o.walk = known[id] - 2; o.lb = true; }
          });
        });
      }
      return pl;
    }
    function searchC() {
      var f0 = root.querySelector("#gzCFrom").value.trim(), t0 = root.querySelector("#gzCTo").value.trim();
      if (((f0 && !stationByName(f0) && !placeKey(f0)) || (t0 && !stationByName(t0) && !placeKey(t0)))) { ensureExt([f0, t0]).then(searchCGo); return; }
      searchCGo();
    }
    function searchCGo() {
      var fromTxt = root.querySelector("#gzCFrom").value.trim(), toTxt = root.querySelector("#gzCTo").value.trim();
      if (fromTxt && toTxt && fromTxt.toLowerCase() === toTxt.toLowerCase() && placeKey(fromTxt) !== "gps") {
        root.querySelector("#gzCRes").innerHTML = '<div class="gz-warn">' + esc(T("near.samePlace", null, "Skąd i Dokąd to to samo miejsce — wybierz inny cel.")) + "</div>"; return;
      }
      var tmin = C.hm(root.querySelector("#gzCTime").value) || Math.floor(warsawNow().min);
      st.cFrom = fromTxt; st.cTo = toTxt; save(LS, st);
      if (uniOn()) {
        clearAll();
        if (fromTxt) announce(fromTxt, toTxt);
        var fsU = stationByName(fromTxt);
        if (fsU && !toTxt) { var dU = root.querySelector("#gzCDate"); cfg.date = dU && dU.value && dU.value !== warsawNow().date ? dU.value : null; goA(fsU, tmin); return; }
        setMode("C");
        if (fromTxt && !toTxt) { fromOnlyDeps(fromTxt, tmin, (root.querySelector("#gzCDate") || {}).value || warsawNow().date); return; }
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
      Promise.all([resolvePlace(fromTxt), resolvePlace(toTxt)]).then(function (pp) { fromPlace = pp[0]; toPlace = pp[1]; return Promise.all([getNet(date), getRt(), authorOn() ? getEgress().catch(function () { return null; }) : null]); }, function (e) {
        var m = String(e && e.message || "");
        if (m.indexOf("addr:") === 0) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.uNoAddr", { a: m.slice(5) }, "Nie znalazłem adresu „{a}” (szukam na Śląsku). Dopisz miasto, np. „Opolska 5, Tarnowskie Góry”.")) + "</div>"; throw "handled"; }
        res.innerHTML = m.indexOf("unset:") === 0 ? '<div class="gz-warn">' + esc(T("gzm.pUnset", { p: PL_TOK[m.slice(6)] }, "Najpierw ustaw miejsce {p} — poniżej, w „Moje miejsca”.")) + "</div>" : gpsErrHtml(m);
        throw "handled";
      }).then(function (r) {
        var net = r[0], code = GzmRaptor.byCode(net);
        net._excl = exclOf(); net._hide = hideOf(); net._pace = paceF();
        if (fromPlace) placeReach(net, fromPlace);
        if (toPlace) placeReach(net, toPlace);
        var fromSt = fromPlace ? null : stationByName(fromTxt), toSt = toPlace ? null : stationByName(toTxt);
        var fN = fromSt || fromPlace ? (fromPlace ? [] : null) : netNames(net, fromTxt), tN = toSt || toPlace ? (toPlace ? [] : null) : netNames(net, toTxt);
        if (fromPlace && !fromPlace.stops.length && !Object.keys(fromPlace.walkSt).length) { farPlace(res, net, fromPlace, "#gzCFrom"); return; }
        if (toPlace && !toPlace.stops.length && !Object.keys(toPlace.walkSt).length) { farPlace(res, net, toPlace, "#gzCTo"); return; }
        if (!fromSt && !fromPlace && !fN.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoTo", { d: fromTxt }, "Nie znam przystanku „{d}”.")) + "</div>"; return; }
        if (!toSt && !toPlace && !tN.length) { res.innerHTML = '<div class="gz-warn">' + esc(T("gzm.cNoTo", { d: toTxt }, "Nie znam przystanku „{d}”.")) + "</div>"; return; }
        var withStops = (index.stations || []).filter(function (x) { return x.s && x.s.length; });
        // stacje przy starcie: gdzie najwcześniej będę na peronie (cała sieć, do 1 przesiadki)
        var accSt;
        if (fromSt) accSt = [fromSt];
        else {
          var star = GzmRaptor.reachAll(net, fromPlace ? { fromStops: fromPlace.stops.map(function (x) { return { s: x.s, t: tmin + x.walk }; }), dep: tmin, rt: rt, maxTransfers: 1 } : { from: fN, dep: tmin, rt: rt, maxTransfers: 1 }) || [];
          accSt = (index.stations || []).filter(function (x) { return (x.s && x.s.length) || (fromPlace && fromPlace.walkSt[x.id] != null); }).map(function (x) {
            var best = 1e9; (x.s || []).forEach(function (p) { var i = code[p[0]], pw = poleWalk(p).min; if (i != null && star[i] + pw < best) best = star[i] + pw; });
            if (fromPlace && fromPlace.walkSt[x.id] != null) best = Math.min(best, tmin + fromPlace.walkSt[x.id]);
            return { st: x, plat: best };
          }).filter(function (x) { return x.plat < 1e8 && (!toSt || x.st.id !== toSt.id); }).sort(function (a, b) { return a.plat - b.plat; }).slice(0, 3).map(function (x) { return x.st; });
        }
        // stacje przy celu: najbliższe celowi (w linii prostej) stacje z przystankami GZM
        var egrSt;
        if (toSt) egrSt = [toSt];
        else {
          var d0 = toPlace ? -1 : net.byName[tN[0]][0], la = toPlace ? toPlace.lat : net.lat[d0], lo = toPlace ? toPlace.lon : net.lon[d0];
          egrSt = (index.stations || []).filter(function (x) { return (x.s && x.s.length) || (toPlace && toPlace.walkSt[x.id] != null); }).map(function (x) { return { st: x, d: Math.pow(x.lat - la, 2) + Math.pow((x.lon - lo) * 0.64, 2) }; })
            .filter(function (x) { return !fromSt || x.st.id !== fromSt.id; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 2).map(function (x) { return x.st; });
          // notatka 21.11 (profil autora): także stacje, z których komunikacją najkrócej do celu (egress.json) — np. Bytom
          // (623 spod Dworca, 3 min z peronu) zamiast tylko najbliższych w linii prostej (Bytom Karb, 12 min pieszo z przesiadką)
          if (authorOn() && egressIx) {
            var names = toPlace ? toPlace.stops.slice(0, 12).map(function (q) { return net.name[q.s]; }) : tN, best2 = {};
            names.forEach(function (nm) { (egressIx[nm] || []).forEach(function (e) { var w = toPlace ? ((toPlace.stops.find(function (q) { return net.name[q.s] === nm; }) || {}).walk || 0) : 0; if (best2[e[0]] == null || e[1] + w < best2[e[0]]) best2[e[0]] = e[1] + w; }); });
            Object.keys(best2).sort(function (a, b) { return best2[a] - best2[b]; }).forEach(function (id) {
              if (egrSt.length >= 3) return;
              var x = (index.stations || []).find(function (y) { return String(y.id) === String(id); });
              if (x && x.s && x.s.length && !egrSt.some(function (y) { return y.id === x.id; }) && (!fromSt || x.id !== fromSt.id)) egrSt.push(x);
            });
          }
        }
        var combos = [];
        accSt.forEach(function (a) { egrSt.forEach(function (e) { if (a.id !== e.id) combos.push({ a: { st: a }, e: { st: e } }); }); });
        // każda stacja wysiadki choć raz (z najlepszą stacją wsiadania), potem reszta — przy limicie zapytań do PLK
        if (authorOn() && egrSt.length > 2) { var first = egrSt.map(function (e) { return combos.find(function (c) { return c.e.st.id === e.id; }); }).filter(Boolean); combos = first.concat(combos.filter(function (c) { return first.indexOf(c) < 0; })); }
        combos = combos.slice(0, authorOn() && egrSt.length > 2 ? 5 : 4);
        if (!modes().train) combos = [];   // pociąg odznaczony — bez zapytań do PLK
        var date2 = date;
        return Promise.all(combos.map(function (cb) {
          var q = new URLSearchParams({ from: cb.a.st.n, to: cb.e.st.n, date: date2, time: C.fmt(tmin), transferMinutes: "3" });
          return plannerFetch(q).then(function (pl) {
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
    function poleWalk(p) { return window.GzmWalkAdj(p[3], p[4] == null || p[4] === -2 ? undefined : p[4], p[5]); }
    function polesOf(stn) { var out = []; (stn.s || []).forEach(function (p) { var i = cState.code[p[0]]; if (i == null) return; var a = poleWalk(p); out.push({ s: i, walk: a.min, warn: a.warn, chk: p[6] === 1 }); });
      if (walkPrefs().noStairs && out.some(function (x) { return x.warn !== "stairs"; })) out = out.filter(function (x) { return x.warn !== "stairs"; });
      return out; }
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
        if (w0) { jn.legs.unshift({ type: "walk", min: w0.walk, measured: !!w0.measured, fixed: !!w0.fixed, far: !!w0.far, dist: w0.d, fromName: fromPl.label, toName: S_name(jn.legs[0].type === "walk" ? jn.legs[0].from : r0.from), pa: placePt(fromPl), pb: stopPt(jn.legs[0].type === "walk" ? jn.legs[0].from : r0.from) }); jn.leave = (jn.legs[1].type === "walk" ? r0.dep - jn.legs[1].min : r0.dep) - w0.walk; }
      }
      if (toPl) {
        var last = jn.legs[jn.legs.length - 1], w1 = toPl.stops.find(function (x) { return x.s === last.to; });
        if (w1) { jn.legs.push({ type: "walk", min: w1.walk, measured: !!w1.measured, fixed: !!w1.fixed, far: !!w1.far, dist: w1.d, fromName: S_name(last.to), toName: toPl.label, pa: stopPt(last.to), pb: placePt(toPl) }); jn.arr += w1.walk; }
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
        });
        // TODO 60 (dla wszystkich od v6.32): stacje przed wsiadaniem i po wysiadce schowane — rozwinięcie jednym stuknięciem
        var ib = -1, ia = -1;
        route.forEach(function (r, j) { var nm = normName(r.stationName); if (ib < 0 && nm === nb) ib = j; else if (ib >= 0 && ia < 0 && nm === na) ia = j; });
        if (ib >= 0 && ia > ib && (ib > 0 || ia < route.length - 1)) {
          var fold = function (part, side, n) {
            if (!part.length) return "";
            var mk = "rt|" + side + "|" + k;
            return '<details class="gz-rt-more" data-mk="' + esc(mk) + '"' + (moreOpen[mk] ? " open" : "") + '><summary>' +
              esc(side === "b" ? T("gzm.tBefore", { n: n }, "▸ wcześniejsze stacje pociągu ({n})") : T("gzm.tAfter", { n: n }, "▸ dalsze stacje pociągu ({n})")) + "</summary>" + part.join("") + "</details>";
          };
          return head + pos + fold(rows.slice(0, ib), "b", ib) + rows.slice(ib, ia + 1).join("") + fold(rows.slice(ia + 1), "a", route.length - 1 - ia);
        }
        return head + pos + rows.join("");
      }).join("");
      return '<div class="gz-trip">' + html + "</div>";
    }
    // ===== Wygląd v2: karty jak w „Pilnowanych” (dla wszystkich od 2.11.2026; stary wygląd usunięty — TODO 10) =====
    var V2ST = { ok: "s-ok", tight: "s-risk", missed: "s-broken", cancelled: "s-cancelled" };
    function v2StTxt(st) { return st === "ok" ? "🟢 " + T("gzm.st.ok", null, "zdążysz") : st === "tight" ? "🟡 " + T("gzm.st.tight", null, "na styk") : st === "cancelled" ? "⚫ " + T("gzm.st.cancelled", null, "odwołany") : "🔴 " + T("gzm.st.missed", null, "nie zdążysz"); }
    function v2Dl(live, delay) {
      if (!live) return ' <span class="src">' + esc(T("gzm.sched", null, "wg rozkładu")) + "</span>";
      return ' <span class="dl ' + (delay > 5 ? "vlate" : delay > 0 ? "late" : "ontime") + '">' + esc(delay ? (delay > 0 ? "+" : "") + delay + " min" : T("gzm.v2OnTime", null, "punktualnie")) + "</span>";
    }
    function v2Walk(l) {
      var marks = (l.far ? " " + farBadge() + esc(T("gzm.farDist", { d: kmTxt(l.dist || 0) }, "{d} — dalej niż zwykle")) : "") + (l.fixed ? " · " + esc(T("gzm.jFixed", null, "Twój czas")) : l.measured ? " · " + esc(T("gzm.jMeasured", null, "zmierzone")) : "");
      var path = l.fromName && l.toName ? esc(l.fromName) + " → " + esc(l.toName) : l.toName ? "→ " + esc(l.toName) : "";
      // mapka i oznaczenie: dla ostatniego odcinka między przystankami (po scaleniu — z części)
      var segs = (l.parts || [l]).filter(function (q) { return typeof q.from === "number" && typeof q.to === "number" && q.from !== q.to; }), sg = segs[segs.length - 1];
      var mb = sg ? mapBtn("data-swmap", sg.from + "|" + sg.to) : ptMapBtn(l.pa, l.pb);
      var fk = cState && cState.net && cState.net.fk, kinds = segs.map(function (q) { return fk ? fk[q.from + "|" + q.to] : "o"; });
      if (authorOn() && segs.length && !l.measured && !l.fixed) {
        if (kinds.some(function (k) { return !k; })) marks += ' · <span title="' + esc(T("gzm.wEstT", null, "Mapa nie zna tu drogi — czas z odległości w linii prostej")) + '">≈ ' + esc(T("gzm.wEst", null, "szacunek")) + "</span>";
        else if (kinds.some(function (k) { return k === "r"; })) marks += ' · <span title="' + esc(T("gzm.wApxT", null, "Droga wzdłuż jezdni — mapa nie ma tu chodników ani przejść")) + '">≈ ' + esc(T("gzm.wApx", null, "przybliżone")) + "</span>";
      }
      return '<div class="leg v2-walk"><div class="leg-t">🚶 ' + l.min + ' min</div><div class="leg-st">' + esc(T("gzm.v2Walk", null, "pieszo")) + (path ? " · " + path : "") + marks + mb + "</div></div>";
    }
    function platWalk(min, from, to, mapVal, chk, extraBtn, via) {
      var mk = chk && authorOn() ? ' · <span title="' + esc(T("gzm.wChkT", null, "Na mapie brak schodów i przejścia podziemnego — czas może być zaniżony; pomiar stoperem pomoże")) + '">⚠️ ' + esc(T("gzm.wChk", null, "sprawdź")) + "</span>" : "";
      return '<div class="leg v2-walk"><div class="leg-t">🚶 ' + min + ' min</div><div class="leg-st">' + esc(T("gzm.v2Walk", null, "pieszo")) + " · " + esc(from) + " → " + esc(to) + (via ? ' <span style="color:var(--muted)">(' + esc(T("gzm.v2Via", { s: via }, "przez {s}")) + ")</span>" : "") + mk + mapBtn("data-pwmap", mapVal) + (extraBtn || "") + "</div></div>";
    }
    function v2Ride(l) {
      var dep = l.live && l.delay ? '<span class="plan-strike">' + C.fmt(l.depPlan) + "</span> " + C.fmt(l.dep) : C.fmt(l.dep);
      return '<div class="leg"><div class="leg-t">' + dep + "<small>" + C.fmt(l.arr) + "</small></div><div>" +
        '<div class="leg-train">' + (TYPE_ICON[l.kind] || "🚌") + " " + esc(l.line) + (l.head ? " → " + esc(l.head) : "") + "</div>" +
        '<div class="leg-st">' + esc(l.fromName + stTag(l.fromCode)) + " → " + esc(l.toName + stTag(l.toCode)) + v2Dl(l.live, l.delay) + "</div></div></div>";
    }
    function v2Train(l, arrReal) {
      var lab = ((l.train && l.train.category) || "") + " " + ((l.train && l.train.number) || "") + (l.train && l.train.name ? " " + l.train.name : "");
      var arr = arrReal != null && C.fmt(arrReal) !== l.alight.time ? '<span class="plan-strike">' + esc(l.alight.time) + "</span> " + C.fmt(arrReal) : esc(l.alight.time);
      return '<div class="leg"><div class="leg-t">' + esc(l.board.time) + "<small>" + arr + "</small></div><div>" +
        '<div class="leg-train">🚆 ' + esc(lab.trim()) + "</div>" + '<div class="leg-st">' + esc(l.board.stationName) + " → " + esc(l.alight.stationName) + "</div></div></div>";
    }
    function v2Xfer(st, txt) { return '<div class="xfer ' + (V2ST[st] || "s-ok") + '">' + (st === "tight" ? "🟡 " : st === "missed" ? "🔴 " : "🟢 ") + txt + "</div>"; }
    // odcinki podróży GZM (z przesiadkami między kursami)
    // TODO 66 (21.11): kolejne odcinki pieszo — jeden krok („pieszo 9 min · A → C”), mapka dla ostatniego odcinka między przystankami
    function mergeWalks(legs) {
      var out = [];
      legs.forEach(function (l) {
        var p = out[out.length - 1];
        if (l.type === "walk" && p && p.type === "walk") { out[out.length - 1] = Object.assign({}, p, { min: p.min + l.min, toName: l.toName, to: l.to, parts: (p.parts || [p]).concat([l]), measured: p.measured && l.measured, fixed: p.fixed && l.fixed }); }
        else out.push(l);
      });
      return out;
    }
    function v2Journey(jn) {
      var out = [], prevRide = null, walkBetween = 0;
      mergeWalks(jn.legs).forEach(function (l) {
        if (l.type === "walk") { if (prevRide) walkBetween += l.min; out.push(v2Walk(l)); return; }
        if (prevRide) {
          var slack = l.dep - prevRide.arr - walkBetween, st = slack >= 3 ? "ok" : slack >= 0 ? "tight" : "missed";
          // 0–1 min (dozwolone tylko na tym samym stanowisku / zintegrowanym przystanku) — graniczny czas: miga na czerwono
          var xh = v2Xfer(slack >= 0 && slack <= 1 ? "missed" : st, esc(T("gzm.v2XferBus", { s: l.fromName, n: slack }, "Przesiadka: {s}, zapas {n} min")));
          out.push(slack >= 0 && slack <= 1 ? xh.replace('class="xfer ', 'class="xfer edge ') : xh);
        }
        out.push(v2Ride(l)); prevRide = l; walkBetween = 0;
      });
      return out.join("");
    }
    function v2Btn(html) { return html.replace(/class="gz-btn sec"/g, 'class="btn-sm secondary"'); }
    function v2Foot(i, tKey, open, meta) {
      return '<div class="c-foot"><span class="c-meta">' + (meta || "") + '</span><span class="c-actions">' +
        (i != null ? '<button type="button" class="btn-sm secondary" data-guard="' + i + '">🛡️ ' + esc(T("gzm.v2Guard", null, "Pilnuj")) + "</button>" : "") +
        (i != null ? v2Btn(remBtnHtml(v2Cur[i], i)) : "") +
        '<button type="button" class="btn-sm secondary" data-tx="' + esc(tKey) + '">' + esc(open ? T("gzm.v2Hide", null, "▲ Zwiń trasę") : T("gzm.v2Route", null, "▼ Trasa")) + "</button></span></div>";
    }
    var v2Cur = [];
    // rozwinięte sekcje „Inne dojazdy…” — przetrwają odświeżanie wyników (co kilka sekund)
    var moreOpen = {};
    root.addEventListener("toggle", function (e) { var d = e.target; if (d && d.dataset && d.dataset.mk) { if (d.open) moreOpen[d.dataset.mk] = 1; else delete moreOpen[d.dataset.mk]; } }, true);
    function v2Head(route, sub, st, chip) {
      return '<div class="c-head"><div><div class="c-route">' + route + '</div><div class="c-sub">' + sub + "</div></div>" +
        '<span class="chip ' + (V2ST[st] || "s-ok") + '">' + chip + "</span></div>";
    }
    function v2Total(min) { if (!(min > 0)) return ""; var h = Math.floor(min / 60), m = min % 60; return (h ? h + " h " : "") + m + " min"; }
    function v2NetCard(jn, i, xx) {
      var f0 = jn.legs.find(function (l) { return l.type === "ride"; }), lv = jn.leave != null ? jn.leave : jn.legs[0].type === "walk" ? f0.dep - jn.legs[0].min : jn.dep;
      var k = jKey(jn), open = !!tripOpen[k];
      var route = esc(jn.legs[0].fromName) + " → " + esc(jn.legs[jn.legs.length - 1].toName);
      var sub = esc(T("gzm.v2Sub", { a: C.fmt(lv), b: C.fmt(jn.arr), t: v2Total(jn.arr - lv) }, "wyjdź {a} · na miejscu {b} · w drodze {t}"));
      var chip = '<span class="ct">' + C.fmt(jn.arr) + "</span>" + esc(jn.transfers ? T("gzm.v2Changes", { n: jn.transfers }, "przesiadki: {n}") : T("gzm.v2Direct", null, "bez przesiadek"));
      var xw = v2Cur[i] && v2Cur[i].why; if (xw) sub += '<br><b>' + esc(xw) + "</b>";
      var ceX = ceOn() && xx ? xx : null, ceStn = ceX ? ceWorst(ceSteps(ceX, cState)) : null;
      return '<div class="card ' + (ceStn ? CE_ST[ceStn] : "s-ok") + ' v2-tap" data-cx="' + esc(k) + '">' + (ceX ? ceFull(ceX, cState) : v2Head(route, sub, "ok", chip) + v2Journey(jn)) + v2Foot(i, k, open, esc(rtOk && cState.date === warsawNow().date ? "● " + T("gzm.liveOn", null, "na żywo") : T("gzm.sched", null, "wg rozkładu"))) + (open && !fInline() ? tripsOfJourney(jn) : "") + "</div>";
    }
    // TODO 68: „albo” — inny dojazd na ten sam pociąg z innej stacji (np. 🚌 900 do Załęża zamiast pieszo na Katowice)
    function altHtml(y) {
      var c = y.c || {}, L = c.latest, lv = y.start, parts = [];
      if (c.walkA) parts.push("🚶 " + c.walkA.min + " min → " + esc(y.p.cb.a.st.n));
      else if (L) L.jn.legs.forEach(function (l) { parts.push(l.type === "walk" ? "🚶 " + l.min + " min" : (TYPE_ICON[l.type] || "🚌") + " <b>" + esc(l.line) + "</b> " + C.fmt(l.dep) + " " + esc(l.fromName) + " → " + esc(l.toName)); });
      var st0 = (y.it.legs && y.it.legs[0] && y.it.legs[0].board.stationName) || y.p.cb.a.st.n;
      return '<div class="c-date" style="margin:8px 0 2px;white-space:normal">🔀 ' + esc(T("gzm.v2Alt", { a: C.fmt(lv), s: st0, t: y.it.departureTime }, "Albo: wyjdź {a} i wsiądź do pociągu w {s} o {t}")) + (L && L.status === "tight" ? " 🟡" : "") + "<br>" + parts.join(" · ") + "</div>";
    }
    // ===== TODO 76: zwarta karta połączenia =====
    var detOpen = {};
    function detKey(x) { return x.net ? jKey(x.net) : "t|" + cKey(x.p, x.it); }
    root.addEventListener("click", function (e) {
      // notatka 20.11: rozwiniętą kartę zwija też stuknięcie w jej nagłówek (godziny, trasa) — nie tylko mały przycisk
      var tb = e.target.closest("[data-trasa]");   // „▼ Trasa” na zwiniętej karcie: rozwiń i pokaż przystanki
      if (tb) { var tk = tb.getAttribute("data-trasa"); e.stopPropagation(); detOpen[tk] = true; tripOpen[tk] = true; rerender(); toFirstRide(tk); return; }
      var d = e.target.closest("[data-det]"), k;
      if (d) k = d.getAttribute("data-det");
      else { var h = e.target.closest(".v2c-open .c-head"); if (!h || e.target.closest("button,a")) return; k = h.closest(".v2c-open").getAttribute("data-detk"); }
      e.stopPropagation();
      if (detOpen[k]) delete detOpen[k]; else detOpen[k] = true;
      rerender();
      if (detOpen[k]) toFirstRide(k);
    }, true);
    // prośba 25.11: po rozwinięciu karty ekran staje na jej nagłówku (godziny, „zdążysz”), pod nim pierwszy pojazd
    function toFirstRide(k) {
      setTimeout(function () {
        var box = [].slice.call(root.querySelectorAll(".v2c-open")).filter(function (b) { return b.getAttribute("data-detk") === k; })[0];
        var el = box && (box.querySelector(".c-head") || box);   // notatka 25.11: od nagłówka karty — godziny podróży i „zdążysz / na styk”
        if (el && window.StopsView) StopsView.scrollTo(el);
      }, 60);
    }
    function chipOf(l) {
      if (l.type === "walk") return '<span class="v2c-w">🚶' + l.min + "</span>";
      return '<span class="v2c-l">' + (TYPE_ICON[l.kind] || "🚌") + esc(l.line) + "</span>";
    }
    function trainChip(l) {
      var t = l.train || {}, nm = t.name && /^S\d/.test(t.name) ? t.name : ((t.category || "") + " " + (t.number || "")).trim();
      return '<span class="v2c-l v2c-t">🚆' + esc(nm) + "</span>";
    }
    function v2Compact(x, S, dk) {
      var chips = [], leave, arr = x.final, st = "ok", rides = 0, why = x.why || "";
      if (x.net) {
        var jn = x.net, f0 = jn.legs.find(function (l) { return l.type === "ride"; });
        leave = jn.leave != null ? jn.leave : jn.legs[0].type === "walk" ? f0.dep - jn.legs[0].min : jn.dep;
        jn.legs.forEach(function (l) { chips.push(chipOf(l)); if (l.type === "ride") rides++; });
      } else {
        var c = x.c || {}, L = c.latest, it = x.it, L0 = it.legs || [];
        leave = c.walkA ? c.walkA.leave : L ? (L.jn.leave != null ? L.jn.leave : L.jn.legs[0].type === "walk" ? L.jn.dep - L.jn.legs[0].min : L.jn.dep) : x.dep;
        st = L && L.status === "tight" ? "tight" : "ok";
        if (c.walkA) chips.push('<span class="v2c-w">🚶' + c.walkA.min + "</span>");
        if (L) L.jn.legs.forEach(function (l) { chips.push(chipOf(l)); if (l.type === "ride") rides++; });
        L0.forEach(function (l) { chips.push(trainChip(l)); rides++; });
        var e0 = c.egr && c.egr[0];
        if (c.walkE) chips.push('<span class="v2c-w">🚶' + c.walkE.min + "</span>");
        else if (e0) e0.legs.forEach(function (l) { chips.push(chipOf(l)); if (l.type === "ride") rides++; });
      }
      var tr = Math.max(0, rides - 1);
      var trTxt = tr ? T(tr === 1 ? "gzm.v2cX1" : "gzm.v2cXn", { n: tr }, tr === 1 ? "1 przesiadka" : "{n} przesiadki") : T("gzm.v2Direct", null, "bez przesiadek");
      var dot = st === "tight" ? "🟡" : "🟢";
      return '<div class="card v2c ' + (V2ST[st] || "s-ok") + '" data-det="' + esc(dk) + '" role="button" tabindex="0">' +
        '<div class="v2c-r1"><b>' + C.fmt(leave) + " → " + C.fmt(arr) + '</b><span class="v2c-dur">' + esc(v2Total(arr - leave)) + " " + dot + "</span></div>" +
        '<div class="v2c-r2">' + chips.join('<span class="v2c-sep">›</span>') + "</div>" +
        '<div class="v2c-r3">' + esc(trTxt) + (why ? " · " + esc(why) : "") + (x.tDelay ? " · " + esc(T("gzm.v2TrainLive", { n: x.tDelay }, "pociąg +{n} min (na żywo)")) : "") + "</div></div>";
    }
    function v2TrainCard(x, i, S) {
      var it = x.it, c = x.c, key = cKey(x.p, it), L = c.latest, tKey = "t|" + key, open = !!tripOpen[tKey];
      var leave = c.walkA ? c.walkA.leave : L ? (L.jn.leave != null ? L.jn.leave : L.jn.legs[0].type === "walk" ? L.jn.dep - L.jn.legs[0].min : L.jn.dep) : x.dep;
      var L0 = it.legs || [], st = L && L.status === "tight" ? "tight" : "ok";
      var fromName = c.walkA ? c.walkA.name : L ? L.jn.legs[0].fromName : (L0[0] && L0[0].board.stationName) || x.p.cb.a.st.n;
      var e0 = c.egr && c.egr[0], toName = c.walkE ? c.walkE.name : e0 ? e0.legs[e0.legs.length - 1].toName : (L0.length ? L0[L0.length - 1].alight.stationName : x.p.cb.e.st.n);
      var html = [];
      if (c.walkA) html.push(v2Walk({ min: c.walkA.min, fromName: c.walkA.name, toName: x.p.cb.a.st.n, pa: placePt(S.fromPlace), pb: stationPt(x.p.cb.a.st) }));
      if (L) {
        html.push(v2Journey(L.jn));
        // notatka 21.11: przejście przystanek → peron jako osobny krok (wcześniej niewidoczne), z mapką drogi
        var lastL = L.jn.legs[L.jn.legs.length - 1], poleA = lastL && lastL.to, pA = poleA != null ? (polesOf(x.p.cb.a.st).find(function (q) { return q.s === poleA; }) || {}) : {}, pwA = pA.walk;
        if (pwA != null) html.push(platWalk(pwA, S.net.name[poleA], T("gzm.v2Plat", { s: x.p.cb.a.st.n }, "peron · {s}"), x.p.cb.a.st.id + "|" + x.p.cb.a.st.n + "|" + poleA + "|1", pA.chk));
        html.push(v2Xfer(L.status, esc(T("gzm.v2XferPlat", { s: x.p.cb.a.st.n, t: C.fmt(L.plat), n: L.slack }, "Na peronie ({s}) {t} · zapas {n} min do pociągu"))));
      }
      L0.forEach(function (l, j) {
        if (j > 0) { var p = L0[j - 1], ch = C.hm(l.board.time) - C.hm(p.alight.time); if (ch < 0) ch += 1440; html.push(v2Xfer(ch >= 3 ? "ok" : "tight", esc(T("gzm.tChange", { s: l.board.stationName, n: ch }, "przesiadka: {s}, {n} min")))); }
        html.push(v2Train(l, j === L0.length - 1 && x.tDelay ? x.arr : null));
      });
      if (c.walkE) html.push(v2Walk({ min: c.walkE.min, fromName: L0.length ? L0[L0.length - 1].alight.stationName : "", toName: c.walkE.name, pa: stationPt(x.p.cb.e.st), pb: placePt(S.toPlace) }));
      else if (e0) {
        var r0 = e0.legs.find(function (l) { return l.type === "ride"; }), wk = 0;
        e0.legs.some(function (l) { if (l.type === "walk") { wk += l.min; return false; } return true; });
        // notatka 21.11: przejście peron → pierwszy przystanek jako osobny krok, z mapką; zapas liczony także z tym przejściem
        var poleE = e0.legs[0] && e0.legs[0].type === "walk" ? e0.legs[0].from : r0 ? r0.from : null;
        var pE = poleE != null ? (polesOf(x.p.cb.e.st).find(function (q) { return q.s === poleE; }) || {}) : {}, pwE = pE.walk;
        // TODO 66: peron → przystanek przy stacji → dalsze przejście pieszo = jeden krok (np. „15 min · peron Bytom Karb → Bytom Łużycka”)
        var lead = []; for (var li = 0; li < e0.legs.length && e0.legs[li].type === "walk"; li++) lead.push(e0.legs[li]);
        var e0v = lead.length ? Object.assign({}, e0, { legs: e0.legs.slice(lead.length) }) : e0;
        if (pwE != null) {
          var lastW = lead[lead.length - 1], toNm = lastW ? lastW.toName : S.net.name[poleE];
          var chain = lead.filter(function (q) { return typeof q.from === "number" && typeof q.to === "number" && q.from !== q.to; }).map(function (q) { return q.from + ">" + q.to; }).join(",");
          html.push(platWalk(pwE + wk, T("gzm.v2Plat", { s: x.p.cb.e.st.n }, "peron · {s}"), toNm, x.p.cb.e.st.id + "|" + x.p.cb.e.st.n + "|" + poleE + "|0" + (chain ? "|" + chain : ""), pE.chk, "", lead.length ? S.net.name[poleE] : null));
        }
        var sl = r0 ? r0.dep - x.arr - wk - (pwE || 0) : 0;
        html.push(v2Xfer(sl >= 3 ? "ok" : sl >= 0 ? "tight" : "missed", esc(T("gzm.v2XferEgr", { s: r0 ? r0.fromName : "", n: sl }, "Po pociągu: {s}, zapas {n} min"))));
        html.push(v2Journey(pwE != null ? e0v : e0));
      }
      // inne możliwości — schowane
      var more = "";
      if (c.acc) {
        var okA = c.acc.filter(function (y) { return y.status !== "missed"; });
        if (okA.length > 1) more += '<details class="v2-more" data-mk="a|' + esc(key) + '"' + (moreOpen["a|" + key] ? " open" : "") + "><summary>" + esc(T("gzm.v2MoreAcc", { n: okA.length - 1 }, "Inne dojazdy na pociąg ({n})")) + "</summary>" +
          okA.filter(function (y) { return y !== L; }).slice(-5).map(function (y) { return jRow(y.jn, "🚉 " + esc(T("gzm.cOnPlatform", { t: C.fmt(y.plat), n: y.slack }, "na peronie {t} · zapas {n} min")), y.status); }).join("") + "</details>";
      }
      if (c.egr && c.egr.length > 1) more += '<details class="v2-more" data-mk="e|' + esc(key) + '"' + (moreOpen["e|" + key] ? " open" : "") + "><summary>" + esc(T("gzm.v2MoreEgr", { n: c.egr.length - 1 }, "Inne możliwości po pociągu ({n})")) + "</summary>" +
        c.egr.slice(1).map(function (y) { return jRow(y, "🏁 " + C.fmt(y.arr) + " " + esc(y.legs[y.legs.length - 1].toName), "ok"); }).join("") +
        (c.egr.length >= 5 + 5 * ((S.more && S.more[key]) || 0) ? '<button type="button" class="btn-sm secondary" data-cmore="' + esc(key) + '">' + esc(T("gzm.more", null, "Pokaż kolejne 5")) + "</button>" : "") + "</details>";
      if (x.alt) more = altHtml(x.alt) + more;
      var route = esc(fromName) + " → " + esc(toName);
      var sub = esc(T("gzm.v2Sub", { a: C.fmt(leave), b: C.fmt(x.final), t: v2Total(x.final - leave) }, "wyjdź {a} · na miejscu {b} · w drodze {t}"));
      var chip = '<span class="ct">' + C.fmt(x.final) + "</span>" + esc(v2StTxt(st));
      if (x.why) sub += '<br><b>' + esc(x.why) + "</b>";
      var meta = x.tDelay ? esc(T("gzm.v2TrainLive", { n: x.tDelay }, "pociąg +{n} min (na żywo)")) : esc(T("gzm.v2TrainPlan", null, "pociąg wg rozkładu PLK"));
      var ceStp = ceOn() ? ceWorst(ceSteps(x, S)) : null;
      return '<div class="card ' + (ceStp ? CE_ST[ceStp] : V2ST[st]) + ' v2-tap" data-cx="' + esc(tKey) + '">' + (ceStp ? ceFull(x, S) : v2Head(route, sub, st, chip) + html.join("")) + more + v2Foot(i, tKey, open, meta) + (open && !fInline() ? (L ? tripsOfJourney(L.jn) : "") + trainRunsHtml(it, S.date) + (e0 && !c.walkE ? tripsOfJourney(e0) : "") : "")   /* wszystkie kursy: dojazd, pociąg(i), dalej */ + "</div>";
    }
    // ===== TODO 85 (21.11, profil autora): karty w wersji F „rozkład godzinowy” (klocki z v6.62 usunięte — TODO 10) =====
    function ceOn() { return authorOn(); }
    function ceXst(sl) { var u = window.GuardCore && GuardCore.unifyOn && GuardCore.unifyOn(); return sl < 0 ? "missed" : sl <= 1 ? "edge" : sl < (u ? 5 : 3) ? "tight" : "ok"; }   // 26.11 15:00: wspólna zasada (2–4 min = na styk)
    function ceWalkStep(l) {
      var segs = (l.parts || [l]).filter(function (q) { return typeof q.from === "number" && typeof q.to === "number" && q.from !== q.to; }), sg = segs[segs.length - 1];
      var fk = cState && cState.net && cState.net.fk, kinds = segs.map(function (q) { return fk ? fk[q.from + "|" + q.to] : "o"; }), mk = "";
      if (l.fixed) mk = T("gzm.jFixed", null, "Twój czas"); else if (l.measured) mk = T("gzm.jMeasured", null, "zmierzone");
      else if (segs.length && kinds.some(function (k) { return !k; })) mk = "≈ " + T("gzm.wEst", null, "szacunek");
      else if (segs.length && kinds.some(function (k) { return k === "r"; })) mk = "≈ " + T("gzm.wApx", null, "przybliżone");
      return { k: "walk", min: l.min, from: l.fromName || "", to: l.toName || "", mk: mk, mb: sg ? mapBtn("data-swmap", sg.from + "|" + sg.to) : ptMapBtn(l.pa, l.pb) };
    }
    function ceRideStep(l) {
      return { k: "ride", icon: TYPE_ICON[l.kind] || "🚌", line: l.line, head: l.head || "", dep: l.dep, depPlan: l.depPlan, arr: l.arr, delay: l.live ? (l.delay || 0) : 0, live: !!l.live,
        from: l.fromName, fromSt: standOf(l.fromCode), to: l.toName, toSt: standOf(l.toCode), trip: l.trip };
    }
    function ceJourney(jn, out) {
      var prev = null, wb = 0;
      mergeWalks(jn.legs).forEach(function (l) {
        if (l.type === "walk") { if (prev) wb += l.min; out.push(ceWalkStep(l)); return; }
        if (prev) { var sl = l.dep - prev.arr - wb; out.push({ k: "xfer", slack: sl, st: ceXst(sl), at: l.fromName, walk: wb }); }
        out.push(ceRideStep(l)); prev = l; wb = 0;
      });
    }
    function ceSteps(x, S) {
      var out = [];
      if (x.net) { ceJourney(x.net, out); return out; }
      var c = x.c || {}, L = c.latest, L0 = x.it.legs || [], e0 = c.egr && c.egr[0];
      if (c.walkA) out.push({ k: "walk", min: c.walkA.min, from: c.walkA.name, to: x.p.cb.a.st.n, mk: "", mb: ptMapBtn(placePt(S.fromPlace), stationPt(x.p.cb.a.st)) });
      if (L) {
        ceJourney(L.jn, out);
        var lastL = L.jn.legs[L.jn.legs.length - 1], poleA = lastL && lastL.to, pA = poleA != null ? (polesOf(x.p.cb.a.st).find(function (q) { return q.s === poleA; }) || {}) : {};
        if (pA.walk != null) out.push({ k: "walk", min: pA.walk, from: S.net.name[poleA], to: T("gzm.v2Plat", { s: x.p.cb.a.st.n }, "peron · {s}"), mk: pA.chk ? "⚠️ " + T("gzm.wChk", null, "sprawdź") : "", mb: mapBtn("data-pwmap", x.p.cb.a.st.id + "|" + x.p.cb.a.st.n + "|" + poleA + "|1") });
        out.push({ k: "xfer", slack: L.slack, st: L.status === "missed" ? "missed" : ceXst(L.slack), at: x.p.cb.a.st.n, walk: pA.walk || 0, plat: true });
      }
      L0.forEach(function (l, j) {
        if (j > 0) { var ch = C.hm(l.board.time) - C.hm(L0[j - 1].alight.time); if (ch < 0) ch += 1440; out.push({ k: "xfer", slack: ch, st: ceXst(ch), at: l.board.stationName, walk: 0 }); }
        var t = l.train || {}, nm = t.name && /^S\d/.test(t.name) ? t.name + " " + (t.number || "") : ((t.category || "") + " " + (t.number || "")).trim();
        var last = j === L0.length - 1, ap = C.hm(l.alight.time);
        out.push({ k: "ride", train: true, icon: "🚆", line: nm.trim(), short: t.name && /^S\d/.test(t.name) ? t.name : (t.category || "") + " " + (t.number || ""), head: "", dep: C.hm(l.board.time), depPlan: C.hm(l.board.time),
          arr: last && x.tDelay ? x.arr : ap, arrPlan: ap, delay: 0, arrDelay: last ? (x.tDelay || 0) : 0, from: l.board.stationName, to: l.alight.stationName, leg: l });
      });
      if (c.walkE) out.push({ k: "walk", min: c.walkE.min, from: L0.length ? L0[L0.length - 1].alight.stationName : "", to: c.walkE.name, mk: "", mb: ptMapBtn(stationPt(x.p.cb.e.st), placePt(S.toPlace)) });
      else if (e0) {
        var r0 = e0.legs.find(function (l) { return l.type === "ride"; }), wk = 0;
        e0.legs.some(function (l) { if (l.type === "walk") { wk += l.min; return false; } return true; });
        var poleE = e0.legs[0] && e0.legs[0].type === "walk" ? e0.legs[0].from : r0 ? r0.from : null;
        var pE = poleE != null ? (polesOf(x.p.cb.e.st).find(function (q) { return q.s === poleE; }) || {}) : {};
        var lead = []; for (var li = 0; li < e0.legs.length && e0.legs[li].type === "walk"; li++) lead.push(e0.legs[li]);
        var rest = e0;
        if (pE.walk != null) {
          var lastW = lead[lead.length - 1], chain = lead.filter(function (q) { return typeof q.from === "number" && typeof q.to === "number" && q.from !== q.to; }).map(function (q) { return q.from + ">" + q.to; }).join(",");
          out.push({ k: "walk", min: pE.walk + wk, from: T("gzm.v2Plat", { s: x.p.cb.e.st.n }, "peron · {s}"), to: lastW ? lastW.toName : S.net.name[poleE], mk: pE.chk ? "⚠️ " + T("gzm.wChk", null, "sprawdź") : "",
            mb: mapBtn("data-pwmap", x.p.cb.e.st.id + "|" + x.p.cb.e.st.n + "|" + poleE + "|0" + (chain ? "|" + chain : "")) });
          rest = Object.assign({}, e0, { legs: e0.legs.slice(lead.length) });
        }
        var sl = r0 ? r0.dep - x.arr - wk - (pE.walk || 0) : 0;
        out.push({ k: "xfer", slack: sl, st: ceXst(sl), at: r0 ? r0.fromName : "", walk: (pE.walk || 0) + wk });
        ceJourney(rest, out);
      }
      return out;
    }
    function ceLeave(x) {
      if (x.net) { var jn = x.net, f0 = jn.legs.find(function (l) { return l.type === "ride"; }); return jn.leave != null ? jn.leave : jn.legs[0].type === "walk" ? f0.dep - jn.legs[0].min : jn.dep; }
      var c = x.c || {}, L = c.latest;
      return c.walkA ? c.walkA.leave : L ? (L.jn.leave != null ? L.jn.leave : L.jn.legs[0].type === "walk" ? L.jn.dep - L.jn.legs[0].min : L.jn.dep) : x.dep;
    }
    function ceWorst(steps) {
      var rank = { ok: 0, tight: 1, edge: 2, missed: 3 }, w = "ok";
      steps.forEach(function (q) { if (q.k === "xfer" && rank[q.st] > rank[w]) w = q.st; });
      return w;
    }
    function ceTime(plan, real) { return real != null && real !== plan ? '<s style="opacity:.7">' + C.fmt(plan) + "</s> " + C.fmt(real) : C.fmt(plan); }
    function ceSt(q, sep) { return q ? (sep || " ") + '<span class="ce-mu">(' + esc(T("gzm.stand", { n: q }, "stan. {n}")) + ")</span>" : ""; }
    var CE_ST = { ok: "s-ok", tight: "s-risk", edge: "s-broken", missed: "s-broken" };
    // ===== TODO 85 — wersja F (22.11): „rozkład godzinowy” =====
    var F_CLS = { ok: "ce-ok", tight: "ce-tight", edge: "ce-edge", missed: "ce-missed" };
    function fStTxt(st) { return st === "edge" ? "🔴 " + T("gzm.ceStEdge", null, "na granicy") : v2StTxt(st === "missed" ? "missed" : st); }
    function fR1(x, steps, leave) { var st = ceWorst(steps); return '<div class="f-r1"><b>' + C.fmt(leave) + " → " + C.fmt(x.final) + '</b><span class="f-st ' + F_CLS[st] + '">' + esc(fStTxt(st)) + "</span></div>"; }
    function fRideName(q) { return q.icon + " <b>" + esc(q.train ? q.short || q.line : q.line) + "</b>"; }
    function ceCompact(x, S, dk) {
      var steps = ceSteps(x, S), leave = ceLeave(x), st = ceWorst(steps);
      var rides = steps.filter(function (q) { return q.k === "ride"; }), xs = steps.filter(function (q) { return q.k === "xfer"; });
      var how = rides.map(function (q, i) { return fRideName(q) + (i < rides.length - 1 ? " → " + esc(q.to) : ""); }).join(", " + esc(T("gzm.fThen", null, "potem")) + " ");
      var walk = steps.reduce(function (a, q) { return a + (q.k === "walk" ? q.min : 0); }, 0), meta = [esc(v2Total(x.final - leave))];
      // notatka 26.11 11:30 (telefon): przy 2+ pojazdach jeden pojazd w jednej linii, pod nim krótko przesiadka
      var oneLine = rides.length >= 2 && xAuthor();
      if (oneLine) {
        var rowsC = [];
        steps.forEach(function (q, i) {
          if (q.k !== "ride") return;
          var nm = q.train ? (q.short || q.line) : q.line;
          rowsC.push('<div style="display:grid;grid-template-columns:44px 22px minmax(0,1fr);gap:6px;align-items:baseline;padding:2px 0"><b>' + C.fmt(q.delay ? q.dep : q.depPlan) + "</b><span>" + q.icon + '</span><span><b>' + esc(nm) + '</b> <span style="color:var(--muted)">→ ' + esc(q.to) + "</span></span></div>");
          var j = i + 1, w = null; if (steps[j] && steps[j].k === "walk") { w = steps[j]; j++; }
          var xq = steps[j] && steps[j].k === "xfer" ? steps[j] : null;
          if (xq) {
            var lab = xq.st === "missed" ? T("gzm.cxMiss", { n: -xq.slack }, "przesiadka: brakuje {n} min").replace("{n}", -xq.slack) : T("gzm.cxLine", { n: xq.slack }, "przesiadka {n} min").replace("{n}", xq.slack) + (xq.st === "tight" ? T("gzm.cxTight", null, " — na styk") : xq.st === "edge" ? T("gzm.cxEdge", null, " — na granicy") : "");
            rowsC.push('<div style="padding:0 0 2px 72px;font-size:12.5px"><span class="' + (xq.st === "ok" ? "" : F_CLS[xq.st]) + '" style="' + (xq.st === "ok" ? "color:var(--muted)" : "font-weight:700") + '">' + esc(lab) + "</span>" + (w ? ' <span style="color:var(--muted)">· 🚶 ' + w.min + " min</span>" : "") + "</div>");
          }
        });
        how = rowsC.join("");
      }
      if (oneLine) meta.push(esc(T("gzm.fXn", { n: xs.length }, "przesiadki: {n}")));
      else if (xs.length === 1) meta.push(esc(T("gzm.fX1", { s: xs[0].at }, "przesiadka: {s}")) + ', <span class="' + F_CLS[xs[0].st] + '">' + esc(T("gzm.fSlack", { n: xs[0].slack }, "zapas {n} min")) + "</span>");
      else if (xs.length > 1) { var mn = xs.reduce(function (a, q) { return q.slack < a.slack ? q : a; }); meta.push(esc(T("gzm.fXn", { n: xs.length }, "przesiadki: {n}")) + ', <span class="' + F_CLS[mn.st] + '">' + esc(T("gzm.fSlackMin", { n: mn.slack }, "najmniej zapasu {n} min")) + "</span>"); }
      else meta.push(esc(T("gzm.v2Direct", null, "bez przesiadek")));
      if (walk) meta.push(esc(T("gzm.fWalk", { n: walk }, "pieszo {n} min")));
      if (x.why) meta.push(esc(x.why));
      if (x.tDelay) meta.push('<span class="ce-tight">' + esc(T("gzm.v2TrainLive", { n: x.tDelay }, "pociąg +{n} min (na żywo)")) + "</span>");
      // TODO 109: wolniejszy kurs — szara plakietka „⏬ później na miejscu” zamiast oceny i podpowiedź, czym szybciej
      var slw = x.net && x.net.slower, head1 = fR1(x, steps, leave);
      if (slw) {
        head1 = '<div class="f-r1"><b>' + C.fmt(leave) + " → " + C.fmt(x.final) + '</b><span class="f-st" style="color:var(--muted);background:rgba(148,163,184,.14);border-radius:999px;padding:2px 9px">⏬ ' + esc(T("gzm.slowerBadge", null, "później na miejscu")) + "</span></div>";
        meta.unshift('<span style="color:var(--muted)">' + esc(T("gzm.slowerHint", { l: slw.line, d: C.fmt(slw.dep), a: C.fmt(slw.arr) }, "szybciej: {l} o {d} → {a}").replace("{l}", slw.line).replace("{d}", C.fmt(slw.dep)).replace("{a}", C.fmt(slw.arr))) + "</span>");
      }
      return '<div class="card v2c ' + (slw ? "" : CE_ST[st]) + '" data-det="' + esc(dk) + '" role="button" tabindex="0"' + (slw ? ' style="border-left-color:#64748b"' : "") + '><div class="c-head" style="display:block">' + head1 + "</div>" +
        '<div class="f-how"' + (oneLine ? ' style="margin-top:6px"' : "") + ">" + how + '</div><div class="f-meta">' + (oneLine ? "⏱️ " : "") + meta.join(" · ") + "</div>" +
        (fInline() ? '<div style="text-align:right;margin-top:6px"><button type="button" class="btn-sm secondary" data-trasa="' + esc(dk) + '">' + esc(T("gzm.v2Route", null, "▼ Trasa")) + "</button></div>" : "") + "</div>";
    }
    function fRow(h, w, sm, cls) { return "<tr" + (cls ? ' class="' + cls + '"' : "") + '><td class="h">' + h + '</td><td class="w">' + w + (sm ? '<span class="f-sm">' + sm + "</span>" : "") + "</td></tr>"; }
    function fMk(q) { return q.mk ? " (" + esc(q.mk) + ")" : ""; }
    // 25.11 (prośba: „tak samo czytelnie w Pociąg + GZM”): pod przejazdem jego przystanki — odcinek widoczny, przed i po zwinięte.
    // GZM: bieg kursu z rozkładu ZTM (tripHtml); pociąg: trasa z PLK (/api/train-details, wczytywana raz, pamiętana).
    var fTrainCache = {};
    // TODO 99 (26.11): perony i tory przy wsiadaniu i wysiadaniu — z biegu pociągu (to samo zapytanie i ta sama pamięć co „Trasa”)
    function fTrainPlat(leg, date) {
      if (!leg || !leg.orderId) return null;
      var k = leg.scheduleId + "|" + leg.orderId + "|" + date; if (!fTrainCache[k]) fTrainStops(leg, date);
      var c = fTrainCache[k], route = c && c.d && Array.isArray(c.d.route) ? c.d.route : null; if (!route) return null;
      var nn = function (v) { return String(v || "").trim().toLowerCase(); }, ib = route.findIndex(function (x) { return nn(x.stationName) === nn(leg.board.stationName); }), ia = -1;
      for (var i = Math.max(0, ib + 1); i < route.length; i++) if (nn(route[i].stationName) === nn(leg.alight.stationName)) { ia = i; break; }
      var pt = function (x) {
        if (!x) return ""; var p = x.platform && x.platform !== "-" ? x.platform : "", t = x.track && x.track !== "-" ? x.track : "";
        return p ? (t ? T("gzm.c99PlatTr", { p: p, t: t }, "peron {p}, tor {t}").replace("{p}", p).replace("{t}", t) : T("gzm.c99Plat", { p: p }, "peron {p}").replace("{p}", p)) : "";
      };
      return { b: pt(ib >= 0 ? route[ib] : null), a: pt(ia >= 0 ? route[ia] : null) };
    }
    function fTrainStops(leg, date) {
      var k = leg.scheduleId + "|" + leg.orderId + "|" + date, c = fTrainCache[k];
      if (!c) {
        fTrainCache[k] = { p: true };
        fetch("/api/train-details?" + new URLSearchParams({ scheduleId: leg.scheduleId || "", orderId: leg.orderId || "", operatingDate: date || "", train: (leg.train && leg.train.number) || "", station: leg.board.stationName }).toString())
          .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
          .then(function (d) { fTrainCache[k] = { d: d }; rerender(); });
        c = fTrainCache[k];
      }
      if (c.p) return '<div class="gz-trip-pos" style="color:var(--muted)">' + esc(T("gzm.tLoading", null, "Wczytuję bieg kursu…")) + "</div>";
      var route = c.d && Array.isArray(c.d.route) ? c.d.route : [], nn = function (v) { return String(v || "").trim().toLowerCase(); };
      var ib = route.findIndex(function (x) { return nn(x.stationName) === nn(leg.board.stationName); }), ia = -1;
      for (var i = Math.max(0, ib + 1); i < route.length; i++) if (nn(route[i].stationName) === nn(leg.alight.stationName)) { ia = i; break; }
      if (ib < 0 || ia < 0) return "";
      // TODO 103: wygląd „Biegu pociągu” (🚏/🏁 → dzienniczek, 🚌 → przesiadki GZM)
      if (window.StopsView) return StopsView.html(route, ib, ia, { leg: leg, date: date, key: "f|" + leg.orderId, onReady: rerender });
      var rows = route.map(function (x, i) {
        var t = String((i === ia ? x.plannedArrival : x.plannedDeparture) || x.plannedTime || "").slice(0, 5);
        var dl = x.status === "confirmed" ? (i === ia ? x.arrivalDelay : x.departureDelay) : (i === ia ? x.forecastArrivalDelay : x.forecastDepartureDelay);
        var tt = dl > 0 ? '<span class="plan-strike">' + esc(t) + "</span> " + C.fmt(C.hm(t) + (+dl)) : esc(t);
        var pl = x.platform && x.platform !== "-" ? ' <span style="opacity:.7">· ' + esc(T("gzm.platN", { p: x.platform }, "peron {p}")) + "</span>" : "";
        return '<div class="gz-tr' + (x.status === "confirmed" ? " past" : "") + (i === ib || i === ia ? " me" : "") + '"><div>' + tt + "</div><div>" + esc(x.stationName) + pl + "</div></div>";
      });
      return foldRoute(rows, ib, ia, "f|" + leg.orderId, "station");
    }
    // 25.11: „▼ Trasa” = przystanki każdego pojazdu w karcie (pod jego wierszem); rozwinięcie karty samo — bez przystanków.
    function rel27() { if (Date.now() >= Date.parse("2026-11-27T16:00:00+01:00")) return true; try { return localStorage.getItem("showVersionBadge") === "1"; } catch (e) { return false; } }   // wydanie zmian z 26–27.11 (TODO 109)
    function xAuthor() { if (Date.now() >= Date.parse("2026-11-26T16:00:00+01:00")) return true; try { return localStorage.getItem("showVersionBadge") === "1"; } catch (e) { return false; } }   // TODO 113: nowy wygląd przesiadki — najpierw profil autora
    function fInline() { if (ceOn() && Date.now() >= Date.parse("2026-11-25T17:00:00+01:00")) return true; try { return ceOn() && localStorage.getItem("showVersionBadge") === "1"; } catch (e) { return false; } }   // dla wszystkich od 25.11 17:00 (zaplanowane), wcześniej profil autora
    function fStops(q) {
      if (!fInline()) return "";
      var date = (cState && cState.date) || warsawNow().date, h = "";
      if (q.trip) h = tripHtml(q.trip, date, q.from, q.to, true);
      else if (q.leg && q.leg.orderId) h = fTrainStops(q.leg, date);
      if (h && !q.trip && window.StopsView) return '<tr class="f-stops"><td colspan="2" style="padding:0">' + h + "</td></tr>";   // pociąg: cała szerokość karty (notatka 25.11)
      // notatka 25.11: autobus/tramwaj też na całą szerokość karty (w prawej kolumnie było za wąsko)
      return h ? '<tr class="f-stops"><td colspan="2" style="padding:0"><div class="gz-trip" style="margin:2px 0 4px;font-size:14px">' + h + "</div></td></tr>" : "";
    }
    // treść rozwiniętej karty (zamiast nagłówka i listy odcinków); reszta karty — jak dotąd
    function ceFull(x, S) {
      var steps = ceSteps(x, S), leave = ceLeave(x), rows = [], firstRide = -1, lastRide = -1, prevArr = null, showStops = !!tripOpen[detKey(x)];
      steps.forEach(function (q, i) { if (q.k === "ride") { if (firstRide < 0) firstRide = i; lastRide = i; } });
      if (window.StopsView && StopsView.legA && xAuthor()) return ceFullA(x, steps, leave, showStops, firstRide, lastRide);   // 26.11 wariant A
      steps.forEach(function (q, i) {
        if (q.k === "walk") {
          if (i < firstRide || firstRide < 0) { rows.push(fRow(C.fmt(leave), "🚶 " + esc(i === 0 ? T("gzm.fLeave", null, "Wyjdź") : T("gzm.fGo", null, "Przejdź")), esc(T("gzm.fWalkTo", { n: q.min, s: q.to }, "{n} min do: {s}")) + fMk(q) + q.mb)); return; }
          if (i > lastRide) { rows.push(fRow(C.fmt(prevArr), "🚶 " + esc(T("gzm.fOnFoot", null, "Pieszo do celu")), esc(T("gzm.fWalkTo", { n: q.min, s: q.to }, "{n} min do: {s}")) + fMk(q) + q.mb)); return; }
          return;   // między kursami — w wierszu przesiadki
        }
        if (q.k === "xfer") {
          var w = steps[i - 1] && steps[i - 1].k === "walk" ? steps[i - 1] : null, sl = '<span class="' + F_CLS[q.st] + '">' + (q.st === "missed" ? esc(T("gzm.ceMiss", { n: -q.slack }, "brakuje {n} min — możesz nie zdążyć")) : esc(T("gzm.fSlack", { n: q.slack }, "zapas {n} min"))) + "</span>";
          // TODO 113 (26.11, profil autora): przesiadka jako jedna odpowiedź — ten sam wygląd co w Pilnowanych i wyszukiwarce kolejowej
          if (window.StopsView && StopsView.xfer && xAuthor()) {
            var nx = steps[i + 1] || {}, xs = { ok: "ok", tight: "risk", edge: "edge", missed: "broken" }[q.st] || "ok";
            var xn = w ? '<div class="xv-p">🚶 ' + esc(T("xfer.walk", { a: w.from, b: w.to }, "Przejście: {a} → {b}").replace("{a}", w.from).replace("{b}", w.to)) + " · " + w.min + " min" + fMk(w) + (w.mb || "") + "</div>" : "";
            var xd = []; if (w) xd.push(T("xfer.dWalk", { n: w.min }, "Na przejście liczymy {n} min").replace("{n}", w.min));
            rows.push('<tr class="f-x"><td colspan="2" style="padding:0">' + StopsView.xfer({ station: w ? w.to : q.at, status: xs, slack: q.slack,
              arr: prevArr != null ? C.fmt(prevArr) : "", dep: nx.dep != null ? C.fmt(nx.dep) : "", depPlan: nx.depPlan != null ? C.fmt(nx.depPlan) : "", info: xn, details: xd, key: "f|" + (q.at || "") + "|" + (nx.dep || "") }) + "</td></tr>");
            return;
          }
          var what = w ? "🚶 " + esc(w.from) + " → <b>" + esc(w.to) + "</b>" : "⏳ " + esc(T("gzm.ceXfer", { s: "" }, "Przesiadka: {s}")) + "<b>" + esc(q.at) + "</b>";
          rows.push(fRow(prevArr != null ? C.fmt(prevArr) : "", what, (w ? w.min + " min" + fMk(w) + " · " : "") + sl + (w ? w.mb : ""), "x-" + q.st));
          return;
        }
        var live = q.live ? (q.delay ? '<span class="ce-tight">+' + q.delay + " min " + esc(T("gzm.ceLive", null, "na żywo")) + "</span>" : esc(T("gzm.ceOnTime", null, "jedzie punktualnie"))) : q.arrDelay ? '<span class="ce-tight">+' + q.arrDelay + " min " + esc(T("gzm.ceLive", null, "na żywo")) + "</span>" : "";
        var from = esc(q.from) + (q.fromSt ? ", " + esc(T("gzm.stand", { n: q.fromSt }, "stan. {n}")) : "");
        var p99 = q.train && xAuthor() ? fTrainPlat(q.leg, (cState && cState.date) || warsawNow().date) : null;   // TODO 99
        if (p99 && p99.b) from += ", <b>" + esc(p99.b) + "</b>";
        var sm = esc(T("gzm.fFrom", { s: "" }, "z: {s}")) + from + " · " + esc(T("gzm.fOff", { t: "" }, "wysiadasz {t}")) + ceTime(q.arrPlan != null ? q.arrPlan : q.arr, q.arrDelay ? q.arr : null) + (q.toSt ? " (" + esc(T("gzm.stand", { n: q.toSt }, "stan. {n}")) + ")" : "") + (p99 && p99.a ? ", " + esc(p99.a) : "") + (live ? " · " + live : "");
        rows.push(fRow(ceTime(q.depPlan, q.delay ? q.dep : null), (q.train && xAuthor() ? q.icon + " <b>" + esc(q.line) + "</b>" : fRideName(q)) + " → " + esc(q.to), sm, "f-ride"));   // TODO 99: pełny numer, np. S9 40362
        if (showStops) rows.push(fStops(q));
        prevArr = q.arr;
      });
      rows.push(fRow(C.fmt(x.final), "🏁 <b>" + esc(T("gzm.fThere", null, "Na miejscu")) + "</b>", x.why ? esc(x.why) : ""));
      // TODO 99: czas podróży i liczba przesiadek pod godzinami
      var m99 = ""; if (xAuthor()) { var nx99 = steps.filter(function (q) { return q.k === "xfer"; }).length; m99 = '<div style="font-size:13.5px;color:var(--muted);margin-top:2px">⏱️ ' + esc(v2Total(x.final - leave)) + " · " + esc(nx99 ? T("gzm.c99X", { n: nx99 }, "przesiadki: {n}").replace("{n}", nx99) : T("gzm.c99Direct", null, "bez przesiadek")) + "</div>"; }
      return '<div class="c-head" style="display:block">' + fR1(x, steps, leave) + m99 + '</div><table class="f-tt">' + rows.join("") + "</table>";
    }
    // ===== 26.11 wariant A (dla wszystkich od 15:00): pojazd nad wszystkim, linia odjazdu i przyjazdu, odpowiedź o przesiadce
    // w linii przyjazdu na stację przesiadki, reszta w „▸ szczegóły” — ten sam układ co w Pilnowanych i wyszukiwarce kolejowej
    function ceFullA(x, steps, leave, showStops, firstRide, lastRide) {
      var date = (cState && cState.date) || warsawNow().date, out = [], prevArr = null, XS = { ok: "ok", tight: "risk", edge: "edge", missed: "broken" };
      var line = function (t, ico, txt) { return '<div class="jl-r" style="padding:6px 0"><div class="jl-t">' + t + '</div><div class="jl-s" style="font-weight:400">' + ico + " " + txt + "</div><div></div></div>"; };
      steps.forEach(function (q, i) {
        if (q.k === "walk") {
          if (i < firstRide || firstRide < 0) out.push(line(C.fmt(leave), "🚶", "<b>" + esc(i === 0 ? T("gzm.fLeave", null, "Wyjdź") : T("gzm.fGo", null, "Przejdź")) + "</b> · " + esc(T("gzm.fWalkTo", { n: q.min, s: q.to }, "{n} min do: {s}")) + fMk(q) + q.mb));
          else if (i > lastRide) out.push(line(C.fmt(prevArr), "🚶", "<b>" + esc(T("gzm.fOnFoot", null, "Pieszo do celu")) + "</b> · " + esc(T("gzm.fWalkTo", { n: q.min, s: q.to }, "{n} min do: {s}")) + fMk(q) + q.mb));
          return;
        }
        if (q.k !== "ride") return;
        var j = i + 1, w = null; if (steps[j] && steps[j].k === "walk" && j < lastRide) { w = steps[j]; j++; }
        var xq = steps[j] && steps[j].k === "xfer" ? steps[j] : null, det = [], warn = false;
        if (q.live && q.delay) { warn = true; det.push('<span class="ce-tight">+' + q.delay + " min " + esc(T("gzm.ceLive", null, "na żywo")) + "</span>"); }
        else if (q.arrDelay) { warn = true; det.push('<span class="ce-tight">+' + q.arrDelay + " min " + esc(T("gzm.ceLive", null, "na żywo")) + "</span>"); }
        else if (q.live) det.push(esc(T("gzm.ceOnTime", null, "jedzie punktualnie")));
        if (w) det.push("🚶 " + esc(T("xfer.walk", { a: w.from, b: w.to }, "Przejście: {a} → {b}").replace("{a}", w.from).replace("{b}", w.to)) + " · " + w.min + " min" + fMk(w) + (w.mb || ""));
        if (xq && xq.st === "missed") det.unshift('<span style="color:#ff6b6b;font-weight:700">' + esc(T("gzm.ceMiss", { n: -xq.slack }, "brakuje {n} min — możesz nie zdążyć")) + "</span>");
        var p99 = q.train ? fTrainPlat(q.leg, date) : null;
        var stand = function (n) { return n ? T("gzm.stand", { n: n }, "stan. {n}").replace("{n}", n) : ""; };
        var after = "";
        if (showStops) { var h = q.trip ? tripHtml(q.trip, date, q.from, q.to, true) : (q.leg && q.leg.orderId ? fTrainStops(q.leg, date) : ""); if (h) after = q.trip ? '<div class="gz-trip" style="margin:2px 0 6px;font-size:14px">' + h + "</div>" : h; }
        var tdir = ""; if (q.train && q.leg) { var tc = fTrainCache[q.leg.scheduleId + "|" + q.leg.orderId + "|" + date], trt = tc && tc.d && Array.isArray(tc.d.route) ? tc.d.route : null; if (trt && trt.length) tdir = trt[trt.length - 1].stationName; }
        out.push(StopsView.legA({ icon: q.icon, label: "<b>" + esc(q.line) + "</b>", dir: q.head || tdir,
          dep: { time: C.fmt(q.delay ? q.dep : q.depPlan), plan: C.fmt(q.depPlan), station: q.from, plat: q.train ? (p99 && p99.b) || "" : stand(q.fromSt) },
          arr: { time: C.fmt(q.arrDelay ? q.arr : (q.arrPlan != null ? q.arrPlan : q.arr)), plan: C.fmt(q.arrPlan != null ? q.arrPlan : q.arr), station: q.to, plat: q.train ? (p99 && p99.a) || "" : stand(q.toSt) },
          xfer: xq ? { status: XS[xq.st] || "ok", slack: xq.slack } : null, details: det.join("<br>"), warn: warn, key: "f|" + detKey(x) + "|" + i, after: after }));
        prevArr = q.arr;
      });
      out.push(line(C.fmt(x.final), "🏁", "<b>" + esc(T("gzm.fThere", null, "Na miejscu")) + "</b>" + (x.why ? ' <span style="color:var(--muted)">· ' + esc(x.why) + "</span>" : "")));
      var nx99 = steps.filter(function (q) { return q.k === "xfer"; }).length;
      var m99 = '<div style="font-size:13.5px;color:var(--muted);margin-top:2px">⏱️ ' + esc(v2Total(x.final - leave)) + " · " + esc(nx99 ? T("gzm.c99X", { n: nx99 }, "przesiadki: {n}").replace("{n}", nx99) : T("gzm.c99Direct", null, "bez przesiadek")) + "</div>";
      return '<div class="c-head" style="display:block">' + fR1(x, steps, leave) + m99 + '</div><div class="f-ja">' + out.join("") + (nx99 && StopsView.xNote ? StopsView.xNote() : "") + "</div>";
    }
    // ===== Logika v3: pieszo, filtry absurdów, pierwszeństwo kolei (TEST — tylko profil autora) =====
    var NODE_M = 300;
    function ptOfStop(i) { return i != null && i >= 0 ? { lat: cState.net.lat[i], lon: cState.net.lon[i] } : null; }
    function ptOfName(nm) {
      var stn = stationByName(nm); if (stn) return { lat: stn.lat, lon: stn.lon };
      var ix = cState.net.byName[nm]; return ix && ix.length ? ptOfStop(ix[0]) : null;
    }
    function endPt(S, side) {
      var pl = side === "s" ? S.fromPlace : S.toPlace, st2 = side === "s" ? S.fromSt : S.toSt, nm = side === "s" ? S.fN : S.tN;
      if (pl) return { lat: pl.lat, lon: pl.lon };
      if (st2) return { lat: st2.lat, lon: st2.lon };
      return nm && nm.length ? ptOfName(nm[0]) : null;
    }
    function dM(a, b) { return a && b ? havM(a.lat, a.lon, b.lat, b.lon) : 1e9; }
    // dojście pieszo start → cel (z czasami na sztywno / zmierzonymi, gdy cel to przystanek przy miejscu)
    function walkGeo(S) {
      var a = endPt(S, "s"), b = endPt(S, "e"); if (!a || !b) return null;
      var d = dM(a, b), w = walkMin(d) + ((S.fromSt || S.toSt) ? 2 : 0);
      var pick = function (pl, names) { var best = null; (pl && pl.stops || []).forEach(function (x) { if ((names || []).indexOf(cState.net.name[x.s]) >= 0 && (best == null || x.walk < best)) best = x.walk; }); return best; };
      var fx = pick(S.fromPlace, S.tN) ; if (fx == null) fx = pick(S.toPlace, S.fN);
      if (fx == null && S.fromPlace && S.toSt && S.fromPlace.walkSt && S.fromPlace.walkSt[S.toSt.id] != null) fx = S.fromPlace.walkSt[S.toSt.id];
      if (fx == null && S.toPlace && S.fromSt && S.toPlace.walkSt && S.toPlace.walkSt[S.fromSt.id] != null) fx = S.toPlace.walkSt[S.fromSt.id];
      return { s: a, e: b, dist: d, walk: fx != null ? fx : w };
    }
    // kolejne punkty trasy (wsiadania i wysiadania) — do filtrów geometrii
    function ridePts(jn, out) { jn.legs.forEach(function (l) { if (l.type === "ride") { out.push(ptOfStop(l.from)); out.push(ptOfStop(l.to)); } }); }
    function routePts(x) {
      var p = [];
      if (x.net) { ridePts(x.net, p); return p; }
      var c = x.c;
      if (c.latest) ridePts(c.latest.jn, p);
      (x.it.legs || []).forEach(function (l) { p.push(ptOfName(l.board.stationName)); p.push(ptOfName(l.alight.stationName)); });
      if (!c.walkE && c.egr && c.egr[0]) ridePts(c.egr[0], p);
      return p;
    }
    // łączne chodzenie w propozycji (do rozstrzygania remisów — np. wysiadka w Bytomiu zamiast Bytomiu Karbie)
    function walkSum(x) {
      var jw = function (jn) { return jn ? jn.legs.reduce(function (a, l) { return a + (l.type === "walk" ? l.min : 0); }, 0) : 0; };
      if (x.net) return jw(x.net);
      var c = x.c || {}, w = (c.walkA ? c.walkA.min : 0) + (c.latest ? jw(c.latest.jn) : 0);
      var e0 = c.egr && c.egr[0]; if (c.walkE) w += c.walkE.min; else if (e0) { w += jw(e0); var p0 = e0.legs[0] && e0.legs[0].type === "walk" ? e0.legs[0].from : (e0.legs.find(function (l) { return l.type === "ride"; }) || {}).from; var pw = (polesOf(x.p.cb.e.st).find(function (q) { return q.s === p0; }) || {}).walk; w += pw || 0; }
      return w;
    }
    function rideCount(x) {
      if (x.net) return x.net.legs.filter(function (l) { return l.type === "ride"; }).length;
      var n = (x.it.legs || []).length, c = x.c;
      if (c.latest) n += c.latest.jn.legs.filter(function (l) { return l.type === "ride"; }).length;
      if (!c.walkE && c.egr && c.egr[0]) n += c.egr[0].legs.filter(function (l) { return l.type === "ride"; }).length;
      return n;
    }
    function absurd(x, g) {
      var p = routePts(x).filter(Boolean); if (!p.length) return false;
      // przejazd przez okolicę celu przed ostatnim odcinkiem (ostatni punkt = wysiadka u celu)
      for (var i = 0; i < p.length - 1; i++) if (dM(p[i], g.e) <= NODE_M) return "dest";
      // powrót w okolicę startu po pierwszym wejściu
      for (var j = 2; j < p.length; j++) if (dM(p[j], g.s) <= NODE_M) return "back";
      // ten sam węzeł dwa razy (nie sąsiednie punkty — przesiadka wysiadka/wsiadanie to jeden węzeł)
      for (var a = 0; a < p.length; a++) for (var b2 = a + 2; b2 < p.length; b2++) if (dM(p[a], p[b2]) <= 150) return "loop";
      var dur = x.final - x.start;
      if (g.walk >= 5 && dur > 2 * g.walk) return "slow";
      if (g.dist >= 800) { var len = dM(g.s, p[0]); for (var k = 1; k < p.length; k++) len += dM(p[k - 1], p[k]); len += dM(p[p.length - 1], g.e); if (len > 2.5 * g.dist) return "detour"; }
      return false;
    }
    root.addEventListener("click", function (ev) {
      if (!ev.target.closest("[data-forcetransit]") || !cState) return;
      cState.forceTransit = true; renderMM();
    });
    function v2WalkCard(g, base) {
      var arr = base + g.walk;
      var sub = esc(T("gzm.v2Sub", { a: C.fmt(base), b: C.fmt(arr), t: v2Total(g.walk) }, "wyjdź {a} · na miejscu {b} · w drodze {t}"));
      return '<div class="card s-ok">' + v2Head("🚶 " + esc(T("gzm.v3Walk", null, "Idź pieszo")), sub, "ok", '<span class="ct">' + C.fmt(arr) + "</span>" + esc(T("gzm.v3WalkChip", { n: g.walk }, "{n} min pieszo"))) +
        '<div class="c-date" style="margin-top:6px">' + esc(T("gzm.v3WalkWhy", { d: kmTxt(g.dist) }, "{d} w linii prostej — pieszo najprościej")) + "</div></div>";
    }
    // TODO 73 (profil autora): położenie z telefonu niedokładne — czasy dojścia z „Mojej lokalizacji” mogą być błędne
    function gpsWarn(S) {
      if (!authorOn()) return "";
      var w = [S.fromPlace, S.toPlace].filter(function (p) { return p && p.key === "gps"; })[0];
      if (!w) return "";
      if (w.nearPlace) return '<div class="gz-sub" style="margin:4px 2px">📍 ' + esc(T("gzm.pGpsNear", { p: PL_TOK[w.nearPlace] }, "Jesteś przy: {p} — dojścia z Twoich zapisanych czasów")) + "</div>";
      if (!(w.acc > 150)) return w.acc != null ? '<div class="gz-sub" style="margin:4px 2px">📍 ' + esc(T("gzm.pGpsAcc", { n: w.acc }, "Lokalizacja z dokładnością ±{n} m")) + "</div>" : "";
      return '<div class="gz-warn" style="margin:4px 2px">⚠️ ' + esc(T("gzm.pGpsBad", { n: w.acc }, "Telefon podał położenie z dokładnością tylko ±{n} m — czasy dojścia pieszo mogą być błędne. Wpisz przystanek albo wybierz 🏠 Dom / 🏢 Pracę.")) + "</div>";
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
          if (rel27()) o.withSlower = true;   // TODO 109: także wolniejsze bezpośrednie (z oznaczeniem) — dla wszystkich od 27.11 16:00
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
          var key = cKey(p, it), tl = delayOf(S, p, it), tD = tl ? tl.d : 0; arr += tD;
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
      var trAlts = {};   // TODO 68: inne dojazdy na ten sam pociąg (inna stacja wsiadania) — pokazujemy jako „albo”
      out = out.filter(function (x) {
        var k = x.net ? "n|" + x.net.legs.map(function (l) { return l.trip || l.min; }).join(">") : cKey(x.p, x.it), k2 = x.net ? null : trainKey(x);
        if (k2 && seen.has(k2) && !seen.has(k)) (trAlts[k2] = trAlts[k2] || []).push(x);
        if (seen.has(k) || (k2 && seen.has(k2))) return false; seen.add(k); if (k2) seen.add(k2); return true;
      });
      // Bez wariantów gorszych pod każdym względem: inny wyrusza nie wcześniej, a dowozi wcześniej
      // (np. tym samym pociągiem dalej przez cel i autobusem z powrotem — wraca się na trasie).
      var geo = walkGeo(S), walkTop = "";
      if (geo) {
        if (!S.forceTransit) out = out.filter(function (x) { return !absurd(x, geo); });
        // dominacja: lepszy = wyrusza nie wcześniej, dociera nie później, nie więcej przesiadek; pociąg chroniony tolerancją
        var tolOf = function (y) { return Math.max(10, Math.round(0.15 * (y.final - y.start))); };
        out = out.filter(function (x) {
          if (x.net && x.net.slower) return true;   // TODO 109: celowo pokazywany wolniejszy kurs
          return !out.some(function (y) {
            if (y === x || y.start < x.start || y.final > x.final || rideCount(y) > rideCount(x)) return false;
            if (!(y.final < x.final || y.start > x.start || rideCount(y) < rideCount(x))) return false;
            if (x.mm && !y.mm && x.final <= y.final + tolOf(y)) return false;
            return true;
          });
        });
        // pierwszeństwo kolei: pociąg na górze, gdy najwyżej ~10 min / 15% później niż najlepsza trasa bez pociągu
        var rails = out.filter(function (x) { return x.mm; }).sort(function (a, b) { return a.final - b.final; });
        var buses = out.filter(function (x) { return x.net; }).sort(function (a, b) { return a.final - b.final; });
        var bR = rails[0], bB = buses[0], railFirst = bR && (!bB || bR.final <= bB.final + tolOf(bB));
        out = (railFirst ? rails.concat(buses) : buses.concat(rails));
        // dociera dużo później niż najlepsza (ponad 30 min albo ponad połowę czasu podróży) — nie pokazujemy
        var bestF = Math.min.apply(null, out.map(function (x) { return x.final; }).concat([Infinity]));
        if (bestF < Infinity) out = out.filter(function (x) { return x.final - bestF <= Math.max(30, 0.5 * (bestF - base)); });
        var slowX = out.filter(function (x) { return x.net && x.net.slower; });
        out = out.filter(function (x) { return !(x.net && x.net.slower); }).slice(0, 6).concat(slowX.slice(0, 3));
        // 🚶 najmniej chodzenia (tylko gdy celem jest adres / moje miejsce)
        if (S.toPlace && S.toPlace.stops && S.toPlace.stops.length && out.length) {
          // łączne chodzenie w trasie (wszystkie odcinki pieszo)
          var jWalk = function (jn) { return jn.legs.reduce(function (a, l) { return a + (l.type === "walk" ? l.min : 0); }, 0); };
          var totalWalk = function (x) {
            if (x.net) return jWalk(x.net);
            var c = x.c || {}, w = (c.walkA ? c.walkA.min : 0) + (c.latest ? jWalk(c.latest.jn) : 0);
            if (c.walkE) w += c.walkE.min; else if (c.egr && c.egr[0]) w += jWalk(c.egr[0]);
            return w;
          };
          var minW = Math.min.apply(null, S.toPlace.stops.map(function (x) { return x.walk; }));
          var bestX = out.slice().sort(function (a, b) { return a.final - b.final; })[0], shownW = totalWalk(bestX);
          if (minW + 3 < shownW) {
            if (S.lessAt !== rtAt + "|" + base) {
              S.lessAt = rtAt + "|" + base; S.lessRes = null;
              // wszystkie stanowiska przystanków najbliżej celu (bez chodzenia między stanowiskami)
              var nearNames = {}; S.toPlace.stops.forEach(function (x) { if (x.walk <= minW + 1) nearNames[S.net.name[x.s]] = 1; });
              var nearest = S.toPlace.stops.filter(function (x) { return nearNames[S.net.name[x.s]]; });
              var fP2 = S.fromNet || S.fromPlace;
              var o2 = Object.assign(fP2 ? { fromStops: fP2.stops.map(function (x) { return { s: x.s, t: base + x.walk }; }), dep: base } : { from: S.fN, dep: base }, { rt: rt, maxTransfers: 2, count: 6, maxDep: base + 180 });
              o2.toStops = nearest.map(function (x) { return { s: x.s, walk: x.walk }; });
              // najmniej chodzenia łącznie; przy remisie — wcześniej na miejscu
              var lr = GzmRaptor.search(S.net, o2).map(function (jn) { return withPlaceWalks(jn, fP2, S.toPlace); }).sort(function (a, b) { return jWalk(a) - jWalk(b) || a.arr - b.arr; })[0];
              S.lessRes = lr || null;
            }
            var lj = S.lessRes, bestNow = Math.min.apply(null, out.map(function (x) { return x.final; }));
            if (lj && jWalk(lj) + 3 <= shownW && lj.arr <= bestNow + 15 && !out.some(function (x) { return x.net && jKey(x.net) === jKey(lj); })) {
              var lx = { net: lj, final: lj.arr, start: lj.leave != null ? lj.leave : lj.dep };
              var lwm = jWalk(lj);
              lx.why = T("gzm.v3LessWalk", { n: lwm, d: lj.arr - bestNow }, "🚶 Najmniej chodzenia: łącznie {n} min pieszo (na miejscu {d} min później)");
              out.splice(1, 0, lx); out = out.slice(0, 6);
            }
          }
        }
        // TODO 97 (25.11): „Albo” tylko z realną korzyścią. Reguła ogólna — bez nazw linii i miast, działa na każdej sieci:
        // to ten sam pociąg (trainKey), więc późniejsze wsiadanie = stacja dalej na jego trasie. Takiego wariantu nie pokazujemy,
        // jeśli trzeba wyjść tak samo albo wcześniej (np. Tarnowskie Góry → „wsiądź w Bytomiu Stroszku” do tego samego S8).
        var aWalk = function (z) { var c = z.c || {}, w = c.walkA ? c.walkA.min : 0; if (c.latest) w += c.latest.jn.legs.reduce(function (t, l) { return t + (l.type === "walk" ? l.min : 0); }, 0); return w; };
        var aSlack = function (z) { var c = z.c || {}; return c.latest && c.latest.slack != null ? c.latest.slack : 99; };
        var aBoard = function (z) { var l = z.it && z.it.legs && z.it.legs[0]; return l ? C.hm(l.board.time) : null; };
        out.forEach(function (x) {
          if (!x.mm) return; var al = (trAlts[trainKey(x)] || []).filter(function (y) {
            if (y.p.cb.a.st.id === x.p.cb.a.st.id || y.final > x.final + 2 || absurd(y, geo)) return false;
            var by = aBoard(y), bx = aBoard(x), further = by != null && bx != null && by > bx;
            if (further && y.start <= x.start) return false;                       // goni ten sam pociąg dalej na trasie — bez sensu
            var later = y.start > x.start;                                         // można wyjść później
            var lessWalk = aWalk(y) + 5 <= aWalk(x) && y.start >= x.start - 5;     // wyraźnie mniej chodzenia
            var safer = aSlack(x) < 3 && aSlack(y) >= aSlack(x) + 3 && y.start >= x.start - 10;   // pewniejsza przesiadka zamiast „na styk”
            return later || lessWalk || safer;
          }).sort(function (p, q) { return q.start - p.start; });
          x.alt = al[0] || null;
        });
        if (bR && bB) {
          var diff = bR.final - bB.final;
          if (railFirst) bR.why = diff > 0 ? T("gzm.v3WhyRailTol", { n: diff }, "Pociągiem — {n} min później niż samą komunikacją, ale koleją") : T("gzm.v3WhyRailBest", null, "Pociągiem — najszybciej");
          else bB.why = T("gzm.v3WhyBus", { n: diff }, "Autobusem/tramwajem — o {n} min szybciej niż pociągiem");
        }
        // wariant pieszy: blisko (ten sam węzeł), do 25 min albo szybciej niż komunikacja
        var bestFinal = out.length ? Math.min.apply(null, out.map(function (x) { return x.final; })) : Infinity;
        var firstStart = out.length ? Math.min.apply(null, out.map(function (x) { return x.start; })) : Infinity;
        // TEST (autor; wszyscy od 3.11 14:30): marsz najwyżej 60 min — bez tego brak wyników (bestFinal = ∞) dawał „Idź pieszo” 4 h
        var walkCap = true;   // dla wszystkich od v5.56
        if ((geo.dist <= NODE_M || geo.walk <= 25 || base + geo.walk <= bestFinal || firstStart > base + 60) && (!walkCap || geo.dist <= NODE_M || geo.walk <= 60)) {
          walkTop = v2WalkCard(geo, base);
          if (!S.forceTransit) walkTop += '<div style="margin:0 2px 10px"><button type="button" class="gz-btn sec" data-forcetransit="1">🚌 Szukaj mimo to komunikacją</button></div>';
          // noc / długa przerwa: najbliższe połączenie dopiero za ponad godzinę
          if (firstStart > base + 60 && firstStart < Infinity) walkTop += '<div class="gz-sub" style="margin:4px 2px 10px">' + esc(T("gzm.v3FirstLater", { t: C.fmt(firstStart) }, "Najbliższe połączenie komunikacją: wyjście dopiero o {t} (poniżej).")) + "</div>";
        }
        if (geo.dist <= NODE_M && !S.forceTransit) out = [];
      } else out = out.filter(function (x) { return !out.some(function (y) { return y !== x && y.start >= x.start && y.final < x.final; }); }).slice(0, 6);
      if (!out.length && walkTop) {
        res.innerHTML = walkTop + (geo && geo.dist > NODE_M ? '<div class="gz-sub" style="margin:6px 2px">' + esc(T("gzm.v3NoTransit", null, "Komunikacją nie będzie szybciej albo brak połączeń w najbliższych godzinach — zmień godzinę, żeby zobaczyć późniejsze kursy.")) + "</div>" : "");
        cState.shown = []; return;
      }
      if (!out.length) { res.innerHTML = '<div class="gz-empty">' + esc(T("gzm.cNone", null, "Nie udało się ułożyć podróży w ciągu 2 godzin od wyjścia.")) + "</div>" + noResModes(); return; }
      // TODO 76 (lista, profil autora): kolejność jak w oficjalnych wyszukiwarkach — wg godziny wyjścia, przy remisie wcześniej na miejscu
      out.sort(function (a, b) { return a.start - b.start || a.final - b.final || walkSum(a) - walkSum(b); });
      var guardOk = !!(window.GuardStore && window.GuardCore && GuardStore.enabled && GuardStore.enabled());
      cState.shown = out;   // TODO 136: przed rysowaniem — karty widzą sąsiadów („➡️ Zamiast”)
      res.innerHTML = gpsWarn(S) + walkTop + (S.date !== warsawNow().date ? '<div class="gz-live off" style="margin:4px 2px">📅 ' + esc(T("gzm.uSched", { d: S.date }, "{d} — godziny wg rozkładu")) + "</div>" : '<div class="gz-live ' + (rtOk ? "on" : "off") + '" style="margin:4px 2px">' + (rtOk ? "● " + esc(T("gzm.liveOn", null, "na żywo")) : "○ " + esc(T("gzm.liveOff", null, "dane na żywo niedostępne, pokazuję rozkład"))) + "</div>") +
        out.map(function (x, i) {
          v2Cur[i] = x;
          // TODO 76 (profil autora): lista jak w oficjalnych wyszukiwarkach — 3 linijki, szczegóły po stuknięciu
          { var dk = detKey(x); if (!detOpen[dk]) return cancelWrap(x, ceOn() ? ceCompact(x, S, dk) : v2Compact(x, S, dk)); }
          var full = x.net ? v2NetCard(x.net, guardOk ? i : null, x) : v2TrainCard(x, guardOk ? i : null, S);
          return cancelWrap(x, '<div class="v2c-open" data-detk="' + esc(detKey(x)) + '"><button type="button" class="v2c-hide" data-det="' + esc(detKey(x)) + '">▴ ' + esc(T("gzm.v2cHide", null, "zwiń do listy")) + "</button>" + full + "</div>");
        }).join("") +
        ('<div style="display:flex;gap:8px;justify-content:space-between;margin:10px 2px">' +
          '<button type="button" class="btn-sm secondary" data-shift="' + (base - 60) + '">⏮ ' + esc(T("gzm.v3Earlier", null, "Wcześniejsze")) + "</button>" +
          '<button type="button" class="btn-sm secondary" data-shift="' + (Math.max.apply(null, out.map(function (x) { return x.start; })) + 1) + '">' + esc(T("gzm.v3Later", null, "Późniejsze połączenia")) + " ⏭</button></div>") +
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
            return plannerFetch(q).then(function (pl) {
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
    function netCard(jn, gi, x) {
      var gBtns = gi == null ? "" : '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="gz-btn sec" data-guard="' + gi + '">🛡️ ' + esc(T("gzm.cGuardAll", null, "Pilnuj całej podróży")) + "</button>" +
        (x ? remBtnHtml(x, gi) : "") + "</div>";
      if (tripExpandOn()) {
        var f0 = jn.legs.find(function (l) { return l.type === "ride"; }), k = jKey(jn), lv = jn.leave != null ? jn.leave : jn.legs[0].type === "walk" ? f0.dep - jn.legs[0].min : jn.dep;
        return '<div class="gz-dep ok" data-tripx="' + esc(k) + '" style="grid-template-columns:minmax(0,1fr) auto">' +
          '<div class="gz-main"><div class="gz-dir" style="white-space:normal">' + esc(T("gzm.cLeave", { t: C.fmt(lv), s: jn.legs[0].fromName }, "wyjdź: {t} z {s}")) + "</div>" +
          '<div class="gz-sub" style="margin:0 0 5px">' + esc(jn.transfers ? T("gzm.nTitle", { n: jn.transfers }, "komunikacja GZM · przesiadki: {n}") : T("gzm.nDirect", null, "komunikacja GZM · bez przesiadek")) + "</div>" +
          legsHtml(jn) + '<div class="gz-tap">' + esc(tripOpen[k] ? T("gzm.tHide", null, "▲ zwiń trasę") : T("gzm.tShow", null, "▼ trasa kursu i gdzie jest teraz")) + "</div>" + gBtns + "</div>" +
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
    // TODO 68: opóźnienie zapisywane też po POCIĄGU (numer + stacja wysiadki) — ten sam pociąg ma to samo opóźnienie
    // we wszystkich wariantach dojazdu (wcześniej wynik „przeskakiwał” między Załężem a Katowicami co minutę)
    function trKey(it) { var l = it && it.legs && it.legs[it.legs.length - 1]; return l && l.train && l.train.number ? "tr|" + l.train.number + "|" + ((l.alight && l.alight.stationName) || "") : null; }
    function delayOf(S, p, it) { var t = S.tDelay || {}, k2 = trKey(it); return t[cKey(p, it)] || (k2 && t[k2]) || null; }
    // Opóźnienie pociągu (ostatni odcinek) na stacji wysiadki — dla 2 pierwszych propozycji, co 60 s.
    // notatka 27.11 12:25: S1 40917 odwołany (PLK: X), a w wynikach „zdążysz” — sprawdzaliśmy tylko OSTATNI pociąg i tylko opóźnienie.
    // Teraz: każdy pociąg 3 pierwszych propozycji raz na wyszukiwanie (cState.tChk), odwołanie → cState.tCancel[numer].
    function trainCancelC() {
      if (!cState || !cState.shown || !window.GuardCore) return Promise.resolve();   // TODO 133: dla wszystkich od razu (27.11, Twoja decyzja)
      cState.tChk = cState.tChk || {}; cState.tCancel = cState.tCancel || {}; cState.tDet = cState.tDet || {}; cState.tLive = cState.tLive || {};
      // TODO 136 etap 5 (27.11): wszystkie pociągi 4 pierwszych propozycji (co najwyżej co 2 min) i ocena przesiadek jak w Pilnowanych
      var au = lvAuthor(), jobs = [], xs = cState.shown.filter(function (x) { return x.it && x.it.legs; }).slice(0, au ? 4 : 3);
      xs.forEach(function (x) {
        x.it.legs.forEach(function (l) {
          var num = l.train && l.train.number; if (!num || !l.orderId) return;
          if (cState.tChk[num] && (!au || Date.now() - cState.tChk[num] < 120000)) return;
          cState.tChk[num] = Date.now();
          var q = new URLSearchParams({ scheduleId: l.scheduleId || "", orderId: l.orderId, operatingDate: cState.date, train: num });
          jobs.push(fetch("/api/train-details?" + q, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
            if (!d) return;
            cState.tDet[num] = d;
            var rd = GuardCore.readLeg({ board: { stationName: l.board.stationName, time: l.board.time }, alight: { stationName: l.alight.stationName, time: l.alight.time } }, d);
            if (!rd.noData && rd.cancelled) cState.tCancel[num] = { likely: !!rd.cancelLikely, label: ((l.train.category || "") + " " + num).trim() };
          }).catch(function () {}));
        });
      });
      return jobs.length ? Promise.all(jobs).then(function () {
        xs.forEach(function (x) {
          var rs = x.it.legs.map(function (l) { return (l.train && cState.tDet[l.train.number]) || null; });
          if (rs.some(function (d) { return !d; })) return;
          try { cState.tLive[itKeyC(x)] = GuardCore.evaluate(GuardCore.fromItinerary(x.it, { date: cState.date }), rs, { minTransfer: 3, xfer2: true }); } catch (e) {}
        });
        renderC();
      }) : Promise.resolve();
    }
    function lvAuthor() { if (Date.now() >= Date.parse("2026-11-27T16:00:00+01:00")) return true; try { return localStorage.getItem("showVersionBadge") === "1"; } catch (e) { return false; } }   // etap 5: na razie profil autora
    function itKeyC(x) { return (x && x.it && x.it.legs || []).map(function (l) { return l.orderId || ""; }).join("|"); }
    // 'ok' | 'risk' | 'broken' | 'cancelled' | null — ta sama zasada co w wyszukiwarce kolejowej („cień szansy” = risk)
    function liveStateC(x) {
      if (cancelledOf(x).length) return "cancelled";
      var r = cState && cState.tLive && cState.tLive[itKeyC(x)]; if (!r) return null;
      if (r.status === "cancelled") return "cancelled";
      var ts = r.transfers || [];
      if (ts.some(function (t) { return t.status === "broken" && t.phase !== "held" && t.phase !== "heldTight"; })) return "broken";
      return ts.some(function (t) { return t.status === "risk" || (t.onlyThanksToB && !t.softB) || t.phase === "unconf" || t.phase === "stillRisk"; }) ? "risk" : "ok";
    }
    function altLineC(x) {
      // 27.11: każda propozycja z listy, która jeszcze nie odjechała (także wcześniejsza niż ta karta) — najwcześniej na miejscu
      var list = (cState && cState.shown) || [], best = null, fb = null, now = nowOn(cState.date);
      list.forEach(function (y) {
        if (y === x) return;
        var st0 = y.start != null ? y.start : y.dep; if (st0 != null && st0 < now) return;
        var sy = y.it ? liveStateC(y) : "ok";
        if (sy === "ok") { if (!best || y.final < best.final) best = y; }
        else if (sy !== "cancelled" && sy !== "broken") { if (!fb || y.final < fb.final) fb = y; }
      });
      var y2 = best || fb; if (!y2) return "";
      var nm = y2.it && y2.it.legs ? y2.it.legs.map(function (l) { return ((l.train && l.train.category) || "") + " " + ((l.train && l.train.number) || ""); }).join(" + ") : (y2.net ? y2.net.legs.filter(function (l) { return l.type === "ride"; }).map(function (l) { return l.line; }).join(" + ") : "");
      return '<div><button type="button" class="gz-btn sec cxl-go" data-cxlgo="' + esc(detKey(y2)) + '" style="margin:6px 0 2px">' + esc(T("gzm.cxlAlt", null, "➡️ Zamiast:") + " " + C.fmt(y2.start != null ? y2.start : y2.dep) + " → " + C.fmt(y2.final) + (nm ? " · " + nm.trim() : "")) + "</button></div>";
    }
    // 🟡/🔴 przesiadka między pociągami wątpliwa — ramka, opis z zapasem i opóźnieniem, „➡️ Zamiast”
    function riskWrap(x, html) {
      if (!lvAuthor()) return html;
      var st = liveStateC(x); if (st !== "risk" && st !== "broken") return html;
      cxlCss();
      var r = cState.tLive[itKeyC(x)], t = (r.transfers || [])[r.worst >= 0 ? r.worst : 0] || {}, sl = typeof t.slack === "number" ? t.slack - (t.need || 0) : null;
      var head = st === "broken" ? T("planer.liveBroken", { st: t.station || "", n: sl != null ? -sl : "?" }, "🔴 Przesiadka w {st} prawdopodobnie zerwana — brakuje {n} min").replace("{st}", t.station || "").replace("{n}", sl != null ? -sl : "?")
        : T("planer.liveRisk", { st: t.station || "", n: sl != null ? Math.max(0, sl) : "?" }, "🟡 Przesiadka w {st} niepewna — zapas {n} min").replace("{st}", t.station || "").replace("{n}", sl != null ? Math.max(0, sl) : "?");
      var why = t.delayA ? " (" + [t.trainA && t.trainA.category, t.trainA && t.trainA.number].filter(Boolean).join(" ") + " +" + t.delayA + " min)" : "";
      var line = '<div class="lv-t lv-' + st + '">' + esc(head + why) + altLineC(x) + "</div>";
      var m = String(html).match(/^s*<div[^>]*>/), cls = st === "broken" ? "x-lbroken" : "x-lrisk";
      if (!m) return '<div class="' + cls + '">' + line + html + "</div>";
      var tag = m[0].indexOf('class="') >= 0 ? m[0].replace(/class="/, 'class="' + cls + " ") : m[0].replace(/^(s*<div)/, '$1 class="' + cls + '"');
      return tag + line + String(html).slice(m[0].length);
    }
    function cancelledOf(x) {
      var t = cState && cState.tCancel; if (!t || !x || !x.it || !x.it.legs) return [];
      return x.it.legs.map(function (l) { return l.train && t[l.train.number]; }).filter(Boolean);
    }
    function cancelWrap(x, html) {
      var cx = cancelledOf(x); if (!cx.length) return riskWrap(x, html);
      var txt = cx.map(function (c) { return "⚫ " + c.label + " " + (c.likely ? T("gzm.cxlLikely", null, "prawdopodobnie odwołany") : T("gzm.cxlYes", null, "odwołany (wg PLK)")); }).join(" · ");
      // 27.11 (Twoja prośba): cała ramka karty czerwona, napis o odwołaniu W KARCIE nad godzinami, bez „🟢 zdążysz”
      cxlCss();
      // TODO 135: alternatywa w karcie — najbliższa propozycja z listy, która jedzie (stuknięcie przewija do niej)
      var alt = altLineC(x), list = [], at = -1;
      for (var j = at + 1; at >= 0 && j < list.length; j++) {
        var y = list[j]; if (cancelledOf(y).length || (y.start != null && x.start != null && y.start < x.start)) continue;
        var nm = y.it && y.it.legs ? y.it.legs.map(function (l) { return ((l.train && l.train.category) || "") + " " + ((l.train && l.train.number) || ""); }).join(" + ") : (y.net ? y.net.legs.filter(function (l) { return l.type === "ride"; }).map(function (l) { return l.line; }).join(" + ") : "");
        alt = '<div><button type="button" class="gz-btn sec cxl-go" data-cxlgo="' + esc(detKey(y)) + '" style="margin:6px 0 2px">' + esc(T("gzm.cxlAlt", null, "➡️ Zamiast:") + " " + C.fmt(y.start != null ? y.start : y.dep) + " → " + C.fmt(y.final) + (nm ? " · " + nm.trim() : "")) + "</button></div>";
        break;
      }
      var line = '<div class="cxl-t">' + esc(txt) + ' <span>— ' + esc(T("gzm.cxlHint", null, "to połączenie nie dojdzie do skutku")) + "</span>" + alt + "</div>";
      var m = String(html).match(/^\s*<div\b[^>]*>/);
      if (!m) return '<div class="x-cxl">' + line + html + "</div>";
      var tag = m[0].replace(/class="/, 'class="x-cxl ');
      if (tag.indexOf('class="') < 0) tag = tag.replace(/^(\s*<div)/, '$1 class="x-cxl"');
      return tag + line + String(html).slice(m[0].length);
    }
    root.addEventListener("click", function (e) {
      var b = e.target.closest(".cxl-go"); if (!b) return;
      e.stopPropagation();
      var k = b.getAttribute("data-cxlgo"), el = root.querySelector('[data-det="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"],[data-detk="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]');
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.style.outline = "3px solid #ffd400"; setTimeout(function () { el.style.outline = ""; }, 1800); }
    }, true);
    function cxlCss() {
      if (document.getElementById("cxl-css")) return;
      var s = document.createElement("style"); s.id = "cxl-css";
      s.textContent = ".x-cxl{border:2px solid #ff4d4d!important;border-left-width:6px!important;box-shadow:0 0 0 1px rgba(255,77,77,.35)!important;background-color:rgba(255,77,77,.07)!important}" +
        ".x-lrisk{border:2px solid #facc15!important;border-left-width:6px!important}.x-lbroken{border:2px solid #ff4d4d!important;border-left-width:6px!important;background-color:rgba(255,77,77,.06)!important}" +
        ".lv-t{font-weight:800;font-size:14px;margin:0 0 6px;line-height:1.35}.lv-risk{color:#facc15}.lv-broken{color:#ff6b6b}.x-lrisk .f-st,.x-lbroken .f-st,.x-lrisk .v2c-dur,.x-lbroken .v2c-dur{display:none!important}" +
        ".x-cxl .cxl-t{color:#ff6b6b;font-weight:800;font-size:14.5px;margin:0 0 6px;line-height:1.35}.x-cxl .cxl-t span{font-weight:400;color:#fca5a5}" +
        ".x-cxl>*:not(.cxl-t){opacity:.6}.x-cxl .f-st,.x-cxl .v2c-dur{display:none!important}";
      document.head.appendChild(s);
    }
    function trainLiveC() {
      if (!cState || !cState.shown || !window.GuardCore) return Promise.resolve();
      trainCancelC();
      return Promise.all(cState.shown.filter(function (x) { return x.it && x.it.legs; }).slice(0, 2).map(function (x) {
        var l = x.it.legs && x.it.legs[x.it.legs.length - 1]; if (!l || !l.orderId) return null;
        var q = new URLSearchParams({ scheduleId: l.scheduleId || "", orderId: l.orderId, operatingDate: cState.date, train: (l.train && l.train.number) || "" });
        return fetch("/api/train-details?" + q, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
          if (!d) return;
          var rd = GuardCore.readLeg({ board: { stationName: l.board.stationName, time: l.board.time }, alight: { stationName: l.alight.stationName, time: l.alight.time } }, d);
          if (!rd.noData) { var dv = { d: Number(rd.delayArr) || 0, src: rd.arrSource, arrived: rd.arrived }, k2 = trKey(x.it); cState.tDelay[cKey(x.p, x.it)] = dv; if (k2) cState.tDelay[k2] = dv; }
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
          var tl = delayOf(S, p, it), tDelay = tl ? tl.d : 0;
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
      if (!out.length) { res.innerHTML = '<div class="gz-empty">' + esc(T("gzm.cNone", null, "Nie udało się ułożyć podróży w ciągu 2 godzin od wyjścia.")) + "</div>" + noResModes(); return; }
      var guardOk = !!(window.GuardStore && window.GuardCore && GuardStore.enabled && GuardStore.enabled());
      cState.shown = out;   // TODO 136: przed rysowaniem — karty widzą sąsiadów („➡️ Zamiast”)
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
          return accList + cancelWrap(x, '<div class="gz-dep ' + worst + '" style="grid-template-columns:minmax(0,1fr) auto">' +
            '<div class="gz-main">' + (L ? '<div class="gz-dir" style="white-space:normal">⏰ ' + esc(T("gzm.cLeave", { t: C.fmt(L.dep), s: L.from }, "wyjdź: {t} z {s}")) + "</div>" : '<div class="gz-dir" style="white-space:normal">🚆 ' + esc(T("gzm.cTrainAt", { t: it.departureTime, s: x.p.cb.a.st.n }, "pociąg {t} z {s}")) + "</div>") +
            steps.map(function (h) { return '<div class="gz-stop" style="white-space:normal;margin-top:4px">' + h + "</div>"; }).join("") +
            (guardOk ? '<div style="margin-top:8px"><button type="button" class="gz-btn sec" data-guard="' + i + '">🛡️ ' + esc(T("gzm.cGuard", null, "Pilnuj pociągów tej podróży")) + "</button></div>" : "") +
            "</div>" +
            '<div class="gz-right"><div class="gz-t">' + C.fmt(x.final) + '</div><div class="gz-in">' + esc(T("gzm.bArrive", null, "na miejscu")) + "</div></div></div>") + list;   // TODO 134: odwołany pociąg — czerwona ramka (zapasowy widok)
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
          board: { stationName: l.fromName, time: C.fmt(l.depPlan), code: cState && cState.net ? String(cState.net.j.stops[l.from][3] || "") : undefined }, alight: { stationName: l.toName, time: C.fmt(l.arr - (l.delay || 0)), code: cState && cState.net ? String(cState.net.j.stops[l.to][3] || "") : undefined }, walkBefore: walk || null });
        walk = 0;
      });
      return out;
    }
    // Połączenie do pilnowania z karty wyniku (pociąg z dojazdami albo sama komunikacja GZM).
    function connOf(x) {
      var S = cState;
      if (x.net) {
        var gl = gzmLegs(x.net, 0); if (!gl.length) return null;
        return { id: GuardCore.connectionId(S.date, gl), date: S.date, from: gl[0].board.stationName, to: gl[gl.length - 1].alight.stationName, legs: gl, source: "multimodal", createdAt: new Date().toISOString() };
      }
      if (S.mm && x.c) return wholeConn(x);
      var q = x.p.query || { from: x.p.cb.a.st.n, to: x.p.cb.e.st.n, date: S.date };
      if (!q.date) q.date = S.date;
      return GuardCore.fromItinerary(x.it, q);
    }
    // dojście z domu/miejsca do pierwszego przystanku lub stacji (dla przypomnienia)
    function leaveWalk(x, conn) {
      if (x.c && x.c.walkA) return x.c.walkA.min;
      var w = conn && conn.legs[0] && conn.legs[0].walkBefore;
      return w != null ? w : null;
    }
    // ⏰ Przypomnij o wyjściu: do 🛡️ Pilnowanych z włączonym przypomnieniem (30 i 15 min przed wyjściem)
    // przycisk ⏰ — z godzinami, gdy przypomnienie dla tej podróży już jest
    function remBtnHtml(x, i) {
      var lab = "⏰ " + esc(T("gzm.remBtn", null, "Przypomnij o wyjściu")), dis = "";
      try {
        if (window.GuardStore && GuardStore.reminder) {
          var cn = connOf(x), cfg = cn && GuardStore.reminder(cn.id);
          if (cfg && cfg.on) { var p = GuardCore.remindPlan(cn, cfg, 0); lab = "⏰ " + esc(T("gzm.remSet", { t: p.fires.map(function (q) { return C.fmt(q.at); }).join(", ") }, "Przypomnę: {t}")); dis = " disabled"; }
        }
      } catch (e) {}
      return '<button type="button" class="gz-btn sec" data-remind="' + i + '"' + dis + ">" + lab + "</button>";
    }
    function remindTrip(btn) {
      var x = cState && cState.shown && cState.shown[+btn.dataset.remind];
      if (!x || !window.GuardStore || !window.GuardCore || !GuardStore.setReminder) return;
      var conn = connOf(x); if (!conn) return;
      var w = leaveWalk(x, conn), cfg = { on: true, walk: w != null ? w : GuardCore.REM_DEFAULTS.walk, mins: GuardCore.REM_DEFAULTS.mins.slice(), date: conn.date };
      btn.disabled = true;
      var have = GuardStore.manual().some(function (c) { return c.id === conn.id; });
      (have ? Promise.resolve() : GuardStore.add(conn)).then(function () { return GuardStore.setReminder(conn.id, cfg); }).then(function () {
        var p = GuardCore.remindPlan(conn, cfg, 0);
        btn.textContent = "⏰ " + T("gzm.remSet", { t: p ? p.fires.map(function (f) { return C.fmt(f.at); }).join(", ") : "" }, "Przypomnę: {t}");
      });
    }
    function wholeConn(x) {
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
      if (c.walkA && legs[0] && legs[0].walkBefore == null) legs[0].walkBefore = c.walkA.min;
      return { id: GuardCore.connectionId(S.date, legs), date: S.date, from: legs[0].board.stationName, to: legs[legs.length - 1].alight.stationName, legs: legs, source: "multimodal", createdAt: new Date().toISOString() };
    }
    function guardWhole(x, btn) {
      var conn = wholeConn(x);
      btn.disabled = true;
      GuardStore.add(conn).then(function () { btn.textContent = "🛡️ " + T("gzm.cGuarded", null, "Pilnowane"); });
    }
    function guardTrip(btn) {
      var x = cState && cState.shown && cState.shown[+btn.dataset.guard];
      if (!x || !window.GuardStore || !window.GuardCore) return;
      if (x.net) { var cn = connOf(x); if (!cn) return; btn.disabled = true; GuardStore.add(cn).then(function () { btn.textContent = "🛡️ " + T("gzm.cGuarded", null, "Pilnowane"); }); return; }
      if (cState.mm && x.c) return guardWhole(x, btn);
      var q = x.p.query || { from: x.p.cb.a.st.n, to: x.p.cb.e.st.n, date: cState.date };
      if (!q.date) q.date = cState.date;
      btn.disabled = true;
      GuardStore.add(GuardCore.fromItinerary(x.it, q)).then(function () { btn.textContent = "🛡️ " + T("gzm.cGuarded", null, "Pilnowane"); });
    }

    var ready = (window.I18n ? I18n.ready : Promise.resolve()).then(getIndex).then(function () { shell(); initModes(); load1(); }).catch(function () {
      root.innerHTML = '<div class="gz-empty">' + esc(T("gzm.noIndex", null, "Dane GZM są chwilowo niedostępne.")) + "</div>";
    });

    // ===== TODO 136 etap 2 (27.11): alternatywa „samą komunikacją miejską” dla wyszukiwarki kolejowej.
    // Ze stacji A do stacji B od depMin (min od północy), dane na żywo ZTM (gzm-rt) — jak w Pociąg + GZM. Bez zapytań do PLK.
    function altJourney(fromName, toName, depMin, date) {
      if (!window.GzmRaptor) return Promise.resolve(null);
      return Promise.all([getIndex(), getNet(date), getRt()]).then(function (r) {
        var ix = r[0], net = r[1];
        if (!net._codeIx) { var m = {}; net.j.stops.forEach(function (s, i) { m[s[3]] = i; }); net._codeIx = m; }
        var find = function (n) { return (ix.stations || []).find(function (x) { return normName(x.n) === normName(n); }); };
        var stops = function (stn) {
          var out = [];
          (stn.s || []).forEach(function (p) { var i = net._codeIx[p[0]]; if (i == null) return; out.push({ s: i, walk: poleWalk(p).min }); });
          if (!out.length) farStops(net, stn).list.forEach(function (o) { o.idx.forEach(function (i) { out.push({ s: i, walk: walkMin(havM(stn.lat, stn.lon, net.lat[i], net.lon[i])) + 2 }); }); });
          return out;
        };
        var A = find(fromName), B = find(toName); if (!A || !B) return null;
        var fa = stops(A), fb = stops(B); if (!fa.length || !fb.length) return null;
        var js = GzmRaptor.search(net, { fromStops: fa.map(function (x) { return { s: x.s, t: depMin + x.walk }; }), toStops: fb.map(function (x) { return { s: x.s, walk: x.walk }; }), dep: depMin, rt: rt, maxTransfers: 2, count: 4 });
        if (!js || !js.length) return null;
        var fin = function (j) { return j.arrTotal != null ? j.arrTotal : j.arr; };
        var best = js.slice().sort(function (a, b) { return fin(a) - fin(b); })[0];
        var rides = best.legs.filter(function (l) { return l.type === "ride"; }); if (!rides.length) return null;
        var w0 = best.legs[0].type === "walk" ? best.legs[0].min : (fa.find(function (x) { return x.s === rides[0].from; }) || {}).walk || 0;
        var live = rides.some(function (l) { return l.live; }), dl = Math.max.apply(null, rides.map(function (l) { return l.live ? (l.delay || 0) : 0; }));
        return { leave: rides[0].dep - w0, dep: rides[0].dep, arr: fin(best), lines: rides.map(function (l) { return l.line; }), live: !!(live && rtOk), delay: dl, transfers: rides.length - 1, from: A.n, to: B.n };
      }).catch(function () { return null; });
    }
    // TODO 136 etap 4: GZM jako pierwszy dostawca „komunikacji miejskiej” (city-transit.js)
    if (window.CityTransit) CityTransit.register({ id: "gzm", label: "GZM",
      covers: function (name) { return getIndex().then(function (ix) { var st = (ix.stations || []).find(function (x) { return normName(x.n) === normName(name); }); return !!st; }); },
      altJourney: altJourney });
    return {
      altJourney: altJourney,
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
