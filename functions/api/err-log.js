// TODO 112 (26.11): rejestr awarii widzianych przez użytkowników (503 / 1102 / brak odpowiedzi), żeby znać przyczynę
// następnym razem. Zapis do KV tylko przy PIERWSZYM zgłoszeniu danego miejsca w danej godzinie (limit zapisów KV),
// klucz errlog:<dzień> → { "HH|miejsce|kod": "pierwsza godzina:minuta" }. Bez danych osobowych: tylko miejsce i kod.
const PREFIX = "errlog:";
const TTL = 30 * 86400;
const clean = (v, n) => String(v || "").replace(/[^\w:\-./]/g, "").slice(0, n);

function warsaw() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hh: p.hour, mm: p.minute };
}

export async function onRequestPost({ request, env }) {
  if (!env.USER_PROFILES) return new Response(null, { status: 204 });
  let body = {};
  try { body = await request.json(); } catch (e) { return new Response(null, { status: 204 }); }
  const where = clean(body.where, 40), code = clean(body.code, 24);
  if (!where || !code) return new Response(null, { status: 204 });
  const now = warsaw(), key = PREFIX + now.date, k = `${now.hh}|${where}|${code}`;
  try {
    const cur = JSON.parse((await env.USER_PROFILES.get(key)) || "{}") || {};
    if (!(k in cur) && Object.keys(cur).length < 300) {
      cur[k] = `${now.hh}:${now.mm}`;
      await env.USER_PROFILES.put(key, JSON.stringify(cur), { expirationTtl: TTL });
    }
  } catch (e) {}
  return new Response(null, { status: 204 });
}
