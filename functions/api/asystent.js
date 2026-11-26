// 🧠 Asystent podróży (TODO 82, wariant B) — dla wszystkich od 24.11 (v6.88), z limitami (niżej, w onRequestPost).
// Darmowy model Cloudflare Workers AI (powiązanie „AI” w ustawieniach projektu) zamienia swobodną prośbę
// („Zawiercie → Tarnowskie Góry, mam czas, mogę jechać przez Częstochowę”) na parametry. Liczą NASZE algorytmy
// (planer PLK, tablice odjazdów, bieg pociągu) — model niczego nie zmyśla. Bez powiązania AI działa prosty parser.
// Limity: 40 rozmów dziennie (licznik w pamięci podręcznej), najwyżej ok. 10 zapytań do planera na rozmowę.
const TOKEN_RE = /^[A-Z0-9]{16}$/;
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
function json(d, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }); }
function normalizeToken(raw) { return String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(); }

let authorHashes = null, authorHashesAt = 0;
async function isAuthor(env, token) {
  if (!token) return false;
  if (!authorHashes || Date.now() - authorHashesAt > 300000) {
    try { authorHashes = JSON.parse((await env.USER_PROFILES.get("author:hashes")) || "[]"); } catch (e) { authorHashes = []; }
    authorHashesAt = Date.now();
  }
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const h = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
  return Array.isArray(authorHashes) && authorHashes.includes(h);
}
async function rateOk(request, name, max, ttlSec) {
  try {
    const key = new Request(new URL("/__rl/" + encodeURIComponent(name), request.url).toString());
    const hit = await caches.default.match(key);
    const n = hit ? (parseInt(await hit.text(), 10) || 0) : 0;
    if (n >= max) return false;
    await caches.default.put(key, new Response(String(n + 1), { headers: { "Cache-Control": "max-age=" + ttlSec } }));
  } catch (e) {}
  return true;
}

export const nowWarsaw = () => {
  const d = new Date(), date = d.toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
  const time = d.toLocaleTimeString("sv-SE", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" });
  const wd = d.toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw", weekday: "long" });
  return { date, time, wd };
};
const hm = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "")); return m ? +m[1] * 60 + +m[2] : null; };
const fmt = m => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0") + ":" + String(((m % 60) + 60) % 60).padStart(2, "0");
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").trim();

