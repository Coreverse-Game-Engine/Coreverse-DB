// Mirrors the Website's `locales` list (src/i18n/routing.ts) -- kept as
// a literal copy rather than a shared package because that's a
// Next.js app-router concern, not something this SDK should depend on.
// If the Website adds/removes a locale, both auth/schemas.ts's
// redirectTo path check and send-email's locale extraction need this
// list updated too.
export const WEBSITE_LOCALES = [
  'en', 'tr', 'fr', 'de', 'es', 'pt', 'cn', 'ru', 'jp', 'kr', 'pl', 'in', 'sa',
] as const;

export type WebsiteLocale = typeof WEBSITE_LOCALES[number];

export function isWebsiteLocale(value: string,): value is WebsiteLocale {
  return (WEBSITE_LOCALES as readonly string[]).includes(value,);
}

// Best-effort locale extraction from a Website-generated redirect URL's
// path (`/{locale}/reset-password`, `/{locale}/login`, etc. -- every
// Website redirectTo/emailRedirectTo the Website builds has the locale
// as its first segment). Falls back to 'en' for anything that doesn't
// match -- a redirect_to Supabase Auth built from Site URL with no
// locale prefix, or any other unrecognized shape.
export function extractLocale(pathname: string,): WebsiteLocale {
  const [, first,] = pathname.split('/',);
  return isWebsiteLocale(first,) ? first : 'en';
}
