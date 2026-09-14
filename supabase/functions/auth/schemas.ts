import { z, } from 'zod';
import { WEBSITE_LOCALES, } from '../_shared/locales.ts';

// Exact path shape a password-reset redirectTo must have -- no query
// string, no hash, no extra segments. Built from the shared
// WEBSITE_LOCALES list (also used by send-email's locale extraction) so
// the two can't drift out of sync with each other.
export const RESET_REDIRECT_PATH_PATTERN = new RegExp(
  `^/(${WEBSITE_LOCALES.join('|',)})/reset-password$`,
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