// ---------- 1. zrozumienie prośby ----------
const SYSTEM = `Jesteś parserem próśb o połączenia kolejowe w Polsce (głównie województwo śląskie). Zamieniasz prośbę pasażera na JEDEN obiekt JSON w jednej linii — bez komentarzy, bez znaczników kodu, bez dodatkowych pól:
{"trip":true|false,"from":"stacja startowa albo null","to":"stacja docelowa albo null","date":"RRRR-MM-DD albo null","time":"GG:MM albo null","arrive":"GG:MM albo null","now":true|false,"flexible":true|false,"via":[],"meet":true|false}

Pola:
- trip: true, gdy pasażer pyta o połączenie, dojazd, trasę albo pociąg między miejscami. Pytania o coś innego (bilety, opóźnienie konkretnego pociągu, pogoda, rozmowa) → false i reszta pól null / false / [].
- from, to: nazwy stacji w MIANOWNIKU, z polskimi znakami, bez słów „stacja”, „dworzec”, „PKP”. Odmiana: z Zawiercia → Zawiercie; do Tarnowskich Gór → Tarnowskie Góry; z Katowic → Katowice; do Gliwic → Gliwice; z Bytomia → Bytom; do Chorzowa Batorego → Chorzów Batory; z Sosnowca Głównego → Sosnowiec Główny; do Lublińca → Lubliniec; z Częstochowy → Częstochowa; do Zabrza → Zabrze; z Rudy Śląskiej → Ruda Śląska; do Dąbrowy Górniczej → Dąbrowa Górnicza; z Krakowa Głównego → Kraków Główny; z Opola Głównego → Opole Główne. Nie dopisuj „Główny/Główna”, jeśli pasażer tego nie napisał. „Z domu”, „z pracy”, „stąd”, „z miejsca, gdzie jestem” → null (nie zgaduj stacji).
- date: dzień podróży. „dziś/dzisiaj” → dzisiejsza data; „jutro” → +1 dzień; „pojutrze” → +2 dni; nazwa dnia tygodnia („w piątek”) → najbliższy taki dzień od dziś (dziś, jeśli to ten dzień, a pora jeszcze nie minęła); brak wzmianki → null.
- time: godzina odjazdu GG:MM. „o 8” / „o ósmej” → 08:00; „po siedemnastej” / „po 17” → 17:00; „około wpół do siódmej” → 06:30; „rano” → 06:00; „przed południem” → 09:00; „w południe” → 12:00; „po południu” → 14:00; „wieczorem” → 18:00; „w nocy” → 22:00; „za godzinę” → teraz + 60 min; „za pół godziny” → teraz + 30 min. Gdy pasażer podaje godzinę PRZYJAZDU („muszę być o 8:00”, „na 7:30 do pracy”) → arrive = ta godzina, a time = ta godzina minus 2 godziny. Brak wzmianki → null.
- arrive: godzina, na którą pasażer musi BYĆ na miejscu (GG:MM), albo null.
- now: true, gdy jedzie teraz, zaraz, „najbliższy”, „najszybciej jak się da”, „już wychodzę”.
- flexible: true, gdy ma czas, nie spieszy się, nie chce czekać na peronie, może się wozić, objazdy mu nie przeszkadzają, „może być dłużej”.
- via: stacje, przez które pasażer chce albo może jechać („nawet przez Częstochowę” → ["Częstochowa"]); w mianowniku; bez stacji z from/to; najwyżej 2; brak → [].
- meet: true, gdy chce wyjechać pociągowi naprzeciw, złapać go wcześniej na trasie, wsiąść na wcześniejszej stacji, żeby mieć miejsce.

Przykłady (teraz: poniedziałek, 2026-11-23, godz. 15:00):
Prośba: z Zawiercia do Tarnowskich Gór, mam czas, mogę jechać przez Częstochowę
{"trip":true,"from":"Zawiercie","to":"Tarnowskie Góry","date":null,"time":null,"arrive":null,"now":false,"flexible":true,"via":["Częstochowa"],"meet":false}
Prośba: jutro po siedemnastej z Katowic do Lublińca
{"trip":true,"from":"Katowice","to":"Lubliniec","date":"2026-11-24","time":"17:00","arrive":null,"now":false,"flexible":false,"via":[],"meet":false}
Prośba: muszę być w Gliwicach na 8:00 w piątek, jadę z Bytomia
{"trip":true,"from":"Bytom","to":"Gliwice","date":"2026-11-27","time":"06:00","arrive":"08:00","now":false,"flexible":false,"via":[],"meet":false}
Prośba: chcę wyjechać pociągowi naprzeciw, jadę z Chorzowa Batorego do Bytomia, najbliższy
{"trip":true,"from":"Chorzów Batory","to":"Bytom","date":null,"time":null,"arrive":null,"now":true,"flexible":false,"via":[],"meet":true}
Prośba: z domu do Katowic wieczorem
{"trip":true,"from":null,"to":"Katowice","date":null,"time":"18:00","arrive":null,"now":false,"flexible":false,"via":[],"meet":false}
Prośba: ile kosztuje bilet miesięczny?
{"trip":false,"from":null,"to":null,"date":null,"time":null,"arrive":null,"now":false,"flexible":false,"via":[],"meet":false}`;

export async function understand(env, text, now) {
  if (env.AI) {
    try {
      const r = await env.AI.run(MODEL, {
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `Teraz jest ${now.wd}, ${now.date}, godz. ${now.time}.\nProśba: ${text}` }],
        max_tokens: 300, temperature: 0
      });
      const out = typeof r === "string" ? r : (r && (r.response ?? r.result?.response)) ?? "";
      const o = typeof out === "object" ? out : JSON.parse((String(out).match(/\{[\s\S]*\}/) || ["null"])[0]);
      if (o && typeof o === "object") {
        const nul = v => (v == null || v === "" || String(v).toLowerCase() === "null") ? null : String(v).trim();
        return { trip: !!o.trip, from: nul(o.from), to: nul(o.to), date: nul(o.date), time: nul(o.time), arrive: /^\d{1,2}:\d{2}$/.test(String(o.arrive || "")) ? String(o.arrive).padStart(5, "0") : null, now: !!o.now, flexible: !!o.flexible,
          via: (Array.isArray(o.via) ? o.via : []).map(nul).filter(Boolean).slice(0, 2), meet: !!o.meet, by: "ai" };
      }
    } catch (e) { /* awaryjnie prosty parser */ }
  }
  // prosty parser (bez AI): „z X do Y”, „X → Y”, „X Y” przy znanych słowach
  const t = " " + text.replace(/[,.!?]/g, " ") + " ";
  let m = /\bz(?:e)?\s+(.+?)\s+do\s+(.+?)(?=\s+(?:teraz|jutro|dzi[sś]|o\s+\d|mam|mog[eę]|nie|przez|i\s|a\s|$))/i.exec(t) || /(?:po[lł][aą]czeni\w*|jak\s+dojad\w*)\s+(.+?)\s+(?:do|→|-)\s+(.+?)(?=\s+(?:teraz|jutro|mam|mog|nie|przez|$))/i.exec(t);
  const via = [...t.matchAll(/przez\s+([A-ZŁŚŻŹĆ][\wąćęłńóśźż]+(?:\s+[A-ZŁŚŻŹĆ][\wąćęłńóśźż]+)?)/g)].map(x => x[1]);
  return { trip: !!m, from: m ? m[1].trim() : null, to: m ? m[2].trim() : null, date: /jutro/i.test(t) ? null : null, time: null, now: /teraz|zaraz/i.test(t), flexible: /mam\s+(?:du[zż]o\s+|pe[lł]no\s+)?(?:wolnego\s+)?czas|nie\s+chc[eę]\s+(?:siedzie|czeka)|wozi[cć]|nie\s+ma\s+(?:dla\s+mnie\s+)?problemu/i.test(t), via, meet: /naprzeciw/i.test(t), by: "regex" };
}

