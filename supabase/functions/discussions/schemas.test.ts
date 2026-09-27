import { assert, assertFalse, } from '@std/assert';
import {
  CreateDiscussionSchema,
  CreateReplySchema,
  UpdateDiscussionSchema,
  UpdateReplySchema,
} from './schemas.ts';

Deno.test('CreateDiscussionSchema accepts a minimal valid body', () => {
  assert(CreateDiscussionSchema.safeParse({ title: 'T', body: 'b', },).success,);
});

Deno.test('CreateDiscussionSchema rejects an empty title', () => {
  assertFalse(CreateDiscussionSchema.safeParse({ title: '', body: 'b', },).success,);
});

Deno.test('UpdateDiscussionSchema rejects an empty body', () => {
  assertFalse(UpdateDiscussionSchema.safeParse({},).success,);
});

Deno.test('CreateDiscussionSchema normalizes category casing/whitespace', () => {
  const result = CreateDiscussionSchema.safeParse({
    title: 'T',
    body: 'b',
    category: '  Modding  ',
  },);
  assert(result.success,);
  if (result.success) assert(result.data.category === 'modding',);
});

Deno.test('CreateDiscussionSchema rejects a body over 20,000 chars', () => {
  assertFalse(
    CreateDiscussionSchema.safeParse({ title: 'T', body: 'x'.repeat(20_001,), },).success,
  );
});

Deno.test('CreateReplySchema rejects a body over 5,000 chars', () => {
  assertFalse(CreateReplySchema.safeParse({ body: 'x'.repeat(5_001,), },).success,);
});

Deno.test('UpdateDiscussionSchema accepts is_locked-only update', () => {
  assert(UpdateDiscussionSchema.safeParse({ is_locked: true, },).success,);
});

Deno.test('CreateReplySchema rejects an empty body', () => {
  assertFalse(CreateReplySchema.safeParse({ body: '', },).success,);
});

Deno.test('UpdateReplySchema accepts deleted-only update', () => {
  assert(UpdateReplySchema.safeParse({ deleted: true, },).success,);
});

Deno.test('UpdateReplySchema rejects an empty body', () => {
  assertFalse(UpdateReplySchema.safeParse({},).success,);
});
