// Strażnik przesiadek — dane w przeglądarce i w profilu (synchronizacja
// telefon ↔ komputer). Logika statusów jest w guard-core.js.
//
// Profil: guardedConnections (ręcznie pilnowane), guardSettings
// {leadMin, minTransfer, autoPlan}, guardPlanOff (id połączeń z planu
// dzienniczka, których NIE pilnować). Plan z dzienniczka nie jest kopiowany —
// połączenia z niego liczymy na bieżąco (GuardCore.fromPlannedTrips).
(function () {
  "use strict";
  var LIST_KEY = "guardedConnectionsV1", SET_KEY = "guardSettingsV1", OFF_KEY = "guardPlanOffV1", PLAN_KEY = "dziennikPlanPodrozy";
  var JOURNAL_KEY = "dziennikPodrozy", PLAN_REMOVED_KEY = "dziennikPlanUsunieteOstatnio";
  var VAPID_PUBLIC_KEY = "BOVJOSGUg7ftbz0Qni3Fo15a25c08pX-OJPavIGysDlyyzYt5FW46c2p3OKu46HJB08fuBB70z5dNk9G_xMAsSA";

  function read(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function today() { return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" }); }
  // Dostępne dla wszystkich od v4.86 (wcześniej beta tylko dla profilu autora).
  function enabled() { return true; }
  // Zapis do profilu, który przeglądarka dokończy nawet po zmianie strony
  // (sendBeacon) — zwykłe zapytanie bywało przerywane, a tablica potem
  // wczytywała stary profil i wpisy znikały.
  function pushSafe(patch) {
    if (!hasProfile()) return;
    if (ProfileSync.pushBeacon && ProfileSync.pushBeacon(patch)) return;
    ProfileSync.push(patch);
  }
  function hasProfile() { return !!(window.ProfileSync && ProfileSync.getToken()); }

  function settings() {
    var s = read(SET_KEY, {});
    var d = GuardCore.DEFAULTS;
    return { leadMin: s.leadMin || d.leadMin, minTransfer: s.minTransfer != null ? s.minTransfer : d.minTransfer, autoPlan: s.autoPlan !== false };
  }
  // Stare (sprzed wczoraj) połączenia wypadają same.
  function prune(list) {
    var d = new Date(today() + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1);
    var min = d.toISOString().slice(0, 10);
    return (list || []).filter(function (c) { return c && c.id && c.date >= min; });
  }
  function manual() { return prune(read(LIST_KEY, [])); }
  function planOff() { return read(OFF_KEY, []); }
  // Wszystkie pilnowane: ręczne + z planu dzienniczka (gdy włączone).
  function all() {
    var list = manual();
    if (settings().autoPlan) {
      var off = planOff(), have = {};
      list.forEach(function (c) { have[c.id] = true; });
      GuardCore.fromPlannedTrips(read(PLAN_KEY, [])).forEach(function (c) {
        if (off.indexOf(c.id) < 0 && !have[c.id] && !have[c.id.replace(/^plan:/, "")]) list.push(c);
      });
    }
    return prune(list).sort(function (a, b) { return (a.date + (a.legs[0] && a.legs[0].board.time)).localeCompare(b.date + (b.legs[0] && b.legs[0].board.time)); });
  }
  // Wpis planu dzienniczka (_key) → id pilnowanego połączenia (dla znaczka 🛡️).
  function planGuardMap() {
    var map = {};
    if (!enabled() || !settings().autoPlan) return map;
    var off = planOff();
    GuardCore.fromPlannedTrips(read(PLAN_KEY, [])).forEach(function (c) {
      if (off.indexOf(c.id) >= 0) return;
      (c.planKeys || []).forEach(function (k) { if (k) map[k] = c.id; });
    });
    return map;
  }
  function isGuarded(id) { return manual().some(function (c) { return c.id === id; }); }

  // Zmiana JEDNEJ pozycji: najpierw świeży profil (inne urządzenie mogło coś
  // dodać), potem zmiana i zapis — nigdy nie odsyłamy całej, starej listy.
  function mutate(fn) {
    var apply = function (remote) {
      var base = manual();
      if (Array.isArray(remote)) {
        var ids = {}; remote.forEach(function (c) { ids[c.id] = true; });
        base = prune(remote).concat(base.filter(function (c) { return !ids[c.id] && c._pending; }));
      }
      var next = prune(fn(base.slice()));
      next.forEach(function (c) { delete c._pending; });
      write(LIST_KEY, next);
      pushSafe({ guardedConnections: next });
      return next;
    };
    if (!hasProfile()) return Promise.resolve(apply(null));
    return ProfileSync.pull().then(function (p) { return apply(p && Array.isArray(p.guardedConnections) ? p.guardedConnections : null); })
      .catch(function () { return apply(null); });
  }
  function add(conn) {
    conn._pending = true;
    var cur = manual(); if (!cur.some(function (c) { return c.id === conn.id; })) { cur.push(conn); write(LIST_KEY, cur); }
    return mutate(function (list) { return list.some(function (c) { return c.id === conn.id; }) ? list : list.concat([conn]); });
  }
  function remove(id) {
    if (/^plan:/.test(id)) {
      var off = planOff(); if (off.indexOf(id) < 0) off.push(id);
      off = off.slice(-100); write(OFF_KEY, off);
      if (hasProfile()) ProfileSync.push({ guardPlanOff: off });
      return Promise.resolve();
    }
    write(LIST_KEY, manual().filter(function (c) { return c.id !== id; }));
    return mutate(function (list) { return list.filter(function (c) { return c.id !== id; }); });
  }
  function replace(oldId, conn) {
    if (/^plan:/.test(oldId)) remove(oldId);
    return mutate(function (list) { return list.filter(function (c) { return c.id !== oldId && c.id !== conn.id; }).concat([conn]); });
  }
  function saveSettings(patch) {
    var s = settings(); Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    write(SET_KEY, s);
    if (hasProfile()) ProfileSync.push({ guardSettings: s });
    return s;
  }
  // Profil → przeglądarka (przy wejściu na stronę): profil jest nadrzędny,
  // lokalne pozycje dodane offline (_pending) dokładamy.
  function refreshFromProfile() {
    if (!hasProfile()) return Promise.resolve(false);
    return ProfileSync.pull().then(function (p) {
      if (!p) return false;
      if (Array.isArray(p.guardedConnections)) {
        var ids = {}; p.guardedConnections.forEach(function (c) { ids[c.id] = true; });
        var pending = manual().filter(function (c) { return c._pending && !ids[c.id]; });
        write(LIST_KEY, prune(p.guardedConnections).concat(pending));
        if (pending.length) mutate(function (l) { return l; });
      }
      if (p.guardSettings && typeof p.guardSettings === "object") write(SET_KEY, p.guardSettings);
      if (Array.isArray(p.guardPlanOff)) write(OFF_KEY, p.guardPlanOff);
      if (Array.isArray(p.plannedTrips)) write(PLAN_KEY, p.plannedTrips);
      return true;
    }).catch(function () { return false; });
  }

  // ---------- po podróży: dzienniczek tylko z potwierdzenia ----------
  var lc = function (s) { return String(s || "").trim().toLowerCase(); };
  function sameTrip(a, b) {
    return a._key === b._key || (a.date === b.date && String(a.trainNumber || "") === String(b.trainNumber || "") &&
      lc(a.boardStation) === lc(b.boardStation) && lc(a.alightStation) === lc(b.alightStation));
  }
  // Wpisy planu dzienniczka należące do tego połączenia.
  function planKeysFor(conn) {
    var keys = (conn.planKeys || []).slice();
    read(PLAN_KEY, []).forEach(function (e) {
      if (e.date === conn.date && conn.legs.some(function (l) {
        return String(l.scheduleId) === String(e.scheduleId) && String(l.orderId) === String(e.orderId) &&
          lc(l.board.stationName) === lc(e.boardStation) && lc(l.alight.stationName) === lc(e.alightStation);
      }) && keys.indexOf(e._key) < 0) keys.push(e._key);
    });
    return keys;
  }
  // Usunięcie z planu (z „nagrobkiem”, jak w dzienniczku — żeby stary stan
  // profilu nie przywrócił wpisu).
  function removeFromPlan(keys, remote) {
    if (!keys.length) return;
    var tomb = read(PLAN_REMOVED_KEY, []).filter(function (x) { return keys.indexOf(x.key) < 0; });
    keys.forEach(function (k) { tomb.push({ key: k, at: Date.now() }); });
    write(PLAN_REMOVED_KEY, tomb);
    var base = Array.isArray(remote) ? remote : read(PLAN_KEY, []);
    var next = base.filter(function (e) { return keys.indexOf(e._key) < 0; });
    write(PLAN_KEY, next);
    pushSafe({ plannedTrips: next });
  }
  function finishConn(conn) {
    if (/^plan:/.test(conn.id)) return Promise.resolve();
    return remove(conn.id);
  }
  // ✅ Jechałem — wpisy (tylko zaznaczone odcinki) do dzienniczka.
  function recordTrip(conn, readings, checked) {
    var entries = GuardCore.buildJournalEntries(conn, readings, checked, new Date().toISOString());
    var keys = planKeysFor(conn);
    var pull = hasProfile() ? ProfileSync.pull().catch(function () { return null; }) : Promise.resolve(null);
    return pull.then(function (p) {
      var local = read(JOURNAL_KEY, []);
      var base = local.slice();
      if (p && Array.isArray(p.journalEntries)) {
        base = p.journalEntries.slice();
        local.forEach(function (e) { if (!base.some(function (x) { return x._key === e._key; })) base.push(e); });
      }
      entries.forEach(function (e) {
        var i = base.findIndex(function (x) { return sameTrip(x, e); });
        if (i >= 0) { e._key = base[i]._key; base[i] = e; } else base.push(e);
      });
      write(JOURNAL_KEY, base);
      pushSafe({ journalEntries: base });
      removeFromPlan(keys, p && Array.isArray(p.plannedTrips) ? p.plannedTrips : null);
      return finishConn(conn);
    }).then(function () { return entries.length; });
  }
  // ❌ Nie jechałem — koniec pilnowania, nic do dzienniczka (i wpisy z planu znikają).
  function dismissTrip(conn) {
    var keys = planKeysFor(conn);
    var pull = keys.length && hasProfile() ? ProfileSync.pull().catch(function () { return null; }) : Promise.resolve(null);
    return pull.then(function (p) {
      removeFromPlan(keys, p && Array.isArray(p.plannedTrips) ? p.plannedTrips : null);
      return finishConn(conn);
    });
  }

  // Powiadomienia push na TYM urządzeniu (ta sama subskrypcja co alarmy).
  function urlB64(s) {
    var pad = "=".repeat((4 - s.length % 4) % 4), b = (s + pad).replace(/-/g, "+").replace(/_/g, "/"), raw = atob(b);
    return Uint8Array.from(Array.prototype.map.call(raw, function (c) { return c.charCodeAt(0); }));
  }
  function pushState() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return Promise.resolve("unsupported");
    if (!hasProfile()) return Promise.resolve("no-profile");
    if (Notification.permission === "denied") return Promise.resolve("denied");
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) { return sub && Notification.permission === "granted" ? "on" : "off"; }).catch(function () { return "off"; });
  }
  function enablePush() {
    if (!hasProfile()) return Promise.resolve({ ok: false, reason: "no-profile" });
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") return { ok: false, reason: "denied" };
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(VAPID_PUBLIC_KEY) });
        });
      }).then(function (sub) {
        if (ProfileSync.registerPush) return ProfileSync.registerPush(sub);
        return fetch("/api/push-subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: ProfileSync.getToken(), subscription: sub.toJSON() }) });
      }).then(function () { return { ok: true }; });
    }).catch(function (e) { return { ok: false, reason: "error", error: e }; });
  }

  window.GuardStore = {
    settings: settings, saveSettings: saveSettings, all: all, manual: manual, isGuarded: isGuarded,
    add: add, remove: remove, replace: replace, refreshFromProfile: refreshFromProfile,
    pushState: pushState, enablePush: enablePush, today: today, hasProfile: hasProfile, enabled: enabled, planGuardMap: planGuardMap, recordTrip: recordTrip, dismissTrip: dismissTrip
  };
})();
