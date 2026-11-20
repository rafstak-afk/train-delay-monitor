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
  var WALK_M = 300, CHANGE = 1;   // 17.11: zapas po przejściu pieszo 1 min (przejście liczone ostrożnie: 1,2 m/s, w górę, +30 s na światłach)
  // 17.11 (uwaga autora): przesiadka na TYM SAMYM stanowisku albo na zintegrowanym przystanku autobusowo-tramwajowym
  // (ten sam numer stanowiska, tramwajowe z dopiskiem „t”, np. 28501 / 28501t) — dozwolony zapas 0–1 min (w widoku miga na czerwono)
  function sameNo(j, a, b) { var ca = String(j.stops[a][3] || "").replace(/t$/i, ""), cb = String(j.stops[b][3] || "").replace(/t$/i, ""); return !!ca && ca === cb; }
  // TODO 69: minimalny zapas przesiadki w komunikacji — 2 min (wcześniej 1 min na tym samym przystanku i 0 min po przejściu pieszo)
  // WALK_W: minuta chodzenia „kosztuje” pół minuty późniejszego wyjścia — dłuższy marsz tylko wtedy, gdy realnie pozwala wyjść później
  var WALK_W = 0.5;

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
    // TODO 71: czasy przejść między przystankami po drogach z OSM (przez jezdnię tylko na przejściach) zamiast linii prostej
    if (j.fw) for (var w = 0; w + 2 < j.fw.length; w += 3) {
      var fa = j.fw[w], fb = j.fw[w + 1], fm = j.fw[w + 2], fa2 = net.foot[fa], fb2 = net.foot[fb];
      if (!fa2 || !fb2) continue;
      for (var u = 0; u < fa2.length; u += 2) if (fa2[u] === fb) fa2[u + 1] = fm;
      for (u = 0; u < fb2.length; u += 2) if (fb2[u] === fa) fb2[u + 1] = fm;
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
    var PC = net._pace || 1, FW = function (x) { return PC === 1 ? x : Math.max(1, Math.round(x * PC)); };
    Array.from(marked).forEach(function (s) { var f = net.foot[s]; for (var q = 0; q < f.length; q += 2) { var o = f[q], tt = tau[0][s] + FW(f[q + 1]); if (tt < tau[0][o]) { tau[0][o] = tt; star[o] = tt; walkL[0][o] = 1; par[0][o] = { walk: s, w: f[q + 1] }; marked.add(o); } } });
    var bestDest = INF;
    for (k = 1; k <= K; k++) {
      var Q = new Map();
      marked.forEach(function (s) { var sp = net.stopPats[s]; for (var q = 0; q < sp.length; q += 2) { var p = sp[q], pos = sp[q + 1]; if (!Q.has(p) || pos < Q.get(p)) Q.set(p, pos); } });
      marked = new Set();
      Q.forEach(function (pos0, p) {
        var pat = j.pats[p], seq = pat[1], off = pat[2], fl = pat[3], trips = net.patTrips[p];
        if (net._excl && net._excl[TYPE[j.lines[pat[0]][1]] || "bus"]) return;   // odznaczony środek transportu
        if (net._hide && net._hide[String(j.lines[pat[0]][0]).toUpperCase()]) return;   // ukryta linia (Moje preferencje)
        var trip = -1, t0 = 0, dl = 0, bPos = -1;
        for (var i = pos0; i < seq.length; i++) {
          var s = seq[i];
          if (trip >= 0 && !(+fl[i] & 2)) {
            var arr = t0 + dl + off[2 * i];
            if (arr < star[s] && arr < bestDest) {
              tau[k][s] = arr; star[s] = arr; walkL[k][s] = 0; par[k][s] = { p: p, trip: trip, b: bPos, a: i };
              marked.add(s); if (destSet[s] != null && arr + destSet[s] < bestDest) bestDest = arr + destSet[s];
            }
          }
          var prev = tau[k - 1][s];
          if (prev < INF && i < seq.length - 1 && !(+fl[i] & 1)) {
            var pw = walkL[k - 1][s] && par[k - 1][s], same = !walkL[k - 1][s] || (pw && pw.walk != null && sameNo(j, pw.walk, s));
            var need = prev + (k > 1 && !same ? CHANGE : 0);   // TODO 69: zapas także po przejściu pieszo (1 min); to samo stanowisko / zintegrowany przystanek — 0 min
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
          var o = f[q], tt = tau[k][s] + FW(f[q + 1]);
          if (tt < star[o] && tt < bestDest) { tau[k][o] = tt; star[o] = tt; walkL[k][o] = 1; par[k][o] = { walk: s, w: FW(f[q + 1]) }; marked.add(o); if (destSet[o] != null) bestDest = Math.min(bestDest, tt + destSet[o]); }
        }
      });
      if (!marked.size) break;
    }
    if (keep) keep.star = star;
    // odtworzenie podróży (Pareto po liczbie przejazdów)
    var out = [], best = INF;
    for (k = 1; k <= K; k++) {
      var bs = -1, bt = INF;
      Object.keys(destSet).forEach(function (s) { s = +s; if (tau[k][s] + destSet[s] < bt) { bt = tau[k][s] + destSet[s]; bs = s; } });
      if (bs < 0 || bt >= best) continue;
      best = bt;
      var legs = [], s = bs, kk = k, guard = 0;
      while (kk > 0 && guard++ < 20) {
        var pr = par[kk][s]; if (!pr) break;
        if (pr.walk != null) { legs.unshift({ type: "walk", from: pr.walk, to: s, min: pr.w }); s = pr.walk; continue; }
        var pat = j.pats[pr.p], tr = j.trips[pr.trip], d = delayOf(net, pr.trip, rt) || 0, ln = j.lines[pat[0]];
        legs.unshift({ type: "ride", line: ln[0], kind: TYPE[ln[1]] || "bus", head: ln[2], trip: tr[2], from: pat[1][pr.b], to: pat[1][pr.a], dep: tr[1] + d + pat[2][2 * pr.b + 1], arr: tr[1] + d + pat[2][2 * pr.a], depPlan: tr[1] + pat[2][2 * pr.b + 1], delay: d, live: !!(rt && rt.trips && rt.trips[tr[2]]), stops: pr.a - pr.b, _p: pr.p, _t: pr.trip, _b: pr.b, _a: pr.a });
        s = pat[1][pr.b]; kk--;
      }
      if (kk > 0) continue;
      // dojście z przystanku startowego (runda 0)
      var p0 = par[0][s]; if (p0 && p0.walk != null) legs.unshift({ type: "walk", from: p0.walk, to: s, min: p0.w });
      betterBoard(legs, origin, startAt, dep, j);
      bestTransfers(legs, net);
      legs.forEach(function (l) { delete l._p; delete l._t; delete l._b; delete l._a; });
      var rides = legs.filter(function (l) { return l.type === "ride"; });
      if (!rides.length) continue;
      // godzina wyjścia (odjazd − dojście, także z miejsca startowego) — do wyboru między podróżami (TODO 69)
      var o0 = legs[0].from, d0 = startAt && startAt.dep0 != null ? startAt.dep0 : dep, w0 = startAt && startAt[o0] != null ? Math.max(0, startAt[o0] - d0) : 0;
      var wk0 = (legs[0].type === "walk" ? legs[0].min : 0) + w0;
      out.push({ dep: rides[0].dep, arr: tau[k][bs], arrTotal: bt, transfers: rides.length - 1, legs: legs, _lv: rides[0].dep - wk0, _wk: wk0 });
    }
    return out;
  }

  // TODO 67 (20.11, reguła autora): gdy dwa kursy jadą wspólnym odcinkiem, przesiadka JAK NAJWCZEŚNIEJ (pierwszy
  // wspólny / sąsiedni przystanek, na którym zdążysz), chyba że dalej zapas jest wyraźnie lepszy — np. 192 / M28:
  // Osiedle Wieczorka Szkoła (przez jezdnię), a gdy tam na styk — Osiedle Wieczorka Dworzec (jeden chodnik).
  // Ten sam kurs dowożący i odjeżdżający — godzina dotarcia do celu się nie zmienia, zmienia się tylko miejsce przesiadki.
  var COMFY = 3;   // zapas od 3 min = „spokojnie” (🟢)
  function bestTransfers(legs, net) {
    var j = net.j;
    for (var i = 0; i < legs.length; i++) {
      var A = legs[i]; if (A.type !== "ride" || A._p == null) continue;
      var k = i + 1, W = null; if (legs[k] && legs[k].type === "walk") { W = legs[k]; k++; }
      var B = legs[k]; if (!B || B.type !== "ride" || B._p == null) continue;
      var pA = j.pats[A._p], pB = j.pats[B._p], sA = pA[1], sB = pB[1], oA = pA[2], oB = pB[2], fA = pA[3], fB = pB[3];
      var tA = j.trips[A._t][1] + (A.delay || 0), tB = j.trips[B._t][1] + (B.delay || 0);
      var cands = [], maxW = Math.max(W ? W.min : 0, 2);   // nie dłuższe przejście niż dotychczasowe (albo 2 min)
      for (var u = A._b + 1; u < sA.length; u++) {
        if (+fA[u] & 2) continue;                          // tu nie wolno wysiąść
        var su = sA[u], arr = tA + oA[2 * u];
        for (var v = 0; v < B._a; v++) {
          if (+fB[v] & 1) continue;                        // tu nie wolno wsiąść
          var sv = sB[v], w = -1;
          if (sv === su) w = 0;
          else { var f = net.foot[su]; for (var q = 0; q < f.length; q += 2) if (f[q] === sv) { w = f[q + 1]; break; } }
          if (w < 0 || w > maxW) continue;
          var need = sv === su || sameNo(j, su, sv) ? 0 : CHANGE, depB = tB + oB[2 * v + 1], slack = depB - arr - w;
          if (slack < need) continue;
          cands.push({ u: u, v: v, w: w, arr: arr, dep: depB, slack: slack });
        }
      }
      if (cands.length < 2) continue;
      cands.sort(function (a, b) { return a.arr - b.arr || a.w - b.w; });
      // najwcześniejsza „spokojna” (zapas ≥ 3 min); gdy żadna — ta z największym zapasem (przy remisie wcześniejsza)
      var pick = cands.find(function (c) { return c.slack >= COMFY; });
      if (!pick) pick = cands.reduce(function (a, b) { return b.slack > a.slack ? b : a; });
      if (pick.u === A._a && pick.v === B._b) continue;
      A._a = pick.u; A.to = sA[pick.u]; A.arr = pick.arr; A.stops = pick.u - A._b;
      B._b = pick.v; B.from = sB[pick.v]; B.dep = pick.dep; B.depPlan = j.trips[B._t][1] + oB[2 * pick.v + 1]; B.stops = B._a - pick.v;
      if (pick.w > 0 || sA[pick.u] !== sB[pick.v]) {
        var nw = { type: "walk", from: sA[pick.u], to: sB[pick.v], min: pick.w };
        if (W) legs[i + 1] = nw; else legs.splice(i + 1, 0, nw);
      } else if (W) legs.splice(i + 1, 1);
    }
  }

  // Pierwszy przejazd: spośród przystanków startowych leżących na trasie tego samego kursu (przed miejscem wysiadki)
  // wybierz ten, z którego wychodzi się najpóźniej (godzina odjazdu − dojście); remis → krótsze dojście.
  function betterBoard(legs, origin, startAt, dep, j) {
    var ri = legs[0] && legs[0].type === "ride" ? 0 : legs[1] && legs[1].type === "ride" && legs[0].type === "walk" ? 1 : -1;
    if (ri < 0) return;
    var L = legs[ri]; if (L._p == null) return;
    // dojście liczone od godziny wyjścia z wyszukiwania (dep0), nie od startu bieżącego przebiegu
    var base = startAt && startAt.dep0 != null ? startAt.dep0 : dep;
    var acc = {}; origin.forEach(function (o) { acc[o] = startAt && startAt[o] != null ? startAt[o] : dep; });
    dep = base;
    var pat = j.pats[L._p], seq = pat[1], off = pat[2], fl = pat[3], t0 = j.trips[L._t][1];
    var curS = ri === 1 ? legs[0].from : seq[L._b];
    var curAcc = acc[curS] != null ? acc[curS] : dep, curWalk = (curAcc - dep) + (ri === 1 ? legs[0].min : 0);
    var best = { b: -1, leave: L.dep - curWalk, walk: curWalk, sc: L.dep - curWalk - WALK_W * curWalk };
    for (var b = 0; b < L._a; b++) {
      var sb = seq[b]; if (acc[sb] == null || (+fl[b] & 1)) continue;
      var depB = t0 + L.delay + off[2 * b + 1], w = acc[sb] - dep;
      if (depB < acc[sb]) continue;                       // nie zdążę na ten przystanek
      var leave = depB - w;
      var sc = leave - WALK_W * w;   // TODO 69: nie 15 min marszu dla 3 min późniejszego wyjścia
      if (sc > best.sc || (sc === best.sc && w < best.walk)) best = { b: b, leave: leave, walk: w, sc: sc };
    }
    if (best.b < 0 || (best.b === L._b && ri === 0)) return;
    L.from = seq[best.b]; L.dep = t0 + L.delay + off[2 * best.b + 1]; L.depPlan = t0 + off[2 * best.b + 1]; L.stops = L._a - best.b; L._b = best.b;
    if (ri === 1) legs.shift();
  }

  // Kilka kolejnych podróży (jak „5 propozycji”): przebiegi od coraz późniejszej godziny.
  // Najwcześniejszy dojazd do KAŻDEGO przystanku sieci (jeden przebieg) — np. żeby
  // wybrać stację przesiadkową: najwcześniej na którym peronie zdążę.
  function reachAll(net, o) {
    var origin = [], startAt = null;
    if (o.fromStops) { startAt = {}; o.fromStops.forEach(function (x) { origin.push(x.s); startAt[x.s] = x.t; }); }
    (o.from || []).forEach(function (nm) { (net.byName[nm] || []).forEach(function (s) { origin.push(s); }); });
    var keep = {};
    if (!origin.length) return null;
    raptor(net, origin, {}, o.dep, (o.maxTransfers == null ? 1 : o.maxTransfers) + 1, o.rt, startAt, keep);
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
    (o.to || []).forEach(function (nm) { (net.byName[nm] || []).forEach(function (s) { destSet[s] = 0; }); });
    // toStops: indeks przystanku albo { s, walk } (dojście od przystanku do celu, np. do domu)
    (o.toStops || []).forEach(function (x) { if (typeof x === "number") destSet[x] = 0; else destSet[x.s] = x.walk || 0; });
    if (!origin.length || !Object.keys(destSet).length) return [];
    var K = (o.maxTransfers == null ? 2 : o.maxTransfers) + 1, dep = o.dep != null ? o.dep : Math.min.apply(null, (o.fromStops || []).map(function (x) { return x.t; })), all = [], count = o.count || 5;
    if (startAt) startAt.dep0 = dep;
    for (var r = 0; r < count * 3 && all.length < count * 2; r++) {
      var res = raptor(net, origin, destSet, dep, K, o.rt, startAt);
      if (!res.length) break;
      res.forEach(function (x) { all.push(x); });
      var first = Math.min.apply(null, res.map(function (x) { return x.dep; }));
      dep = Math.max(dep, first) + 1;
      if (o.maxDep && dep > o.maxDep) break;
    }
    // bez duplikatów i bez podróży zdominowanych (później start i nie wcześniejsza meta przy ≥ przesiadkach)
    var key = function (x) { return x.legs.filter(function (l) { return l.type === "ride"; }).map(function (l) { return l.trip + "@" + l.from; }).join(">"); };
    var seen = {}; all = all.filter(function (x) { var kx = key(x); if (seen[kx]) return false; seen[kx] = 1; return true; });
    // TODO 69: porównanie po „wartości wyjścia” (wyjście − pół minuty za każdą minutę chodzenia), nie po odjeździe pierwszego kursu —
    // wcześniej późniejszy tramwaj z dalekiego przystanku (15 min pieszo) wypierał bliższy przystanek z wcześniejszym wyjściem
    var sv = function (x) { return x._lv - WALK_W * x._wk; };
    all = all.filter(function (x) { return !all.some(function (y) { return y !== x && sv(y) >= sv(x) && y.arrTotal <= x.arrTotal && y.transfers <= x.transfers && (sv(y) > sv(x) || y.arrTotal < x.arrTotal || y.transfers < x.transfers); }); });
    all.sort(function (a, b) { return a.dep - b.dep || a.arrTotal - b.arrTotal; });
    return all.slice(0, count).map(function (x) {
      delete x._lv; delete x._wk;
      x.legs.forEach(function (l) { l.fromName = net.name[l.from]; l.toName = net.name[l.to]; l.fromCode = net.j.stops[l.from][3]; l.toCode = net.j.stops[l.to][3]; });
      return x;
    });
  }

  return { prepare: prepare, search: search, reachAll: reachAll, byCode: byCode };
});
