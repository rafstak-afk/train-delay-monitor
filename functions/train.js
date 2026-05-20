export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = new URL('/train.html', url.origin);
  url.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  return Response.redirect(target.toString(), 302);
}
