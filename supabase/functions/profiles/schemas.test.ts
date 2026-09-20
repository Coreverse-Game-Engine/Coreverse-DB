import { assert, assertEquals, assertFalse, } from '@std/assert';
import { AVATAR_MAX_BYTES, UpdateProfileSchema, validateAvatarFile, } from './schemas.ts';

function fakeFile(type: string, size: number,): File {
  // Building an actual `size`-byte Blob for every test case would be
  // wasteful (and pointless above a few KB) -- Object.defineProperty
  // lets us assert on a File-shaped object's `.size` without allocating
  // real bytes.
  const file = new File([], 'avatar', { type, },);
  Object.defineProperty(file, 'size', { value: size, },);
  return file;
}

Deno.test('UpdateProfileSchema accepts full_name only', () => {
  assert(UpdateProfileSchema.safeParse({ full_name: 'Alice', },).success,);
});

Deno.test('UpdateProfileSchema strips avatar_path rather than accepting it', () => {
  // avatar_path must never be settable through this schema -- it's not
  // just ignored as an unknown key, the whole point is that a client
  // can't point their profile at an arbitrary storage object. A
  // request with *only* avatar_path (no full_name/username) should
  // therefore fail the "at least one of" refinement.
  assertFalse(UpdateProfileSchema.safeParse({ avatar_path: 'avatars/x.png', },).success,);
});

Deno.test('UpdateProfileSchema rejects an empty body', () => {
  assertFalse(UpdateProfileSchema.safeParse({},).success,);
});

Deno.test('UpdateProfileSchema rejects an over-length full_name', () => {
  assertFalse(UpdateProfileSchema.safeParse({ full_name: 'x'.repeat(101,), },).success,);
});

Deno.test('UpdateProfileSchema accepts username only', () => {
  assert(UpdateProfileSchema.safeParse({ username: 'alice_99', },).success,);
});

Deno.test('UpdateProfileSchema rejects a too-short username', () => {
  assertFalse(UpdateProfileSchema.safeParse({ username: 'ab', },).success,);
});

Deno.test('UpdateProfileSchema rejects a too-long username', () => {
  assertFalse(UpdateProfileSchema.safeParse({ username: 'x'.repeat(25,), },).success,);
});

Deno.test('UpdateProfileSchema rejects a username with disallowed characters', () => {
  assertFalse(UpdateProfileSchema.safeParse({ username: 'alice.99', },).success,);
  assertFalse(UpdateProfileSchema.safeParse({ username: 'alice 99', },).success,);
  assertFalse(UpdateProfileSchema.safeParse({ username: 'alice-99', },).success,);
});

// ---------------------------------------------------------------------
// validateAvatarFile
// ---------------------------------------------------------------------

Deno.test('validateAvatarFile accepts a PNG under the size limit', () => {
  assertEquals(validateAvatarFile(fakeFile('image/png', 1024,),), null,);
});

Deno.test('validateAvatarFile accepts a WebP under the size limit', () => {
  assertEquals(validateAvatarFile(fakeFile('image/webp', 1024,),), null,);
});

Deno.test('validateAvatarFile rejects a missing file', () => {
  const result = validateAvatarFile(null,);
  assertEquals(result?.code, 'missing_file',);
});

Deno.test('validateAvatarFile rejects an empty file', () => {
  const result = validateAvatarFile(fakeFile('image/png', 0,),);
  assertEquals(result?.code, 'missing_file',);
});

Deno.test('validateAvatarFile rejects an unsupported type', () => {
  const result = validateAvatarFile(fakeFile('image/gif', 1024,),);
  assertEquals(result?.code, 'unsupported_type',);
});

Deno.test('validateAvatarFile rejects a file over the size limit', () => {
  const result = validateAvatarFile(fakeFile('image/webp', AVATAR_MAX_BYTES + 1,),);
  assertEquals(result?.code, 'too_large',);
});

Deno.test('validateAvatarFile accepts a file exactly at the size limit', () => {
  assertEquals(validateAvatarFile(fakeFile('image/png', AVATAR_MAX_BYTES,),), null,);
});
