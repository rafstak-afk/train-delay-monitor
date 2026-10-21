// Jedyne zadanie tego Workera: co 5 minut (natywny Cron Trigger Cloudflare,
// dokladniejszy niz harmonogram GitHub Actions, ktory potrafil pomijac
// wiekszosc cykli) wywolac POST /api/push-tick na glownej stronie Pages.
// Cala logika sprawdzania opoznien/wysylki Web Push zostaje tam, bez zmian
// - ten Worker to tylko "budzik".

export default {
  async scheduled(event, env, ctx) {
    const res = await fetch("https://train-delay-monitor1.pages.dev/api/push-tick", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.PUSH_TICK_SECRET}` }
    });
    console.log("push-tick:", res.status, await res.text());
  },

  async fetch(request, env, ctx) {
    return new Response("push-tick-cron: dziala tylko na Cron Trigger, brak publicznego endpointu.", { status: 404 });
  }
};
