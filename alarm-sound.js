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
    btn.style.cssText = "min-width:44px;padding:10px 12px;border-radius:10px;border:1px solid #48627c;background:#172433;color:#fff;font-size:18px;cursor:pointer;line-height:1";
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

  window.AlarmSound = { play, isEnabled, setEnabled };
})();
