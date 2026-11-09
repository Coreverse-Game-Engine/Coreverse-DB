// Path routing shared by every Edge Function.
//
// Depending on where a request is received, the pathname a function sees is
// either `/functions/v1/<function>/...` (full URL as called by clients, and
// `supabase functions serve`) or `/<function>/...` (the gateway strips the
// `/functions/v1` prefix before the request reaches the function). Routing on
// one fixed shape made every list call read the function name as a resource id
// ("faq" is not a valid UUID). Both shapes must resolve to the same remainder.

const GATEWAY_PREFIX = '/functions/v1';

export function routePath(url: URL, functionName: string,): string {
  const pathname = url.pathname.startsWith(`${GATEWAY_PREFIX}/`,)
    ? url.pathname.slice(GATEWAY_PREFIX.length,)
    : url.pathname;
  const base = `/${functionName}`;

  if (pathname === base) return '';
  if (pathname.startsWith(`${base}/`,)) return pathname.slice(base.length + 1,);
  return pathname.replace(/^\/+/, '',);
}

export function routeSegments(url: URL, functionName: string,): string[] {
  return routePath(url, functionName,).split('/',).filter(Boolean,);
}
