// 🛡️ Widok pilnowanych połączeń (zakładka „Pilnowane” w planerze; dawniej
// osobna strona /pilnowane/, która teraz tu przekierowuje). Wymaga
// guard-core.js, guard-store.js (i opcjonalnie alarm-sound.js, i18n.js).
//   var v = GuardView.mount(element, { focusId, onCount(n) });
//   v.start()  — pokazany: odświeża i odpytuje PLK (co 1–5 min)
//   v.stop()   — ukryty: bez odpytywania
(function () {
  'use strict';
  var STYLE =
    '.gv .notice{background:rgba(255,204,0,.08);border:1px solid rgba(255,204,0,.5);color:#ffe27a;border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.45;margin:10px 0}' +
    '.gv .notice a{color:#ffe27a}' +
    '.gv .btn-sm{border:0;border-radius:10px;background:var(--blue);color:#fff;font-weight:800;cursor:pointer;font-family:inherit;padding:7px 11px;font-size:12.5px}' +
    '.gv .btn-sm.secondary{background:var(--grey)}.gv .btn-sm.danger{background:#7f1d1d}' +
    '.gv .gv-settings{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px;margin:12px 0}' +
    '.gv .gv-settings summary{cursor:pointer;font-weight:800;font-size:14px}' +
    '.gv .set-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0;font-size:13.5px;flex-wrap:wrap}' +
    '.gv .set-row select{width:auto;background:var(--card);color:#fff;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:13.5px}' +
    '.gv .set-row input{width:auto;margin:0}' +
    '.gv .card{background:var(--panel);border:1px solid var(--line);border-left:6px solid var(--grey);border-radius:14px;padding:12px 14px;margin:12px 0}' +
    '.gv .card.s-ok{border-left-color:var(--green)}.gv .card.s-risk{border-left-color:var(--yellow)}.gv .card.s-broken{border-left-color:var(--red)}.gv .card.s-cancelled{border-left-color:#000;background:#151a20}' +
    '.gv .card.hl{box-shadow:0 0 0 2px var(--cyan)}' +
    '.gv .c-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}' +
    '.gv .c-route{font-weight:800;font-size:15.5px;line-height:1.3}' +
    '.gv .c-date{color:var(--muted);font-size:12.5px;margin-top:2px}' +
    '.gv .chip{flex:0 1 auto;max-width:48%;border-radius:12px;padding:5px 10px;font-size:12.5px;font-weight:800;background:var(--grey);text-align:center;line-height:1.3}' +
    '.gv .chip.s-ok{background:rgba(93,211,158,.18);color:var(--green)}.gv .chip.s-risk{background:rgba(255,204,0,.16);color:var(--yellow)}' +
    '.gv .chip.s-broken{background:rgba(255,77,77,.18);color:var(--red)}.gv .chip.s-cancelled{background:#000;color:#fff}.gv .chip.s-done{background:rgba(34,211,238,.15);color:var(--cyan)}' +
    '.gv .leg{display:grid;grid-template-columns:88px minmax(0,1fr);gap:8px;padding:8px 0;border-top:1px solid #2a3a4c;font-size:13.5px}' +
    '.gv .leg:first-of-type{border-top:0}' +
    '.gv a.leg{color:inherit;text-decoration:none;border-radius:8px;position:relative;padding-right:18px}' +
    '.gv a.leg:hover{background:rgba(255,255,255,.04)}' +
    '.gv a.leg::after{content:"›";position:absolute;right:4px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:20px}' +
    '.gv .leg-t{font-weight:800}.gv .leg-t small{display:block;color:var(--muted);font-weight:400}' +
    '.gv .leg-train{font-weight:800}.gv .leg-st{color:var(--muted);overflow-wrap:anywhere}' +
    '.gv .dl{font-weight:800}.gv .dl.late{color:var(--yellow)}.gv .dl.vlate{color:var(--red)}.gv .dl.ontime{color:var(--green)}' +
    '.gv .src{color:var(--muted);font-size:11.5px}' +
    '.gv .xfer{margin:4px 0 4px 72px;padding:8px 10px;border-radius:10px;background:var(--card);font-size:13px;line-height:1.45}' +
    '.gv .xfer.s-ok{border:1px solid rgba(93,211,158,.4)}.gv .xfer.s-risk{border:1px solid rgba(255,204,0,.55)}.gv .xfer.s-broken,.gv .xfer.s-cancelled{border:1px solid rgba(255,77,77,.6)}' +
    '.gv .xfer .warn{color:var(--yellow)}' +
    '.gv .rem{margin-top:10px;padding:9px 10px;border:1px solid #6b5d1a;border-radius:10px;background:rgba(255,212,0,.06);font-size:13.5px}' +
    '.gv .rem label.rem-t{display:flex;gap:8px;align-items:center;font-weight:800;cursor:pointer}' +
    '.gv .rem-row{margin-top:7px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
    '.gv .rem input[type=number]{width:62px;padding:5px;border-radius:7px;border:1px solid #48627c;background:#223244;color:#fff;font-size:14px}' +
    '.gv .rem-chip{display:inline-flex;gap:6px;align-items:center;border:1px solid #6b5d1a;border-radius:14px;padding:4px 9px;background:#2a2410}' +
    '.gv .rem-chip button{border:0;background:transparent;color:#ff8a8a;cursor:pointer;font-size:13px;padding:0}' +
    '.gv .rem-note{color:#b8c3cf;font-size:12px;line-height:1.4}' +
    '.gv .c-foot{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between;margin-top:10px}' +
    '.gv .c-meta{color:var(--muted);font-size:11.5px}' +
    '.gv .c-actions{display:flex;gap:6px;flex-wrap:wrap}' +
    '.gv .badge{display:inline-block;font-size:11px;border-radius:999px;padding:2px 7px;background:#2b3e52;color:var(--muted);margin-left:6px;vertical-align:middle}' +
    '.gv .alts{margin-top:10px;border-top:1px dashed var(--line);padding-top:10px}' +
    '.gv .alts h4{margin:0 0 6px;font-size:13.5px}' +
    '.gv .alt{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--card);border-radius:10px;padding:8px 10px;margin:6px 0;font-size:13px}' +
    '.gv .alt b{font-size:14px}' +
    '.gv .ask{margin-top:10px;border-top:1px dashed var(--line);padding-top:10px}' +
    '.gv .ask h4{margin:0 0 6px;font-size:14px}' +
    '.gv .ask label{display:flex;gap:8px;align-items:flex-start;font-size:13px;margin:6px 0;color:var(--muted)}' +
    '.gv .ask label input{width:auto;margin:2px 0 0}' +
    '.gv .ask label b{color:#fff}' +
    '.gv .ask .btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}' +
    '.gv .ask .btn-sm.ok{background:#15803d}' +
    '.gv .saved-msg{background:rgba(93,211,158,.12);border:1px solid rgba(93,211,158,.5);color:#bff3d8;border-radius:12px;padding:10px 12px;font-size:13.5px;margin:10px 0}' +
    '.gv .plan-strike{text-decoration:line-through;color:var(--muted);font-weight:400}' +
    '.gv .t-ok{color:var(--green)}.gv .t-late{color:var(--yellow)}.gv .t-vlate{color:var(--red)}' +
    '.gv .leg-t small .plan-strike{display:inline}' +
    '.gv .xtimes{font-size:12.5px;color:var(--muted);margin-top:2px}' +
    '.gv .empty{text-align:center;color:var(--muted);padding:24px 10px;font-size:14px;line-height:1.5}' +
    '.gv .empty a{color:var(--cyan)}' +
    '.gv .waiting{color:var(--muted);font-size:13px;margin-top:6px}' +
    '@media(max-width:480px){.gv .xfer{margin-left:0}.gv .leg{grid-template-columns:82px minmax(0,1fr)}}';

  function T(k, p, fb) { if (window.I18n) { var v = I18n.t(k, p); if (v !== k) return v; } return fb != null ? fb : k; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var EMO = { ok: '🟢', risk: '🟡', broken: '🔴', cancelled: '⚫', nodata: '❔', done: '🏁', waiting: '⏳' };

  function nowWarsawMin(dateStr) {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    var g = function (t) { return (p.find(function (x) { return x.type === t; }) || {}).value; };
    var today = g('year') + '-' + g('month') + '-' + g('day');
    var m = (+g('hour') % 24) * 60 + (+g('minute'));
    var dd = Math.round((Date.parse(today) - Date.parse(dateStr)) / 86400000);
    return m + dd * 1440;
  }

  function remOn() { return true; }   // ⏰ przypomnienia — dla wszystkich od v5.25

  function mount(root, opts) {
    opts = opts || {};
    var G = window.GuardCore, S = window.GuardStore;
    if (!document.getElementById('guard-view-css')) {
      var st = document.createElement('style'); st.id = 'guard-view-css'; st.textContent = STYLE; document.head.appendChild(st);
    }
    root.classList.add('gv');
    root.innerHTML =
      '<div class="gv-push"></div>' +
      '<details class="gv-settings">' +
      '<summary data-i18n="guard.settings">' + esc(T('guard.settings', null, '⚙️ Ustawienia pilnowania')) + '</summary>' +
      '<div class="set-row"><label for="gvLead" data-i18n="guard.leadLabel">' + esc(T('guard.leadLabel', null, 'Zacznij pilnować przed odjazdem')) + '</label>' +
      '<select id="gvLead"><option value="60">1 h</option><option value="120">2 h</option><option value="180">3 h</option><option value="240">4 h</option></select></div>' +
      '<div class="set-row"><label for="gvMin" data-i18n="guard.minLabel">' + esc(T('guard.minLabel', null, 'Minimalny czas na przesiadkę')) + '</label>' +
      '<select id="gvMin"><option value="2">2 min</option><option value="3">3 min</option><option value="5">5 min</option><option value="7">7 min</option><option value="10">10 min</option><option value="15">15 min</option></select></div>' +
      '<div class="set-row"><label for="gvAuto" data-i18n="guard.autoPlanLabel">' + esc(T('guard.autoPlanLabel', null, 'Pilnuj automatycznie przejazdów z planu w dzienniczku')) + '</label><input type="checkbox" id="gvAuto" /></div>' +
      '<div class="set-row"><label for="gvSound" data-i18n="guard.soundLabel">' + esc(T('guard.soundLabel', null, '🔊 Dźwięk Rp1 przy pogorszeniu (gdy aplikacja jest otwarta)')) + '</label><input type="checkbox" id="gvSound" /></div>' +
      (remOn() ? '<div class="set-row"><label for="gvVol">' + esc(T('guard.rem.vol', null, '🔊 Głośność alarmu Rp1 (aplikacja otwarta)')) + '</label><span style="display:flex;gap:8px;align-items:center"><input type="range" id="gvVol" min="0" max="100" step="5" style="width:120px">' +
        '<button type="button" class="btn-sm secondary" id="gvTest">▶ ' + esc(T('guard.rem.test', null, 'Odsłuchaj')) + '</button></span></div>' : '') +
      '</details>' +
      '<div class="gv-list"></div>';
    var q = function (sel) { return root.querySelector(sel); };
    var list = q('.gv-list');

    var cache = {};          // scheduleId|orderId|date → {at, data}
    var trend = {};          // id → [delayA…] (trend „opóźnienie rośnie”)
    var results = {};        // id → wynik evaluate
    var alts = {};           // id → {loading|list|error}
    var lastAt = 0, timer = null, shown = false, started = false;
    var focusId = opts.focusId || null;
    var savedMsg = '';

    function count() { if (opts.onCount) opts.onCount(S.all().length); }
    function statusText(s) { return T('guard.status.' + s, null, { ok: 'OK', risk: 'przesiadka zagrożona', broken: 'przesiadka prawdopodobnie zerwana', cancelled: 'pociąg odwołany', nodata: 'brak danych', done: 'dojechano', waiting: 'czeka na start' }[s] || s); }
    function delayHtml(d, src) {
      if (d == null) return '';
      var cls = d >= 10 ? 'vlate' : (d >= 3 ? 'late' : 'ontime');
      var srcT = src === 'live' ? T('gzm.live', null, 'na żywo') : src === 'sched' ? T('gzm.sched', null, 'wg rozkładu') : src === 'forecast' ? T('guard.src.forecast', null, 'prognoza PLK') : (src === 'confirmed' ? T('guard.src.confirmed', null, 'potwierdzone') : (src === 'notStarted' ? T('guard.src.notStarted', null, 'jeszcze nie wyjechał') : ''));
      return ' <span class="dl ' + cls + '">' + (d > 0 ? '+' + d : d === 0 ? '0' : d) + ' min</span>' + (srcT ? ' <span class="src">(' + esc(srcT) + ')</span>' : '');
    }

    var gzmRtP = null, gzmRtAt = 0;
    function fetchTrain(leg, date) {
      if (leg.mode === "gzm") {
        if (!gzmRtP || Date.now() - gzmRtAt > 20000) { gzmRtAt = Date.now(); gzmRtP = fetch('/api/gzm-rt', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; }); }
        return gzmRtP.then(function (rt) { return { gzm: true, t: rt && rt.ok && rt.trips ? rt.trips[leg.trip] || null : null }; });
      }
      var k = leg.scheduleId + '|' + leg.orderId + '|' + date;
      var c = cache[k];
      if (c && Date.now() - c.at < 50000) return Promise.resolve(c.data);
      var qs = new URLSearchParams({ scheduleId: leg.scheduleId, orderId: leg.orderId, operatingDate: date, train: (leg.train && leg.train.number) || '' });
      return fetch('/api/train-details?' + qs.toString(), { headers: { Accept: 'application/json' }, cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        .then(function (d) { cache[k] = { at: Date.now(), data: d }; return d; });
    }

    function refresh() {
      clearTimeout(timer);
      var set = S.settings();
      var conns = S.all();
      var jobs = conns.map(function (c) {
        var nm = nowWarsawMin(c.date);
        var w = G.timeWindow(c, set.leadMin);
        // poza oknem pilnowania nie odpytujemy PLK — pokazujemy plan
        if (!w || nm < w.startMin) { results[c.id] = { status: 'waiting', startMin: w && w.startMin }; return Promise.resolve(); }
        return Promise.all(c.legs.map(function (l) { return fetchTrain(l, c.date); })).then(function (rs) {
          var res = G.evaluate(c, rs, { minTransfer: set.minTransfer });
          res.raw = rs;
          var t = res.transfers[res.worst];
          if (t && typeof t.delayA === 'number') { var h = trend[c.id] = (trend[c.id] || []); if (h[h.length - 1] !== t.delayA || h.length < 1) h.push(t.delayA); if (h.length > 6) h.shift(); res.rising = G.rising(h); }
          var before = results[c.id] && results[c.id].status;
          if (before && before !== 'waiting' && before !== 'nodata' && (G.RANK[res.status] || 0) > (G.RANK[before] || 0) && (G.RANK[res.status] || 0) >= G.RANK.risk && window.AlarmSound) AlarmSound.playOnce();
          results[c.id] = res;
          // Alternatywy przy 🟡/🔴/⚫ — od stacji zagrożonej przesiadki; ponowne
          // wyszukanie, gdy zmieni się stacja albo godzina startu o ≥ 5 min.
          if (res.status === 'risk' || res.status === 'broken' || res.status === 'cancelled') {
            var o = G.altOrigin(c, res), prev = alts[c.id];
            if (o && (!prev || !prev.origin || prev.origin.station !== o.station || Math.abs(G.hm(prev.origin.time) - G.hm(o.time)) >= 5)) findAlternatives(c, res);
          }
        });
      });
      return Promise.all(jobs).then(function () {
        lastAt = Date.now(); render();
        // co 1 min, gdy któraś przesiadka jest w ciągu 60 min; inaczej co 5 min —
        // tylko gdy widok jest pokazany
        var soon = conns.some(function (c) { var r = results[c.id]; if (!r || r.status === 'waiting' || r.status === 'done') return false; var nm = nowWarsawMin(c.date); return c.legs.some(function (l) { var t = G.hm(l.alight.time); return t != null && t - nm <= 60 && t - nm >= -30; }); });
        if (shown && document.visibilityState === 'visible') timer = setTimeout(refresh, soon ? 60000 : 300000);
      });
    }

    // Alternatywy — ta sama logika co w powiadomieniu (guard-core.js: altOrigin,
    // altQuery, pickAlternatives), więc strona i push proponują to samo.
    function findAlternatives(c, res) {
      var o = G.altOrigin(c, res); if (!o) return;
      alts[c.id] = { loading: true, origin: o };
      var qs = new URLSearchParams(G.altQuery(c, o));
      fetch('/api/planner?' + qs.toString(), { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (d) {
        alts[c.id] = { list: G.pickAlternatives(d && d.itineraries, 3), origin: o }; render();
      }).catch(function () { alts[c.id] = { error: true, origin: o }; render(); });
    }
    function switchTo(c, idx) {
      var a = alts[c.id]; if (!a || !a.list || !a.list[idx]) return;
      var it = a.list[idx];
      var head = c.legs.slice(0, a.origin.keep);
      var altConn = G.fromItinerary({ legs: it.legs }, { date: c.date });
      var legs = head.concat(altConn.legs);
      var conn = { id: G.connectionId(c.date, legs), date: c.date, from: legs[0].board.stationName, to: legs[legs.length - 1].alight.stationName, legs: legs, source: 'switched', createdAt: new Date().toISOString() };
      S.replace(c.id, conn).then(function () { delete alts[c.id]; focusId = conn.id; refresh(); });
    }

    // „14:58” → przy opóźnieniu: <s>14:58</s> 15:00 (kolor wg opóźnienia), jak na tablicy.
    function timeHtml(planned, delay) {
      if (!planned) return '';
      var d = Number(delay || 0);
      if (!(d > 0)) return esc(planned);
      var real = G.fmt(G.hm(planned) + d);
      var cls = d >= 10 ? 't-vlate' : (d >= 3 ? 't-late' : 't-ok');
      return '<span class="plan-strike">' + esc(planned) + '</span> <span class="' + cls + '">' + esc(real) + '</span>';
    }
    // Pełny bieg pociągu — ten sam adres co z planera (functions/api/planner.js: buildTrainUrl).
    function trainUrl(l, date) {
      var p = new URLSearchParams();
      p.set('train', (l.train && l.train.number) || '');
      if (l.train && l.train.category) p.set('category', l.train.category);
      if (l.train && l.train.name) p.set('name', l.train.name);
      p.set('destination', l.alight.stationName);
      if (date) p.set('date', date);
      if (l.scheduleId) { p.set('scheduleId', l.scheduleId); p.set('scheduledId', l.scheduleId); }
      if (l.orderId) p.set('orderId', l.orderId);
      if (l.trainOrderId) p.set('trainOrderId', l.trainOrderId);
      if (l.board.stationId) p.set('stationId', l.board.stationId);
      p.set('station', l.board.stationName);
      return '/train?' + p.toString();
    }
    function legHtml(l, r, date) {
      var tr = G.trainLabel(l.train) + (l.train && l.train.name ? ' ' + l.train.name : '');
      var d = r && !r.noData;
      var info = !r ? '' : (r.noData ? ' <span class="src">(' + esc(T('guard.status.nodata', null, 'brak danych')) + ')</span>' : (r.cancelled ? ' <b style="color:#fff;background:#000;padding:1px 6px;border-radius:6px">⚫ ' + esc(T('guard.status.cancelled', null, 'pociąg odwołany')) + '</b>' : ''));
      if (l.mode === "gzm") return '<div class="leg"><div class="leg-t">' + timeHtml(l.board.time, d ? r.delayDep : 0) + '<small>' + timeHtml(l.alight.time, d ? r.delayArr : 0) + '</small></div>' +
        '<div><div class="leg-train">' + esc(tr) + info + '</div><div class="leg-st">' + esc(l.board.stationName) + (d ? delayHtml(r.delayDep, r.depSource) : '') + ' → ' + esc(l.alight.stationName) + '</div></div></div>';
      return '<a class="leg" href="' + esc(trainUrl(l, date)) + '" title="' + esc(T('guard.openTrain', null, 'Pokaż cały bieg pociągu')) + '"><div class="leg-t">' + timeHtml(d && r.plannedDep || l.board.time, d ? r.delayDep : 0) + '<small>' + timeHtml(d && r.plannedArr || l.alight.time, d ? r.delayArr : 0) + (l.alight.nextDay ? ' +1' : '') + '</small></div>' +
        '<div><div class="leg-train">' + esc(tr) + info + '</div><div class="leg-st">' + esc(l.board.stationName) + (d ? delayHtml(r.delayDep, r.depSource) : '') + ' → ' + esc(l.alight.stationName) + (d ? delayHtml(r.delayArr, r.arrSource) : '') + '</div></div></a>';
    }
    function xferHtml(t, rising) {
      var s = t.status;
      var main;
      if (s === 'nodata') main = T('guard.xferNoData', { st: t.station }, 'Przesiadka w ' + t.station + ': brak danych o jednym z pociągów.');
      else if (s === 'cancelled') main = T('guard.xferCancelled', { st: t.station }, 'Przesiadka w ' + t.station + ': pociąg odwołany.');
      else main = T('guard.xferLine', { st: t.station, slack: t.slack, plan: t.plannedSlack, need: t.need }, 'Przesiadka w ' + t.station + ': zapas ' + t.slack + ' min (wg planu ' + t.plannedSlack + ', potrzebne ' + t.need + ')');
      var extra = '';
      if (t.platformChange) extra += '<div class="src">' + esc(T('guard.platformChange', { a: t.platformArr, b: t.platformDep }, 'Zmiana peronu: ' + t.platformArr + ' → ' + t.platformDep + ' (+2 min)')) + '</div>';
      if (t.stationChange) extra += '<div class="src">' + esc(T('guard.stationChange', { a: t.station, b: t.toStation }, 'Przejście między stacjami: ' + t.station + ' → ' + t.toStation + ' (+5 min)')) + '</div>';
      if (t.onlyThanksToB) extra += '<div class="warn">' + esc(T('guard.onlyThanksToB', { b: G.trainLabel(t.trainB) }, 'Zdążysz tylko, jeśli ' + G.trainLabel(t.trainB) + ' nie nadrobi opóźnienia.')) + '</div>';
      if (rising) extra += '<div class="warn">📈 ' + esc(T('guard.rising', null, 'Opóźnienie rośnie')) + '</div>';
      var times = '';
      if (t.plannedArrA && t.plannedDepB && s !== 'nodata') times = '<div class="xtimes">' + esc(T('guard.arrShort', null, 'przyjazd')) + ' ' + timeHtml(t.plannedArrA, t.delayA) + ' → ' + esc(T('guard.depShort', null, 'odjazd')) + ' ' + timeHtml(t.plannedDepB, t.delayB) + '</div>';
      return '<div class="xfer s-' + s + '">' + EMO[s] + ' ' + esc(main) + times + extra + '</div>';
    }
    // ===== ⏰ Przypomnienia o wyjściu z domu (TEST — tylko profil autora) =====
    function lang() { try { return (window.I18n && I18n.getLang && I18n.getLang()) || 'pl'; } catch (e) { return 'pl'; } }
    function defWalk(c) {
      // czas „na sztywno” z 🏠 Dom (planer → Moje miejsca), gdy jest dla tej stacji/przystanku
      try { var d = (JSON.parse(localStorage.getItem('gzmPlacesV1')) || {}).dom, w = d && d.walks, nm = c.legs[0].board.stationName; if (w) { if (w.st && w.st[nm] != null) return +w.st[nm]; if (w.stop && w.stop[nm] != null) return +w.stop[nm]; } } catch (e) {}
      return G.REM_DEFAULTS.walk;
    }
    function remCfg(c) { return S.reminder(c.id) || { on: false, walk: defWalk(c), mins: G.REM_DEFAULTS.mins.slice(), date: c.date }; }
    function remShift(c) { var r = results[c.id]; return G.remindShift(r && r.legs && r.legs[0]); }
    function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
    function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
    function remHtml(c) {
      var cfg = remCfg(c), on = !!cfg.on;
      var html = '<div class="rem"><label class="rem-t"><input type="checkbox" class="rem-on" data-id="' + esc(c.id) + '"' + (on ? ' checked' : '') + '> ⏰ ' + esc(T('guard.rem.title', null, 'Przypomnij o wyjściu z domu')) + '</label>';
      if (!on) return html + '</div>';
      var sh = remShift(c), p = G.remindPlan(c, cfg, sh);
      html += '<div class="rem-row">' + esc(T('guard.rem.walk', null, 'Dojście na stację / przystanek:')) + ' <input type="number" class="rem-walk" data-id="' + esc(c.id) + '" min="0" max="120" value="' + esc(p.walk) + '"> min</div>' +
        '<div class="rem-row">' + esc(T('guard.rem.leave', { t: G.fmt(p.leave), d: c.legs[0].board.time, w: p.walk }, 'Wyjście: {t} (odjazd {d} − {w} min dojścia)')).replace(G.fmt(p.leave), '<b>' + G.fmt(p.leave) + '</b>') +
        (sh ? ' · <b style="color:#ffd400">' + esc(T('guard.rem.shift', { n: sh }, 'przesunięte o +{n} min (opóźnienie)')) + '</b>' : '') + '</div>' +
        '<div class="rem-row">' + esc(T('guard.rem.list', null, 'Przypomnienia:')) + ' ' + p.fires.map(function (f) {
          return '<span class="rem-chip">' + esc(T('guard.rem.chip', { m: f.m, t: G.fmt(f.at) }, '{m} min przed → {t}')) + ' <button type="button" data-act="remDel" data-id="' + esc(c.id) + '" data-m="' + f.m + '" title="✕">✕</button></span>';
        }).join('') +
        (p.fires.length < 5 ? ' <input type="number" class="rem-add" data-id="' + esc(c.id) + '" min="1" max="180" placeholder="min"> <button type="button" class="btn-sm secondary" data-act="remAdd" data-id="' + esc(c.id) + '">+ ' + esc(T('guard.rem.add', null, 'dodaj')) + '</button>' : '') + '</div>' +
        '<div class="rem-row"><button type="button" class="btn-sm secondary" data-act="remIcs" data-id="' + esc(c.id) + '">📅 ' + esc(T('guard.rem.ics', null, 'Dodaj do kalendarza (z alarmami)')) + '</button>' +
        '</div>';
      var notes = [];
      if (!('Notification' in window) || Notification.permission !== 'granted') notes.push(T('guard.rem.noPush', null, 'Żeby przypomnienie przyszło przy zamkniętej aplikacji, włącz powiadomienia (przycisk nad listą).'));
      if (isIOS() && !standalone()) notes.push(T('guard.rem.ios', null, 'iPhone: przypomnienie przy zamkniętej aplikacji przyjdzie tylko, gdy dodasz ją do ekranu początkowego: Udostępnij ⬆️ → „Do ekranu początkowego”, otwórz z ikony i zezwól na powiadomienia.'));
      notes.push(T('guard.rem.sound', null, 'Przy zamkniętej aplikacji gra zwykły dźwięk powiadomienia telefonu. Android: dźwięk możesz zmienić w ustawieniach powiadomień tej aplikacji.'));
      return html + notes.map(function (n) { return '<div class="rem-note" style="margin-top:6px">' + esc(n) + '</div>'; }).join('') + '</div>';
    }
    function saveRem(c, patch) {
      var cfg = Object.assign({}, remCfg(c), patch, { date: c.date });
      return S.setReminder(c.id, cfg.on ? cfg : null).then(function () { render(); });
    }
    function downloadIcs(c) {
      var cfg = remCfg(c), title = '🚆 ' + T('guard.rem.icsTitle', { d: c.legs[0].board.time, from: c.from, to: c.to }, 'Wyjście: {d} {from} → {to}');
      var blob = new Blob([G.remindIcs(c, cfg, title)], { type: 'text/calendar;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'przypomnienie-' + c.date + '.ics';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    // Alarm na otwartej stronie (bez czekania na push): co 20 s, każde przypomnienie raz.
    function remLocalTick() {
      if (!remOn()) return;
      var fired; try { fired = JSON.parse(localStorage.getItem('remindFiredV1')) || {}; } catch (e) { fired = {}; }
      var changed = false;
      S.all().forEach(function (c) {
        var cfg = S.reminder(c.id); if (!cfg || !cfg.on) return;
        var nm = nowWarsawMin(c.date), sh = remShift(c), p = G.remindPlan(c, cfg, sh); if (!p) return;
        p.fires.forEach(function (f) {
          var k = c.date + '|' + c.id + '|' + f.m;
          if (fired[k] || nm < f.at || nm > f.at + 10) return;
          fired[k] = Date.now(); changed = true;
          var r = results[c.id], t = G.remindText(lang(), { m: f.m, conn: c, reading: r && r.legs && r.legs[0], plan: p, shift: sh });
          if (window.AlarmSound && AlarmSound.banner) AlarmSound.banner(t.title, t.body, null);
        });
      });
      if (changed) { var lim = Date.now() - 2 * 86400000; Object.keys(fired).forEach(function (k) { if (fired[k] < lim) delete fired[k]; }); try { localStorage.setItem('remindFiredV1', JSON.stringify(fired)); } catch (e) {} }
    }
    setInterval(remLocalTick, 20000); setTimeout(remLocalTick, 3000);

    function cardHtml(c) {
      var r = results[c.id] || { status: 'nodata' };
      var s = r.status;
      var html = '<div class="card s-' + s + (c.id === focusId ? ' hl' : '') + '" id="g-' + esc(c.id) + '">' +
        '<div class="c-head"><div><div class="c-route">' + esc(c.from) + ' → ' + esc(c.to) + (c.source === 'plan' ? '<span class="badge">' + esc(T('guard.fromPlan', null, 'z dzienniczka')) + '</span>' : '') + '</div>' +
        '<div class="c-date">' + esc(c.date) + ' · ' + (function () {
          var l0 = r.legs && r.legs[0], ln = r.legs && r.legs[r.legs.length - 1], ok0 = l0 && !l0.noData, okn = ln && !ln.noData;
          return timeHtml(ok0 && l0.plannedDep || c.legs[0].board.time, ok0 ? l0.delayDep : 0) + ' → ' + timeHtml(okn && ln.plannedArr || c.legs[c.legs.length - 1].alight.time, okn ? ln.delayArr : 0);
        })() + '</div></div>' +
        '<span class="chip s-' + s + '">' + EMO[s] + ' ' + esc(statusText(s)) + '</span></div>';
      c.legs.forEach(function (l, i) {
        html += legHtml(l, r.legs ? r.legs[i] : null, c.date);
        if (i < c.legs.length - 1 && r.transfers && r.transfers[i]) html += xferHtml(r.transfers[i], r.rising && r.worst === i);
      });
      if (s === 'waiting') {
        var st = r.startMin; html += '<div class="waiting">⏳ ' + esc(T('guard.waitingInfo', { time: G.fmt(st) }, 'Pilnowanie zacznie się ok. ' + G.fmt(st) + ' tego dnia.')) + '</div>';
      }
      var a = alts[c.id];
      if (a && (s === 'risk' || s === 'broken' || s === 'cancelled')) {
        html += '<div class="alts"><h4>🔀 ' + (s === 'risk' ? esc(T('guard.planB', null, 'Plan B')) + ': ' : '') + esc(T('guard.altTitle', { st: a.origin.station, time: a.origin.time }, 'Alternatywy z ' + a.origin.station + ' od ' + a.origin.time)) + '</h4>';
        if (a.loading) html += '<div class="src">' + esc(T('guard.altLoading', null, 'Szukam połączeń…')) + '</div>';
        else if (a.error || !a.list || !a.list.length) html += '<div class="src">' + esc(T('guard.altNone', null, 'Nie znalazłem alternatyw.')) + '</div> <button type="button" class="btn-sm secondary" data-act="altRetry" data-id="' + esc(c.id) + '">' + esc(T('guard.altRetry', null, 'Szukaj ponownie')) + '</button>';
        else {
          var gap = G.hm(a.list[0].departureTime) - G.hm(a.origin.time);
          if (gap > 20) html += '<div class="src" style="margin:0 0 6px;line-height:1.45">ℹ️ ' + esc(T('guard.altNote', { dest: c.to, arr: a.list[0].arrivalTime, dep: a.list[0].departureTime, from: a.origin.station }, 'Wcześniej do stacji ' + c.to + ' się nie da: najbliższe połączenie dojedzie o ' + a.list[0].arrivalTime + '. Odjazd ' + a.list[0].departureTime + ' to najpóźniejszy, który zdąży — wcześniejsze pociągi ze stacji ' + a.origin.station + ' też zdążą, ale poczekasz dłużej na przesiadkę.')) + '</div>';
        }
        if (a.list && a.list.length) a.list.forEach(function (it, k) {
          var trs = it.legs.map(function (l) { return G.trainLabel(l.train); }).join(' + ');
          html += '<div class="alt"><div><b>' + esc(it.departureTime) + ' → ' + esc(it.arrivalTime) + '</b> · ' + esc(trs) + '<div class="src">' + esc(it.legs.length > 1 ? T('guard.altChanges', { n: it.legs.length - 1 }, 'przesiadki: ' + (it.legs.length - 1)) : T('guard.altDirect', null, 'bezpośrednio')) + '</div></div>' +
            '<button type="button" class="btn-sm" data-act="switch" data-id="' + esc(c.id) + '" data-k="' + k + '">' + esc(T('guard.switch', null, '🛡️ Pilnuj tej')) + '</button></div>';
        });
        html += '</div>';
      }
      var arrMin = G.lastArrMin(c);
      if (s !== 'waiting' && (s === 'done' || (arrMin != null && nowWarsawMin(c.date) >= arrMin))) {
        html += '<div class="ask"><h4>📓 ' + esc(T('guard.ask.title', null, 'Jechałeś tym połączeniem?')) + '</h4>' +
          (c.legs.length > 1 ? '<div class="src">' + esc(T('guard.ask.legsHint', null, 'Odznacz odcinki, którymi nie jechałeś.')) + '</div>' : '') +
          c.legs.map(function (l, i) { return '<label><input type="checkbox" class="ask-leg" data-id="' + esc(c.id) + '" data-i="' + i + '" checked> <span><b>' + esc(G.trainLabel(l.train)) + '</b> ' + esc(l.board.stationName) + ' ' + esc(l.board.time) + ' → ' + esc(l.alight.stationName) + ' ' + esc(l.alight.time) + '</span></label>'; }).join('') +
          '<div class="btns"><button type="button" class="btn-sm ok" data-act="record" data-id="' + esc(c.id) + '">✅ ' + esc(T('guard.ask.yes', null, 'Tak — zapisz w dzienniczku')) + '</button>' +
          '<button type="button" class="btn-sm secondary" data-act="dismiss" data-id="' + esc(c.id) + '">❌ ' + esc(T('guard.ask.no', null, 'Nie jechałem')) + '</button></div></div>';
      }
      if (remOn() && s !== 'done') html += remHtml(c);
      html += '<div class="c-foot"><span class="c-meta">' + (lastAt && s !== 'waiting' ? esc(T('guard.updated', { time: new Date(lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, 'Aktualizacja: ' + new Date(lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))) : '') + '</span>' +
        '<span class="c-actions"><button type="button" class="btn-sm secondary" data-act="refresh">↻ ' + esc(T('guard.refresh', null, 'Odśwież')) + '</button>' +
        '<button type="button" class="btn-sm danger" data-act="remove" data-id="' + esc(c.id) + '">' + esc(T('guard.stop', null, 'Przestań pilnować')) + '</button></span></div></div>';
      return html;
    }
    var pendingRender = false;
    function render() {
      var ae = document.activeElement;
      if (ae && list.contains(ae) && ae.tagName === 'INPUT' && ae.type === 'number') { pendingRender = true; return; }
      pendingRender = false;
      var conns = S.all();
      var msg = savedMsg ? '<div class="saved-msg">' + esc(savedMsg) + ' <a href="/dziennik/" style="color:#bff3d8">' + esc(T('guard.ask.openJournal', null, 'Otwórz dzienniczek →')) + '</a></div>' : '';
      if (!conns.length) list.innerHTML = opts.hideWhenEmpty ? msg : msg + '<div class="empty">' + T('guard.empty', null, 'Nie pilnujesz jeszcze żadnego połączenia.<br>W <a href="/planer/">planerze</a> kliknij „🛡️ Pilnuj” przy wyniku — albo dodaj przejazd do planu w dzienniczku.') + '</div>';
      else list.innerHTML = msg + conns.map(cardHtml).join('');
      // W „Moje” (planer) bez pilnowanych połączeń cała sekcja znika.
      if (opts.hideWhenEmpty) root.hidden = !conns.length && !savedMsg;
      count();
      if (focusId && shown) { var el = document.getElementById('g-' + focusId); if (el) { el.scrollIntoView({ block: 'center' }); focusId = null; } }
    }
    list.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]'); if (!b) return;
      var act = b.dataset.act, id = b.dataset.id;
      var c = S.all().find(function (x) { return x.id === id; });
      if (act === 'refresh') { cache = {}; refresh(); return; }
      if (act === 'remDel' && c) { var cf = remCfg(c); saveRem(c, { mins: G.remindMins(cf).filter(function (m) { return m !== Number(b.dataset.m); }) }); return; }
      if (act === 'remAdd' && c) { var inp = list.querySelector('.rem-add[data-id="' + CSS.escape(id) + '"]'), v = Math.round(Number(inp && inp.value)); if (v >= 1 && v <= 180) saveRem(c, { mins: G.remindMins(remCfg(c)).concat([v]) }); return; }
      if (act === 'remIcs' && c) { downloadIcs(c); return; }
      if (act === 'remove' && c) { if (!confirm(T('guard.confirmStop', null, 'Przestać pilnować tego połączenia?'))) return; S.remove(id).then(function () { delete results[id]; render(); }); return; }
      if (act === 'switch' && c) { switchTo(c, Number(b.dataset.k)); return; }
      if (act === 'record' && c) {
        var checked = c.legs.map(function (l, i) { var cb = root.querySelector('.ask-leg[data-id="' + CSS.escape(id) + '"][data-i="' + i + '"]'); return !cb || cb.checked; });
        if (!checked.some(Boolean)) { alert(T('guard.ask.noneChecked', null, 'Zaznacz co najmniej jeden odcinek albo wybierz „Nie jechałem”.')); return; }
        b.disabled = true;
        S.recordTrip(c, (results[id] && results[id].raw) || [], checked).then(function (n) {
          delete results[id]; savedMsg = T('guard.ask.saved', { n: n }, '✅ Zapisano w dzienniczku: ' + n + ' odc.'); render();
        });
        return;
      }
      if (act === 'dismiss' && c) { b.disabled = true; S.dismissTrip(c).then(function () { delete results[id]; render(); }); return; }
      if (act === 'altRetry' && c) { delete alts[id]; findAlternatives(c, results[id]); render(); }
    });

    list.addEventListener('change', function (e) {
      var el = e.target, id = el.dataset && el.dataset.id; if (!id) return;
      var c = S.all().find(function (x) { return x.id === id; }); if (!c) return;
      if (el.classList.contains('rem-on')) { saveRem(c, { on: el.checked }); if (el.checked && window.AlarmSound) AlarmSound.play(); }
      else if (el.classList.contains('rem-walk')) { var w = Math.round(Number(el.value)); if (w >= 0 && w <= 120) saveRem(c, { walk: w }); }
    });
    list.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.classList.contains('rem-add')) { e.preventDefault(); var bt = e.target.parentNode.querySelector('[data-act="remAdd"]'); if (bt) bt.click(); } });
    list.addEventListener('focusout', function () { setTimeout(function () { if (pendingRender) render(); }, 50); });
    // Ustawienia
    function fillSettings() { var s = S.settings(); q('#gvLead').value = String(s.leadMin); q('#gvMin').value = String(s.minTransfer); q('#gvAuto').checked = s.autoPlan; q('#gvSound').checked = !window.AlarmSound || AlarmSound.isEnabled(); }
    if (q('#gvVol')) {
      q('#gvVol').value = String(Math.round((window.AlarmSound && AlarmSound.volume ? AlarmSound.volume() : 1) * 100));
      q('#gvVol').addEventListener('input', function () { if (window.AlarmSound && AlarmSound.setVolume) AlarmSound.setVolume(this.value / 100, false); });
      q('#gvVol').addEventListener('change', function () { if (window.AlarmSound && AlarmSound.setVolume) { AlarmSound.setVolume(this.value / 100, true); AlarmSound.play(); } });
      q('#gvTest').addEventListener('click', function () { if (window.AlarmSound) AlarmSound.play(); });
    }
    q('#gvSound').addEventListener('change', function () { if (window.AlarmSound) { AlarmSound.setEnabled(this.checked); if (this.checked) AlarmSound.play(); } });
    q('#gvLead').addEventListener('change', function () { S.saveSettings({ leadMin: Number(this.value) }); refresh(); });
    q('#gvMin').addEventListener('change', function () { S.saveSettings({ minTransfer: Number(this.value) }); refresh(); });
    q('#gvAuto').addEventListener('change', function () { S.saveSettings({ autoPlan: this.checked }); refresh(); });

    // Powiadomienia na tym urządzeniu
    function renderPush() {
      S.pushState().then(function (st) {
        var box = q('.gv-push');
        if (st === 'on') { box.innerHTML = ''; return; }
        var msg = {
          'no-profile': T('guard.push.noProfile', null, 'Powiadomienia w tle wymagają profilu. <a href="/profil/">Załóż profil</a> — bez hasła, kilkanaście sekund.'),
          'denied': T('guard.push.denied', null, 'Powiadomienia są zablokowane w przeglądarce. Odblokuj je w ustawieniach strony, żeby dostawać ostrzeżenia.'),
          'unsupported': T('guard.push.unsupported', null, 'Ta przeglądarka nie obsługuje powiadomień push. Na iPhonie dodaj aplikację do ekranu głównego.'),
          'off': T('guard.push.off', null, 'Włącz powiadomienia na tym urządzeniu, żeby dostawać ostrzeżenia także przy zamkniętej aplikacji.')
        }[st] || '';
        box.innerHTML = '<div class="notice">' + msg + (st === 'off' ? ' <button type="button" class="btn-sm gv-push-on">🔔 ' + esc(T('guard.push.enable', null, 'Włącz powiadomienia')) + '</button>' : '') + '</div>';
        var on = q('.gv-push-on'); if (on) on.addEventListener('click', function () { on.disabled = true; S.enablePush().then(renderPush); });
      });
    }

    document.addEventListener('visibilitychange', function () { if (shown && document.visibilityState === 'visible' && Date.now() - lastAt > 45000) refresh(); });
    window.addEventListener('langchange', function () { if (started) { render(); renderPush(); } });
    // Lista z pamięci od razu (licznik zakładki), bez odpytywania PLK.
    render();

    return {
      start: function () {
        shown = true;
        if (!started) {
          started = true;
          (window.I18n ? I18n.ready : Promise.resolve()).then(function () {
            fillSettings(); render(); renderPush();
            return S.refreshFromProfile();
          }).then(function () { fillSettings(); return refresh(); });
        } else if (Date.now() - lastAt > 45000) refresh();
        else render();
      },
      stop: function () { shown = false; clearTimeout(timer); },
      // Podświetl i przewiń do połączenia (np. z „🛡️ Pilnowane” przy wyniku).
      // Nowe połączenie (bez wyniku) — przelicz od razu, żeby nie wisiało „brak danych”.
      focus: function (id) { focusId = id; if (S.all().some(function (c) { return !results[c.id]; })) refresh(); else render(); },
      // Czy któreś połączenie jest teraz w oknie pilnowania (planer otwiera wtedy tę zakładkę).
      anyActive: function () {
        var lead = S.settings().leadMin;
        return S.all().some(function (c) { return G.isActive(c, nowWarsawMin(c.date), lead); });
      }
    };
  }

  window.GuardView = { mount: mount };
})();
