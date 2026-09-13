import { assertEquals, assertStringIncludes, } from '@std/assert';
import { actionLinkFor, emailContentFor, } from './render.ts';

const BASE_EMAIL_DATA = {
  token: 'otp-123',
  token_hash: 'hash-abc',
  redirect_to: 'https://coreverse.dev/en/reset-password',
  email_action_type: 'recovery',
  site_url: 'https://coreverse.dev',
  token_new: '',
  token_hash_new: '',
};

// ---------------------------------------------------------------------
// actionLinkFor
// ---------------------------------------------------------------------

Deno.test('actionLinkFor builds the auth/v1/verify link with token_hash, type and redirect_to', () => {
  const link = actionLinkFor('https://xyzcompany.supabase.co', BASE_EMAIL_DATA,);
  const url = new URL(link,);

  assertEquals(url.origin + url.pathname, 'https://xyzcompany.supabase.co/auth/v1/verify',);
  // token_hash goes in the `token` query param -- confusing name, but
  // that's Supabase Auth's own /verify contract, not ours.
  assertEquals(url.searchParams.get('token',), 'hash-abc',);
  assertEquals(url.searchParams.get('type',), 'recovery',);
  assertEquals(url.searchParams.get('redirect_to',), 'https://coreverse.dev/en/reset-password',);
});

Deno.test('actionLinkFor carries a non-recovery action_type through untouched', () => {
  const link = actionLinkFor('https://xyzcompany.supabase.co', {
    ...BASE_EMAIL_DATA,
    email_action_type: 'magiclink',
  },);
  assertEquals(new URL(link,).searchParams.get('type',), 'magiclink',);
});

// ---------------------------------------------------------------------
// emailContentFor
// ---------------------------------------------------------------------

Deno.test('emailContentFor returns the Turkish recovery copy for locale "tr"', () => {
  const { subject, htmlContent, } = emailContentFor('recovery', 'tr', 'https://coreverse.dev/link',);
  assertEquals(subject, 'Coreverse Engine parolanızı sıfırlayın',);
  assertStringIncludes(htmlContent, 'Parolayı Sıfırla',);
  assertStringIncludes(htmlContent, 'https://coreverse.dev/link',);
});

Deno.test('emailContentFor returns the English recovery copy for locale "en"', () => {
  const { subject, htmlContent, } = emailContentFor('recovery', 'en', 'https://coreverse.dev/link',);
  assertEquals(subject, 'Reset your Coreverse Engine password',);
  assertStringIncludes(htmlContent, 'Reset Password',);
});

Deno.test('emailContentFor covers every WEBSITE_LOCALES entry for recovery (no missing translation)', async () => {
  const { WEBSITE_LOCALES, } = await import('../_shared/locales.ts',);
  for (const locale of WEBSITE_LOCALES) {
    const { subject, } = emailContentFor('recovery', locale, 'https://coreverse.dev/link',);
    assertEquals(typeof subject, 'string',);
    assertEquals(subject.length > 0, true,);
  }
});

Deno.test('emailContentFor falls back to a generic English message for an uncovered action_type', () => {
  const { subject, htmlContent, } = emailContentFor('signup', 'tr', 'https://coreverse.dev/link',);
  assertEquals(subject, 'Coreverse Engine',);
  assertStringIncludes(htmlContent, 'signup',);
  assertStringIncludes(htmlContent, 'https://coreverse.dev/link',);
});
