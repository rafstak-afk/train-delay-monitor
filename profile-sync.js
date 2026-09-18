// Współdzielony mechanizm synchronizacji profilu (token -> Cloudflare KV)
// między index.html, moje-pociagi-v2 i monitorowane-pociagi. Token jest
// jedynym "kluczem" do danych (bez hasła) — świadoma decyzja, dane są
// niskiej wrażliwości (ulubione stacje/pociągi, nie dane osobowe).
(function () {
  "use strict";

  const STORAGE_KEY = "profileToken";
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // bez 0/O/1/I/L

  function normalize(raw) {
    return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }

  function format(token) {
    const t = normalize(token);
    const groups = t.match(/.{1,4}/g);
    return groups ? groups.join("-") : t;
  }

  function isValid(token) {
    return /^[A-Z0-9]{16}$/.test(normalize(token));
  }

  function generateToken() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
  }

  function getToken() {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch (e) {
      return null;
    }
  }

  function setToken(token) {
    const t = normalize(token);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch (e) {}
    return t;
  }

  function clearToken() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  async function pull() {
    const token = getToken();
    if (!token) return null;

    try {
      const res = await fetch("/api/profile?token=" + encodeURIComponent(token), {
        cache: "no-store"
      });
      if (!res.ok) return null;
      const body = await res.json();
      return body && body.ok ? (body.data || null) : null;
    } catch (e) {
      return null;
    }
  }

  async function push(patch) {
    const token = getToken();
    if (!token) return false;

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, patch })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  window.ProfileSync = {
    generateToken,
    getToken,
    setToken,
    clearToken,
    normalize,
    format,
    isValid,
    pull,
    push
  };
})();
