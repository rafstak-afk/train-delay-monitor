// ===== TODO 136 etap 4 (27.11): wspólny element „komunikacja miejska” — rejestr dostawców (dziś GZM, w przyszłości inne miasta).
// Wyszukiwarka kolejowa, Pilnowane i asystent pytają REJESTR, nie konkretne miasto. Każde miasto dostarcza dane w tym samym
// formacie (GTFS → sieć przystanków dla RAPTOR, indeks stacji PLK z najbliższymi przystankami, dane na żywo GTFS-RT) i rejestruje
// się tu jednym wywołaniem — patrz docs/komunikacja-miejska.md.
//
//   CityTransit.register({ id: "gzm", label: "GZM", covers: fn(stationName) → Promise<bool>,
//                          altJourney: fn(fromStation, toStation, depMin, date) → Promise<wynik|null> })
//   CityTransit.altJourney(fromStation, toStation, depMin, date)   → najlepszy wynik spośród dostawców obsługujących OBIE stacje
//   CityTransit.list()                                            → zarejestrowani dostawcy
// wynik: { leave, dep, arr (min od północy), lines: ["M3"], live: bool, delay: min, transfers, from, to, provider: {id, label} }
(function () {
  "use strict";
  var providers = [];
  function register(p) {
    if (!p || !p.id || typeof p.altJourney !== "function") return;
    providers = providers.filter(function (x) { return x.id !== p.id; }).concat([p]);
  }
  function covers(p, name) {
    try { return p.covers ? Promise.resolve(p.covers(name)).then(function (v) { return !!v; }, function () { return false; }) : Promise.resolve(true); }
    catch (e) { return Promise.resolve(false); }
  }
  function altJourney(from, to, depMin, date) {
    if (!providers.length) return Promise.resolve(null);
    return Promise.all(providers.map(function (p) {
      return Promise.all([covers(p, from), covers(p, to)]).then(function (c) {
        if (!c[0] || !c[1]) return null;
        return Promise.resolve(p.altJourney(from, to, depMin, date)).then(function (r) { if (r) r.provider = { id: p.id, label: p.label || p.id }; return r || null; }, function () { return null; });
      });
    })).then(function (rs) {
      rs = rs.filter(Boolean);
      return rs.length ? rs.sort(function (a, b) { return a.arr - b.arr; })[0] : null;
    });
  }
  window.CityTransit = { register: register, altJourney: altJourney, list: function () { return providers.slice(); }, has: function () { return providers.length > 0; } };
})();
