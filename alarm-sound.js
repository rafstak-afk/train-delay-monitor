// Dźwięk alarmu na otwartej stronie (tablica, Moje pociągi): prawdziwe Rp1
// "Baczność" — syrena EN57 z ostatniego pociągu Tarnowskie Góry → Opole
// Główne, 10.12.2011, nagranie RafStaK (YT: "Ostatni pociąg z Tarnowskich
// Gór do Opola Rp1"). Powiadomienia push z serwera grają dźwiękiem
// systemowym — przeglądarki nie pozwalają stronie podmienić dźwięku
// powiadomienia, dlatego ten dźwięk dotyczy tylko alarmu na otwartej stronie.
//
// Ustawienie ON/OFF jest częścią profilu (`alarmSound`) — takie samo na
// każdym urządzeniu z tym profilem; profile-sync.js przepisuje je z profilu
// do localStorage przy każdym pull().
(function () {
  "use strict";
  const KEY = "alarmSoundEnabled";
  const SRC = "/sounds/alarm-rp1.mp3";
  const VOL = "alarmVolume";
  function volume() { try { const v = parseFloat(localStorage.getItem(VOL)); return isNaN(v) ? 1 : Math.max(0, Math.min(1, v)); } catch (e) { return 1; } }
  // fromProfile = wartość przyszła z profilu; zapis do profilu tylko przy puszczeniu suwaka (change), nie przy przesuwaniu
  function setVolume(v, push) {
    v = Math.max(0, Math.min(1, Number(v) || 0));
    try { localStorage.setItem(VOL, String(v)); } catch (e) {}
    if (audio) audio.volume = v;
    if (push && window.ProfileSync && ProfileSync.getToken()) ProfileSync.push({ alarmVolume: Math.round(v * 100) / 100 });
  }
  let audio = null;

  function isEnabled() {
    try { return localStorage.getItem(KEY) !== "0"; } catch (e) { return true; }
  }

  function t(key, fallback) {
    try { return window.I18n ? I18n.t(key) : fallback; } catch (e) { return fallback; }
  }

  function play() {
    if (!isEnabled()) return;
    try {
      if (!audio) audio = new Audio(SRC);
      audio.volume = volume();
      audio.currentTime = 0;
      // Przeglądarka może zablokować dźwięk, dopóki użytkownik nie kliknie
      // niczego na stronie — wtedy po prostu nic nie gra, bez błędu.
      const p = audio.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function renderButton() {
    const btn = document.getElementById("alarmSoundButton");
    if (!btn) return;
    const on = isEnabled();
    btn.textContent = on ? "🔊" : "🔇";
    btn.title = on
      ? t("alarmSound.onTitle", "Dźwięk alarmu (Rp1): włączony — kliknij, aby wyłączyć")
      : t("alarmSound.offTitle", "Dźwięk alarmu (Rp1): wyłączony — kliknij, aby włączyć");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function setEnabled(on, fromProfile) {
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
    renderButton();
    if (!fromProfile && window.ProfileSync && ProfileSync.getToken()) ProfileSync.push({ alarmSound: !!on });
  }

  function injectButton() {
    const anchor = document.getElementById("alertButton");
    if (!anchor || document.getElementById("alarmSoundButton")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "alarmSoundButton";
    btn.className = "alarm-sound-btn";
    btn.style.cssText = "min-width:40px;width:auto;padding:6px 10px;border-radius:8px;border:1px solid #48627c;background:#172433;color:#fff;font-size:16px;cursor:pointer;line-height:1;align-self:stretch";
    btn.addEventListener("click", function () {
      const on = !isEnabled();
      setEnabled(on, false);
      if (on) play(); // od razu słychać, co się włączyło
    });
    anchor.insertAdjacentElement("afterend", btn);
    renderButton();
  }

  window.addEventListener("langchange", renderButton);
  window.addEventListener("alarmsoundchange", renderButton);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectButton);
  else injectButton();

  // Ten sam alarm najwyżej raz na 20 s (np. push i strona strażnika naraz).
  let lastOnceAt = 0;
  function playOnce() {
    if (Date.now() - lastOnceAt < 20000) return;
    lastOnceAt = Date.now();
    play();
    try { if (navigator.vibrate) navigator.vibrate([120, 80, 120, 400, 120, 80, 120]); } catch (e) {}
  }
  // Powiadomienie strażnika przyszło, a aplikacja jest otwarta i widoczna —
  // service worker prosi o Rp1 (dźwięku samego powiadomienia systemowego
  // przeglądarka nie pozwala zmienić).
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "playAlarm" && document.visibilityState === "visible") playOnce();
      if (e.data && e.data.type === "remindBanner" && document.visibilityState === "visible") banner(e.data.title, e.data.body, e.data.url);
    });
  }

  // Duży baner przypomnienia na otwartej stronie (z Rp1) — „budzik” w aplikacji.
  function banner(title, body, url) {
    let el = document.getElementById("remindBanner");
    if (!el) {
      el = document.createElement("div"); el.id = "remindBanner";
      el.style.cssText = "position:fixed;left:10px;right:10px;top:10px;z-index:100010;background:#3a2a00;border:2px solid #ffd400;border-radius:14px;padding:14px 16px;color:#fff;font-family:Arial,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.6);max-width:560px;margin:0 auto";
      document.body.appendChild(el);
    }
    el.innerHTML = "";
    const h = document.createElement("div"); h.style.cssText = "font-size:19px;font-weight:900;margin-bottom:6px"; h.textContent = title || "⏰";
    const b = document.createElement("div"); b.style.cssText = "font-size:14.5px;line-height:1.45"; b.textContent = body || "";
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;margin-top:10px";
    const ok = document.createElement("button"); ok.type = "button"; ok.textContent = "✓ OK";
    ok.style.cssText = "border:0;border-radius:9px;background:#ffd400;color:#101820;font-weight:900;padding:9px 16px;font-size:15px;cursor:pointer";
    ok.onclick = function () { el.remove(); try { if (audio) audio.pause(); } catch (e) {} };
    row.appendChild(ok);
    if (url && location.pathname + location.hash !== url) {
      const go = document.createElement("a"); go.href = url; go.textContent = "🛡️ →";
      go.style.cssText = "border:1px solid #ffd400;border-radius:9px;color:#ffd400;font-weight:800;padding:8px 14px;text-decoration:none";
      row.appendChild(go);
    }
    el.appendChild(h); el.appendChild(b); el.appendChild(row);
    playOnce();
  }

  window.AlarmSound = { play, playOnce, isEnabled, setEnabled, volume, setVolume, banner };
})();
