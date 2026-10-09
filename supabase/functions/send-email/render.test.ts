import { assertEquals, assertStringIncludes, } from '@std/assert';
import { actionLinkFor, emailContentFor, WEBSITE_CONFIRM_PATH, } from './render.ts';

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

const WEBSITE_ORIGINS = ['https://coreverse.dev', 'http://localhost:3000',];

Deno.test('actionLinkFor points recovery at the Website confirm route when the origin is allowed', () => {
  const link = actionLinkFor('https://xyzcompany.supabase.co', BASE_EMAIL_DATA, WEBSITE_ORIGINS,);
  const url = new URL(link,);

  assertEquals(url.origin + url.pathname, `https://coreverse.dev${WEBSITE_CONFIRM_PATH}`,);
  assertEquals(url.searchParams.get('token_hash',), 'hash-abc',);
  assertEquals(url.searchParams.get('type',), 'recovery',);
  assertEquals(url.searchParams.get('next',), '/en/reset-password',);
  assertEquals(url.searchParams.has('redirect_to',), false,);
});

Deno.test('actionLinkFor builds the signup link with the locale path as next', () => {
  const link = actionLinkFor('https://xyzcompany.supabase.co', {
    ...BASE_EMAIL_DATA,
    email_action_type: 'signup',
    redirect_to: 'http://localhost:3000/tr',
  }, WEBSITE_ORIGINS,);
  const url = new URL(link,);

  assertEquals(url.origin + url.pathname, `http://localhost:3000${WEBSITE_CONFIRM_PATH}`,);
  assertEquals(url.searchParams.get('type',), 'signup',);
  assertEquals(url.searchParams.get('next',), '/tr',);
});

Deno.test('actionLinkFor drops the query string and hash of redirect_to from next', () => {
  const link = actionLinkFor('https://xyzcompany.supabase.co', {
    ...BASE_EMAIL_DATA,
    redirect_to: 'https://coreverse.dev/en/reset-password?x=1#frag',
  }, WEBSITE_ORIGINS,);
  assertEquals(new URL(link,).searchParams.get('next',), '/en/reset-password',);
});

Deno.test('actionLinkFor covers signup, recovery, magiclink and invite', () => {
  for (const type of ['signup', 'recovery', 'magiclink', 'invite',]) {
    const link = actionLinkFor('https://xyzcompany.supabase.co', {
      ...BASE_EMAIL_DATA,
      email_action_type: type,
    }, WEBSITE_ORIGINS,);
    const url = new URL(link,);
    assertEquals(url.pathname, WEBSITE_CONFIRM_PATH,);
    assertEquals(url.searchParams.get('type',), type,);
  }
});

Deno.test('actionLinkFor falls back to the Supabase verify link for an origin that is not allowed', () => {
  const link = actionLinkFor('https://xyzcompany.supabase.co', {
    ...BASE_EMAIL_DATA,
    redirect_to: 'https://evil.example/en/reset-password',
  }, WEBSITE_ORIGINS,);
  const url = new URL(link,);

  assertEquals(url.origin + url.pathname, 'https://xyzcompany.supabase.co/auth/v1/verify',);
  assertEquals(url.searchParams.get('redirect_to',), 'https://evil.example/en/reset-password',);
});

Deno.test('actionLinkFor falls back to the Supabase verify link when redirect_to is not a URL', () => {
  const link = actionLinkFor('https://xyzcompany.supabase.co', {
    ...BASE_EMAIL_DATA,
    redirect_to: '',
  }, WEBSITE_ORIGINS,);
  assertEquals(new URL(link,).pathname, '/auth/v1/verify',);
});

Deno.test('actionLinkFor keeps the Supabase verify link for email_change', () => {
  const link = actionLinkFor('https://xyzcompany.supabase.co', {
    ...BASE_EMAIL_DATA,
    email_action_type: 'email_change',
  }, WEBSITE_ORIGINS,);
  assertEquals(new URL(link,).pathname, '/auth/v1/verify',);
});

