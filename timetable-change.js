// Zmiana rocznego rozkładu jazdy 13.12.2026 (TODO 39 p. 2 + podstawa TODO 40). TEST: profil autora, teksty tylko po polsku.
// „Moje pociągi”: dla każdego pociągu sprawdza nowy rozkład (smart-lookup po numerze i stacji; pon. 14.12, a gdy brak —
// sob. 19.12 i ndz. 20.12, bo część pociągów jeździ tylko w weekend) i pokazuje, co się zmieni. Wynik pamiętany przez dobę.
(function () {
  "use strict";
  var LIST_KEY = "rafstakMojePociagiV4", CACHE_KEY = "ttChange2027", HIDE_KEY = "ttChange2027Hidden";
  var PROBES = ["2026-12-14", "2026-12-19", "2026-12-20"], SHOW_UNTIL = "2026-12-27", GAP_MS = 400;
  function on() { try { return localStorage.getItem("showVersionBadge") === "1"; } catch (e) { return false; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function today() { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date()); }
  function hm(v) { var m = String(v || "").match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; }
  function fmt(m) { return Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0"); }
  function pad(m) { m = Math.max(0, m); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function trains() {
    var l = []; try { l = JSON.parse(localStorage.getItem(LIST_KEY) || "[]") || []; } catch (e) {}
    var seen = {};
    return l.filter(function (t) { var k = t && t.trainNum + "|" + t.station; if (!t || !t.trainNum || !t.station || seen[k]) return false; seen[k] = 1; return true; });
  }
  async function probe(t) {
    var failed = false;
    for (var i = 0; i < PROBES.length; i++) {
      await sleep(GAP_MS);
      try {
        var q = new URLSearchParams({ train: t.trainNum, station: t.station, date: PROBES[i] });
        var r = await fetch("/api/v2/smart-lookup?" + q.toString(), { cache: "no-store" }), j = await r.json();
        if (j && j.ok && j.orderId) return { st: "found", date: PROBES[i], time: j.stationTime || "" };
        if (!j || !/Nie znaleziono poci/i.test(String(j.error || ""))) failed = true;
      } catch (e) { failed = true; }
    }
    return { st: failed ? "unknown" : "missing" };
  }
  function rowHtml(x, i) {
    var name = esc(x.t.trainNum) + " · " + esc(x.t.station), old = hm(x.t.planTime), now = hm(x.r.time);
    if (x.r.st === "missing") return '<div style="margin:8px 0"><b>❌ ' + name + (old != null ? " " + fmt(old) : "") + '</b> — nie ma pod tym numerem' +
      '<br><button type="button" class="btn-small" data-ttnear="' + i + '">Pokaż odjazdy z tej stacji o tej porze (14.12)</button><div data-ttout="' + i + '"></div></div>';
    if (x.r.st === "unknown") return '<div style="margin:8px 0">❔ ' + name + " — nie udało się sprawdzić</div>";
    var note = x.r.date !== PROBES[0] ? " (w poniedziałek 14.12 nie znalazłem, jeździ " + (x.r.date === PROBES[1] ? "w sobotę" : "w niedzielę") + ")" : "";
    if (old == null || now == null) return '<div style="margin:8px 0">🕐 ' + name + (now != null ? " " + fmt(now) : "") + esc(note) + "</div>";
    var d = now - old;
    if (Math.abs(d) >= 180) return '<div style="margin:8px 0"><b>⚠️ ' + name + "</b>: " + fmt(old) + " → " + fmt(now) + " — inna pora dnia, sprawdź, czy to ten sam pociąg" + esc(note) + "</div>";
    if (d === 0) return '<div style="margin:8px 0">✅ ' + name + " " + fmt(now) + esc(note) + "</div>";
    return '<div style="margin:8px 0"><b>🕐 ' + name + "</b>: " + fmt(old) + " → <b>" + fmt(now) + "</b> (" + (d > 0 ? "+" : "−") + Math.abs(d) + " min)" + esc(note) + "</div>";
  }
  function isChange(x) { if (x.r.st !== "found") return false; var o = hm(x.t.planTime), n = hm(x.r.time); return o != null && n != null && o !== n; }
  function render(box, rows) {
    var miss = rows.filter(function (x) { return x.r.st === "missing"; }).length, ch = rows.filter(isChange).length, unk = rows.filter(function (x) { return x.r.st === "unknown"; }).length;
    var same = rows.length - miss - ch - unk;
    box.innerHTML = '<div class="panel" style="border:1px solid #f59e0b;margin:10px 0;padding:12px;font-size:14px;line-height:1.4">' +
      '<div style="font-weight:800;font-size:16px;margin-bottom:4px">🗓️ Od 13 grudnia nowy rozkład jazdy</div>' +
      "<div>Twoje pociągi: <b>" + miss + "</b> bez tego numeru · <b>" + ch + "</b> ze zmianą godziny · " + same + " bez zmian" + (unk ? " · " + unk + " niesprawdzone" : "") + "</div>" +
      '<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:700">Pokaż szczegóły</summary>' +
      rows.map(function (x, i) { return { h: rowHtml(x, i), o: x.r.st === "missing" ? 0 : isChange(x) ? 1 : 2 }; }).sort(function (a, b) { return a.o - b.o; }).map(function (y) { return y.h; }).join("") +
      '<div style="opacity:.75;font-size:12px;margin-top:8px">„Nie ma pod tym numerem” nie znaczy, że pociągu nie będzie: mógł dostać nowy numer, a PLK może jeszcze uzupełniać rozkład. Twoja lista się nie zmienia, dopóki sam jej nie zmienisz.</div></details>' +
      '<button type="button" class="btn-small" data-tthide="1" style="margin-top:8px">Ukryj</button></div>';
    box.onclick = async function (ev) {
      if (ev.target.closest("[data-tthide]")) { try { localStorage.setItem(HIDE_KEY, "1"); } catch (e) {} box.remove(); return; }
      var b = ev.target.closest("[data-ttnear]"); if (!b) return;
      var i = +b.getAttribute("data-ttnear"), x = rows[i], out = box.querySelector('[data-ttout="' + i + '"]'), t0 = hm(x.t.planTime) || 0;
      b.disabled = true; out.textContent = "Szukam…";
      try {
        var q = new URLSearchParams({ station: x.t.station, limit: "6", date: PROBES[0], time: pad(t0 - 20) });
        var j = await (await fetch("/api/departures?" + q.toString())).json();
        out.innerHTML = '<div style="opacity:.75;font-size:12px;margin-top:4px">Najbliższe odjazdy, kierunek sprawdź sam:</div>' + ((j && j.departures) || []).map(function (d) { return "<div>" + esc(d.plannedDeparture || d.time) + " " + esc(d.category || "") + " " + esc(d.trainNumber || d.number || d.train) + " → " + esc(d.destination) + "</div>"; }).join("");
      } catch (e) { out.textContent = "Nie udało się pobrać odjazdów."; b.disabled = false; }
    };
  }
  async function run() {
    if (!on() || today() > SHOW_UNTIL) return;
    try { if (localStorage.getItem(HIDE_KEY)) return; } catch (e) {}
    var list = trains(), main = document.getElementById("list"); if (!list.length || !main) return;
    var box = document.createElement("div"); box.id = "ttChange"; main.parentNode.insertBefore(box, main);
    var sig = list.map(function (t) { return t.trainNum + "|" + t.station + "|" + t.planTime; }).join(";"), cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
    if (cached && cached.day === today() && cached.sig === sig) { render(box, cached.rows); return; }
    box.innerHTML = '<div class="panel" style="margin:10px 0;padding:12px;font-size:14px">🗓️ Sprawdzam Twoje pociągi w nowym rozkładzie (od 13.12)…</div>';
    var rows = [];
    for (var i = 0; i < list.length; i++) rows.push({ t: { trainNum: list[i].trainNum, station: list[i].station, planTime: list[i].planTime }, r: await probe(list[i]) });
    render(box, rows);
    if (!rows.some(function (x) { return x.r.st === "unknown"; })) try { localStorage.setItem(CACHE_KEY, JSON.stringify({ day: today(), sig: sig, rows: rows })); } catch (e) {}
  }
  window.addEventListener("load", function () { setTimeout(run, 1500); });
})();
