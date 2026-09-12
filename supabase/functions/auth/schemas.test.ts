import { assert, assertFalse, } from '@std/assert';
import { PasswordResetSchema, } from './schemas.ts';

Deno.test('PasswordResetSchema accepts a valid email', () => {
  assert(PasswordResetSchema.safeParse({ email: 'user@example.com', },).success,);
});

Deno.test('PasswordResetSchema rejects a malformed email', () => {
  assertFalse(PasswordResetSchema.safeParse({ email: 'not-an-email', },).success,);
});

Deno.test('PasswordResetSchema rejects a missing email', () => {
  assertFalse(PasswordResetSchema.safeParse({},).success,);
});

Deno.test('PasswordResetSchema rejects a non-string email', () => {
  assertFalse(PasswordResetSchema.safeParse({ email: 12345, },).success,);
});
