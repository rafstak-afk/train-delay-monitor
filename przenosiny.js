// TODO 79: przenosiny na nowy adres czyzdaze.pl bez utraty danych.
// Przeglądarka trzyma dane (token profilu, ulubione, pilnowane, ustawienia) osobno dla każdego adresu strony.
// Stary adres: pasek „Nowy adres” + przycisk „Przenieś” → otwiera https://czyzdaze.pl/?przenosiny=1 w nowym oknie
// i przekazuje mu wszystkie dane z localStorage przez postMessage (tylko do tego jednego adresu — nie w URL-u).
// Nowy adres: przy ?przenosiny=1 prosi okno, które go otworzyło (tylko stary adres), o dane, zapisuje je i odświeża.
// 24.11: dla wszystkich. Po udanym przeniesieniu (nowe okno potwierdza „ok”) pasek znika. Kto ma profil (token), ten nie
// widzi go już wcale — ulubione, pilnowane, Moje pociągi itd. i tak synchronizują się przez profil między adresami.
// Kto nie ma profilu (dane tylko w telefonie), dostaje krótkie przypomnienie z „Przenieś ponownie”.
(function () {
  var OLD = "https://train-delay-monitor1.pages.dev", NEW = "https://czyzdaze.pl";
  var here = location.origin;
  // subskrypcja powiadomień należy do adresu strony — na nowym adresie trzeba ją założyć od nowa
  var SKIP = ["pushEndpointThisDevice", "przenosinyUkryj"];
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function note(html, bg) {
    var d = document.createElement("div");
    d.setAttribute("role", "status");
    d.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;background:" + (bg || "#12324a") + ";color:#fff;border:1px solid #2e5f86;border-radius:14px;padding:12px 14px;font:15px/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45)";
    d.innerHTML = html;
    document.body.appendChild(d);
    return d;
  }

  // ===== stary adres: pasek i wysyłka danych =====
  if (here === OLD) {
    var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
    var moved = get("przenosinyZrobione"), hasProfile = !!get("profileToken");
    if (moved && hasProfile) return;
    var send = null;
    window.addEventListener("message", function (ev) {
      if (ev.origin !== NEW || !ev.data) return;
      if (ev.data.przenosiny === "ok") {   // nowe okno zapisało dane
        try { localStorage.setItem("przenosinyZrobione", new Date().toISOString()); } catch (e) {}
        if (alertBox) alertBox.innerHTML = "✅ <b>Przeniesiono.</b> Korzystaj teraz z <b>czyzdaze.pl</b>" + (get("profileToken") ? " — zmiany i tak zsynchronizują się przez Twój profil." : ".");
        setTimeout(function () { if (alertBox) alertBox.remove(); }, 6000);
        return;
      }
      if (ev.data.przenosiny !== "gotowy" || !send) return;
      var all = {};
      try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (SKIP.indexOf(k) < 0) all[k] = localStorage.getItem(k); } } catch (e) {}
      send.postMessage({ przenosiny: "dane", ls: all }, NEW);
    });
    var go = function () {
      send = window.open(NEW + "/?przenosiny=1", "_blank");
      if (!send) alertBox.querySelector("[data-p=info]").textContent = "Przeglądarka zablokowała nowe okno — pozwól na wyskakujące okna dla tej strony i spróbuj ponownie.";
    };
    var alertBox;
    var show = function () {
      if (moved) {   // już przeniesione, ale bez profilu — zmiany zrobione tutaj nie przejdą same
        alertBox = note("🌐 Korzystasz ze starego adresu. <b>Zmiany zrobione tutaj nie przejdą same na czyzdaze.pl</b> (nie masz profilu)." +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><a href="' + NEW + '/" style="flex:1;text-align:center;text-decoration:none;border-radius:10px;background:#2e7d32;color:#fff;font-weight:800;padding:10px">Otwórz czyzdaze.pl</a>' +
          '<button data-p=go style="border:0;border-radius:10px;background:#1565c0;color:#fff;font-weight:700;padding:10px">Przenieś ponownie</button>' +
          '<button data-p=later style="border:0;border-radius:10px;background:#37474f;color:#fff;font-weight:700;padding:10px">✕</button></div><span data-p=info></span>', "#2a2f12");
        alertBox.querySelector("[data-p=go]").onclick = go;
        alertBox.querySelector("[data-p=later]").onclick = function () { alertBox.remove(); try { sessionStorage.setItem("przenosinyPozniej", "1"); } catch (e) {} };
        return;
      }
      alertBox = note("🌐 <b>Aplikacja ma nowy adres: czyzdaze.pl</b><br><span data-p=info>Przeniesienie skopiuje Twój profil, ulubione, pilnowane połączenia i ustawienia. Ten adres dalej działa — niczego tu nie tracisz.</span>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button data-p=go style="flex:1;border:0;border-radius:10px;background:#2e7d32;color:#fff;font-weight:800;padding:10px">➡️ Przenieś na czyzdaze.pl</button>' +
        '<button data-p=later style="border:0;border-radius:10px;background:#37474f;color:#fff;font-weight:700;padding:10px">Później</button></div>');
      alertBox.querySelector("[data-p=go]").onclick = go;
      alertBox.querySelector("[data-p=later]").onclick = function () { alertBox.remove(); try { sessionStorage.setItem("przenosinyPozniej", "1"); } catch (e) {} };
    };
    var later = false; try { later = sessionStorage.getItem("przenosinyPozniej") === "1"; } catch (e) {}
    if (!later) { if (document.body) show(); else document.addEventListener("DOMContentLoaded", show); }
    return;
  }

  // ===== nowy adres: powiadomienia na tym adresie (zgoda jest osobna dla każdego adresu) =====
  if (here === NEW && !/[?&]przenosiny=1/.test(location.search)) {
    var askPush = function () {
      var g = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
      if (!g("profileToken") || g("pushEndpointThisDevice") || g("pushPytanieUkryj") === "1") return;
      if (!("Notification" in window) || Notification.permission === "denied" || Notification.permission === "granted") return;
      var b = note("🔔 <b>Włącz powiadomienia na tym adresie.</b> Alarmy i pilnowane połączenia działają, ale ten telefon na czyzdaze.pl nie dostaje jeszcze powiadomień." +
        '<div style="display:flex;gap:8px;margin-top:10px"><button data-p=on style="flex:1;border:0;border-radius:10px;background:#2e7d32;color:#fff;font-weight:800;padding:10px">🔔 Włącz</button>' +
        '<button data-p=no style="border:0;border-radius:10px;background:#37474f;color:#fff;font-weight:700;padding:10px">Nie teraz</button></div>');
      b.querySelector("[data-p=on]").onclick = function () {
        b.querySelector("[data-p=on]").textContent = "⏳…";
        (window.ProfileSync && ProfileSync.ensureDevicePush ? ProfileSync.ensureDevicePush(true) : Promise.resolve(false)).then(function (ok) {
          b.innerHTML = ok ? "✅ Powiadomienia włączone na tym telefonie." : "⚠️ Nie udało się włączyć — sprawdź zgodę na powiadomienia w ustawieniach przeglądarki.";
          setTimeout(function () { b.remove(); }, 5000);
        });
      };
      b.querySelector("[data-p=no]").onclick = function () { b.remove(); try { localStorage.setItem("pushPytanieUkryj", "1"); } catch (e) {} };
    };
    setTimeout(function () { if (document.body) askPush(); else document.addEventListener("DOMContentLoaded", askPush); }, 3000);
  }

  // ===== nowy adres: odbiór danych =====
  if (here === NEW && /[?&]przenosiny=1/.test(location.search)) {
    var start = function () {
      if (!window.opener) { note("ℹ️ Otwórz przenosiny przyciskiem na starym adresie aplikacji (train-delay-monitor1.pages.dev)."); return; }
      var box = note("⏳ Przenoszę dane ze starego adresu…");
      var done = false;
      window.addEventListener("message", function (ev) {
        if (ev.origin !== OLD || !ev.data || ev.data.przenosiny !== "dane" || done) return;
        done = true;
        var n = 0, ls = ev.data.ls || {};
        try { Object.keys(ls).forEach(function (k) { if (typeof ls[k] === "string") { localStorage.setItem(k, ls[k]); n++; } }); } catch (e) {}
        try { localStorage.setItem("przenosinyZ", new Date().toISOString()); localStorage.setItem("przenosinyZrobione", new Date().toISOString()); } catch (e) {}
        try { window.opener && window.opener.postMessage({ przenosiny: "ok", n: n }, OLD); } catch (e) {}
        box.innerHTML = "✅ <b>Przeniesiono " + esc(n) + " ustawień.</b> Za chwilę odświeżę stronę.<br>Powiadomienia na tym adresie trzeba włączyć jeszcze raz (🛡️ Pilnowane albo Moje pociągi), a aplikację na telefonie zainstalować z tego adresu.";
        setTimeout(function () { location.replace(NEW + "/"); }, 3500);
      });
      var tries = 0;
      (function ping() { if (done || tries++ > 20) { if (!done) box.textContent = "⚠️ Stary adres nie odpowiedział. Zamknij to okno i spróbuj ponownie."; return; } try { window.opener.postMessage({ przenosiny: "gotowy" }, OLD); } catch (e) {} setTimeout(ping, 500); })();
    };
    if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  }
})();
