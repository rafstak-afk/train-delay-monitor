// Najbliższe stacje (TODO 51): lista stacji PLK z odległością w linii prostej, jak „Najbliższa (GPS)” w Portalu Pasażera.
// Dane: /data/stations-geo.json [[id, nazwa, szer., dł.], …] ze słownika PLK, ładowane dopiero przy pierwszym użyciu.
// Użycie: NearestStations.mount(poElemencie, wybór) — przycisk „📍 Najbliższe stacje” (GPS) z listą pod nim;
//         NearestStations.render(kontener, { lat, lon, extra, onPick }) — sama lista dla podanego miejsca.
(function () {
  "use strict";
  var dataP = null;
  function t(k, p, d) { try { if (window.I18n) { var v = I18n.t("near." + k, p); if (v && v !== "near." + k) return v; } } catch (e) {} return d; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function load() { return dataP || (dataP = fetch("/data/stations-geo.json").then(function (r) { return r.json(); }).then(function (d) { return d.stations || []; }).catch(function () { dataP = null; return []; })); }
  function km(a, b, c, d) { var R = 6371, r = Math.PI / 180, x = Math.pow(Math.sin((c - a) * r / 2), 2) + Math.cos(a * r) * Math.cos(c * r) * Math.pow(Math.sin((d - b) * r / 2), 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function kmTxt(v) { return (v < 10 ? (Math.round(v * 10) / 10) : Math.round(v)).toString().replace(".", ",") + " km"; }
  function near(lat, lon, n, maxKm) {
    return load().then(function (list) {
      return list.map(function (s) { return { id: String(s[0]), name: s[1], km: km(lat, lon, s[2], s[3]) }; })
        .filter(function (s) { return s.km <= (maxKm || 60); }).sort(function (a, b) { return a.km - b.km; }).slice(0, n || 6);
    });
  }
  function locate() {
    var get = function (high, ms) { return new Promise(function (res, rej) { navigator.geolocation.getCurrentPosition(function (p) { res({ lat: p.coords.latitude, lon: p.coords.longitude }); }, rej, { enableHighAccuracy: high, timeout: ms, maximumAge: 60000 }); }); };
    if (!navigator.geolocation) return Promise.reject(new Error("none"));
    return get(true, 10000).catch(function (e) { if (e && e.code === 1) throw e; return get(false, 8000); });
  }
  // extra: [{ name, km, kind: "stop" }] — np. przystanki GZM z planera; onPick({ id, name, kind })
  function render(box, o) {
    box.innerHTML = '<div style="opacity:.75;font-size:13px;margin:6px 0">' + esc(t("searching", null, "Szukam najbliższych stacji…")) + "</div>";
    return near(o.lat, o.lon, 6, 60).then(function (st) {
      var items = st.map(function (s) { return { id: s.id, name: s.name, km: s.km, kind: "station" }; }).concat(o.extra || []).sort(function (a, b) { return a.km - b.km; });
      if (!items.length) { box.innerHTML = '<div style="margin:6px 0">' + esc(t("none", { km: 60 }, "Brak stacji w promieniu 60 km.")) + "</div>"; return; }
      box.innerHTML = '<div style="font-weight:700;margin:8px 0 4px">' + esc(o.title || t("title", null, "Najbliższe stacje (w linii prostej)")) + "</div>" +
        items.map(function (s, i) {
          return '<button type="button" data-near="' + i + '" style="display:flex;justify-content:space-between;gap:10px;width:100%;text-align:left;margin:4px 0;padding:9px 12px;border-radius:10px;border:1px solid #34495e;background:#1c2833;color:#fff;font-size:14px;cursor:pointer">' +
            "<span>" + (s.kind === "stop" ? "🚏 " : "🚉 ") + esc(s.name) + '</span><span style="opacity:.75">' + esc(kmTxt(s.km)) + "</span></button>";
        }).join("");
      box.onclick = function (ev) { var b = ev.target.closest("[data-near]"); if (b && o.onPick) o.onPick(items[+b.getAttribute("data-near")]); };
    });
  }
  // opts.buttonIn — przycisk jako pierwszy w podanym rzędzie przycisków (np. na tablicy przed „Otwórz PLK”), lista pod `after`
  function mount(after, onPick, opts) {
    if (!after || !after.parentNode) return;
    opts = opts || {};
    var wrap = document.createElement("div"); wrap.className = "near-stations"; wrap.style.cssText = "max-width:900px;margin:6px auto;padding:0 4px";
    var label = esc(t("btn", null, "📍 Najbliższe stacje"));
    wrap.innerHTML = (opts.buttonIn ? "" : '<button type="button" class="near-btn" style="border:1px solid #34495e;background:#1c2833;color:#fff;border-radius:999px;padding:7px 12px;font-size:13px;cursor:pointer">' + label + "</button>") + '<div class="near-list"></div>';
    after.parentNode.insertBefore(wrap, after.nextSibling);
    var btn = wrap.querySelector(".near-btn"), list = wrap.querySelector(".near-list");
    if (opts.buttonIn) {
      btn = document.createElement("button"); btn.type = "button"; btn.className = "near-btn " + (opts.buttonClass || "");
      btn.setAttribute("data-i18n", "near.btn"); btn.innerHTML = label; if (opts.buttonStyle) btn.style.cssText = opts.buttonStyle;
      opts.buttonIn.insertBefore(btn, opts.buttonIn.firstChild);
    }
    btn.onclick = function () {
      if (list.innerHTML) { list.innerHTML = ""; return; }
      list.innerHTML = '<div style="opacity:.75;font-size:13px;margin:6px 0">' + esc(t("locating", null, "Ustalam położenie…")) + "</div>";
      // onPick może zwrócić tekst nagłówka — wtedy lista zostaje otwarta do kolejnego wyboru (planer: najpierw „Skąd”, potem „Dokąd”)
      locate().then(function (g) {
        var pick = function (s) {
          var next = onPick(s);
          if (!next) { list.innerHTML = ""; return; }
          render(list, { lat: g.lat, lon: g.lon, title: next, onPick: pick });
        };
        return render(list, { lat: g.lat, lon: g.lon, title: typeof opts.title === "function" ? opts.title() : opts.title, onPick: pick });
      })
        .catch(function (e) { list.innerHTML = '<div style="margin:6px 0;color:#fbbf24">' + esc(e && e.code === 1 ? t("denied", null, "Przeglądarka nie ma zgody na lokalizację.") : t("gpsErr", null, "Nie udało się ustalić położenia. Spróbuj ponownie.")) + "</div>"; });
    };
  }
  window.NearestStations = { mount: mount, render: render, near: near, locate: locate, km: km };
})();
