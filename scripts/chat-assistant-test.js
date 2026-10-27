// Testy rozmów asystenta 💬 (chat-assistant.js) — uruchamiać przed KAŻDĄ
// zmianą w asystencie:   node scripts/chat-assistant-test.js
//
// Każdy scenariusz to prawdziwa rozmowa: wysyłamy zdania, klikamy przyciski
// i sprawdzamy, co asystent ustalił i co odpowiedział. Bez przeglądarki —
// minimalna atrapa DOM poniżej wystarcza, bo asystent buduje okno sam.
// Najważniejsza zasada, której pilnują testy: asystent NIE MOŻE zgadywać ani
// po cichu podstawiać stacji/terminu z poprzedniej rozmowy — ma dopytać.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "chat-assistant.js"), "utf8");
const STATIONS = fs.readFileSync(path.join(ROOT, "data", "stations-pl.json"), "utf8");
const PL = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", "pl.json"), "utf8"));

// ---------- atrapa DOM ----------
class El {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.children = []; this.parent = null; this.style = {}; this.attrs = {};
    this.listeners = {}; this.className = ""; this._text = ""; this._q = {};
    this.id = ""; this.type = ""; this.value = ""; this.title = "";
    this.scrollTop = 0; this.scrollHeight = 0;
    const self = this;
    this.classList = {
      add(c) { const s = new Set(self.className.split(/\s+/).filter(Boolean)); s.add(c); self.className = [...s].join(" "); },
      remove(c) { self.className = self.className.split(/\s+/).filter(x => x && x !== c).join(" "); },
      contains(c) { return self.className.split(/\s+/).includes(c); }
    };
  }
  get childNodes() { return this.children; }
  appendChild(c) { if (c.parent) c.remove(); c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; }
  contains(x) { for (let n = x; n; n = n.parent) if (n === this) return true; return false; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(""); }
  set innerHTML(v) { this._text = ""; this.children = []; this._q = {}; }
  get innerHTML() { return ""; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener() {}
  dispatch(t, ev) { (this.listeners[t] || []).slice().forEach(f => f(Object.assign({ type: t, target: this, preventDefault() {} }, ev || {}))); }
  click() { this.dispatch("click"); }
  focus() {}
  closest() { return null; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  // Elementy z innerHTML okna (nagłówek, log, formularz) tworzymy na żądanie.
  querySelector(sel) {
    const found = this.all().find(n => sel.startsWith(".") && n.classList.contains(sel.slice(1)));
    if (found) return found;
    if (!this._q[sel]) { const e = new El(sel === "form" || sel === "input" ? sel : "div"); this._q[sel] = e; e.parent = this; }
    return this._q[sel];
  }
  querySelectorAll(sel) { return this.all().filter(n => sel.startsWith(".") && n.classList.contains(sel.slice(1))); }
}

function makeEnv() {
  const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  const body = new El("body"), head = new El("head");
  const document = {
    readyState: "complete", body, head,
    createElement: t => new El(t),
    getElementById: id => body.all().concat(head.all()).find(n => n.id === id) || null,
    querySelector: () => null,
    addEventListener() {}, removeEventListener() {}
  };
  const I18n = {
    t(k, p) { let v = k.split(".").reduce((o, x) => (o && o[x] != null ? o[x] : undefined), PL); if (typeof v !== "string") return k; if (p) v = v.replace(/\{(\w+)\}/g, (m, n) => (p[n] != null ? p[n] : m)); return v; },
    getLang: () => "pl", ready: Promise.resolve()
  };
  const location = { href: "", pathname: "/", search: "" };
  const window = { addEventListener() {}, I18n, location };
  const ctx = {
    window, document, I18n, location, console, URLSearchParams, Promise, Date, Math, JSON, setTimeout, clearTimeout,
    localStorage: store(), sessionStorage: store(),
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(STATIONS)) })
  };
  window.localStorage = ctx.localStorage; window.sessionStorage = ctx.sessionStorage;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx;
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

