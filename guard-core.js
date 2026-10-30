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
    return {
      noData: false,
      cancelled: isCancelled(data),
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
    out.onlyThanksToB = dB > 0 && out.slackWithoutB < need + SAFE_MARGIN && out.slack >= need;
    out.etaA = fmt(plannedA + dA);
    if (out.slack < need) out.status = "broken";
    else if (out.slack < need + SAFE_MARGIN || out.onlyThanksToB) out.status = "risk";
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
    var status = "ok";
    r.forEach(function (x) { if (x.noData) status = worse(status, "nodata"); else if (x.cancelled) status = worse(status, "cancelled"); });
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
      can: "⚫ {tr} odwołany — połączenie {from} → {to} nie dojdzie do skutku.",
      better: "✅ Przesiadka na stacji {st} znów bezpieczna ({s} min zapasu).",
      onlyB: " Zdążysz tylko, jeśli {b} nie nadrobi opóźnienia.",
      alt: " Najbliższa alternatywa: {alt}.", check: " Sprawdź alternatywy." },
    en: { title: "🛡️ Guarded connection", ok: "OK", risk: "connection at risk", broken: "connection probably missed", cancelled: "train cancelled", nodata: "no data", done: "arrived",
      warn: "⚠️ Connection at {st} at risk: {a} is +{d} min, {s} min left to change to {b} (need {n}).",
      brk: "🔴 Connection at {st} probably missed: {a} is +{d} min, {b} leaves at {t}.",
      can: "⚫ {tr} cancelled — the {from} → {to} journey won't work.",
      better: "✅ Connection at {st} safe again ({s} min to spare).",
      onlyB: " You'll make it only if {b} doesn't make up its delay.",
      alt: " Next alternative: {alt}.", check: " Check alternatives." },
    de: { title: "🛡️ Überwachte Verbindung", ok: "OK", risk: "Anschluss gefährdet", broken: "Anschluss wahrscheinlich verpasst", cancelled: "Zug fällt aus", nodata: "keine Daten", done: "angekommen",
      warn: "⚠️ Anschluss in {st} gefährdet: {a} hat +{d} Min., zum Umstieg in {b} bleiben {s} Min. (nötig {n}).",
      brk: "🔴 Anschluss in {st} wahrscheinlich verpasst: {a} hat +{d} Min., {b} fährt um {t}.",
      can: "⚫ {tr} fällt aus — die Fahrt {from} → {to} klappt nicht.",
      better: "✅ Anschluss in {st} wieder sicher ({s} Min. Puffer).",
      onlyB: " Klappt nur, wenn {b} die Verspätung nicht aufholt.",
      alt: " Nächste Alternative: {alt}.", check: " Prüfe Alternativen." },
    cs: { title: "🛡️ Hlídané spojení", ok: "OK", risk: "přestup ohrožen", broken: "přestup pravděpodobně ujede", cancelled: "vlak zrušen", nodata: "bez dat", done: "dojeto",
      warn: "⚠️ Přestup ve stanici {st} ohrožen: {a} má +{d} min, na přestup na {b} zbude {s} min (potřeba {n}).",
      brk: "🔴 Přestup ve stanici {st} pravděpodobně ujede: {a} má +{d} min, {b} odjíždí v {t}.",
      can: "⚫ {tr} zrušen — spojení {from} → {to} nevyjde.",
      better: "✅ Přestup ve stanici {st} je znovu bezpečný ({s} min rezervy).",
      onlyB: " Stihneš jen, pokud {b} zpoždění nedožene.",
      alt: " Nejbližší alternativa: {alt}.", check: " Zkontroluj alternativy." },
    es: { title: "🛡️ Conexión vigilada", ok: "OK", risk: "transbordo en riesgo", broken: "transbordo probablemente perdido", cancelled: "tren cancelado", nodata: "sin datos", done: "llegada",
      warn: "⚠️ Transbordo en {st} en riesgo: {a} va con +{d} min, quedarán {s} min para cambiar a {b} (se necesitan {n}).",
      brk: "🔴 Transbordo en {st} probablemente perdido: {a} va con +{d} min, {b} sale a las {t}.",
      can: "⚫ {tr} cancelado: el viaje {from} → {to} no saldrá.",
      better: "✅ Transbordo en {st} seguro de nuevo ({s} min de margen).",
      onlyB: " Solo llegarás si {b} no recupera el retraso.",
      alt: " Próxima alternativa: {alt}.", check: " Revisa alternativas." },
    uk: { title: "🛡️ Відстежуване сполучення", ok: "OK", risk: "пересадка під загрозою", broken: "пересадку, ймовірно, втрачено", cancelled: "поїзд скасовано", nodata: "немає даних", done: "прибуття",
      warn: "⚠️ Пересадка на станції {st} під загрозою: {a} має +{d} хв, на пересадку на {b} лишиться {s} хв (потрібно {n}).",
      brk: "🔴 Пересадку на станції {st}, ймовірно, втрачено: {a} має +{d} хв, {b} відправляється о {t}.",
      can: "⚫ {tr} скасовано — поїздка {from} → {to} не відбудеться.",
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
    res.legs.forEach(function (x, i) { if (ci < 0 && x && !x.noData && x.cancelled) ci = i; });
    var tIdx = res.worst;
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
  function buildJournalEntries(conn, readings, checked, nowIso) {
    var legs = conn.legs || [];
    var lc = function (s) { return String(s || "").trim().toLowerCase(); };
    var dur = function (a, b) { var x = hm(a), y = hm(b); if (x == null || y == null) return null; var d = y - x; if (d < 0) d += 1440; return d; };
    var out = [];
    legs.forEach(function (leg, i) {
      if (checked && checked[i] === false) return;
      if (leg.mode === "gzm") return;   // dzienniczek: tylko przejazdy pociągiem
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
        scheduleId: leg.scheduleId, orderId: leg.orderId,
        _key: [conn.date, leg.scheduleId || "", leg.orderId || "", lc(leg.board.stationName), lc(leg.alight.stationName)].join("|"),
        createdAt: nowIso || new Date().toISOString()
      });
    });
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

  var api = {
    DEFAULTS: DEFAULTS, RANK: RANK, MAX_ACTIVE: MAX_ACTIVE,
    lastArrMin: lastArrMin, buildJournalEntries: buildJournalEntries, remindMessage: remindMessage,
    altOrigin: altOrigin, altQuery: altQuery, pickAlternatives: pickAlternatives, altText: altText,
    norm: norm, hm: hm, fmt: fmt, connectionId: connectionId, fromItinerary: fromItinerary, fromPlannedTrips: fromPlannedTrips,
    timeWindow: timeWindow, isActive: isActive, readLeg: readLeg, evalTransfer: evalTransfer, evaluate: evaluate,
    rising: rising, shouldNotify: shouldNotify, message: message, tx: tx, trainLabel: trainLabel
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GuardCore = api;
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this));
