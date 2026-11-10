// Zmiana rocznego rozkładu jazdy 13.12.2026 (TODO 39 p. 2 i TODO 40). Dla wszystkich.
// „Moje pociągi”: dla każdego pociągu sprawdza nowy rozkład (smart-lookup po numerze i stacji; pon. 14.12, a gdy brak —
// sob. 19.12 i ndz. 20.12, bo część pociągów jeździ tylko w weekend) i pokazuje, co się zmieni.
// Rusza 20 s po otwarciu strony (nie razem z odświeżaniem listy), po kolei, a wynik pamięta przez 3 dni — mało zapytań do PLK.
// TODO 40: „Zamień” / „Popraw godzinę”. Przed 13.12 zmiana czeka w tym telefonie i wykona się sama przy pierwszym otwarciu
// listy od 13.12 (wcześniej stary pociąg jeszcze jeździ); od 13.12 wykonuje się od razu. Zmiana listy — jak przy dodawaniu:
// świeży odczyt profilu, jedna operacja, jeden zapis (mutateTrains z moje-pociagi/index.html).
(function () {
  "use strict";
  var LIST_KEY = "rafstakMojePociagiV4", CACHE_KEY = "ttChange2027", HIDE_KEY = "ttChange2027Hidden", PENDING_KEY = "ttChange2027Pending";
  var CHANGE_DAY = "2026-12-13", PROBES = ["2026-12-14", "2026-12-19", "2026-12-20"], SHOW_UNTIL = "2026-12-27", GAP_MS = 400, START_MS = 20000, KEEP_MS = 3 * 864e5;
  function t(k, p) { return window.I18n ? window.I18n.t("tt." + k, p) : k; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function today() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date()); }
  function afterChange() { return today() >= CHANGE_DAY; }
  function hm(v) { var m = String(v || "").match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; }
  function fmt(m) { return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0"); }
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function pad(m) { return hhmm(Math.max(0, m)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function idOf(x) { return [x.station, x.trainNum, x.planTime || ""].join("|"); }
  function readJson(k, d) { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } }
  function writeJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function trains() {
    var l = readJson(LIST_KEY, []), seen = {};
    return (Array.isArray(l) ? l : []).filter(function (x) { var k = x && x.trainNum + "|" + x.station; if (!x || !x.trainNum || !x.station || seen[k]) return false; seen[k] = 1; return true; });
  }
  // --- zmiany na liście (TODO 40) ---
  function pending() { return readJson(PENDING_KEY, {}); }
  function setPending(p) { writeJson(PENDING_KEY, p); }
  async function applyChanges(changes) {   // changes: [{ old: {station,trainNum,planTime}, now: {...} }]
    if (!changes.length) return 0;
    var map = {}; changes.forEach(function (c) { map[idOf(c.old)] = c.now; });
    var mutate = function (list) { return list.map(function (x) { var n = map[idOf(x)]; return n ? Object.assign({}, x, n) : x; }); };
    if (typeof window.mutateTrains === "function") { await window.mutateTrains(mutate); if (typeof window.init === "function") window.init(); }
    else writeJson(LIST_KEY, mutate(readJson(LIST_KEY, [])));
    return changes.length;
  }
  async function applyPendingIfDue() {
    if (!afterChange()) return 0;
    var p = pending(), keys = Object.keys(p); if (!keys.length) return 0;
    var present = {}; trains().forEach(function (x) { present[idOf(x)] = 1; });
    var due = keys.filter(function (k) { return present[k]; }).map(function (k) { return p[k]; });
    setPending({});
    return applyChanges(due);
  }
  async function probe(x) {
    var failed = false;
    for (var i = 0; i < PROBES.length; i++) {
      await sleep(GAP_MS);
      try {
        var q = new URLSearchParams({ train: x.trainNum, station: x.station, date: PROBES[i] });
        var r = await fetch("/api/v2/smart-lookup?" + q.toString(), { cache: "no-store" }), j = await r.json();
        if (j && j.ok && j.orderId) return { st: "found", date: PROBES[i], time: j.stationTime || "" };
        if (!j || !/Nie znaleziono poci/i.test(String(j.error || ""))) failed = true;
      } catch (e) { failed = true; }
    }
    return { st: failed ? "unknown" : "missing" };
  }
  var ROW = '<div style="margin:8px 0">';
  function btn(attrs, label) { return '<button type="button" class="btn-small" ' + attrs + ' style="margin:4px 6px 0 0">' + esc(label) + "</button>"; }
  function pendingHtml(x) {
    var c = pending()[idOf(x.t)]; if (!c) return "";
    var txt = c.now.trainNum !== x.t.trainNum ? t("pendingSwap", { train: c.now.trainNum, time: c.now.planTime }) : t("pendingFix", { time: c.now.planTime });
    return '<div style="color:#86efac;margin-top:4px">✅ ' + esc(txt) + " " + btn('data-ttundo="' + esc(idOf(x.t)) + '"', t("undo")) + "</div>";
  }
  function rowHtml(x, i) {
    var name = esc(x.t.trainNum) + " · " + esc(x.t.station), old = hm(x.t.planTime), now = hm(x.r.time), pend = pendingHtml(x);
    if (x.r.st === "missing") return ROW + "<b>❌ " + name + (old != null ? " " + fmt(old) : "") + "</b> — " + esc(t("missing")) +
      (pend || "<br>" + btn('data-ttnear="' + i + '"', t("nearBtn"))) + '<div data-ttout="' + i + '"></div></div>';
    if (x.r.st === "unknown") return ROW + "❔ " + name + " — " + esc(t("unknown")) + "</div>";
    var note = x.r.date !== PROBES[0] ? " (" + esc(t(x.r.date === PROBES[1] ? "onlySat" : "onlySun")) + ")" : "";
    if (old == null || now == null) return ROW + "🕐 " + name + (now != null ? " " + fmt(now) : "") + note + "</div>";
    var d = now - old;
    var fix = pend || btn('data-ttfix="' + i + '"', t(afterChange() ? "fixNow" : "fixLater"));
    if (Math.abs(d) >= 180) return ROW + "<b>⚠️ " + name + "</b>: " + fmt(old) + " → " + fmt(now) + " — " + esc(t("otherTime")) + note + "<br>" + fix + "</div>";
    if (d === 0) return ROW + "✅ " + name + " " + fmt(now) + note + "</div>";
    return ROW + "<b>🕐 " + name + "</b>: " + fmt(old) + " → <b>" + fmt(now) + "</b> (" + (d > 0 ? "+" : "−") + Math.abs(d) + " min)" + note + "<br>" + fix + "</div>";
  }
  function isChange(x) { if (x.r.st !== "found") return false; var o = hm(x.t.planTime), n = hm(x.r.time); return o != null && n != null && o !== n; }
  async function choose(box, rows, x, now) {
    var change = { old: x.t, now: now };
    if (afterChange()) { await applyChanges([change]); box.querySelector("[data-ttmsg]").textContent = "✅ " + t("applied", { n: 1 }); return; }
    var p = pending(); p[idOf(x.t)] = change; setPending(p); render(box, rows, "");
  }
  function render(box, rows, msg) {
    var miss = rows.filter(function (x) { return x.r.st === "missing"; }).length, ch = rows.filter(isChange).length, unk = rows.filter(function (x) { return x.r.st === "unknown"; }).length;
    var nPend = Object.keys(pending()).length, open = box.querySelector("details") && box.querySelector("details").open;
    box.innerHTML = '<div class="panel" style="border:1px solid #f59e0b;margin:10px 0;padding:12px;font-size:14px;line-height:1.4">' +
      '<div style="font-weight:800;font-size:16px;margin-bottom:4px">🗓️ ' + esc(t("title")) + "</div>" +
      "<div>" + esc(t("summary", { miss: miss, ch: ch, same: rows.length - miss - ch - unk })) + (unk ? " · " + esc(t("summaryUnknown", { n: unk })) : "") + "</div>" +
      (nPend && !afterChange() ? '<div style="color:#86efac;margin-top:4px">' + esc(t("pendingCount", { n: nPend })) + "</div>" : "") +
      '<div data-ttmsg style="color:#86efac;margin-top:4px">' + esc(msg || "") + "</div>" +
      '<details style="margin-top:6px"' + (open ? " open" : "") + '><summary style="cursor:pointer;font-weight:700">' + esc(t("details")) + "</summary>" +
      rows.map(function (x, i) { return { h: rowHtml(x, i), o: x.r.st === "missing" ? 0 : isChange(x) ? 1 : 2 }; }).sort(function (a, b) { return a.o - b.o; }).map(function (y) { return y.h; }).join("") +
      '<div style="opacity:.75;font-size:12px;margin-top:8px">' + esc(t("note")) + " " + esc(t(afterChange() ? "noteSwapNow" : "noteSwapLater")) + "</div></details>" +
      btn('data-tthide="1"', t("hide")) + "</div>";
    box.onclick = async function (ev) {
      var el = ev.target.closest("button"); if (!el) return;
      if (el.hasAttribute("data-tthide")) { try { localStorage.setItem(HIDE_KEY, "1"); } catch (e) {} box.remove(); return; }
      if (el.hasAttribute("data-ttundo")) { var p = pending(); delete p[el.getAttribute("data-ttundo")]; setPending(p); render(box, rows, ""); return; }
      if (el.hasAttribute("data-ttfix")) { var xf = rows[+el.getAttribute("data-ttfix")]; el.disabled = true; await choose(box, rows, xf, { station: xf.t.station, trainNum: xf.t.trainNum, planTime: hhmm(hm(xf.r.time)) }); return; }
      if (el.hasAttribute("data-ttswap")) {
        var parts = el.getAttribute("data-ttswap").split("|"), xs = rows[+parts[0]];
        el.disabled = true; await choose(box, rows, xs, { station: xs.t.station, trainNum: parts[1], planTime: parts[2] }); return;
      }
      if (!el.hasAttribute("data-ttnear")) return;
      var i = +el.getAttribute("data-ttnear"), x = rows[i], out = box.querySelector('[data-ttout="' + i + '"]'), t0 = hm(x.t.planTime) || 0;
      el.disabled = true; out.textContent = t("searching");
      try {
        var q = new URLSearchParams({ station: x.t.station, limit: "6", date: PROBES[0], time: pad(t0 - 20) });
        var j = await (await fetch("/api/departures?" + q.toString())).json();
        out.innerHTML = '<div style="opacity:.75;font-size:12px;margin-top:4px">' + esc(t("nearNote")) + "</div>" + ((j && j.departures) || []).map(function (d) {
          var num = String(d.trainNumber || d.number || d.train || "").split("/")[0].replace(/\D/g, ""), tm = hm(d.plannedDeparture || d.time);
          return '<div style="margin:4px 0">' + esc(d.plannedDeparture || d.time) + " " + esc(d.category || "") + " " + esc(d.trainNumber || d.number || d.train) + " → " + esc(d.destination) +
            (num && tm != null ? " " + btn('data-ttswap="' + i + "|" + esc(num) + "|" + hhmm(tm) + '"', t(afterChange() ? "swapNow" : "swapLater")) : "") + "</div>";
        }).join("");
      } catch (e) { out.textContent = t("nearFail"); el.disabled = false; }
    };
  }
  async function run() {
    if (window.I18n) await window.I18n.ready;
    var applied = 0; try { applied = await applyPendingIfDue(); } catch (e) {}
    if (today() > SHOW_UNTIL) return;
    try { if (localStorage.getItem(HIDE_KEY) && !applied) return; } catch (e) {}
    var list = trains(), main = document.getElementById("list"); if (!list.length || !main) return;
    var box = document.createElement("div"); box.id = "ttChange"; main.parentNode.insertBefore(box, main);
    var msg = applied ? t("applied", { n: applied }) : "";
    var sig = list.map(function (x) { return x.trainNum + "|" + x.station + "|" + x.planTime; }).join(";"), cached = readJson(CACHE_KEY, null);
    if (cached && cached.ts && Date.now() - cached.ts < KEEP_MS && cached.sig === sig) { render(box, cached.rows, msg); return; }
    box.innerHTML = '<div class="panel" style="margin:10px 0;padding:12px;font-size:14px">🗓️ ' + esc(t("checking")) + "</div>";
    var rows = [];
    for (var i = 0; i < list.length; i++) rows.push({ t: { trainNum: list[i].trainNum, station: list[i].station, planTime: list[i].planTime }, r: await probe(list[i]) });
    render(box, rows, msg);
    if (!rows.some(function (x) { return x.r.st === "unknown"; })) writeJson(CACHE_KEY, { ts: Date.now(), sig: sig, rows: rows });
  }
  window.addEventListener("load", function () { setTimeout(run, START_MS); });
})();
