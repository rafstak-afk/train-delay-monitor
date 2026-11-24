// Strażnik przesiadek („🛡️ Pilnuj połączenia”) — WSPÓLNA logika statusów.
// Ten sam plik liczy status w aplikacji (strona /pilnowane/, planer) i na
// serwerze (cron functions/api/push-tick.js), żeby telefon i powiadomienie
// push zawsze mówiły to samo. Bez zależności — czyste obliczenia na danych
// z /api/train-details (bieg pociągu PLK: opóźnienia, prognozy, perony).
//
// Testy: node scripts/guard-test.js — uruchamiać przy KAŻDEJ zmianie tutaj.
(function (root) {
  "use strict";

  var DEFAULTS = { leadMin: 120, minTransfer: 3, autoPlan: true };
  var PLATFORM_EXTRA = 2;  // inny peron przyjazdu i odjazdu na przesiadce
  var STATION_EXTRA = 5;   // przesiadka między różnymi stacjami (dworzec ↔ przystanek)
  var SAFE_MARGIN = 5;     // 🟢 dopiero od minimum + 5 min zapasu
  // Nowa reguła (TEST: profil autora, potem dla wszystkich): bez opóźnienia przesiadka z zapasem ≥ potrzebnego to 🟢;
  // zapas bezpieczeństwa = samo opóźnienie pociągu A (najwyżej SAFE_MARGIN) — bo opóźnienia zwykle rosną.
  var SOFT_MARGIN = true;   // dla wszystkich (także powiadomienia z serwera) od v5.56
  function setSoftMargin(v) { SOFT_MARGIN = !!v; }
  var RANK = { ok: 0, nodata: 1, risk: 2, broken: 3, cancelled: 4 };
  var MAX_ACTIVE = 5;      // tyle połączeń naraz pilnujemy w tle (limity PLK)

  function norm(s) {
    return String(s || "").toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  function hm(t) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
    return m ? +m[1] * 60 + +m[2] : null;
  }
  function fmt(min) {
    if (min == null) return "";
    min = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function isCancelled(data) {
    var s = String((data && data.status) || "").trim().toUpperCase();
    return s === "X" || s.indexOf("ODWO") >= 0 || s.indexOf("CANCEL") >= 0;
  }
  // Odwołanie NA ODCINKU (23.11, S8 40474): PLK nie zmienia statusu kursu, podaje tylko
  // utrudnienie „Na odcinku od stacji A do stacji B pociąg został odwołany…” z listą stacji.
  // Jeśli ten odcinek zachodzi na naszą nogę (wsiadamy przed jego końcem i wysiadamy po
  // jego początku) — noga odwołana. Zwraca { from, to, zka, msg } albo null.
  var CANCEL_RE = /odwoła|odwoł|nie kursuje|komunikacj\S* zastępcz/i;
  function partialCancel(data, bi, ai) {
    var ds = data && Array.isArray(data.disruptions) ? data.disruptions : [], route = data.route;
    for (var i = 0; i < ds.length; i++) {
      var d = ds[i];
      if (!d || !CANCEL_RE.test(String(d.message || "")) || !Array.isArray(d.stations) || !d.stations.length) continue;
      var set = {}; d.stations.forEach(function (s) { set[norm(s)] = 1; });
      var lo = -1, hi = -1;
      for (var k = 0; k < route.length; k++) if (set[norm(route[k].stationName)]) { if (lo < 0) lo = k; hi = k; }
      if (lo < 0 || hi <= lo) continue;
      if (bi < hi && ai > lo) return { from: route[lo].stationName, to: route[hi].stationName, zka: /zastępcz/i.test(d.message), msg: String(d.message) };
    }
    return null;
  }
  // 23.11 (S8 40474): komunikat o odwołaniu PLK potrafi zniknąć po godzinie, a pociąg znika
  // z danych o ruchu (404) i z tablic. Jadący pociąg zawsze ma dane o ruchu — więc gdy minęło
  // 10 min od planowego odjazdu z naszej stacji, PLK zwraca 404 i nic nie jest potwierdzone,
  // traktujemy go jako „prawdopodobnie odwołany”.
  function warsawNow() {
    var p = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { date: p.year + "-" + p.month + "-" + p.day, min: (+p.hour) * 60 + (+p.minute) };
  }
  function likelyCancelled(data, stop) {
    var dg = data && data.diag;
    if (!dg || dg.opsOk !== false || !/404/.test(String(dg.opsError || "")) || data.lastConfirmedStation) return false;
    if ((data.route || []).some(function (s) { return s.status === "confirmed"; })) return false;
    // TODO 89: od odjazdu ze STACJI POCZĄTKOWEJ — jadący pociąg ma dane o ruchu od startu, więc 10 min po planowym
    // wyjeździe z początku trasy brak danych (404) = zniknął; ostrzeżenie zanim dojedzie do stacji wsiadania.
    var o0 = (data.route || [])[0] || stop, t = hm(o0.plannedDeparture || o0.plannedTime || stop.plannedDeparture || stop.plannedTime), n = warsawNow(), day = String(data.operatingDate || "");
    if (!day || t == null) return false;
    // tylko dziś: dane o ruchu PLK wygasają po ok. 2–3 dniach (20.11 już 404), więc dla starszych dni 404 nic nie znaczy
    // PLK ma dane o ruchu ok. 2–3 h przed startem (23.11: o 19:38 były dla 21:57, nie dla 22:55) — brak na 60 min przed
    // wyjazdem z początku trasy jest już podejrzany (TODO 89: wcześniejsze ostrzeżenie).
    return day === n.date && n.min >= t - 60;
  }

  // ===== TODO 75: czy pociąg poczeka na spóźniony dowożący =====
  // Statystyka z tablic (data/czekanie.json, skrypt notatki/skrypty/czekanie.mjs): pary[stacja|D|F] i linie[stacja|lD|lF]
  // = [przypadków zagrożonej przesiadki, ile razy D czekał, najdłuższe czekanie min]. Najpierw para pociągów (≥ 2 przypadki),
  // potem para linii (≥ 3). „S1 KŁODNICA” → S1.
  function lineOf(n) { var m = String(n || "").match(/^S\d+/); return m ? m[0] : String(n || "").trim(); }
  function waitHint(stats, station, numB, numA, lineB, lineA) {
    if (!stats) return null;
    var p = stats.pary && stats.pary[station + "|" + numB + "|" + numA];
    if (p && p[0] >= 2) return { n: p[0], w: p[1], max: p[2], level: "pair" };
    var l = lineB && lineA && stats.linie && stats.linie[station + "|" + lineB + "|" + lineA];
    if (l && l[0] >= 3) return { n: l[0], w: l[1], max: l[2], level: "line", lineB: lineB, lineA: lineA };
    return null;
  }
  // Tekst (PL — na razie profil autora). needWait = o ile min D musiałby poczekać.
  function waitText(t) {
    var h = t && t.wait; if (!h) return "";
    var who = h.level === "pair" ? trainLabel(t.trainB) + " na " + trainLabel(t.trainA) : "pociągi " + h.lineB + " na " + h.lineA;
    var stat = h.w + " z " + h.n + " razy";
    if (!h.w) return "🕒 " + who + " w " + t.station + " zwykle nie czekają (" + stat + ").";
    var s = "🕒 " + (h.level === "pair" ? who + " czekał" : who + " czekały") + " w " + t.station + " " + stat + ", najdłużej " + h.max + " min";
    if (t.needWait > 0 && t.needWait > h.max) s += " — tu trzeba by ok. " + t.needWait + " min, dłużej niż dotąd";
    else if (t.needWait > 0 && h.w / h.n >= 0.5) s += " — jest szansa, że poczeka";
    return s + ".";
  }

  // ===== TODO 88: obieg składu =====
  // Ten sam skład zwykle wraca: pociąg kończy bieg na stacji początkowej naszego kursu, a potem jedzie
  // z powrotem jako nasz (23.11: S8 40423 → Lubliniec, odwołany „Awaria taboru”; potem S8 40474 z Lublińca).
  // Z tablicy stacji początkowej z przyjazdami (/api/departures?arrivals=1) bierzemy OSTATNI pociąg tego samego
  // przewoźnika i linii, który kończy tam bieg 3–60 min przed naszym odjazdem. To przybliżenie (PLK nie podaje
  // obiegów), więc w tekście „prawdopodobnie”.
  // Zapytanie o tablicę — tylko gdy nasz kurs jeszcze nie wyruszył, a do odjazdu z początku trasy jest ≤ 120 min.
  function rotationQuery(data, date) {
    if (!data || data.error || !Array.isArray(data.route) || !data.route.length || data.lastConfirmedStation) return null;
    var o0 = data.route[0], dep = hm(o0.plannedDeparture || o0.plannedTime), n = warsawNow();
    if (dep == null || !o0.stationName || date !== n.date || n.min < dep - 120 || n.min > dep + 5) return null;
    return { station: o0.stationName, date: date, time: fmt(Math.max(0, dep - 75)), limit: "40", arrivals: "1" };
  }
  // hint = { name } z danych kursu — gdy nasz pociąg zniknął z tablicy (jak 40474 23.11), dopasowanie po samej linii.
  function rotationFrom(rows, trainNum, depTime, hint) {
    rows = Array.isArray(rows) ? rows : [];
    var dep = hm(depTime); if (dep == null) return null;
    var own = rows.filter(function (r) { return !r.terminates && String(r.train) === String(trainNum); })[0]
      || (hint && hint.name ? { carrier: "", name: hint.name } : null);
    if (!own || (!own.carrier && !own.name)) return null;
    var best = null;
    rows.forEach(function (r) {
      if (!r.terminates || (own.carrier && r.carrier !== own.carrier) || (own.name && r.name !== own.name)) return;
      var pa = hm(r.plannedArrivalTime || r.plannedTime);
      if (pa == null || pa > dep - 3 || pa < dep - 60) return;
      if (!best || pa > hm(best.plannedArrivalTime || best.plannedTime)) best = r;
    });
    if (!best) return null;
    var pa = hm(best.plannedArrivalTime || best.plannedTime), turn = dep - pa;
    var ra = hm(best.arrivalTime || best.time); if (ra == null) ra = pa;
    var cancelled = String(best.status || "").toUpperCase() === "X";
    var minTurn = Math.min(5, turn), exp = cancelled ? 0 : Math.max(0, ra + minTurn - dep);
    return { train: String(best.train), label: [best.name || best.category || "", best.train].filter(Boolean).join(" "),
      plannedArr: fmt(pa), arr: fmt(ra), delay: Math.max(0, ra - pa), cancelled: cancelled, expDelay: exp, turn: turn, reason: best.disruptionReason || "",
      dep: fmt(dep), src: best.arrivalSource || "", status: String(best.status || "").toUpperCase(), scheduleId: best.scheduleId || "", orderId: best.orderId || "" };
  }
  // 24.11 (notatka): obieg „na żywo” — bieg poprzedniego kursu (train-details): gdzie jest, opóźnienie na naszej stacji
  // początkowej (potwierdzone / prognoza), czy wyruszył, czy nie odwołany. Uaktualnia rot.
  function rotationLive(rot, d, stationName) {
    if (!rot || !d || d.error || !Array.isArray(d.route) || !d.route.length) return rot;
    var i = findStop(d.route, stationName, 0); if (i < 0) i = d.route.length - 1;
    var st = d.route[i], ad = stopDelay(st, d, "arr"), pa = hm(rot.plannedArr), dep = hm(rot.dep);
    var o0 = d.route[0];
    rot.live = { started: !!d.lastConfirmedStation, where: d.lastConfirmedStation || "", whereTime: d.lastConfirmedTime || "", arrived: st.status === "confirmed",
      src: ad.source, from: o0.stationName || "", fromDep: o0.plannedDeparture || o0.plannedTime || "" };
    if (isCancelled(d) || partialCancel(d, Math.max(0, i - 1), i) || likelyCancelled(d, o0)) rot.cancelled = true;
    if (ad.delay != null && pa != null) {
      rot.delay = Math.max(0, ad.delay); rot.arr = fmt(pa + rot.delay);
      rot.expDelay = rot.cancelled ? 0 : Math.max(0, pa + rot.delay + Math.min(5, rot.turn) - dep);
    }
    return rot;
  }
  // Cały łańcuch (do 2 ogniw): tablica stacji początkowej → poprzedni kurs → jego bieg; gdy jeszcze nie wyruszył —
  // ten sam krok dla niego (skład wcześniej). getBoard(q) i getTrain(rot, date) zwracają Promise z JSON-em.
  function rotationResolve(rd, legNum, date, getBoard, getTrain) {
    var q = rotationQuery(rd, date); if (!q) return Promise.resolve(null);
    return getBoard(q).then(function (b) {
      var rot = rotationFrom(b && b.departures, legNum || rd.train, rd.route[0].plannedDeparture || rd.route[0].plannedTime, { name: rd.name });
      if (!rot || !rot.orderId) return rot;
      return getTrain(rot, date).then(function (d) {
        rotationLive(rot, d, q.station);
        if (!d || !rot.live || rot.live.started || rot.cancelled) return rot;
        var q2 = rotationQuery(d, date); if (!q2) return rot;
        return getBoard(q2).then(function (b2) {
          var p = rotationFrom(b2 && b2.departures, rot.train, d.route[0].plannedDeparture || d.route[0].plannedTime, { name: d.name });
          if (p) {
            rot.prev = p;
            // poprzednie ogniwo spóźnione → nasz poprzedni kurs ruszy później → szacunek dla nas
            if (!p.cancelled && p.expDelay > 0) { var pa2 = hm(rot.plannedArr), dp2 = hm(rot.dep); rot.expDelay = Math.max(rot.expDelay, pa2 + p.expDelay + Math.min(5, rot.turn) - dp2, 0); }
          }
          return rot;
        });
      });
    }).catch(function () { return null; });
  }
  // Jedna linijka o obiegu (PL — na razie profil autora).
  function rotationLine(rot, originName) {
    if (!rot) return "";
    var s = "skład przyjeżdża do " + originName + " jako " + rot.label, lv = rot.live;
    if (lv && lv.from) s += " (start " + lv.from + " " + lv.fromDep + ")";
    if (rot.cancelled) s += " — odwołany";
    else if (lv && lv.arrived) s += " — przyjechał " + rot.arr + (rot.delay ? " (+" + rot.delay + ")" : "") + ", potwierdzone";
    else if (lv && lv.started) s += " — jedzie" + (lv.where ? ", ostatnio " + lv.where + (lv.whereTime ? " " + lv.whereTime : "") : "") + ", przyjazd ok. " + rot.arr + (rot.delay ? " (+" + rot.delay + ")" : " (planowo)");
    else if (lv) s += " — jeszcze nie wyruszył" + (rot.prev ? "; wcześniej ten skład: " + rot.prev.label + (rot.prev.cancelled ? " — odwołany" : rot.prev.delay ? " +" + rot.prev.delay + " min" : "") : "");
    else s += " — " + (rot.src === "actual" ? "przyjechał " + rot.arr : rot.src === "forecast" ? "prognoza " + rot.arr : "wg rozkładu " + rot.plannedArr + ", brak danych na żywo");
    s += " · postój " + Math.max(0, rot.turn - (rot.delay || 0)) + " min";
    if (rot.expDelay >= 5 && !rot.cancelled) s += " · Twój może odjechać ok. " + rot.expDelay + " min później";
    return s;
  }
  // Czy obieg zagraża kursowi, który jeszcze nie wyruszył.
  function rotationRisk(x) { return !!(x && !x.noData && !x.started && x.rotation && (x.rotation.cancelled || x.rotation.expDelay >= 5 || (x.rotation.prev && x.rotation.prev.cancelled))); }
  var ROT_TX = {
    pl: { can: "🔁 {tr}: skład prawdopodobnie przyjeżdża do stacji {st} jako {in}, który jest odwołany{why}. Twój pociąg może zostać odwołany albo opóźniony.",
      late: "🔁 {tr}: skład prawdopodobnie przyjeżdża do stacji {st} jako {in} z opóźnieniem +{d} min (przyjazd {arr}). Twój pociąg może odjechać ok. {e} min później." },
    en: { can: "🔁 {tr}: the train set probably arrives at {st} as {in}, which is cancelled{why}. Your train may be cancelled or delayed.",
      late: "🔁 {tr}: the train set probably arrives at {st} as {in}, +{d} min late (arr. {arr}). Your train may leave about {e} min late." }
  };
  function rotationText(conn, res, lang) {
    var i = -1; res.legs.forEach(function (x, k) { if (i < 0 && rotationRisk(x)) i = k; });
    if (i < 0) return "";
    var t = ROT_TX[lang] || ROT_TX.pl, x = res.legs[i], ro = x.rotation, l = conn.legs[i];
    var st = (l && l._originName) || x.originName || "";
    return fill(ro.cancelled ? t.can : t.late, { tr: trainLabel(l.train), st: st, in: ro.label, d: ro.delay, arr: ro.arr, e: ro.expDelay, why: ro.reason ? " (" + ro.reason + ")" : "" });
  }

  // Id połączenia — z daty i kursów, więc ten sam wynik dodany dwa razy
  // (albo z dwóch urządzeń) to ta sama pozycja, nie duplikat.
  function connectionId(date, legs) {
    return date + "|" + legs.map(function (l) { return (l.mode === "gzm" ? "g" + (l.trip || "") : (l.scheduleId || "") + "-" + (l.orderId || "")) + "@" + norm(l.board && l.board.stationName); }).join(">");
  }

  // Z wyniku planera ({legs, …} + zapytanie) — tylko to, co potrzebne do pilnowania.
  function fromItinerary(it, query) {
    var legs = (it.legs || []).map(function (l) {
      return {
        train: { category: (l.train && l.train.category) || "", number: (l.train && l.train.number) || "", name: (l.train && l.train.name) || "" },
        scheduleId: String(l.scheduleId || ""), orderId: String(l.orderId || ""), trainOrderId: String(l.trainOrderId || ""),
        board: { stationName: l.board.stationName, stationId: l.board.stationId || "", time: l.board.time, platform: l.board.platform || "" },
        alight: { stationName: l.alight.stationName, stationId: l.alight.stationId || "", time: l.alight.time, nextDay: !!l.alight.nextDay }
      };
    });
    return {
      id: connectionId(query.date, legs),
      date: query.date,
      from: legs.length ? legs[0].board.stationName : (query.from || ""),
      to: legs.length ? legs[legs.length - 1].alight.stationName : (query.to || ""),
      legs: legs,
      source: "planner",
      createdAt: new Date().toISOString()
    };
  }

  // Okno pilnowania: od (pierwszy odjazd − leadMin) do przyjazdu na cel + 60 min
  // (bufor na opóźnienie; wcześniej i tak kończy „dojechał”).
  function timeWindow(conn, leadMin) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(conn.date || "");
    if (!d || !conn.legs || !conn.legs.length) return null;
    var base = Date.UTC(+d[1], +d[2] - 1, +d[3]);
    var dep = hm(conn.legs[0].board.time);
    var last = conn.legs[conn.legs.length - 1];
    var arr = hm(last.alight.time);
    if (dep == null || arr == null) return null;
    if (arr < dep || last.alight.nextDay) arr += 1440;
    // Czas „ścienny” Polski liczymy jako UTC + przesunięcie podane przez wywołującego.
    return { startMin: dep - (leadMin == null ? DEFAULTS.leadMin : leadMin), endMin: arr + 60, baseUtc: base };
  }
  // nowMin — minuty od północy dnia conn.date (czas lokalny Polski), może być > 1440.
  function isActive(conn, nowMin, leadMin) {
    var w = timeWindow(conn, leadMin);
    return !!w && nowMin >= w.startMin && nowMin <= w.endMin;
  }

  // Odczyt jednej nogi z danych biegu pociągu.
  function findStop(route, name, fromIdx) {
    var n = norm(name);
    for (var i = fromIdx || 0; i < (route || []).length; i++) if (norm(route[i].stationName) === n) return i;
    return -1;
  }
  // Opóźnienie na stacji: potwierdzone → rzeczywiste; dalej → prognoza PLK;
  // bez prognozy → bieżące opóźnienie pociągu (jeśli już jedzie), inaczej 0.
  function stopDelay(stop, data, kind) {
    if (!stop) return { delay: null, source: "none" };
    var started = !!(data && data.lastConfirmedStation);
    if (stop.status === "confirmed") {
      var c = kind === "arr" ? num(stop.arrivalDelay) : num(stop.departureDelay);
      if (c == null) c = num(stop.delay);
      return { delay: c == null ? 0 : c, source: "confirmed" };
    }
    var f = kind === "arr" ? num(stop.forecastArrivalDelay) : num(stop.forecastDepartureDelay);
    if (f != null) return { delay: f, source: "forecast" };
    if (started) return { delay: num(data.delay) || 0, source: "current" };
    return { delay: 0, source: "notStarted" };
  }
  function readLeg(leg, data) {
    // Odcinek GZM (autobus/tramwaj): data = { gzm: true, t: [stop_sequence, opóźnienie s, …] | null }
    // z /api/gzm-rt. Bez danych na żywo — rozkład (to nie „brak danych”).
    if (leg.mode === "gzm") {
      var gt = data && data.t, cx = !!(gt && gt[1] === "X"), gd = gt && !cx ? Math.round((gt[1] || 0) / 60) : 0;
      var src = gt ? "live" : "sched";
      return { noData: false, gzm: true, cancelled: cx, started: !!gt, boarded: false, arrived: false,
        plannedDep: leg.board.time, plannedArr: leg.alight.time, delayDep: gd, delayArr: gd, depSource: src, arrSource: src, platformDep: "", platformArr: "" };
    }
    if (!data || data.error || !Array.isArray(data.route) || !data.route.length) return { noData: true };
    var bi = findStop(data.route, leg.board.stationName, 0);
    var ai = findStop(data.route, leg.alight.stationName, bi < 0 ? 0 : bi + 1);
    if (bi < 0 || ai < 0) return { noData: true };
    var b = data.route[bi], a = data.route[ai];
    var dep = stopDelay(b, data, "dep"), arr = stopDelay(a, data, "arr");
    var pc = partialCancel(data, bi, ai), lk = !isCancelled(data) && !pc && likelyCancelled(data, b);
    return {
      noData: false,
      cancelled: isCancelled(data) || !!pc || lk,
      cancelSection: pc || null,
      cancelLikely: lk,
      rotation: data._rot || null,
      originName: data.route[0].stationName || "",
      line: lineOf(data.name),
      started: !!data.lastConfirmedStation,
      boarded: b.status === "confirmed",
      arrived: a.status === "confirmed",
      plannedDep: b.plannedDeparture || b.plannedTime || leg.board.time,
      plannedArr: a.plannedArrival || a.plannedTime || leg.alight.time,
      delayDep: dep.delay, depSource: dep.source,
      delayArr: arr.delay, arrSource: arr.source,
      platformDep: b.platform && b.platform !== "-" ? String(b.platform) : "",
      platformArr: a.platform && a.platform !== "-" ? String(a.platform) : ""
    };
  }

  // Jedna przesiadka: A przyjeżdża na X, B odjeżdża z X.
  // zapas planowy = plan. odjazd B − plan. przyjazd A
  // zapas rzeczywisty = (plan. odjazd B + opóźn. B) − (plan. przyjazd A + opóźn. A)
  // OSTROŻNIE: opóźnienie B może zostać nadrobione — jeśli przesiadka wychodzi
  // TYLKO dzięki opóźnieniu B, status jest najwyżej 🟡 („zdążysz, jeśli B nie nadrobi”).
  function evalTransfer(legA, legB, rA, rB, minTransfer) {
    var station = legA.alight.stationName;
    var stationChange = norm(legA.alight.stationName) !== norm(legB.board.stationName);
    var plannedA = hm((rA && !rA.noData && rA.plannedArr) || legA.alight.time);
    var plannedB = hm((rB && !rB.noData && rB.plannedDep) || legB.board.time);
    if (plannedA == null || plannedB == null) return { station: station, status: "nodata" };
    if (plannedB < plannedA - 720) plannedB += 1440; // przez północ
    var plannedSlack = plannedB - plannedA;
    var platformChange = !!(rA && rB && !rA.noData && !rB.noData && rA.platformArr && rB.platformDep && rA.platformArr !== rB.platformDep);
    var need = minTransfer + (platformChange ? PLATFORM_EXTRA : 0) + (stationChange ? STATION_EXTRA : 0);
    // przesiadka z udziałem GZM: potrzebny czas = dojście (peron ↔ przystanek, słupek ↔ słupek), zapisane w odcinku B
    if (legA.mode === "gzm" || legB.mode === "gzm" || legB.walkBefore != null) {
      platformChange = false; stationChange = false;
      need = Math.max(1, legB.walkBefore != null ? legB.walkBefore : minTransfer);
    }
    var out = {
      station: station, toStation: legB.board.stationName, stationChange: stationChange, platformChange: platformChange,
      platformArr: rA && rA.platformArr || "", platformDep: rB && rB.platformDep || "",
      plannedSlack: plannedSlack, need: need,
      trainA: legA.train, trainB: legB.train,
      plannedArrA: fmt(plannedA), plannedDepB: fmt(plannedB)
    };
    if (rA && !rA.noData && rA.cancelled) { out.status = "cancelled"; out.cancelledTrain = "A"; return out; }
    if (rB && !rB.noData && rB.cancelled) { out.status = "cancelled"; out.cancelledTrain = "B"; return out; }
    if (!rA || rA.noData || !rB || rB.noData) { out.status = "nodata"; return out; }
    var dA = rA.delayArr || 0, dB = Math.max(0, rB.delayDep || 0);
    out.delayA = dA; out.delayB = dB; out.delaySourceA = rA.arrSource; out.delaySourceB = rB.depSource;
    out.slack = plannedSlack + dB - dA;
    out.slackWithoutB = plannedSlack - dA;
    var margin = SOFT_MARGIN ? Math.min(SAFE_MARGIN, Math.max(0, dA)) : SAFE_MARGIN;
    out.onlyThanksToB = dB > 0 && out.slackWithoutB < need + margin && out.slack >= need;
    out.etaA = fmt(plannedA + dA);
    if (out.slack < need) out.status = "broken";
    else if (out.slack < need + margin || out.onlyThanksToB) out.status = "risk";
    else out.status = "ok";
    // B już odjechał, a A jeszcze nie dojechał — po przesiadce.
    if (rB.boarded && !rA.arrived && out.status !== "ok") out.status = "broken";
    return out;
  }

  function worse(a, b) { return (RANK[b] || 0) > (RANK[a] || 0) ? b : a; }

  // readings: tablica danych /api/train-details dla kolejnych nóg (null = brak).
  function evaluate(conn, readings, opts) {
    opts = opts || {};
    var minTransfer = opts.minTransfer != null ? opts.minTransfer : DEFAULTS.minTransfer;
    var legs = conn.legs || [];
    var r = legs.map(function (l, i) { return readLeg(l, readings[i]); });
    var transfers = [];
    for (var i = 0; i < legs.length - 1; i++) transfers.push(evalTransfer(legs[i], legs[i + 1], r[i], r[i + 1], minTransfer));
    if (opts.waitStats) transfers.forEach(function (t, k) {
      if ((t.status !== "risk" && t.status !== "broken") || legs[k].mode === "gzm" || legs[k + 1].mode === "gzm") return;
      var rb = r[k + 1], ra = r[k];
      if (rb && rb.boarded) return;   // B już odjechał
      t.wait = waitHint(opts.waitStats, t.station, legs[k + 1].train && legs[k + 1].train.number, legs[k].train && legs[k].train.number, rb && rb.line, ra && ra.line);
      if (t.wait) t.needWait = Math.max(0, (t.need || 0) - (typeof t.slack === "number" ? t.slack : 0));
    });
    var status = "ok";
    r.forEach(function (x) { if (x.noData) status = worse(status, "nodata"); else if (x.cancelled) status = worse(status, "cancelled"); else if (rotationRisk(x)) status = worse(status, "risk"); });
    transfers.forEach(function (t) { status = worse(status, t.status); });
    var last = r[r.length - 1];
    var done = !!(last && !last.noData && last.arrived);
    var lastLeg = legs[legs.length - 1];
    var eta = last && !last.noData ? fmt(hm(last.plannedArr) + (last.delayArr || 0)) : (lastLeg ? lastLeg.alight.time : "");
    // najgorsza przesiadka — do treści powiadomienia
    var worst = -1;
    transfers.forEach(function (t, k) { if (worst < 0 || (RANK[t.status] || 0) > (RANK[transfers[worst].status] || 0)) worst = k; });
    return { status: done ? "done" : status, legs: r, transfers: transfers, worst: worst, eta: eta, done: done };
  }

  // Trend: opóźnienie A rośnie w 3 kolejnych odczytach.
  function rising(history) {
    var h = (history || []).filter(function (x) { return typeof x === "number"; });
    if (h.length < 3) return false;
    var a = h[h.length - 3], b = h[h.length - 2], c = h[h.length - 1];
    return b > a && c > b;
  }

  // Czy wysłać powiadomienie? Tylko przy ZMIANIE statusu, a przy tym samym
  // (🟡/🔴) — gdy opóźnienie A zmieniło się o ≥ 5 min. Bez spamu przy „brak
  // danych” (to nie jest zmiana dla pasażera) i przy pierwszym 🟢.
  function shouldNotify(prev, cur) {
    var p = prev && prev.status, c = cur.status;
    if (c === "nodata" || c === "done") return null;
    if (!p || p === "nodata") return (c === "ok") ? null : "worse";
    if (p !== c) {
      if ((RANK[c] || 0) > (RANK[p] || 0)) return "worse";
      if (c === "ok" && (p === "risk" || p === "broken")) return "better";
      return (RANK[c] || 0) >= RANK.risk ? "changed" : null;
    }
    if ((c === "risk" || c === "broken") && typeof prev.delayA === "number" && typeof cur.delayA === "number" && Math.abs(cur.delayA - prev.delayA) >= 5) return "delay";
    return null;
  }

  // ---------- teksty (powiadomienia i statusy) w 6 językach ----------
  var TXT = {
    pl: { title: "🛡️ Pilnowane połączenie", ok: "OK", risk: "przesiadka zagrożona", broken: "przesiadka prawdopodobnie zerwana", cancelled: "pociąg odwołany", nodata: "brak danych", done: "dojechano",
      warn: "⚠️ Przesiadka na stacji {st} zagrożona: {a} ma +{d} min, na przesiadkę na {b} zostanie {s} min (potrzebne {n}).",
      brk: "🔴 Przesiadka na stacji {st} prawdopodobnie zerwana: {a} ma +{d} min, {b} odjeżdża {t}.",
      can: "⚫ {tr} odwołany — połączenie {from} → {to} nie dojdzie do skutku.", sec: " (odcinek {a} – {b}{z})", zka: ", komunikacja zastępcza", likely: " (prawdopodobnie — PLK nie ma danych o jego ruchu)",
      better: "✅ Przesiadka na stacji {st} znów bezpieczna ({s} min zapasu).",
      onlyB: " Zdążysz tylko, jeśli {b} nie nadrobi opóźnienia.",
      alt: " Najbliższa alternatywa: {alt}.", check: " Sprawdź alternatywy." },
    en: { title: "🛡️ Guarded connection", ok: "OK", risk: "connection at risk", broken: "connection probably missed", cancelled: "train cancelled", nodata: "no data", done: "arrived",
      warn: "⚠️ Connection at {st} at risk: {a} is +{d} min, {s} min left to change to {b} (need {n}).",
      brk: "🔴 Connection at {st} probably missed: {a} is +{d} min, {b} leaves at {t}.",
      can: "⚫ {tr} cancelled — the {from} → {to} journey won't work.", sec: " (section {a} – {b}{z})", zka: ", replacement bus", likely: " (probably — PLK has no running data for it)",
      better: "✅ Connection at {st} safe again ({s} min to spare).",
      onlyB: " You'll make it only if {b} doesn't make up its delay.",
      alt: " Next alternative: {alt}.", check: " Check alternatives." },
    de: { title: "🛡️ Überwachte Verbindung", ok: "OK", risk: "Anschluss gefährdet", broken: "Anschluss wahrscheinlich verpasst", cancelled: "Zug fällt aus", nodata: "keine Daten", done: "angekommen",
      warn: "⚠️ Anschluss in {st} gefährdet: {a} hat +{d} Min., zum Umstieg in {b} bleiben {s} Min. (nötig {n}).",
      brk: "🔴 Anschluss in {st} wahrscheinlich verpasst: {a} hat +{d} Min., {b} fährt um {t}.",
      can: "⚫ {tr} fällt aus — die Fahrt {from} → {to} klappt nicht.", sec: " (Abschnitt {a} – {b}{z})", zka: ", Ersatzverkehr", likely: " (wahrscheinlich — PLK hat keine Fahrdaten)",
      better: "✅ Anschluss in {st} wieder sicher ({s} Min. Puffer).",
      onlyB: " Klappt nur, wenn {b} die Verspätung nicht aufholt.",
      alt: " Nächste Alternative: {alt}.", check: " Prüfe Alternativen." },
    cs: { title: "🛡️ Hlídané spojení", ok: "OK", risk: "přestup ohrožen", broken: "přestup pravděpodobně ujede", cancelled: "vlak zrušen", nodata: "bez dat", done: "dojeto",
      warn: "⚠️ Přestup ve stanici {st} ohrožen: {a} má +{d} min, na přestup na {b} zbude {s} min (potřeba {n}).",
      brk: "🔴 Přestup ve stanici {st} pravděpodobně ujede: {a} má +{d} min, {b} odjíždí v {t}.",
      can: "⚫ {tr} zrušen — spojení {from} → {to} nevyjde.", sec: " (úsek {a} – {b}{z})", zka: ", náhradní doprava", likely: " (pravděpodobně — PLK nemá data o jeho jízdě)",
      better: "✅ Přestup ve stanici {st} je znovu bezpečný ({s} min rezervy).",
      onlyB: " Stihneš jen, pokud {b} zpoždění nedožene.",
      alt: " Nejbližší alternativa: {alt}.", check: " Zkontroluj alternativy." },
    es: { title: "🛡️ Conexión vigilada", ok: "OK", risk: "transbordo en riesgo", broken: "transbordo probablemente perdido", cancelled: "tren cancelado", nodata: "sin datos", done: "llegada",
      warn: "⚠️ Transbordo en {st} en riesgo: {a} va con +{d} min, quedarán {s} min para cambiar a {b} (se necesitan {n}).",
      brk: "🔴 Transbordo en {st} probablemente perdido: {a} va con +{d} min, {b} sale a las {t}.",
      can: "⚫ {tr} cancelado: el viaje {from} → {to} no saldrá.", sec: " (tramo {a} – {b}{z})", zka: ", transporte sustitutivo", likely: " (probablemente: PLK no tiene datos de su circulación)",
      better: "✅ Transbordo en {st} seguro de nuevo ({s} min de margen).",
      onlyB: " Solo llegarás si {b} no recupera el retraso.",
      alt: " Próxima alternativa: {alt}.", check: " Revisa alternativas." },
    uk: { title: "🛡️ Відстежуване сполучення", ok: "OK", risk: "пересадка під загрозою", broken: "пересадку, ймовірно, втрачено", cancelled: "поїзд скасовано", nodata: "немає даних", done: "прибуття",
      warn: "⚠️ Пересадка на станції {st} під загрозою: {a} має +{d} хв, на пересадку на {b} лишиться {s} хв (потрібно {n}).",
      brk: "🔴 Пересадку на станції {st}, ймовірно, втрачено: {a} має +{d} хв, {b} відправляється о {t}.",
      can: "⚫ {tr} скасовано — поїздка {from} → {to} не відбудеться.", sec: " (ділянка {a} – {b}{z})", zka: ", замінний транспорт", likely: " (ймовірно — PLK не має даних про його рух)",
      better: "✅ Пересадка на станції {st} знову безпечна ({s} хв запасу).",
      onlyB: " Встигнеш, лише якщо {b} не наздожене затримку.",
      alt: " Найближча альтернатива: {alt}.", check: " Перевір альтернативи." }
  };
  function tx(lang) { return TXT[lang] || TXT.pl; }
  function fill(s, p) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return p[k] != null ? p[k] : m; }); }
  function trainLabel(t) { return [t && t.category, t && t.number].filter(Boolean).join(" ") || "?"; }

  // Treść powiadomienia dla wyniku evaluate() i rodzaju zmiany.
  function message(conn, res, kind, lang, altText) {
    var t = tx(lang);
    var tr = res.transfers[res.worst] || null;
    var body;
    if (res.status === "cancelled") {
      var ci = res.legs.findIndex(function (x) { return !x.noData && x.cancelled; });
      body = fill(t.can, { tr: trainLabel(conn.legs[ci < 0 ? 0 : ci].train), from: conn.from, to: conn.to });
      var cs = ci >= 0 && res.legs[ci].cancelSection;
      if (ci >= 0 && res.legs[ci].cancelLikely && t.likely) body = body.replace(/\.?$/, function () { return t.likely + "."; });
      if (cs && t.sec) body = body.replace(/\.?$/, function () { return fill(t.sec, { a: cs.from, b: cs.to, z: cs.zka ? t.zka : "" }) + "."; });
    } else if (res.status === "risk" && kind !== "better" && rotationText(conn, res, lang) && (!tr || (RANK[tr.status] || 0) < RANK.risk)) {
      body = rotationText(conn, res, lang);
    } else if (kind === "better" && tr) {
      body = fill(t.better, { st: tr.station, s: tr.slack });
    } else if (tr && res.status === "broken") {
      body = fill(t.brk, { st: tr.station, a: trainLabel(tr.trainA), d: tr.delayA, b: trainLabel(tr.trainB), t: fmt(hm(tr.plannedDepB) + (tr.delayB || 0)) });
    } else if (tr) {
      body = fill(t.warn, { st: tr.station, a: trainLabel(tr.trainA), d: tr.delayA, b: trainLabel(tr.trainB), s: Math.max(0, tr.slack), n: tr.need });
      if (tr.onlyThanksToB) body += fill(t.onlyB, { b: trainLabel(tr.trainB) });
    } else {
      body = t[res.status] || res.status;
    }
    if (tr && tr.wait && (res.status === "risk" || res.status === "broken") && kind !== "better") body += " " + waitText(tr);
    if ((res.status === "broken" || res.status === "cancelled") && kind !== "better") body += altText ? fill(t.alt, { alt: altText }) : t.check;
    return { title: t.title, body: body };
  }

  // Plan z dzienniczka → połączenia: odcinki z jednego dnia, które łączą się
  // w ciąg (wysiadka = następne wsiadanie, odjazd po przyjeździe, < 3 h przerwy).
  function fromPlannedTrips(trips) {
    var byDate = {};
    (trips || []).forEach(function (e) {
      if (!e || !e.date || !e.scheduleId || !e.orderId || !e.boardStation || !e.alightStation) return;
      (byDate[e.date] = byDate[e.date] || []).push(e);
    });
    var out = [];
    Object.keys(byDate).forEach(function (date) {
      var list = byDate[date].slice().sort(function (a, b) { return (hm(a.plannedDeparture) || 0) - (hm(b.plannedDeparture) || 0); });
      var chain = [];
      var flush = function () {
        if (!chain.length) return;
        var legs = chain.map(function (e) {
          return {
            train: { category: e.category || "", number: e.trainNumber || "", name: "" },
            scheduleId: String(e.scheduleId), orderId: String(e.orderId), trainOrderId: "",
            board: { stationName: e.boardStation, time: e.plannedDeparture || "" },
            alight: { stationName: e.alightStation, time: e.plannedArrival || "", nextDay: false }
          };
        });
        out.push({ id: "plan:" + connectionId(date, legs), date: date, from: legs[0].board.stationName, to: legs[legs.length - 1].alight.stationName, legs: legs, source: "plan", planKeys: chain.map(function (e) { return e._key; }) });
        chain = [];
      };
      list.forEach(function (e) {
        var prev = chain[chain.length - 1];
        if (prev) {
          var gap = (hm(e.plannedDeparture) || 0) - (hm(prev.plannedArrival) || 0);
          if (norm(prev.alightStation) !== norm(e.boardStation) || gap < 0 || gap > 180) flush();
        }
        chain.push(e);
      });
      flush();
    });
    return out;
  }

  // ---------- alternatywy (przy 🔴 / ⚫) ----------
  // Skąd i od kiedy szukać: odwołany pociąg przed najgorszą przesiadką → od
  // stacji, gdzie miałem do niego wsiąść, od jego planowego odjazdu; inaczej
  // od stacji przesiadki, od przewidywanej godziny dotarcia tam (z opóźnieniem).
  // keep = ile pierwszych nóg zostaje przy przełączeniu na alternatywę.
  function altOrigin(conn, res) {
    if (!res || !res.legs) return null;
    if ((conn.legs || []).some(function (l) { return l.mode === "gzm"; })) return null;   // podróż z GZM — bez alternatyw z planera PLK
    var ci = -1;
    res.legs.forEach(function (x, i) { if (ci < 0 && x && !x.noData && (x.cancelled || rotationRisk(x))) ci = i; });
    var tIdx = res.worst;
    if (tIdx >= 0 && res.transfers[tIdx] && (RANK[res.transfers[tIdx].status] || 0) < RANK.risk && ci < 0) tIdx = -1;
    if (ci >= 0 && (tIdx < 0 || ci <= tIdx)) {
      var l = conn.legs[ci];
      return { keep: ci, station: l.board.stationName, stationId: l.board.stationId || "", time: l.board.time };
    }
    var t = res.transfers && res.transfers[tIdx];
    if (!t) return null;
    return { keep: tIdx + 1, station: t.station, stationId: conn.legs[tIdx].alight.stationId || "", time: t.etaA || conn.legs[tIdx].alight.time };
  }
  // Zapytanie do /api/planner dla alternatyw.
  function altQuery(conn, origin) {
    var last = conn.legs[conn.legs.length - 1];
    var q = { from: origin.station, to: last.alight.stationName, date: conn.date, time: origin.time };
    if (origin.stationId) q.fromId = origin.stationId;
    if (last.alight.stationId) q.toId = last.alight.stationId;
    return q;
  }
  // 2–3 najlepsze: najwcześniejszy przyjazd na cel.
  function pickAlternatives(itineraries, n) {
    return (itineraries || []).filter(function (it) { return it && it.legs && it.legs.length; })
      .slice().sort(function (a, b) { return (hm(a.arrivalTime) + (a.arrivalNextDay ? 1440 : 0)) - (hm(b.arrivalTime) + (b.arrivalNextDay ? 1440 : 0)); })
      .slice(0, n || 3);
  }
  var ALT_FMT = { pl: "{tr} o {dep} (przyj. {arr})", en: "{tr} at {dep} (arr. {arr})", de: "{tr} um {dep} (an {arr})", cs: "{tr} v {dep} (příj. {arr})", es: "{tr} a las {dep} (llega {arr})", uk: "{tr} о {dep} (приб. {arr})" };
  // „KŚ 40602 o 17:42 (przyj. 18:30)” — do treści powiadomienia.
  function altText(it, lang) {
    if (!it || !it.legs || !it.legs.length) return "";
    var tr = it.legs.map(function (l) { return trainLabel(l.train); }).join(" + ");
    return fill(ALT_FMT[lang] || ALT_FMT.pl, { tr: tr, dep: it.departureTime || it.legs[0].board.time, arr: it.arrivalTime || it.legs[it.legs.length - 1].alight.time });
  }

  // ---------- po podróży: dzienniczek tylko z potwierdzenia ----------
  // Planowy przyjazd na cel (minuty od północy dnia conn.date, może być > 1440).
  function lastArrMin(conn) {
    var w = timeWindow(conn, 0);
    return w ? w.endMin - 60 : null;
  }
  // Wpisy dzienniczka dla odcinków, którymi pasażer POTWIERDZIŁ, że jechał
  // (checked[i] === false = pominąć). Godziny rzeczywiste = plan + opóźnienie
  // z danych PLK (potwierdzone albo ostatnia prognoza). Format jak w dzienniczku.
  // opts.gzm — także odcinki GZM (autobus/tramwaj/trolejbus): linia jako numer, ikona jako kategoria, godziny z rozkładu + opóźnienie GZM na żywo.
  // Kilometry odcinka „zapamiętane raz”: najpierw ulubione trasy z dzienniczka (odcinek z tą samą parą stacji,
  // w obie strony), potem ostatni wpis dzienniczka z tą parą stacji i wpisanymi km.
  function kmFor(board, alight, trips, journal) {
    var n = function (s) { return String(s || "").trim().toLowerCase(); }, b = n(board), a = n(alight);
    if (!b || !a) return null;
    var list = Array.isArray(trips) ? trips : trips && typeof trips === "object" ? ["domPraca", "pracaDom"].filter(function (id) { return trips[id]; }).map(function (id) { var t = Object.assign({}, trips[id]); t.id = t.id || id; return t; }) : [];
    for (var pass = 0; pass < 2; pass++) for (var i = 0; i < list.length; i++) {
      var t = list[i]; if (!t) continue;
      var legs = t.leg1 ? [t.leg1, t.leg2] : [{ board: t.board, alight: t.alight }];
      for (var j = 0; j < legs.length; j++) {
        var l = legs[j]; if (!l || !l.board || !l.alight) continue;
        var hit = pass === 0 ? n(l.board) === b && n(l.alight) === a : n(l.board) === a && n(l.alight) === b;
        if (!hit) continue;
        var km = l.distanceKm != null && l.distanceKm !== "" ? Number(l.distanceKm) : !t.leg2 && t.distanceKm ? Number(t.distanceKm) : null;
        if (km != null && isFinite(km)) return { km: km, trip: pass === 0 ? t : null, legNumber: j + 1, src: "trasa" };
      }
    }
    var best = null;
    (Array.isArray(journal) ? journal : []).forEach(function (e) {
      if (!e || e.distanceKm == null || e.distanceKm === "" || e.mode === "gzm") return;
      var eb = n(e.boardStation), ea = n(e.alightStation);
      if (!((eb === b && ea === a) || (eb === a && ea === b))) return;
      var at = String(e.date || "") + String(e.createdAt || "");
      if (!best || at > best.at) best = { at: at, km: Number(e.distanceKm) };
    });
    return best && isFinite(best.km) ? { km: best.km, trip: null, src: "dzienniczek" } : null;
  }
  function buildJournalEntries(conn, readings, checked, nowIso, opts) {
    var legs = conn.legs || [];
    var lc = function (s) { return String(s || "").trim().toLowerCase(); };
    var kmOn = opts && (opts.trips || opts.journal);
    var dur = function (a, b) { var x = hm(a), y = hm(b); if (x == null || y == null) return null; var d = y - x; if (d < 0) d += 1440; return d; };
    var out = [];
    legs.forEach(function (leg, i) {
      if (checked && checked[i] === false) return;
      var isG = leg.mode === "gzm";
      if (isG && !(opts && opts.gzm)) return;   // dzienniczek: domyślnie tylko przejazdy pociągiem
      var data = readings ? readings[i] : null;
      var r = readLeg(leg, data);
      var ok = r && !r.noData;
      var plannedDep = (ok && r.plannedDep) || leg.board.time;
      var plannedArr = (ok && r.plannedArr) || leg.alight.time;
      var dDep = ok ? (r.delayDep || 0) : 0, dArr = ok ? (r.delayArr || 0) : 0;
      var actualDep = fmt(hm(plannedDep) + dDep), actualArr = fmt(hm(plannedArr) + dArr);
      out.push({
        date: conn.date,
        trainNumber: (data && data.trainNumber) || (leg.train && leg.train.number) || "",
        category: (data && data.category) || (leg.train && leg.train.category) || "",
        boardStation: leg.board.stationName, alightStation: leg.alight.stationName,
        plannedDeparture: plannedDep, actualDeparture: actualDep,
        plannedArrival: plannedArr, actualArrival: actualArr,
        delayMinutes: dArr,
        plannedDurationMin: dur(plannedDep, plannedArr), actualDurationMin: dur(actualDep, actualArr),
        tripType: "inna",
        tripLabel: legs.length > 1 ? conn.from + " → " + conn.to : "",
        legNumber: legs.length > 1 ? i + 1 : null,
        distanceKm: null,
        scheduleId: isG ? "" : leg.scheduleId, orderId: isG ? "" : leg.orderId,
        mode: isG ? "gzm" : undefined, gzmTrip: isG ? leg.trip : undefined, gzmKind: isG ? leg.kind : undefined,
        _key: [conn.date, isG ? "gzm" : (leg.scheduleId || ""), isG ? String(leg.trip || "") : (leg.orderId || ""), lc(leg.board.stationName), lc(leg.alight.stationName)].join("|"),
        createdAt: nowIso || new Date().toISOString()
      });
      if (kmOn && !isG) {
        var k = kmFor(leg.board.stationName, leg.alight.stationName, opts.trips, opts.journal), e = out[out.length - 1];
        if (k) { e.distanceKm = k.km; e._kt = k.trip; e._kl = k.legNumber; }
      }
    });
    // wszystkie odcinki pociągiem to odcinki TEJ SAMEJ ulubionej trasy → jej nazwa i typ (jak przy zapisie z biegu pociągu)
    if (kmOn) {
      var tr = out.filter(function (e) { return e.mode !== "gzm"; }), t0 = tr.length && tr[0]._kt;
      if (t0 && tr.every(function (e) { return e._kt === t0; })) tr.forEach(function (e) { e.tripType = t0.id || "inna"; e.tripLabel = t0.name || "trasa"; e.legNumber = t0.leg2 ? e._kl : null; });
      out.forEach(function (e) { delete e._kt; delete e._kl; });
    }
    return out;
  }
  var REMIND = {
    pl: "📓 Dojechałeś? Zapisz przejazd {from} → {to} w dzienniczku albo oznacz, że nie jechałeś.",
    en: "📓 Arrived? Save the {from} → {to} trip in your journal, or mark that you didn't travel.",
    de: "📓 Angekommen? Speichere die Fahrt {from} → {to} im Reisetagebuch oder markiere, dass du nicht gefahren bist.",
    cs: "📓 Dojel jsi? Ulož jízdu {from} → {to} do deníku, nebo označ, že jsi nejel.",
    es: "📓 ¿Has llegado? Guarda el viaje {from} → {to} en tu diario o marca que no viajaste.",
    uk: "📓 Доїхав? Збережи поїздку {from} → {to} у щоденнику або познач, що не їхав."
  };
  function remindMessage(conn, lang) {
    return { title: tx(lang).title, body: fill(REMIND[lang] || REMIND.pl, { from: conn.from, to: conn.to }) };
  }

  // ===== Przypomnienia o wyjściu z domu =====
  // cfg = { on, walk (min dojścia na stację/przystanek), mins: [30, 15] (przed WYJŚCIEM) }.
  // Wyjście = odjazd pierwszego odcinka − dojście (+ przesunięcie o opóźnienie pociągu).
  var REM_DEFAULTS = { walk: 10, mins: [30, 15] };
  function remindMins(cfg) {
    var m = (cfg && Array.isArray(cfg.mins) ? cfg.mins : REM_DEFAULTS.mins).map(Number).filter(function (x) { return x >= 1 && x <= 180; });
    m = m.filter(function (x, i) { return m.indexOf(x) === i; }).sort(function (a, b) { return b - a; });
    return m.slice(0, 5);
  }
  function remindPlan(conn, cfg, shift) {
    var l0 = conn && conn.legs && conn.legs[0]; if (!l0) return null;
    var dep = hm(l0.board.time); if (dep == null) return null;
    var walk = cfg && cfg.walk != null && cfg.walk !== "" ? Math.max(0, Math.min(120, Number(cfg.walk) || 0)) : REM_DEFAULTS.walk;
    var leave = dep - walk + (shift || 0);
    return { dep: dep, walk: walk, leave: leave, fires: remindMins(cfg).map(function (m) { return { m: m, at: leave - m }; }) };
  }
  // Przesunięcie wyjścia: tylko przy opóźnieniu ≥ 3 min (potwierdzonym, prognozie PLK albo bieżącym).
  function remindShift(reading) {
    if (!reading || reading.noData || reading.cancelled) return 0;
    var d = Number(reading.delayDep) || 0;
    return d >= 3 ? d : 0;
  }
  var REM_TX = {
    pl: { title: "⏰ Za {m} min wyjście", now: "⏰ Czas wychodzić", train: "pociąg", plat: "peron {p}", delay: "opóźnienie +{d} min — wyjdź o {t}", cancel: "⚫ pociąg odwołany wg PLK", may: "pociąg może nadrobić" },
    en: { title: "⏰ Leave in {m} min", now: "⏰ Time to leave", train: "train", plat: "platform {p}", delay: "delay +{d} min — leave at {t}", cancel: "⚫ train cancelled (PLK)", may: "the train may catch up" },
    de: { title: "⏰ In {m} Min. losgehen", now: "⏰ Zeit zu gehen", train: "Zug", plat: "Bahnsteig {p}", delay: "Verspätung +{d} Min. — geh um {t} los", cancel: "⚫ Zug fällt aus (PLK)", may: "der Zug kann aufholen" },
    cs: { title: "⏰ Za {m} min odchod", now: "⏰ Čas vyrazit", train: "vlak", plat: "nástupiště {p}", delay: "zpoždění +{d} min — vyraz v {t}", cancel: "⚫ vlak zrušen (PLK)", may: "vlak může dohnat zpoždění" },
    es: { title: "⏰ Sal en {m} min", now: "⏰ Hora de salir", train: "tren", plat: "andén {p}", delay: "retraso +{d} min: sal a las {t}", cancel: "⚫ tren cancelado (PLK)", may: "el tren puede recuperar tiempo" },
    uk: { title: "⏰ Через {m} хв виходь", now: "⏰ Час виходити", train: "потяг", plat: "перон {p}", delay: "затримка +{d} хв — виходь о {t}", cancel: "⚫ потяг скасовано (PLK)", may: "потяг може надолужити" }
  };
  // o = { m, conn, reading (readLeg pierwszego odcinka) | null, plan (remindPlan z przesunięciem) }
  function remindText(lang, o) {
    var t = REM_TX[lang] || REM_TX.pl, c = o.conn, l0 = c.legs[0], r = o.reading || null;
    var lab = l0.mode === "gzm" ? trainLabel(l0.train) : (t.train + " " + trainLabel(l0.train));
    var parts = [lab + " " + l0.board.time + " " + c.from + " → " + c.to];
    if (r && !r.noData && r.platformDep && r.platformDep !== "-") parts[0] += ", " + fill(t.plat, { p: r.platformDep });
    if (r && r.cancelled) parts.push(t.cancel);
    else if (o.shift) parts.push(fill(t.delay, { d: o.shift, t: fmt(o.plan.leave) }) + " (" + t.may + ")");
    return { title: o.m > 0 ? fill(t.title, { m: o.m }) : t.now, body: "→ " + parts.join(" · ") };
  }
  // Plik kalendarza: wydarzenie „wyjście” z alarmem przed nim (VALARM) — dla każdego przypomnienia.
  function remindIcs(conn, cfg, title) {
    var p = remindPlan(conn, cfg, 0); if (!p) return "";
    var d = String(conn.date).replace(/-/g, "");
    var at = function (min) { var day = new Date(Date.parse(conn.date + "T00:00:00Z") + Math.floor(min / 1440) * 86400000).toISOString().slice(0, 10).replace(/-/g, ""); min = ((min % 1440) + 1440) % 1440; return day + "T" + String(Math.floor(min / 60)).padStart(2, "0") + String(min % 60).padStart(2, "0") + "00"; };
    var esc = function (x) { return String(x || "").replace(/[\\;,]/g, function (ch) { return "\\" + ch; }).replace(/\n/g, "\\n"); };
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//czy-zdaze//przypomnienie//PL", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      "UID:" + conn.id.replace(/[^A-Za-z0-9]/g, "") + "-" + d + "@czy-zdaze", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART;TZID=Europe/Warsaw:" + at(p.leave), "DTEND;TZID=Europe/Warsaw:" + at(p.dep), "SUMMARY:" + esc(title), "DESCRIPTION:" + esc(conn.from + " → " + conn.to + " · " + conn.legs[0].board.time)];
    p.fires.forEach(function (f) { lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(title), "TRIGGER:-PT" + f.m + "M", "END:VALARM"); });
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(title), "TRIGGER:PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
  }

  var api = {
    REM_DEFAULTS: REM_DEFAULTS, remindMins: remindMins, remindPlan: remindPlan, remindShift: remindShift, remindText: remindText, remindIcs: remindIcs,
    DEFAULTS: DEFAULTS, RANK: RANK, MAX_ACTIVE: MAX_ACTIVE,
    lastArrMin: lastArrMin, buildJournalEntries: buildJournalEntries, kmFor: kmFor, remindMessage: remindMessage,
    altOrigin: altOrigin, altQuery: altQuery, pickAlternatives: pickAlternatives, altText: altText,
    norm: norm, hm: hm, fmt: fmt, connectionId: connectionId, fromItinerary: fromItinerary, fromPlannedTrips: fromPlannedTrips,
    timeWindow: timeWindow, isActive: isActive, readLeg: readLeg, evalTransfer: evalTransfer, evaluate: evaluate, setSoftMargin: setSoftMargin,
    rising: rising, shouldNotify: shouldNotify, message: message, tx: tx, trainLabel: trainLabel,
    isCancelled: isCancelled, partialCancel: partialCancel, likelyCancelled: likelyCancelled,
    rotationQuery: rotationQuery, rotationFrom: rotationFrom, rotationRisk: rotationRisk, rotationText: rotationText,
    rotationLive: rotationLive, rotationResolve: rotationResolve, rotationLine: rotationLine,
    lineOf: lineOf, waitHint: waitHint, waitText: waitText
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GuardCore = api;
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this));
