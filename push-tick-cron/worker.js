// „Budzik” serwera (Cloudflare Worker z Cron Trigger) — co minutę:
//  • /api/remind-tick — przypomnienia o wyjściu z domu (lekkie: tylko profile z indeksu przypomnień),
//  • /api/push-tick — co 5 minut, jak dotąd (alarmy opóźnień, obserwowane stacje, strażnik przesiadek).
//  • codziennie o 6:00 czasu polskiego — uruchamia aktualizację rozkładów GZM (GitHub Action gzm-data);
//    1. dnia miesiąca o 2:00 — pełne przeliczenie dojść pieszych. Zegar GitHuba spóźniał się o 6–8 h.
//  • kontrola rozkładów GZM o 7:00, 8:30, 10:00, 13:00 i 17:00 — gdy dziś nie ma udanej aktualizacji
//    (np. portal ZTM nie odpowiadał o 6:00) i żadna nie trwa, uruchamia ją ponownie.
// Cała logika zostaje w funkcjach Pages / w Action; ten Worker tylko je wywołuje.

const ORIGIN = "https://train-delay-monitor1.pages.dev";

async function call(env, path) {
  const res = await fetch(ORIGIN + path, { method: "POST", headers: { Authorization: `Bearer ${env.PUSH_TICK_SECRET}` } });
  console.log(path + ":", res.status, (await res.text()).slice(0, 300));
}

const REPO = "rafstak-afk/train-delay-monitor";

// Godzina i dzień miesiąca w Warszawie (sam przelicza czas letni/zimowy).
function warsaw(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return { day: +p.day, hour: +p.hour, minute: +p.minute };
}

function warsawDate(ts) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
}
const GH_HEADERS = env => ({ Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "push-tick-cron" });

// Kontrola: czy dziś (czas polski) była udana aktualizacja gzm-data? Jeśli nie i nic nie trwa — ponów.
async function checkGzm(env, ts) {
  if (!env.GITHUB_TOKEN) { console.log("gzm-data kontrola: brak sekretu GITHUB_TOKEN"); return; }
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/gzm-data.yml/runs?per_page=10`, { headers: GH_HEADERS(env) });
  if (!res.ok) { console.log("gzm-data kontrola: GitHub", res.status); return; }
  const today = warsawDate(ts);
  const runs = ((await res.json()).workflow_runs || []).filter(r => warsawDate(r.created_at) === today);
  if (runs.some(r => r.conclusion === "success")) { console.log("gzm-data kontrola: dziś OK"); return; }
  if (runs.some(r => r.status !== "completed")) { console.log("gzm-data kontrola: aktualizacja w toku"); return; }
  console.log("gzm-data kontrola: dziś brak udanej aktualizacji (" + runs.map(r => r.conclusion).join(",") + ") — ponawiam");
  await dispatchGzm(env, false);
}

async function dispatchGzm(env, fullWalk) {
  if (!env.GITHUB_TOKEN) { console.log("gzm-data: brak sekretu GITHUB_TOKEN"); return; }
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/gzm-data.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "push-tick-cron" },
    body: JSON.stringify({ ref: "main", inputs: { full_walk: fullWalk ? "true" : "false" } })
  });
  console.log("gzm-data dispatch" + (fullWalk ? " (full_walk)" : "") + ":", res.status, (await res.text()).slice(0, 200));
}

export default {
  async scheduled(event, env, ctx) {
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    const jobs = [call(env, "/api/remind-tick")];
    if (minute % 5 === 0) jobs.push(call(env, "/api/push-tick"));
    const w = warsaw(event.scheduledTime);
    if (w.hour === 6 && w.minute === 0) jobs.push(dispatchGzm(env, false));
    if (w.day === 1 && w.hour === 2 && w.minute === 0) jobs.push(dispatchGzm(env, true));
    if ((w.hour === 7 && w.minute === 0) || (w.hour === 8 && w.minute === 30) || (w.hour === 10 && w.minute === 0) || (w.hour === 13 && w.minute === 0) || (w.hour === 17 && w.minute === 0)) jobs.push(checkGzm(env, event.scheduledTime));
    ctx.waitUntil(Promise.allSettled(jobs));
  },

  async fetch(request, env, ctx) {
    return new Response("push-tick-cron: dziala tylko na Cron Trigger, brak publicznego endpointu.", { status: 404 });
  }
};