// ---------- 2. narzędzia: nasze API ----------
async function api(request, path) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(new URL(path, request.url)); const tx = await r.text(); if (tx.startsWith("{")) return JSON.parse(tx); } catch (e) {}
    await new Promise(r => setTimeout(r, 1200 * (i + 1)));
  }
  return null;
}
async function station(request, name) {
  if (!name) return null;
  // nazwa może przyjść odmieniona („z Zawiercia”, „do Tarnowskich Gór”) — szukamy po rdzeniu i wybieramy najlepiej pasującą
  const words = norm(name).split(/\s+/).filter(Boolean), stem = w => w.slice(0, Math.max(4, w.length - 3));
  const score = n => { const ws = norm(n).split(/[\s-]+/); let sc = 0; words.forEach((w, i) => { if (ws[i] && ws[i].startsWith(stem(w))) sc += 2; else if (ws.some(x => x.startsWith(stem(w)))) sc += 1; }); return sc - Math.abs(ws.length - words.length) * 0.5; };
  // zapytania z polskimi znakami (słownik PLK ich wymaga), rdzeń bez końcówki
  const ow = String(name).trim().split(/\s+/), ostem = w => w.slice(0, Math.max(4, w.length - 3));
  const tries = [name, ow.map(ostem).join(" "), ostem(ow[0])];
  for (const q of tries) {
    const j = await api(request, "/api/dictionaries/stations?search=" + encodeURIComponent(q) + "&pageSize=20");
    const list = (j && j.stations) || [];
    const exact = list.find(s => norm(s.name) === norm(name)); if (exact) return exact;
    const best = list.map(s => ({ s, sc: score(s.name) })).sort((x, y) => y.sc - x.sc)[0];
    if (best && best.sc >= words.length * 1.5) return best.s;
  }
  return null;
}
const planner = (request, q) => api(request, "/api/planner?" + new URLSearchParams(Object.assign({ transferMinutes: "3", maxResults: "6" }, q)).toString());
const itsOf = j => (j && Array.isArray(j.itineraries) ? j.itineraries : []);
const legTxt = l => { const t = l.train || {}; return ((t.category || "") + " " + (t.number || "") + (t.name ? " " + t.name : "")).trim(); };
const itTxt = it => (it.legs || []).map(l => legTxt(l) + " " + l.board.stationName + " " + l.board.time + " → " + l.alight.stationName + " " + l.alight.time).join("  ›  ");
const durMin = it => { let d = hm(it.arrivalTime) - hm(it.departureTime); return d < 0 ? d + 1440 : d; };

