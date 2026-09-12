import { z, } from 'zod';

// Mirrors the Website's `locales` list (src/i18n/routing.ts) -- kept as
// a literal copy rather than a shared package because that's a Next.js
// app-router concern, not something this SDK should depend on. If the
// Website adds/removes a locale, this list needs updating too.
export const RESET_REDIRECT_LOCALES = [
  'en',
  'tr',
  'fr',
  'de',
  'es',
  'pt',
  'cn',
  'ru',
  'jp',
  'kr',
  'pl',
  'in',
  'sa',
] as const;

// Exact path shape a password-reset redirectTo must have -- no query
// string, no hash, no extra segments. Built from RESET_REDIRECT_LOCALES
// so the two can't drift out of sync with each other.
export const RESET_REDIRECT_PATH_PATTERN = new RegExp(
  `^/(${RESET_REDIRECT_LOCALES.join('|',)})/reset-password$`,
);

// redirectTo is required, not optional: there is currently no caller of
// this endpoint that relies on falling back to Supabase Auth's own
// (root) Site URL, and defaulting to that root is exactly the bug this
// field exists to close. index.ts additionally validates the URL's
// origin against WEBSITE_ALLOWED_ORIGINS and its path against
// RESET_REDIRECT_PATH_PATTERN -- zod only checks "is this a URL".
export const PasswordResetSchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url(),
},);
