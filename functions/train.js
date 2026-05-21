export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = new URL('/train.html', url.origin);
  target.search = url.search;

  return Response.redirect(target.toString(), 302);
}
