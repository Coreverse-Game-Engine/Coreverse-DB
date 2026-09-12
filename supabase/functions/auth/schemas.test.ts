import { assert, assertFalse, } from '@std/assert';
import { PasswordResetSchema, RESET_REDIRECT_PATH_PATTERN, } from './schemas.ts';

const VALID_BODY = {
  email: 'user@example.com',
  redirectTo: 'https://coreverse.dev/en/reset-password',
};

Deno.test('PasswordResetSchema accepts a valid email and redirectTo', () => {
  assert(PasswordResetSchema.safeParse(VALID_BODY,).success,);
});

Deno.test('PasswordResetSchema rejects a malformed email', () => {
  assertFalse(PasswordResetSchema.safeParse({ ...VALID_BODY, email: 'not-an-email', },).success,);
});

Deno.test('PasswordResetSchema rejects a missing email', () => {
  const { email: _email, ...rest } = VALID_BODY;
  assertFalse(PasswordResetSchema.safeParse(rest,).success,);
});

Deno.test('PasswordResetSchema rejects a non-string email', () => {
  assertFalse(PasswordResetSchema.safeParse({ ...VALID_BODY, email: 12345, },).success,);
});

Deno.test('PasswordResetSchema rejects a missing redirectTo', () => {
  const { redirectTo: _redirectTo, ...rest } = VALID_BODY;
  assertFalse(PasswordResetSchema.safeParse(rest,).success,);
});

Deno.test('PasswordResetSchema rejects a non-URL redirectTo', () => {
  assertFalse(PasswordResetSchema.safeParse({ ...VALID_BODY, redirectTo: 'not-a-url', },).success,);
});

// RESET_REDIRECT_PATH_PATTERN is what index.ts's validateRedirectTo()
// actually enforces (origin allowlist + this path shape) -- schema-level
// zod only checks "is this a URL", so the interesting cases (wrong
// origin, extra segments, query/hash) are exercised against the pattern
// directly here rather than against the full unauthenticated HTTP route.
Deno.test('RESET_REDIRECT_PATH_PATTERN accepts every known locale', () => {
  assert(RESET_REDIRECT_PATH_PATTERN.test('/en/reset-password',),);
  assert(RESET_REDIRECT_PATH_PATTERN.test('/tr/reset-password',),);
  assert(RESET_REDIRECT_PATH_PATTERN.test('/sa/reset-password',),);
});

Deno.test('RESET_REDIRECT_PATH_PATTERN rejects an unknown locale', () => {
  assertFalse(RESET_REDIRECT_PATH_PATTERN.test('/xx/reset-password',),);
});

Deno.test('RESET_REDIRECT_PATH_PATTERN rejects extra path segments', () => {
  assertFalse(RESET_REDIRECT_PATH_PATTERN.test('/en/reset-password/confirm',),);
  assertFalse(RESET_REDIRECT_PATH_PATTERN.test('/admin/en/reset-password',),);
});

Deno.test('RESET_REDIRECT_PATH_PATTERN rejects the bare root path', () => {
  assertFalse(RESET_REDIRECT_PATH_PATTERN.test('/reset-password',),);
});
