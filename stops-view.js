// TODO 103 (25.11): stacje pociągu w rozwinięciach (wyszukiwarka kolejowa „Trasa”, Pociąg + GZM, Pilnowane) w tym samym wyglądzie
// co strona „Bieg pociągu”: godzina planowa przekreślona + rzeczywista w nawiasie, opóźnienie, plakietka stanu, peron i tor,
// przyciski 🚏 / 🏁 (dzienniczek — otwierają „Bieg pociągu” z zaznaczoną stacją) i 🚌 (przesiadki GZM ze stacji).
// Użycie: StopsView.html(route, bi, ai, { leg, date, key, onReady }) — route jak z /api/train-details, leg = odcinek planera ({train, board, alight, scheduleId, orderId}).
(function () {
  "use strict";
  var CSS = ".sv{margin:4px 0 6px}.sv .rrow{display:grid;grid-template-columns:70px 40px 1fr 56px;gap:6px;align-items:center;padding:8px 6px;border-bottom:1px solid rgba(255,255,255,.10)}" +
    ".sv .rrow:last-child{border-bottom:0}.sv .rrow.current{background:rgba(255,204,0,.13);outline:1px solid rgba(255,204,0,.35);border-radius:8px}.sv .rrow.next{background:rgba(34,211,238,.10);border-radius:8px}" +
    ".sv .rrow.info{background:rgba(255,204,0,.055);border-radius:8px}.sv .rrow.future{opacity:.82}.sv .rrow.mine{box-shadow:inset 3px 0 0 #3b82f6}" +
    ".sv .time{font-size:16px;font-weight:900}.sv .time-rows{display:flex;flex-direction:column;gap:6px}.sv .plan-small{font-size:12px;color:#8b95a1;line-height:1.1}.sv .plan-strike{text-decoration:line-through}" +
    ".sv .time.future{color:#cbd5e1}.sv .time.ok{color:#5dd39e}.sv .time.delay-low{color:#ffcc00}.sv .time.delay-mid{color:#ff4d4d}.sv .time.delay-high{color:#c084fc}" +
    ".sv .delay-cell,.sv .platform-cell{text-align:center}.sv .station-cell{display:flex;flex-direction:column;gap:3px;min-width:0}.sv .station-name{font-size:15px;font-weight:900;line-height:1.2}" +
    ".sv .badge{display:inline-block;width:fit-content;border-radius:999px;padding:2px 6px;font-size:10px;font-weight:800;white-space:nowrap}.sv .badge.passed{background:#14532d;color:#bbf7d0}.sv .badge.current{background:#ffcc00;color:#102027}" +
    ".sv .badge.next{background:#0ea5e9;color:#fff}.sv .badge.future{background:#334155;color:#e5e7eb}.sv .badge.info{background:#5b4b1f;color:#ffe8a3}" +
    ".sv .plat-num{font-size:17px;font-weight:800;line-height:1}.sv .plat-track{font-size:10px;color:#9fb0c2;margin-top:2px}" +
    ".sv .mark-btns{display:flex;gap:4px;margin-top:4px}.sv .mark-btn{border:1.5px solid #8fa6bf;background:rgba(255,255,255,.08);border-radius:7px;padding:4px 7px;font-size:15px;line-height:1.2;text-decoration:none;color:inherit;display:inline-flex}" +
    ".sv .mark-btn.gzm{background:#7a1f2b;border-color:#a33}.sv details>summary{cursor:pointer;color:#9fb0c2;font-size:13px;padding:6px 4px}";
  function css() { if (document.getElementById("sv-css")) return; var st = document.createElement("style"); st.id = "sv-css"; st.textContent = CSS; document.head.appendChild(st); }
  function T(k, p, d) { try { if (window.I18n) { var v = I18n.t(k, p); if (v && v !== k) return v; } } catch (e) {} return d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function sh(t) { var m = /(\d{1,2}):(\d{2})/.exec(String(t || "")); return m ? (m[1].length < 2 ? "0" : "") + m[1] + ":" + m[2] : ""; }
  function toMin(t) { var m = /(\d{1,2}):(\d{2})/.exec(String(t || "")); return m ? +m[1] * 60 + +m[2] : null; }
  function nowW() { var p = new Date().toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hour12: false }).split(":"); return +p[0] * 60 + +p[1]; }
  function today() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" }); }
  function dClass(d) { return d >= 20 ? "high" : d > 10 ? "mid" : d > 0 ? "low" : "zero"; }
  function timeRow(real, planned, delay, state) {
    planned = sh(planned); real = sh(real); if (!planned) return "";
    var d = Math.max(0, Number(delay) || 0);
    if (!(real && real !== planned && d > 0)) return '<div class="time ' + (state === "future" ? "future" : "ok") + '">' + esc(planned) + "</div>";
    return '<div class="plan-small plan-strike">' + esc(planned) + '</div><div class="time delay-' + dClass(d) + '">(' + esc(real) + ")</div>";
  }
  function timeCell(s, state) {
    var conf = s.status === "confirmed";
    var arr = conf ? timeRow(s.actualArrival, s.plannedArrival, s.arrivalDelay, state) : timeRow(s.forecastArrival, s.plannedArrival, s.forecastArrivalDelay, state);
    var dep = conf ? timeRow(s.actualDeparture, s.plannedDeparture, s.departureDelay, state) : timeRow(s.forecastDeparture, s.plannedDeparture, s.forecastDepartureDelay, state);
    if (arr || dep) return '<div class="time-rows">' + (arr ? "<div>" + arr + "</div>" : "") + (dep ? "<div>" + dep + "</div>" : "") + "</div>";
    return '<div class="time-rows"><div>' + timeRow(conf ? s.actualTime : "", s.plannedTime, s.delay, state) + "</div></div>";
  }
  function dCell(d) { var n = Math.max(0, Number(d) || 0); return n > 0 ? '<div><div class="plan-small" style="visibility:hidden">00:00</div><div class="time delay-' + dClass(n) + '">+' + n + "</div></div>" : '<div><div class="time" style="visibility:hidden">0</div></div>'; }
  function delayCell(s) {
    var conf = s.status === "confirmed", ad = conf ? s.arrivalDelay : s.forecastArrivalDelay, dd = conf ? s.departureDelay : s.forecastDepartureDelay;
    if (s.plannedArrival || s.plannedDeparture) return '<div class="time-rows">' + (s.plannedArrival ? dCell(ad) : "") + (s.plannedDeparture ? dCell(dd) : "") + "</div>";
    return '<div class="time-rows">' + dCell(conf ? s.delay : 0) + "</div>";
  }
  var gzmIx = null, gzmP = null;
  function gzmIndex(cb) {
    if (gzmIx) return gzmIx;
    if (!gzmP) gzmP = fetch("/api/gzm-data/index.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (ix) {
      var by = {}; ((ix && ix.stations) || []).forEach(function (x) { if ((x.s && x.s.length) || (x.far && x.far.length)) by[String(x.n).trim().toLowerCase()] = x.id; });
      gzmIx = by; if (cb) cb(); return by;
    });
    return null;
  }
  // adres „Biegu pociągu” (jak w Pilnowanych); mb/ma = stacje do zaznaczenia w dzienniczku
  function trainUrl(l, date) {
    var p = new URLSearchParams(); p.set("train", (l.train && l.train.number) || "");
    if (l.train && l.train.category) p.set("category", l.train.category);
    if (l.train && l.train.name) p.set("name", l.train.name);
    if (l.alight) p.set("destination", l.alight.stationName);
    if (date) p.set("date", date);
    if (l.scheduleId) { p.set("scheduleId", l.scheduleId); p.set("scheduledId", l.scheduleId); }
    if (l.orderId) p.set("orderId", l.orderId);
    if (l.trainOrderId) p.set("trainOrderId", l.trainOrderId);
    if (l.board && l.board.stationId) p.set("stationId", l.board.stationId);
    if (l.board) p.set("station", l.board.stationName);
    return "/train?" + p.toString();
  }
  // otwarte „wcześniejsze / dalsze stacje” przetrwają odświeżenie karty
  var openMk = {};
  document.addEventListener("toggle", function (e) { var d = e.target; if (d && d.getAttribute && d.getAttribute("data-svk")) { if (d.open) openMk[d.getAttribute("data-svk")] = 1; else delete openMk[d.getAttribute("data-svk")]; } }, true);
  function html(route, bi, ai, o) {
    css(); o = o || {};
    route = Array.isArray(route) ? route : []; if (!route.length) return "";
    var ix = gzmIndex(o.onReady);
    var passedIdx = -1; route.forEach(function (s, i) { if (s.status === "confirmed") passedIdx = i; });
    var isToday = !o.date || o.date === today(), nm = nowW();
    var leg = o.leg || {}, url = function (b, a) { var u = o.leg ? trainUrl(o.leg, o.date) : String(o.trainUrl || ""); if (!u) return ""; return u + (u.indexOf("?") >= 0 ? "&" : "?") + "mb=" + encodeURIComponent(b) + "&ma=" + encodeURIComponent(a); };
    var boardName = bi >= 0 ? route[bi].stationName : "", alightName = ai >= 0 ? route[ai].stationName : "";
    var row = function (s, i) {
      var state = "future", txt = T("train.bBefore", null, "przed"), badge = "future";
      if (s.status === "confirmed") { state = i === passedIdx ? "current" : "passed"; txt = i === passedIdx ? T("train.bLast", null, "ostatnia") : T("train.bPassed", null, "zaliczona"); badge = state; }
      else if (passedIdx >= 0 && i < passedIdx) { state = "passed"; txt = T("train.bPassedNoConf", null, "minięta"); badge = "info"; }
      else {
        var t = toMin(s.actualTime || s.plannedDeparture || s.plannedArrival || s.plannedTime);
        if (!isToday || (t != null && t >= nm)) { if (i === passedIdx + 1) { state = "next"; txt = T("train.bNext", null, "następna"); badge = "next"; } }
        else { state = "info"; txt = T("train.bNoInfo", null, "brak info z API"); badge = "info"; }
      }
      var hasP = s.platform && s.platform !== "-", hasT = s.track && s.track !== "-";
      var gid = ix && i > 0 ? ix[String(s.stationName).trim().toLowerCase()] : null, gzm = "";
      if (gid) {
        var p = new URLSearchParams({ gzm: String(gid), arr: sh(s.plannedArrival || s.plannedTime || s.plannedDeparture), date: o.date || "", orderId: leg.orderId || "", scheduleId: leg.scheduleId || "", train: (leg.train && leg.train.number) || "", from: route[0].stationName || "" });
        gzm = '<a class="mark-btn gzm" href="/planer/?' + p.toString() + '" title="' + esc(T("train.gzmTitle", null, "Przesiadki GZM")) + '">🚌</a>';
      }
      var mb = url(s.stationName, i < ai ? alightName : (route[route.length - 1] || {}).stationName), ma = url(i > bi ? boardName : route[0].stationName, s.stationName);
      var btns = '<div class="mark-btns">' + (mb ? '<a class="mark-btn" href="' + esc(mb) + '" title="' + esc(T("train.boardHere", null, "Tu wsiadam")) + '">🚏</a>' : "") +
        (ma ? '<a class="mark-btn" href="' + esc(ma) + '" title="' + esc(T("train.alightHere", null, "Tu wysiadam")) + '">🏁</a>' : "") + gzm + "</div>";
      return '<div class="rrow ' + state + (i >= bi && i <= ai ? " mine" : "") + '"><div class="time-cell">' + timeCell(s, state === "future" || state === "next" ? "future" : state) + '</div><div class="delay-cell">' + delayCell(s) + "</div>" +
        '<div class="station-cell"><span class="badge ' + badge + '">' + esc(txt) + '</span><div class="station-name">' + esc(s.stationName) + "</div>" + btns + "</div>" +
        '<div class="platform-cell"><div class="plat-num">' + (hasP ? esc(s.platform) : "—") + "</div>" + (hasT ? '<div class="plat-track">' + esc(T("train.track", { track: s.track }, "tor " + s.track)) + "</div>" : "") + "</div></div>";
    };
    var rows = route.map(row);
    if (bi < 0 || ai < 0 || ai <= bi) return '<div class="sv">' + rows.join("") + "</div>";
    var fold = function (part, txt, side) { var mk = (o.key || "") + "|" + side; return part.length ? "<details data-svk=\"" + esc(mk) + "\"" + (openMk[mk] ? " open" : "") + "><summary>" + esc(txt) + "</summary>" + part.join("") + "</details>" : ""; };
    return '<div class="sv">' + fold(rows.slice(0, bi), T("train.foldBefore", { n: bi }, "▸ wcześniejsze stacje (" + bi + ")"), "b") + rows.slice(bi, ai + 1).join("") +
      fold(rows.slice(ai + 1), T("train.foldAfter", { n: route.length - 1 - ai }, "▸ dalsze stacje (" + (route.length - 1 - ai) + ")"), "a") + "</div>";
  }
  window.StopsView = { html: html, trainUrl: trainUrl, ready: function () { gzmIndex(); return gzmP; } };
})();