// ---------- 3. rozumowanie ----------
export async function solve(request, p, now) {
  const [A, B] = await Promise.all([station(request, p.from), station(request, p.to)]);
  if (!A || !B) return { ok: false, text: `Nie rozpoznałem stacji ${!A ? "„" + (p.from || "?") + "”" : ""}${!A && !B ? " ani " : ""}${!B ? "„" + (p.to || "?") + "”" : ""}. Napisz pełne nazwy, np. „z Zawiercia do Tarnowskich Gór”.` };
  const date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : now.date;
  const time = p.time && /^\d{1,2}:\d{2}$/.test(p.time) ? p.time.padStart(5, "0") : now.time;
  const out = [], notes = [];
  const base = await planner(request, { from: A.name, to: B.name, date, time });
  const its = itsOf(base).sort((a, b) => hm(a.arrivalTime) - hm(b.arrivalTime) || hm(b.departureTime) - hm(a.departureTime));
  if (!its.length) return { ok: true, text: `Nie znalazłem połączenia ${A.name} → ${B.name} od ${time} (${date}). Spróbuj innej godziny.` };
  const best = its[0];
  let arrPick = null;
  // 24.11: „muszę być na 8:00” — najpierw ostatnie połączenie, które zdąży (najdłużej w domu), potem najszybsze
  if (p.arrive && hm(p.arrive) != null) {
    const ok = itsOf(base).filter(x => hm(x.arrivalTime) <= hm(p.arrive)).sort((a, b) => hm(b.departureTime) - hm(a.departureTime));
    arrPick = ok[0] || null;
    if (ok.length) out.push(`✅ Na ${p.arrive} zdążysz, wyjeżdżając najpóźniej: ${ok[0].departureTime} → ${ok[0].arrivalTime} (zapas ${hm(p.arrive) - hm(ok[0].arrivalTime)} min)\n   ${itTxt(ok[0])}`);
    else out.push(`⚠️ Nie znalazłem połączenia z przyjazdem do ${p.arrive} (szukam od ${time}). Najwcześniej na miejscu:`);
  }
  out.push(`🏆 Najszybciej na miejscu: ${best.departureTime} → ${best.arrivalTime} (${durMin(best)} min)\n   ${itTxt(best)}`);
  const others = itsOf(base).filter(x => x !== best && x !== arrPick).slice(0, 3);
  if (others.length) out.push("Inne:\n" + others.map(x => `   ${x.departureTime} → ${x.arrivalTime} · ${itTxt(x)}`).join("\n"));
  // objazdy przez wskazane stacje
  for (const v of (p.via || []).slice(0, 2)) {
    const V = await station(request, v); if (!V) continue;
    const vi = itsOf(await planner(request, { from: A.name, to: B.name, via: V.name, date, time, maxResults: "3" })).sort((a, b) => hm(a.arrivalTime) - hm(b.arrivalTime));
    if (!vi.length) { notes.push(`Przez stację ${V.name}: nie znalazłem połączenia.`); continue; }
    const d = hm(vi[0].arrivalTime) - hm(best.arrivalTime);
    out.push(`🔀 Przez stację ${V.name}: ${vi[0].departureTime} → ${vi[0].arrivalTime}${d > 0 ? ` (na miejscu ${d} min później niż najszybciej)` : d < 0 ? ` (o ${-d} min wcześniej!)` : " (tak samo)"}\n   ${itTxt(vi[0])}`);
  }
  // pociąg naprzeciw / skąd rusza pierwszy pociąg
  const wait = hm(best.departureTime) - hm(time);
  const L0 = (best.legs || [])[0];
  if ((p.meet || p.flexible) && L0 && L0.orderId) {
    const td = await api(request, "/api/train-details?" + new URLSearchParams({ scheduleId: L0.scheduleId || "", orderId: L0.orderId, operatingDate: date, train: (L0.train && L0.train.number) || "" }).toString());
    const route = (td && td.route) || [], i0 = route.findIndex(s => norm(s.stationName) === norm(L0.board.stationName));
    if (i0 === 0) notes.push(`↔️ ${legTxt(L0)} zaczyna bieg na stacji ${L0.board.stationName} o ${L0.board.time} — nie da się wyjechać mu naprzeciw.`);
    else if (i0 > 0) notes.push(`↔️ ${legTxt(L0)} jedzie z ${route[0].stationName}; wcześniejsze stacje: ${route.slice(Math.max(0, i0 - 3), i0).map(s => s.stationName + " " + (s.plannedDeparture || s.plannedTime)).join(", ")}. Wyjazd naprzeciw nie przyspieszy przyjazdu — to ten sam pociąg.`);
  }
  // przejażdżka zamiast czekania: tam i z powrotem przed odjazdem najszybszego
  if (p.flexible && wait >= 20) {
    const dj = await api(request, "/api/departures?" + new URLSearchParams({ station: A.name, date, time, limit: "20" }).toString());
    const deps = ((dj && dj.departures) || []).filter(d => hm(d.time || d.plannedTime) >= hm(time) && hm(d.time || d.plannedTime) <= hm(best.departureTime) - 15);
    const cands = []; const seen = new Set();
    for (const d of deps) { const x = String(d.via || "").split(",").map(s => s.trim()).filter(Boolean)[0]; if (x && !seen.has(x)) { seen.add(x); cands.push({ x, dep: d }); } if (cands.length >= 3) break; }
    const loops = [];
    for (const c of cands) {
      const there = itsOf(await planner(request, { from: A.name, to: c.x, date, time: c.dep.plannedTime || c.dep.time, maxResults: "1", maxTransfers: "0" }))[0];
      if (!there) continue;
      const back = itsOf(await planner(request, { from: c.x, to: A.name, date, time: fmt(hm(there.arrivalTime) + 2), maxResults: "3", maxTransfers: "0" })).filter(b => hm(b.arrivalTime) <= hm(best.departureTime) - 3).pop();
      if (!back) continue;
      const slack = hm(best.departureTime) - hm(back.arrivalTime);
      loops.push(`   ${there.departureTime} ${legTxt(there.legs[0])} → ${c.x} ${there.arrivalTime}, powrót ${back.departureTime} ${legTxt(back.legs[0])} → ${A.name} ${back.arrivalTime} (zapas ${slack} min do ${best.departureTime}${slack < 6 ? " ⚠️ krótki — przy opóźnieniu stracisz pociąg" : ""})`);
    }
    if (loops.length) out.push(`⏳ Zamiast czekać ${wait} min na peronie — przejażdżka tam i z powrotem:\n` + loops.join("\n"));
    else notes.push(`⏳ Do odjazdu ${wait} min — nie znalazłem przejażdżki tam i z powrotem, która zdąży wrócić.`);
  }
  if (wait > 0 && date === now.date && time === now.time && !(p.flexible && wait >= 20)) notes.push(`Do odjazdu najszybszego połączenia: ${wait} min.`);
  return { ok: true, text: `${A.name} → ${B.name}, ${date === now.date ? "dziś" : date} od ${time}\n\n` + out.join("\n\n") + (notes.length ? "\n\n" + notes.join("\n") : "") + "\n\nRozkład i opóźnienia: PKP PLK." };
}