Deno.test('actionLinkFor does not match an allowed origin by prefix', () => {
  const link = actionLinkFor('https://xyzcompany.supabase.co', {
    ...BASE_EMAIL_DATA,
    redirect_to: 'https://coreverse.dev.evil.example/en/reset-password',
  }, WEBSITE_ORIGINS,);
  assertEquals(new URL(link,).pathname, '/auth/v1/verify',);
});

// ---------------------------------------------------------------------
// emailContentFor
// ---------------------------------------------------------------------

Deno.test('emailContentFor returns the Turkish recovery copy for locale "tr"', () => {
  const { subject, htmlContent, } = emailContentFor(
    'recovery',
    'tr',
    'https://coreverse.dev/link',
  );
  assertEquals(subject, 'Coreverse Engine parolanızı sıfırlayın',);
  assertStringIncludes(htmlContent, 'Parolayı Sıfırla',);
  assertStringIncludes(htmlContent, 'https://coreverse.dev/link',);
});

Deno.test('emailContentFor returns the English recovery copy for locale "en"', () => {
  const { subject, htmlContent, } = emailContentFor(
    'recovery',
    'en',
    'https://coreverse.dev/link',
  );
  assertEquals(subject, 'Reset your Coreverse Engine password',);
  assertStringIncludes(htmlContent, 'Reset Password',);
});

Deno.test('emailContentFor covers every WEBSITE_LOCALES entry for recovery (no missing translation)', async () => {
  const { WEBSITE_LOCALES, } = await import('../_shared/locales.ts');
  for (const locale of WEBSITE_LOCALES) {
    const { subject, } = emailContentFor('recovery', locale, 'https://coreverse.dev/link',);
    assertEquals(typeof subject, 'string',);
    assertEquals(subject.length > 0, true,);
  }
});

Deno.test('emailContentFor falls back to a generic English message for an uncovered action_type', () => {
  // email_change is deliberately left uncovered -- see render.ts's
  // ACTION_COPY module comment.
  const { subject, htmlContent, } = emailContentFor(
    'email_change',
    'tr',
    'https://coreverse.dev/link',
  );
  assertEquals(subject, 'Coreverse Engine',);
  assertStringIncludes(htmlContent, 'email_change',);
  assertStringIncludes(htmlContent, 'https://coreverse.dev/link',);
});

Deno.test('emailContentFor returns Turkish copy for a localized non-recovery action (signup)', () => {
  const { subject, htmlContent, } = emailContentFor(
    'signup',
    'tr',
    'https://coreverse.dev/confirm',
  );
  assertEquals(subject, 'Coreverse Engine hesabınızı doğrulayın',);
  assertStringIncludes(htmlContent, 'E-postayı Doğrula',);
});

Deno.test('emailContentFor falls back to English for a localized action in an un-mirrored locale', () => {
  // ACTION_COPY only has en+tr written out (unlike RESET_EMAIL_COPY,
  // which mirrors every WEBSITE_LOCALES entry) -- 'fr' must fall back
  // to the en copy rather than throwing or rendering "undefined".
  const { subject, } = emailContentFor('magiclink', 'fr', 'https://coreverse.dev/link',);
  assertEquals(subject, 'Your Coreverse Engine sign-in link',);
});

Deno.test('emailContentFor renders the OTP for reauthentication instead of a link', () => {
  const { htmlContent, } = emailContentFor(
    'reauthentication',
    'en',
    'https://coreverse.dev/link',
    '123456',
  );
  assertStringIncludes(htmlContent, '123456',);
});

Deno.test('emailContentFor HTML-escapes an untrusted action_type in the fallback message', () => {
  const { htmlContent, } = emailContentFor(
    '<script>alert(1)</script>',
    'en',
    'https://coreverse.dev/link',
  );
  assertEquals(htmlContent.includes('<script>',), false,);
  assertStringIncludes(htmlContent, '&lt;script&gt;',);
});
