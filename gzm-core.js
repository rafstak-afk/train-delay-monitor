// Logika „Przesiadki GZM” (bez interfejsu): z pliku stacji (/api/gzm-data/
// stations/<id>.json), godziny przyjazdu pociągu i danych na żywo GZM liczy,
// na które odjazdy autobusów/tramwajów zdążysz. Ten sam plik w przeglądarce
// (window.GzmCore) i w testach Node (require).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GzmCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var OK_SLACK = 3;          // 🟢 zapas ≥ 3 min; 🟡 0–2 min; 🔴 < 0
  var TYPE = { 0: "tram", 3: "bus", 11: "trolley" };

  function addDays(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function fmt(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return (m < 600 ? "0" : "") + Math.floor(m / 60) + ":" + (m % 60 < 10 ? "0" : "") + (m % 60); }
  function hm(s) { var x = /^(\d{1,2}):(\d{2})/.exec(s || ""); return x ? +x[1] * 60 + +x[2] : null; }

  // Odjazdy dnia `date` (minuty od północy tego dnia) + następnego dnia
  // (+1440), żeby przesiadka koło północy też działała.
  function departures(file, date) {
    var out = [];
    [0, 1].forEach(function (k) {
      var d = addDays(date, k), list = (file.days || {})[d] || [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i], ln = file.lines[r[1]], st = file.stops[r[2]];
        out.push({ min: r[0] + k * 1440, line: ln[0], type: TYPE[ln[1]] || "bus", head: ln[2], stopIdx: r[2], stop: st, trip: r[3], seq: r[4], pat: r[5] == null ? -1 : r[5], date: d });
      }
    });
    return out;
  }

  // Czas dojścia do przystanku: z konkretnego peronu, jeśli go znamy i mamy
  // dla niego wynik; inaczej ostrożnie — od najdalszego peronu (górna granica).
  function walkFor(stop, platform) {
    if (platform != null && stop.p && stop.p[String(platform)] != null) return { min: stop.p[String(platform)], exact: true };
    return { min: stop.w[1], exact: false };
  }

  // Dane na żywo (z /api/gzm-rt): opóźnienie kursu przenosimy na kolejne
  // przystanki; gdy pojazd jest już za naszym przystankiem — odjechał.
  function live(dep, rt) {
    var t = rt && rt.trips && rt.trips[dep.trip];
    if (!t) return { min: dep.min, live: false };
    if (t[1] === "X") return { min: dep.min, live: true, cancelled: true };
    if (t[0] != null && t[0] > dep.seq) return { min: dep.min + Math.round((t[1] || 0) / 60), live: true, passed: true };
    var d = Math.round((t[1] || 0) / 60);
    return { min: dep.min + d, live: true, delay: d };
  }

  // Czas jazdy do przystanku docelowego (nazwa albo lista nazw, np. „Katowice
  // AWF” i „Katowice Stadion AWF”) z wzoru trasy kursu; null = kurs tam nie jedzie.
  function travelTo(file, dep, destSet) {
    var p = file.pt && dep.pat >= 0 ? file.pt[dep.pat] : null;
    if (!p) return null;
    for (var i = 0; i < p.length; i += 2) if (destSet[file.ds[p[i]]]) return { name: file.ds[p[i]], min: p[i + 1] };
    return null;
  }
  // Nazwy przystanków docelowych dostępnych z tej stacji (do podpowiedzi).
  function destinations(file) { return (file.ds || []).slice().sort(function (a, b) { return a.localeCompare(b, "pl"); }); }

  // Ulubione linie/kierunki dla stacji: klucz „linia|kierunek” albo samo „linia”.
  function favKey(dep) { return dep.line + "|" + dep.head; }
  function isFav(dep, favs) { return !favs || !favs.length || favs.indexOf(favKey(dep)) >= 0 || favs.indexOf(dep.line) >= 0; }

  // Główne liczenie.
  //   opts: { file, date, arrMin (przyjazd pociągu, minuty od północy `date`),
  //           nowMin (teraz, ta sama skala), platform, rt, favs, onlyFavs,
  //           windowMin (okno listy), types (Set typów), q (szukaj) }
  // Zwraca { arr, items (wszystkie w oknie, ze statusem), catchable (🟢/🟡,
  // wg rzeczywistego odjazdu), missed (ostatnie 3 uciekłe) }.
  function compute(opts) {
    var deps = departures(opts.file, opts.date);
    var arr = Math.max(opts.arrMin, opts.nowMin);   // po przyjeździe liczymy od teraz
    var items = [];
    var q = (opts.q || "").trim().toLowerCase();
    var dest = opts.dest && opts.dest.length ? (Array.isArray(opts.dest) ? opts.dest : [opts.dest]) : null, destSet = null;
    if (dest) { destSet = {}; dest.forEach(function (n) { destSet[n] = true; }); }
    deps.forEach(function (d) {
      if (opts.types && opts.types.size && !opts.types.has(d.type)) return;
      if (q && (d.line + " " + d.head + " " + d.stop.n).toLowerCase().indexOf(q) < 0) return;
      var tr = destSet ? travelTo(opts.file, d, destSet) : null;
      if (destSet && !tr) return;                     // ten kurs nie dowiezie do celu
      var L = live(d, opts.rt);
      if (L.passed) return;                           // pojazd już za przystankiem
      var w = walkFor(d.stop, opts.platform);
      var earliest = arr + w.min;
      var slack = L.min - earliest;
      if (L.min < opts.nowMin - 1) return;            // już odjechał
      if (L.min > arr + (opts.windowMin || 60) + w.min) return;
      var status = L.cancelled ? "cancelled" : slack >= OK_SLACK ? "ok" : slack >= 0 ? "tight" : "missed";
      items.push({ dep: d, travel: tr ? tr.min : null, destName: tr ? tr.name : null, arrDest: tr ? L.min + tr.min : null, real: L.min, live: L.live, delay: L.delay || 0, cancelled: !!L.cancelled, walk: w, earliest: earliest, slack: slack, status: status, fav: isFav(d, opts.favs) && !!(opts.favs && opts.favs.length) });
    });
    if (destSet && items.length) {
      // linie okrężne / objazdy: odrzuć jazdę wyraźnie dłuższą od najszybszej
      var minT = Math.min.apply(null, items.map(function (x) { return x.travel; }));
      items = items.filter(function (x) { return x.travel <= minT * 2 + 5; });
      items.sort(function (a, b) { return a.arrDest - b.arrDest || a.real - b.real; });
    } else items.sort(function (a, b) { return a.real - b.real || a.walk.min - b.walk.min; });
    var useFav = opts.onlyFavs && !destSet;            // cel podróży zastępuje ulubione linie
    var pool = items.filter(function (x) { return (x.status === "ok" || x.status === "tight") && (!useFav || isFav(x.dep, opts.favs)); });
    var missed = items.filter(function (x) { return x.status === "missed" && (!useFav || isFav(x.dep, opts.favs)); }).slice(-3);
    return { arr: arr, items: items, catchable: pool, missed: missed };
  }

  // ===== Krok 2: przystanek GZM → pociąg =====
  // Przejazdy z przystanku startowego pod stację (plik <id>-arr.json): dla
  // każdego kursu wybieramy przystanek przy stacji, z którego NAJSZYBCIEJ
  // dojdziesz na peron (np. 46: Mikołowska 14:34 + 8 min vs Dworzec 14:37 + 2 min).
  //   opts: { arrFile, origin: [nazwy], date, fromMin (najwcześniej na przystanku), rt, maxMin }
  function ridesToStation(opts) {
    var f = opts.arrFile, set = {}, best = new Map();
    (opts.origin || []).forEach(function (n) { set[n] = true; });
    [0, 1].forEach(function (k) {
      var d = addDays(opts.date, k), list = (f.days || {})[d] || [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i], p = f.up[r[5]]; if (!p) continue;
        var off = null, name = null;
        for (var j = 0; j < p.length; j += 2) if (set[f.us[p[j]]]) { off = p[j + 1]; name = f.us[p[j]]; break; }
        if (off == null) continue;
        var arr = r[0] + k * 1440, depO = arr - off;
        var t = opts.rt && opts.rt.trips && opts.rt.trips[r[3]], dl = 0, live = false;
        if (t) {
          if (t[1] === "X") continue;                    // odwołany
          if (t[0] != null && t[0] >= r[4]) continue;    // już pod stacją albo dalej
          dl = Math.round((t[1] || 0) / 60); live = true;
        }
        if (depO + dl < opts.fromMin) continue;
        if (opts.maxMin && depO > opts.fromMin + opts.maxMin) continue;
        var st = f.stops[r[2]], ln = f.lines[r[1]];
        var ride = { trip: r[3], line: ln[0], type: TYPE[ln[1]] || "bus", head: ln[2], from: name, dep: depO + dl, depPlan: depO, arrStop: arr + dl, stop: st, walk: st.w[1], platform: arr + dl + st.w[1], live: live, delay: dl };
        var prev = best.get(r[3]);
        if (!prev || ride.platform < prev.platform) best.set(r[3], ride);
      }
    });
    return Array.from(best.values()).sort(function (a, b) { return a.platform - b.platform || a.dep - b.dep; });
  }
  // Dla pociągów (minuty odjazdu ze stacji) — przejazdy GZM, na które zdążysz:
  // zapas = odjazd pociągu − (przyjazd GZM + dojście na peron); 🟢 ≥ 3, 🟡 0–2.
  //   trains: [{ dep (min), ... }] → [{ train, rides: [...] (od najwcześniejszego), latest }]
  function matchTrains(rides, trains, per) {
    return trains.map(function (tr) {
      var ok = rides.filter(function (r) { return r.platform <= tr.dep; }).map(function (r) {
        var slack = tr.dep - r.platform;
        return Object.assign({}, r, { slack: slack, status: slack >= OK_SLACK ? "ok" : "tight" });
      });
      var safe = ok.filter(function (r) { return r.status === "ok"; });
      // pokazujemy najpóźniejsze BEZPIECZNE przejazdy (🟢); „na styk” tylko, gdy nie ma innych
      return { train: tr, rides: (safe.length ? safe : ok).slice(-(per || 3)), latest: safe.length ? safe[safe.length - 1] : (ok.length ? ok[ok.length - 1] : null), count: ok.length };
    }).filter(function (x) { return x.count > 0; });
  }

  // Lista pogrupowana po linii + kierunku: dla każdej najbliższe `per` odjazdów.
  function groupByLine(items, per) {
    var map = new Map();
    items.forEach(function (x) {
      if (x.status === "missed" || x.cancelled) return;
      var k = favKey(x.dep);
      if (!map.has(k)) map.set(k, []);
      if (map.get(k).length < (per || 3)) map.get(k).push(x);
    });
    return Array.from(map.entries()).map(function (e) { return { key: e[0], line: e[1][0].dep.line, type: e[1][0].dep.type, head: e[1][0].dep.head, items: e[1] }; })
      .sort(function (a, b) { return a.items[0].real - b.items[0].real; });
  }

  return { ridesToStation: ridesToStation, matchTrains: matchTrains, travelTo: travelTo, destinations: destinations, compute: compute, groupByLine: groupByLine, departures: departures, walkFor: walkFor, live: live, favKey: favKey, fmt: fmt, hm: hm, addDays: addDays, OK_SLACK: OK_SLACK };
});