export async function onRequestPost({ request, env }) {
  let b = null; try { b = await request.json(); } catch (e) { return json({ ok: false, error: "Zły format" }, 400); }
  const token = normalizeToken(b && b.token);
  const text = String((b && b.text) || "").slice(0, 600).trim();
  if (!text) return json({ ok: false, error: "Pusta prośba" }, 400);
  const now = nowWarsaw();
  // 24.11 (v6.88): dla wszystkich. Limity: autor 60/dobę; pozostali 10/dobę na osobę (profil albo skrót adresu IP — tylko
  // w pamięci podręcznej na dobę, bez zapisu) i 150/dobę łącznie (TODO 96, 26.11: było 300 — darmowe 10 tys. neuronów Workers AI starcza na ok. 175 rozmów Llamą 3.3 70B, więc z zapasem zawsze odpowiada pełny model; ok. 1,5 tys. zapytań do PLK).
  const author = TOKEN_RE.test(token) && await isAuthor(env, token);
  const sha = async x => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)))].slice(0, 8).map(v => v.toString(16).padStart(2, "0")).join("");
  if (author) {
    if (!(await rateOk(request, "asyst-a:" + now.date, 60, 86400))) return json({ ok: false, error: "Dzienny limit asystenta wyczerpany — jutro znowu." }, 429);
  } else {
    const who = TOKEN_RE.test(token) ? "t" + await sha(token) : "i" + await sha("czyzdaze|" + (request.headers.get("CF-Connecting-IP") || "?"));
    if (!(await rateOk(request, "asyst-u:" + now.date + ":" + who, 10, 86400))) return json({ ok: false, error: "Twój dzienny limit asystenta (10 rozmów) jest wyczerpany — jutro znowu. Zwykły czat i planer działają bez limitu." }, 429);
    if (!(await rateOk(request, "asyst:" + now.date, 150, 86400))) return json({ ok: false, error: "Asystent ma dziś bardzo dużo pytań — dzienny limit wyczerpany, jutro znowu. Planer działa normalnie." }, 429);
  }
  const p = await understand(env, text, now);
  if (!p || !p.trip || !p.from || !p.to) return json({ ok: false, reason: "not_trip", parsed: p, ai: !!env.AI });
  const r = await solve(request, p, now);
  return json(Object.assign({ parsed: p, ai: !!env.AI }, r));
}

// 24.11: stan bez tokenu — tylko czy powiązanie z modelem Workers AI jest podłączone (bez wywołania modelu).
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  if (u.searchParams.get("status") !== "1") return json({ ok: false, error: "Użyj POST" }, 405);
  return json({ ok: true, ai: !!env.AI, model: env.AI ? MODEL : null });
}
