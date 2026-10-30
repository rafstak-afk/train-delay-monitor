// Wyszukiwarka połączeń w całej sieci GZM (autobusy, tramwaje, trolejbusy) —
// algorytm RAPTOR (Round-Based Public Transit Routing), w przeglądarce, na
// pliku dnia /api/gzm-data/network/<data>.json (tools/gzm/build.mjs).
//   var net = GzmRaptor.prepare(json);
//   var list = GzmRaptor.search(net, { from: ["Katowice AWF"], to: ["Krupski Młyn Słoneczna"], dep: 7*60, rt, maxTransfers: 2, count: 5 });
// Przesiadki: ten sam słupek (+1 min), inne słupki do 300 m pieszo (linia prosta
// × 1,4 / 1,2 m/s, min. 1 min). Wynik: podróże bez „gorszych” (później start
// i później meta), od najwcześniejszego odjazdu. Ten sam plik w Node (testy).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GzmRaptor = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var INF = 1e9, TYPE = { 0: "tram", 3: "bus", 11: "trolley" };
  var WALK_M = 300, CHANGE = 1;

  function hav(a, b, c, d) { var R = 6371000, t = Math.PI / 180, x = Math.pow(Math.sin((c - a) * t / 2), 2) + Math.cos(a * t) * Math.cos(c * t) * Math.pow(Math.sin((d - b) * t / 2), 2); return 2 * R * Math.asin(Math.sqrt(x)); }

  function prepare(j) {
    var n = j.stops.length, P = j.pats.length;
    var net = { j: j, n: n, name: new Array(n), lat: new Float64Array(n), lon: new Float64Array(n), stopPats: [], foot: [], patTrips: new Array(P), byName: {} };
    for (var i = 0; i < n; i++) {
      var s = j.stops[i]; net.name[i] = j.names[s[0]]; net.lat[i] = s[1]; net.lon[i] = s[2];
      net.stopPats.push([]); net.foot.push([]);
      (net.byName[net.name[i]] = net.byName[net.name[i]] || []).push(i);
    }
    for (var p = 0; p < P; p++) { var seq = j.pats[p][1]; for (var k = 0; k < seq.length; k++) net.stopPats[seq[k]].push(p, k); net.patTrips[p] = []; }
    for (var t = 0; t < j.trips.length; t++) net.patTrips[j.trips[t][0]].push(t);   // kursy już posortowane po starcie
    // przejścia piesze: siatka ~300 m
    var cell = 0.003, grid = {};
    for (i = 0; i < n; i++) { var key = Math.floor(net.lat[i] / cell) + "," + Math.floor(net.lon[i] / (cell * 1.6)); (grid[key] = grid[key] || []).push(i); }
    for (i = 0; i < n; i++) {
      var gy = Math.floor(net.lat[i] / cell), gx = Math.floor(net.lon[i] / (cell * 1.6));
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var c = grid[(gy + dy) + "," + (gx + dx)]; if (!c) continue;
        for (var q = 0; q < c.length; q++) {
          var o = c[q]; if (o === i) continue;
          var d = hav(net.lat[i], net.lon[i], net.lat[o], net.lon[o]);
          if (d <= WALK_M) net.foot[i].push(o, Math.max(1, Math.ceil(d * 1.4 / 1.2 / 60)));
        }
      }
    }
    return net;
  }

  function delayOf(net, t, rt) {
    var x = rt && rt.trips && rt.trips[net.j.trips[t][2]];
    if (!x) return 0;
    if (x[1] === "X") return null;   // odwołany
    return Math.round((x[1] || 0) / 60);
  }

  // Pojedynczy przebieg RAPTOR od godziny `dep` (minuty). Zwraca podróże Pareto (czas, przesiadki).
  // startAt (opcjonalnie): przystanek → własna godzina startu (np. słupki przy stacji: przyjazd pociągu + dojście z peronu)
  function raptor(net, origin, destSet, dep, K, rt, startAt, keep) {
    var j = net.j, n = net.n;
    var tau = [], walkL = [], par = [], star = new Float64Array(n).fill(INF), marked = new Set();
    for (var k = 0; k <= K; k++) { tau.push(new Float64Array(n).fill(INF)); walkL.push(new Uint8Array(n)); par.push(new Array(n)); }
    origin.forEach(function (s) { var t0s = startAt && startAt[s] != null ? Math.max(startAt[s], dep) : dep; tau[0][s] = t0s; star[s] = t0s; marked.add(s); });
    // dojście z przystanku startowego do pobliskich słupków
    Array.from(marked).forEach(function (s) { var f = net.foot[s]; for (var q = 0; q < f.length; q += 2) { var o = f[q], tt = tau[0][s] + f[q + 1]; if (tt < tau[0][o]) { tau[0][o] = tt; star[o] = tt; walkL[0][o] = 1; par[0][o] = { walk: s, w: f[q + 1] }; marked.add(o); } } });
    var bestDest = INF;
    for (k = 1; k <= K; k++) {
      var Q = new Map();
      marked.forEach(function (s) { var sp = net.stopPats[s]; for (var q = 0; q < sp.length; q += 2) { var p = sp[q], pos = sp[q + 1]; if (!Q.has(p) || pos < Q.get(p)) Q.set(p, pos); } });
      marked = new Set();
      Q.forEach(function (pos0, p) {
        var pat = j.pats[p], seq = pat[1], off = pat[2], fl = pat[3], trips = net.patTrips[p];
        var trip = -1, t0 = 0, dl = 0, bPos = -1;
        for (var i = pos0; i < seq.length; i++) {
          var s = seq[i];
          if (trip >= 0 && !(+fl[i] & 2)) {
            var arr = t0 + dl + off[2 * i];
            if (arr < star[s] && arr < bestDest) {
              tau[k][s] = arr; star[s] = arr; walkL[k][s] = 0; par[k][s] = { p: p, trip: trip, b: bPos, a: i };
              marked.add(s); if (destSet[s] && arr < bestDest) bestDest = arr;
            }
          }
          var prev = tau[k - 1][s];
          if (prev < INF && i < seq.length - 1 && !(+fl[i] & 1)) {
            var need = prev + (k > 1 && !walkL[k - 1][s] ? CHANGE : 0);
            if (trip < 0 || need <= t0 + dl + off[2 * i + 1]) {
              // najwcześniejszy kurs tego wzoru odjeżdżający z i-tego przystanku nie wcześniej niż `need`
              var lo = 0, hi = trips.length, target = need - off[2 * i + 1] - 30;
              while (lo < hi) { var m = (lo + hi) >> 1; if (j.trips[trips[m]][1] < target) lo = m + 1; else hi = m; }
              for (var x = lo; x < trips.length && x < lo + 200; x++) {
                var tt2 = trips[x], d2 = delayOf(net, tt2, rt); if (d2 === null) continue;
                var depT = j.trips[tt2][1] + d2 + off[2 * i + 1];
                if (depT >= need) { if (trip < 0 || depT < t0 + dl + off[2 * i + 1]) { trip = tt2; t0 = j.trips[tt2][1]; dl = d2; bPos = i; } break; }
              }
            }
          }
        }
      });
      // przejścia piesze po tej rundzie
      Array.from(marked).forEach(function (s) {
        if (walkL[k][s]) return;
        var f = net.foot[s];
        for (var q = 0; q < f.length; q += 2) {
          var o = f[q], tt = tau[k][s] + f[q + 1];
          if (tt < star[o] && tt < bestDest) { tau[k][o] = tt; star[o] = tt; walkL[k][o] = 1; par[k][o] = { walk: s, w: f[q + 1] }; marked.add(o); if (destSet[o]) bestDest = Math.min(bestDest, tt); }
        }
      });
      if (!marked.size) break;
    }
    if (keep) keep.star = star;
    // odtworzenie podróży (Pareto po liczbie przejazdów)
    var out = [], best = INF;
    for (k = 1; k <= K; k++) {
      var bs = -1, bt = INF;
      Object.keys(destSet).forEach(function (s) { s = +s; if (tau[k][s] < bt) { bt = tau[k][s]; bs = s; } });
      if (bs < 0 || bt >= best) continue;
      best = bt;
      var legs = [], s = bs, kk = k, guard = 0;
      while (kk > 0 && guard++ < 20) {
        var pr = par[kk][s]; if (!pr) break;
        if (pr.walk != null) { legs.unshift({ type: "walk", from: pr.walk, to: s, min: pr.w }); s = pr.walk; continue; }
        var pat = j.pats[pr.p], tr = j.trips[pr.trip], d = delayOf(net, pr.trip, rt) || 0, ln = j.lines[pat[0]];
        legs.unshift({ type: "ride", line: ln[0], kind: TYPE[ln[1]] || "bus", head: ln[2], trip: tr[2], from: pat[1][pr.b], to: pat[1][pr.a], dep: tr[1] + d + pat[2][2 * pr.b + 1], arr: tr[1] + d + pat[2][2 * pr.a], depPlan: tr[1] + pat[2][2 * pr.b + 1], delay: d, live: !!(rt && rt.trips && rt.trips[tr[2]]), stops: pr.a - pr.b });
        s = pat[1][pr.b]; kk--;
      }
      if (kk > 0) continue;
      // dojście z przystanku startowego (runda 0)
      var p0 = par[0][s]; if (p0 && p0.walk != null) legs.unshift({ type: "walk", from: p0.walk, to: s, min: p0.w });
      var rides = legs.filter(function (l) { return l.type === "ride"; });
      if (!rides.length) continue;
      out.push({ dep: rides[0].dep, arr: bt, transfers: rides.length - 1, legs: legs });
    }
    return out;
  }

  // Kilka kolejnych podróży (jak „5 propozycji”): przebiegi od coraz późniejszej godziny.
  // Najwcześniejszy dojazd do KAŻDEGO przystanku sieci (jeden przebieg) — np. żeby
  // wybrać stację przesiadkową: najwcześniej na którym peronie zdążę.
  function reachAll(net, o) {
    var origin = [];
    (o.from || []).forEach(function (nm) { (net.byName[nm] || []).forEach(function (s) { origin.push(s); }); });
    var keep = {};
    if (!origin.length) return null;
    raptor(net, origin, {}, o.dep, (o.maxTransfers == null ? 1 : o.maxTransfers) + 1, o.rt, null, keep);
    return keep.star;
  }
  // indeks przystanku po kodzie słupka (kody z plików stacji)
  function byCode(net) {
    if (!net._code) { net._code = {}; net.j.stops.forEach(function (x, i) { if (x[3]) net._code[x[3]] = i; }); }
    return net._code;
  }

  function search(net, o) {
    var origin = [], destSet = {}, startAt = null;
    if (o.fromStops) { startAt = {}; o.fromStops.forEach(function (x) { origin.push(x.s); startAt[x.s] = x.t; }); }
    (o.from || []).forEach(function (nm) { (net.byName[nm] || []).forEach(function (s) { origin.push(s); }); });
    (o.to || []).forEach(function (nm) { (net.byName[nm] || []).forEach(function (s) { destSet[s] = true; }); });
    (o.toStops || []).forEach(function (s) { destSet[s] = true; });
    if (!origin.length || !Object.keys(destSet).length) return [];
    var K = (o.maxTransfers == null ? 2 : o.maxTransfers) + 1, dep = o.dep != null ? o.dep : Math.min.apply(null, (o.fromStops || []).map(function (x) { return x.t; })), all = [], count = o.count || 5;
    for (var r = 0; r < count * 3 && all.length < count * 2; r++) {
      var res = raptor(net, origin, destSet, dep, K, o.rt, startAt);
      if (!res.length) break;
      res.forEach(function (x) { all.push(x); });
      var first = Math.min.apply(null, res.map(function (x) { return x.dep; }));
      dep = first + 1;
      if (o.maxDep && dep > o.maxDep) break;
    }
    // bez duplikatów i bez podróży zdominowanych (później start i nie wcześniejsza meta przy ≥ przesiadkach)
    var key = function (x) { return x.legs.filter(function (l) { return l.type === "ride"; }).map(function (l) { return l.trip + "@" + l.from; }).join(">"); };
    var seen = {}; all = all.filter(function (x) { var kx = key(x); if (seen[kx]) return false; seen[kx] = 1; return true; });
    all = all.filter(function (x) { return !all.some(function (y) { return y !== x && y.dep >= x.dep && y.arr <= x.arr && y.transfers <= x.transfers && (y.dep > x.dep || y.arr < x.arr || y.transfers < x.transfers); }); });
    all.sort(function (a, b) { return a.dep - b.dep || a.arr - b.arr; });
    return all.slice(0, count).map(function (x) {
      x.legs.forEach(function (l) { l.fromName = net.name[l.from]; l.toName = net.name[l.to]; l.fromCode = net.j.stops[l.from][3]; l.toCode = net.j.stops[l.to][3]; });
      return x;
    });
  }

  return { prepare: prepare, search: search, reachAll: reachAll, byCode: byCode };
});