// ---------- jedna rozmowa ----------
async function session() {
  const env = makeEnv();
  const CA = env.window.ChatAssistant;
  await CA._loadStations();
  CA.open();
  await flush();
  const panel = env.document.body.all().find(n => n.classList.contains("ca-panel"));
  const log = panel.querySelector(".ca-log");
  const input = panel.querySelector("input");
  const form = panel.querySelector("form");
  // Nowe wiadomości = węzły, których jeszcze nie widzieliśmy (usuwane przyciski
  // zmieniają liczbę dzieci, więc nie liczymy po indeksie).
  const seen = new Set(log.children);
  const fresh = () => { const out = log.children.filter(n => !seen.has(n)); out.forEach(n => seen.add(n)); return out; };
  const botText = nodes => nodes.filter(n => n.classList.contains("ca-bot")).map(n => n.textContent).join("\n");
  const options = () => log.querySelectorAll(".ca-opt").map(b => b.textContent);
  const api = {
    env, CA,
    state: () => CA._state(),
    async say(text) { input.value = text; form.dispatch("submit"); await flush(); api.last = botText(fresh()); return api.last; },
    async click(label) {
      const b = log.querySelectorAll(".ca-opt").find(x => x.textContent.includes(label));
      if (!b) throw new Error("brak przycisku „" + label + "”; są: " + options().join(" | "));
      b.click(); await flush(); api.last = botText(fresh()); return api.last;
    },
    options,
    clickHeader(cls) { panel.querySelector(cls).click(); return flush().then(() => { api.last = botText(fresh()); return api.last; }); },
    last: ""
  };
  return api;
}

// ---------- asercje ----------
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const TODAY = iso(new Date());
const TOMORROW = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return iso(d); })();
function expect(cond, msg) { if (!cond) throw new Error(msg); }
const name = s => (s ? s.name : null);
function expectStation(st, key, want) {
  expect(name(st[key]) === want, key + ": oczekiwano „" + want + "”, jest „" + name(st[key]) + "”");
}
function expectEmpty(st, key) { expect(!st[key], key + " powinno być puste (dopytać), a jest „" + name(st[key]) + "”"); }
function expectSaid(c, frag) { expect(c.last.includes(frag), "odpowiedź bez „" + frag + "”:\n      " + c.last.replace(/\n/g, "\n      ")); }

// ---------- scenariusze ----------
const T = [];
const test = (title, fn) => T.push({ title, fn });

test("pełne zdanie bez „z”: Częstochowa do Tarnowskich Gór dziś po 18 bezpośrednio", async () => {
  const c = await session();
  await c.say("częstochowa do tarnowskie góry  dziś po 18:00 bezpośrednio");
  const st = c.state();
  expectStation(st, "from", "Częstochowa"); expectStation(st, "to", "Tarnowskie Góry");
  expect(st.time === "18:00", "godzina " + st.time); expect(st.date === TODAY, "data " + st.date); expect(st.direct, "tylko bezpośrednie");
  expectSaid(c, "Szukać?");
});

test("dwie stacje bez przyimków + „pierwsze połączenie”", async () => {
  const c = await session();
  await c.say("bytom szklarska poręba górna jutro pierwsze połączenie");
  const st = c.state();
  expectStation(st, "from", "Bytom"); expectStation(st, "to", "Szklarska Poręba Górna");
  expect(st.date === TOMORROW, "data " + st.date); expect(st.time === "00:00", "godzina " + st.time);
});

test("nowa trasa NIE dziedziczy stacji z poprzedniej rozmowy", async () => {
  const c = await session();
  await c.say("z Katowic do Gliwic jutro o 7");
  expectStation(c.state(), "from", "Katowice");
  await c.say("częstochowa do tarnowskie góry");
  const st = c.state();
  expectStation(st, "from", "Częstochowa"); expectStation(st, "to", "Tarnowskie Góry");
  expect(!st.time, "godzina z poprzedniej trasy nie powinna zostać: " + st.time);
});

test("nowa trasa NIE dziedziczy wykluczonych przewoźników ani czasu przesiadki", async () => {
  const c = await session();
  await c.say("z Katowic do Gliwic bez Intercity 10 minut na przesiadkę");
  expect(c.state().exclude.length === 1 && c.state().transfer === 10, "pierwsza trasa nie ustawiła IC/10 min");
  await c.say("bytom szklarska poręba górna jutro pierwsze połączenie");
  expect(!c.state().exclude.length, "zostało wykluczenie: " + c.state().exclude.map(x => x.name).join(", "));
  expect(c.state().transfer == null, "został czas przesiadki: " + c.state().transfer);
  expect(!c.last.includes("bez:"), "podsumowanie pokazuje „bez:”");
});

