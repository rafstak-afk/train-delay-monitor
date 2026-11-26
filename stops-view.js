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
    ".sv .mark-btn.gzm{background:#7a1f2b;border-color:#a33}.sv details>summary{cursor:pointer;color:#9fb0c2;font-size:13px;padding:6px 4px;list-style:none}.sv details>summary::-webkit-details-marker{display:none}" +
    // notatka 25.11 (telefon, Pociąg + GZM): w wąskiej karcie 4 kolumny nachodziły na siebie — 3 kolumny, opóźnienie widać po godzinie w nawiasie
    ".sv{container-type:inline-size}@container (max-width:440px){.sv .rrow{grid-template-columns:58px minmax(0,1fr) 34px;gap:6px;padding:7px 4px}.sv .delay-cell{display:none}.sv .time{font-size:14px}.sv .plan-small{font-size:11px}" +
    ".sv .station-name{font-size:14px;overflow-wrap:anywhere}.sv .plat-num{font-size:15px}.sv .plat-track{font-size:9.5px}.sv .mark-btn{padding:3px 6px;font-size:14px}}";
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
  // prośba 25.11: po rozwinięciu „Trasy” / „szczegółów” ekran staje na pierwszym pociągu (pod przyklejonym paskiem zakładek), bez przewijania
  function scrollTo(el) {
    if (!el || !el.getBoundingClientRect) return;
    var bar = document.querySelector(".ptabs"), off = (bar ? bar.getBoundingClientRect().height : 0) + 8;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - off), behavior: "smooth" });
  }
  // ===== TODO 113 (26.11): przesiadka jako jedna odpowiedź — „Katowice · 46 min zapasu” / „Chorzów Batory · 14 min za mało”.
  // Wspólne dla Pilnowanych, wyszukiwarki kolejowej i Pociąg + GZM. Wyliczenia (plan, potrzebny czas, zmiana peronu) — w „szczegóły”.
  // o: { station, status: ok|risk|edge|broken|nodata|cancelled, slack, need, arr, arrPlan, dep, depPlan, platA, platB, walkTo,
  //      icon (html obok nazwy, np. 🗺️), notes (html pod spodem: ostrzeżenia), details: [teksty], key }
  var XCSS = ".xv{background:#16212d;border:1px solid #2b3b4f;border-radius:12px;padding:10px 12px;margin:8px 0}.xv-h{display:flex;align-items:center;justify-content:space-between;gap:8px}" +
    ".xv-st{font-weight:800;font-size:15px;min-width:0}.xv-b{flex:none;border-radius:999px;padding:3px 10px;font-size:13px;font-weight:800;white-space:nowrap}" +
    ".xv-ok .xv-b{background:rgba(34,197,94,.16);color:#4ade80}.xv-risk .xv-b{background:rgba(250,204,21,.16);color:#facc15}.xv-edge .xv-b,.xv-broken .xv-b{background:rgba(255,77,77,.18);color:#ff6b6b}" +
    ".xv-nodata .xv-b{background:#334155;color:#cbd5e1}.xv-cancelled .xv-b{background:#000;color:#fff;border:1px solid #555}.xv-broken{border-color:rgba(255,77,77,.45)}.xv-edge .xv-b{animation:xvb 1.2s ease-in-out infinite}" +
    "@keyframes xvb{50%{opacity:.45}}.xv-l{margin-top:5px;font-size:14px;color:#dbe5f1}.xv-l .late{color:#facc15;font-weight:700}.xv-p{margin-top:3px;font-size:13.5px;color:#9fb0c2}" +
    ".xv details{margin-top:6px}.xv summary{cursor:pointer;color:#8ea3ba;font-size:12.5px;list-style:none}.xv summary.xv-warn{color:#ff6b6b;font-weight:700}.xv summary::-webkit-details-marker{display:none}.xv .xv-d{font-size:12.5px;color:#9fb0c2;margin-top:4px;line-height:1.45}";
  function xcss() { if (document.getElementById("xv-css")) return; var st = document.createElement("style"); st.id = "xv-css"; st.textContent = XCSS; document.head.appendChild(st); }
  function xfer(o) {
    xcss(); o = o || {};
    var s = o.status || "ok", n = Number(o.slack), b;
    if (s === "nodata") b = T("xfer.noData", null, "brak danych");
    else if (s === "cancelled") b = T("xfer.cancelled", null, "pociąg odwołany");
    else if (!isFinite(n)) b = "";
    else if (n < 0) b = T("xfer.short", { n: -n }, "{n} min za mało").replace("{n}", -n);
    else if (s === "broken") b = T("xfer.tooLittle", { n: n }, "tylko {n} min — za mało").replace("{n}", n);
    else if (s === "edge") b = T("xfer.edge", { n: n }, "{n} min — na granicy").replace("{n}", n);
    else if (s === "risk") b = T("xfer.tight", { n: n }, "{n} min zapasu — na styk").replace("{n}", n);
    else b = T("xfer.spare", { n: n }, "{n} min zapasu").replace("{n}", n);
    var tm = function (real, plan) { real = sh(real); plan = sh(plan); if (!real) return esc(plan); return real !== plan && plan ? '<span class="late">' + esc(real) + "</span>" : esc(real); };
    var line = (o.arr || o.arrPlan) && (o.dep || o.depPlan) ? '<div class="xv-l">' + T("xfer.times", { a: "\u0001", b: "\u0002" }, "Przyjazd \u0001 → odjazd \u0002").replace("\u0001", tm(o.arr, o.arrPlan)).replace("\u0002", tm(o.dep, o.depPlan)) + "</div>" : "";
    var plat = o.platA && o.platB && String(o.platA) !== String(o.platB) ? '<div class="xv-p">' + esc(T("xfer.plat", { a: o.platA, b: o.platB }, "Peron {a} → {b}").replace("{a}", o.platA).replace("{b}", o.platB)) + "</div>" : "";
    var walk = o.walkTo ? '<div class="xv-p">' + esc(T("xfer.walk", { a: o.station, b: o.walkTo }, "Przejście: {a} → {b}").replace("{a}", o.station).replace("{b}", o.walkTo)) + "</div>" : "";
    var det = (o.details || []).filter(Boolean);
    var dk = o.key ? ' data-svk="' + esc("x|" + o.key) + '"' + (openMk["x|" + o.key] ? " open" : "") : "";
    // notatka 26.11 9:46: na wierzchu tylko stacja + odpowiedź, przyjazd → odjazd, peron; reszta (przejście, „czy poczeka”, ostrzeżenia, wyliczenia) w „szczegóły”,
    // a „▸ szczegóły” na czerwono, gdy coś odbiega od normy (opóźnienie, zagrożenie, ostrzeżenie) — przy punktualnej przesiadce szare
    var late = (sh(o.arr) && sh(o.arrPlan) && sh(o.arr) !== sh(o.arrPlan)) || (sh(o.dep) && sh(o.depPlan) && sh(o.dep) !== sh(o.depPlan));
    var warn = s !== "ok" || late || !!o.notes;
    var body = walk + (o.info || "") + (o.notes || "") +   // info = neutralne (np. przejście pieszo), notes = ostrzeżenia
       (det.length ? '<div class="xv-d">' + det.map(esc).join("<br>") + "</div>" : "");
    return '<div class="xv xv-' + esc(s) + '"><div class="xv-h"><span class="xv-st">' + esc(o.station || "") + (o.icon || "") + "</span>" + (b ? '<span class="xv-b">' + esc(b) + "</span>" : "") + "</div>" +
      line + plat +
      (body ? "<details" + dk + "><summary" + (warn ? ' class="xv-warn"' : "") + ">▸ " + esc(T("xfer.details", null, "szczegóły")) + "</summary>" + body + "</details>" : "") + "</div>";
  }
  // ===== 26.11 wariant A: odcinek podróży — numer pociągu nad wszystkim, linia odjazdu i linia przyjazdu;
  // odpowiedź o przesiadce w linii przyjazdu na stację przesiadki; reszta w „▸ szczegóły” (czerwone przy odchyleniach).
  // o: { icon, label (html), dir, tag (html obok numeru), attrs (atrybuty bloku), dep: {time, plan, station, plat}, arr: {time, plan, station, plat, platNext},
  //      xfer: {status, slack} | null, details (html), warn, key, after (html pod blokiem, np. rozwinięte stacje) }
  var LCSS = ".jl{padding:8px 0 6px}.jl+.jl{border-top:1px solid #2b3b4f}.jl-h{font-weight:800;font-size:15.5px;margin:0 0 4px;display:flex;flex-wrap:wrap;align-items:baseline;gap:6px}" +
    ".jl-h .jl-d{font-weight:400;color:#9fb0c2;font-size:14px}.jl-h a{color:inherit;text-decoration:underline;text-decoration-color:#4b6584;text-underline-offset:3px}" +
    ".jl-r{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:8px;align-items:center;padding:3px 0}.jl-t{font-weight:900;font-size:16px;line-height:1.1}" +
    ".jl-t s{display:block;font-size:11.5px;color:#8b95a1;font-weight:400}.jl-t .late{color:#facc15}.jl-s{font-size:15px;font-weight:700;min-width:0;overflow-wrap:break-word;hyphens:manual}" +
    ".jl-s small{display:block;font-weight:400;color:#9fb0c2;font-size:12.5px}.jl .xv-b{display:inline-block;border-radius:12px;padding:3px 9px;font-size:12.5px;font-weight:800;white-space:normal;text-align:center;max-width:120px;line-height:1.25}" +
    ".jl-ok .xv-b{background:rgba(34,197,94,.16);color:#4ade80}.jl-risk .xv-b{background:rgba(250,204,21,.16);color:#facc15}.jl-edge .xv-b,.jl-broken .xv-b{background:rgba(255,77,77,.18);color:#ff6b6b}" +
    ".jl-edge .xv-b{animation:xvb 1.2s ease-in-out infinite}.jl-nodata .xv-b{background:#334155;color:#cbd5e1}.jl-cancelled .xv-b{background:#000;color:#fff;border:1px solid #555}" +
    ".jl details{margin-top:2px}.jl summary{cursor:pointer;color:#8ea3ba;font-size:12.5px;list-style:none;padding:2px 0}.jl summary::-webkit-details-marker{display:none}.jl summary.xv-warn{color:#ff6b6b;font-weight:700}" +
    ".jl .jl-det{font-size:12.5px;color:#9fb0c2;line-height:1.45;margin-top:2px}.jl-dots::after{content:'';animation:jldots 1.2s steps(4) infinite}" +
    "@keyframes jldots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}";
  function lcss() { xcss(); if (document.getElementById("jl-css")) return; var st = document.createElement("style"); st.id = "jl-css"; st.textContent = LCSS; document.head.appendChild(st); }
  function xBadge(x) {
    if (!x) return "";
    var s = x.status || "ok", n = Number(x.slack), b;
    if (s === "nodata") b = T("xfer.noData", null, "brak danych");
    else if (s === "cancelled") b = T("xfer.cancelled", null, "pociąg odwołany");
    else if (!isFinite(n)) return "";
    else if (n < 0) b = T("xfer.short", { n: -n }, "{n} min za mało").replace("{n}", -n);
    else if (s === "broken") b = T("xfer.tooLittle", { n: n }, "tylko {n} min — za mało").replace("{n}", n);
    else if (s === "edge") b = T("xfer.edge", { n: n }, "{n} min — na granicy").replace("{n}", n);
    else if (s === "risk") b = T("xfer.tight", { n: n }, "{n} min zapasu — na styk").replace("{n}", n);
    else b = T("xfer.spare", { n: n }, "{n} min zapasu").replace("{n}", n);
    return '<span class="xv-b">' + esc(b) + "</span>";
  }
  function legA(o) {
    lcss(); o = o || {};
    var tcell = function (p) { var r = sh(p.time), pl = sh(p.plan); if (r && pl && r !== pl) return "<s>" + esc(pl) + '</s><span class="late">' + esc(r) + "</span>"; return esc(r || pl || ""); };
    var pcell = function (p, next) {
      var a = p.plat ? String(p.plat) : "", b = next ? String(next) : "";
      if (a && b && a !== b) return T("xfer.plat", { a: a, b: b }, "Peron {a} → {b}").replace("{a}", a).replace("{b}", b).toLowerCase();
      return a ? (/^\D/.test(a) ? a : T("gzm.c99Plat", { p: a }, "peron {p}").replace("{p}", a)) : (b ? T("gzm.c99Plat", { p: b }, "peron {p}").replace("{p}", b) : "");
    };
    var row = function (p, next, badge) { if (!p) return ""; var pc = pcell(p, next); return '<div class="jl-r"><div class="jl-t">' + tcell(p) + '</div><div class="jl-s">' + esc(p.station || "") + (pc ? "<small>" + esc(pc) + "</small>" : "") + "</div><div>" + (badge || "") + "</div></div>"; };
    var x = o.xfer, cls = "jl" + (x ? " jl-" + (x.status || "ok") : "");
    var dk = o.key ? ' data-svk="' + esc("l|" + o.key) + '"' + (openMk["l|" + o.key] ? " open" : "") : "";
    var late = (o.dep && sh(o.dep.time) && sh(o.dep.plan) && sh(o.dep.time) !== sh(o.dep.plan)) || (o.arr && sh(o.arr.time) && sh(o.arr.plan) && sh(o.arr.time) !== sh(o.arr.plan));
    var warn = o.warn || late || (x && x.status && x.status !== "ok");
    return '<div class="' + cls + '"' + (o.attrs || "") + '><div class="jl-h">' + (o.icon || "🚆") + " " + (o.label || "") + (o.dir ? ' <span class="jl-d">→ ' + esc(o.dir) + "</span>" : "") + (o.tag || "") + "</div>" +
      row(o.dep, null, "") + row(o.arr, o.arr && o.arr.platNext, xBadge(x)) +
      (o.details ? "<details" + dk + "><summary" + (warn ? ' class="xv-warn"' : "") + ">▸ " + (o.pending ? "⏳ " : "") + esc(T("xfer.details", null, "szczegóły")) + '</summary><div class="jl-det">' + o.details + "</div></details>" : "") +
      "</div>" + (o.after || "");
  }
  // dopisek pod przesiadkami — link do objaśnienia w „Jak działa aplikacja”
  function xNote() { return '<div style="font-size:12px;color:#8ea3ba;margin-top:6px;line-height:1.4">' + esc(T("xfer.note", null, "ℹ️ Zapas przesiadki liczymy po przejściu: doliczamy zmianę peronu i dojście pieszo.")) + ' <a href="/jak-dziala/#przesiadki" style="color:#8fb8f5">' + esc(T("xfer.more", null, "Jak to liczymy")) + " ›</a></div>"; }
  window.StopsView = { xNote: xNote, legA: legA, isOpen: function (k) { return !!openMk[k]; }, scrollTo: scrollTo, html: html, xfer: xfer, trainUrl: trainUrl, ready: function () { gzmIndex(); return gzmP; } };
})();
