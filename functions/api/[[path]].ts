interface Env {
  PDP_API_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  // Pobieramy ścieżkę po /api/ (np. operations, schedules/route/123 itp.)
  const pathArray = (params.path as string[]) || [];
  const targetPath = pathArray.join('/');

  // Tworzymy pełny URL docelowy do API PKP PLK wraz z parametrami query
  const url = new URL(request.url);
  const targetUrl = new URL(`https://pdp-api.plk-sa.pl/api/v1/${targetPath}${url.search}`);

  // Pobieramy klucz API ze zmiennych środowiskowych Cloudflare
  const apiKey = env.PDP_API_KEY || '';

  const headers = new Headers();
  headers.set('Accept', 'application/json');
  headers.set('X-API-Key', apiKey);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: headers,
    });

    return response;
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Proxy Error', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