test("brak stacji początkowej → pytanie, poprzednia tylko jako propozycja", async () => {
  const c = await session();
  await c.say("z Katowic do Gliwic");
  await c.say("chcę jechać do Bytomia");
  const st = c.state();
  expectEmpty(st, "from"); expectStation(st, "to", "Bytom");
  expectSaid(c, "Skąd jedziesz?");
  expect(c.options()[0] === "Katowice", "pierwsza propozycja powinna być poprzednią stacją: " + c.options().join(" | "));
});

test("sama nowa data nie zmienia po cichu trasy z nierozpoznanymi słowami", async () => {
  const c = await session();
  await c.say("z Katowic do Gliwic");
  await c.say("xyz abc jutro");
  expectEmpty(c.state(), "from");
  expectSaid(c, "Nie rozpoznałem stacji");
});

test("literówka → podpowiedzi do kliknięcia, bez zgadywania", async () => {
  const c = await session();
  await c.say("z Tarnogór do Katowic");
  expectEmpty(c.state(), "from");
  expectSaid(c, "Nie znalazłem stacji");
  expect(c.options().includes("Tarnowskie Góry"), "brak „Tarnowskie Góry” w: " + c.options().join(" | "));
  await c.click("Tarnowskie Góry");
  expectStation(c.state(), "from", "Tarnowskie Góry");
});

test("odmiana nazw: z Lublińca do Bytomia", async () => {
  const c = await session();
  await c.say("z Lublińca do Bytomia");
  expectStation(c.state(), "from", "Lubliniec"); expectStation(c.state(), "to", "Bytom");
});

test("niejednoznaczne miasto → wybór, stacja główna pierwsza", async () => {
  const c = await session();
  await c.say("z Bytomia do Krakowa");
  expectEmpty(c.state(), "to");
  expect(c.options()[0] === "Kraków Główny", "pierwsza opcja: " + c.options()[0]);
  expect(c.options().some(o => o.includes("Żadne z powyższych")), "brak „Żadne z powyższych”");
  await c.click("Kraków Główny");
  expectStation(c.state(), "to", "Kraków Główny");
});

test("jedna stacja bez z/do → pytanie o kierunek", async () => {
  const c = await session();
  await c.say("bytom jutro o 7");
  expectEmpty(c.state(), "from"); expectEmpty(c.state(), "to");
  await c.click("Tam jadę");
  expectStation(c.state(), "to", "Bytom");
  expectSaid(c, "Skąd jedziesz?");
  expect(c.state().time === "07:00", "godzina " + c.state().time);
});

test("myślnik: Katowice - Gliwice", async () => {
  const c = await session();
  await c.say("Katowice - Gliwice");
  expectStation(c.state(), "from", "Katowice"); expectStation(c.state(), "to", "Gliwice");
});

test("Dąbrowa Górnicza do Katowic (stacja na „d”)", async () => {
  const c = await session();
  await c.say("Dąbrowa Górnicza do Katowic");
  expectStation(c.state(), "from", "Dąbrowa Górnicza"); expectStation(c.state(), "to", "Katowice");
});

test("godzina słowami: Częstochowa Tarnowskie Góry bezpośredni dzisiaj po siedemnastej", async () => {
  const c = await session();
  await c.say("Częstochowa Tarnowskie Góry bezpośredni dzisiaj po siedemnastej");
  const st = c.state();
  expectStation(st, "from", "Częstochowa"); expectStation(st, "to", "Tarnowskie Góry");
  expect(st.time === "17:00", "godzina " + st.time); expect(st.direct, "tylko bezpośrednie"); expect(st.date === TODAY, "data " + st.date);
  expect(!c.last.includes("od teraz"), "nie może być „od teraz”");
});

