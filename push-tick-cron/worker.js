// „Budzik” serwera (Cloudflare Worker z Cron Trigger) — co minutę:
//  • /api/remind-tick — przypomnienia o wyjściu z domu (lekkie: tylko profile z indeksu przypomnień),
//  • /api/push-tick — co 5 minut, jak dotąd (alarmy opóźnień, obserwowane stacje, strażnik przesiadek).
// Cała logika zostaje w funkcjach Pages; ten Worker tylko je wywołuje.

const ORIGIN = "https://train-delay-monitor1.pages.dev";

async function call(env, path) {
  const res = await fetch(ORIGIN + path, { method: "POST", headers: { Authorization: `Bearer ${env.PUSH_TICK_SECRET}` } });
  console.log(path + ":", res.status, (await res.text()).slice(0, 300));
}

export default {
  async scheduled(event, env, ctx) {
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    const jobs = [call(env, "/api/remind-tick")];
    if (minute % 5 === 0) jobs.push(call(env, "/api/push-tick"));
    ctx.waitUntil(Promise.allSettled(jobs));
  },

  async fetch(request, env, ctx) {
    return new Response("push-tick-cron: dziala tylko na Cron Trigger, brak publicznego endpointu.", { status: 404 });
  }
};