test("godziny słowami — różne formy", async () => {
  const cases = [
    ["z Bytomia do Gliwic o piątej", "05:00"],
    ["z Bytomia do Gliwic o wpół do ósmej", "07:30"],
    ["z Bytomia do Gliwic około dwudziestej pierwszej trzydzieści", "21:30"],
    ["z Bytomia do Gliwic po dziewiętnastej piętnaście", "19:15"],
    ["z Bytomia do Gliwic o dwunastej", "12:00"],
    ["z Bytomia do Gliwic od szesnastej", "16:00"],
    ["z Bytomia do Gliwic o północy", "00:00"],
    ["z Bytomia do Gliwic o 7 30", "07:30"]
  ];
  for (const [txt, want] of cases) {
    const c = await session();
    await c.say(txt);
    expect(c.state().time === want, "„" + txt + "”: oczekiwano " + want + ", jest " + c.state().time);
  }
});

test("niezrozumiała godzina → pytanie, nie „od teraz”", async () => {
  const c = await session();
  await c.say("z Bytomia do Gliwic po kolacji");
  expect(!c.state().time, "godzina nie powinna być ustawiona: " + c.state().time);
  expectSaid(c, "O której");
});

test("„rano” → przyciski z godzinami", async () => {
  const c = await session();
  await c.say("z Gliwic do Katowic rano");
  expectSaid(c, "O której");
  await c.click("07:00");
  expect(c.state().time === "07:00", "godzina " + c.state().time);
});

test("przez stację", async () => {
  const c = await session();
  await c.say("jutro z Tarnowskich Gór do Katowic przez Chorzów Batory");
  expectStation(c.state(), "via", "Chorzów Batory");
});

test("bez Intercity", async () => {
  const c = await session();
  await c.say("z Bytomia do Gliwic bez Intercity");
  expect(c.state().exclude.some(x => x.code === "IC"), "IC nie wykluczony");
});

test("nieznany przewoźnik → przyciski przewoźników", async () => {
  const c = await session();
  await c.say("z Bytomia do Gliwic bez kogoś");
  await c.click("Koleje Śląskie");
  expect(c.state().exclude.some(x => x.code === "KS"), "KS nie wykluczony");
});

test("niedozwolony czas przesiadki → przyciski", async () => {
  const c = await session();
  await c.say("z Bytomia do Gliwic 7 minut na przesiadkę");
  await c.click("10 min");
  expect(c.state().transfer === 10, "przesiadka " + c.state().transfer);
});

test("podróż powrotna", async () => {
  const c = await session();
  await c.say("z Bytomia do Gliwic jutro o 7");
  await c.say("powrót o 16");
  const st = c.state();
  expectStation(st, "from", "Gliwice"); expectStation(st, "to", "Bytom");
  expect(st.time === "16:00", "godzina " + st.time);
});

test("obcy język → „Nie rozumiem w Twoim języku.”", async () => {
  const c = await session();
  await c.say("from Katowice to Gliwice tomorrow please");
  expectSaid(c, "Nie rozumiem w Twoim języku.");
  expectEmpty(c.state(), "from");
});

test("„Szukaj” otwiera planer z parametrami", async () => {
  const c = await session();
  await c.say("z Tarnowskich Gór do Katowic jutro o 7 bez Intercity");
  await c.click("Szukaj");
  const href = c.env.location.href;
  ["/planer/?", "from=Tarnowskie", "to=Katowice", "time=07%3A00", "date=" + TOMORROW, "exclude=IC", "auto=1"].forEach(p =>
    expect(href.includes(p), "w adresie brak „" + p + "”: " + href));
});

test("czyść historię pyta o potwierdzenie", async () => {
  const c = await session();
  await c.say("z Bytomia do Gliwic");
  await c.clickHeader(".ca-clear");
  expectSaid(c, "Na pewno");
  expectStation(c.state(), "from", "Bytom");
  await c.click("Tak, wyczyść");
  expectEmpty(c.state(), "from");
});

// ---------- uruchomienie ----------
(async () => {
  let fail = 0;
  for (const t of T) {
    try { await t.fn(); console.log("  ✔ " + t.title); }
    catch (e) { fail++; console.log("  ✘ " + t.title + "\n      " + e.message); }
  }
  console.log("\n" + (T.length - fail) + "/" + T.length + " scenariuszy OK");
  process.exit(fail ? 1 : 0);
})();
