import { assert, assertFalse, } from '@std/assert';
import { CreateNewsSchema, UpdateNewsSchema, } from './schemas.ts';

Deno.test('CreateNewsSchema accepts a valid body', () => {
  assert(CreateNewsSchema.safeParse({ title: 'T', slug: 't-slug', body: 'body', },).success,);
});

Deno.test('CreateNewsSchema rejects an uppercase slug', () => {
  assertFalse(CreateNewsSchema.safeParse({ title: 'T', slug: 'Not-Valid', body: 'b', },).success,);
});

Deno.test('CreateNewsSchema rejects a slug with spaces', () => {
  assertFalse(CreateNewsSchema.safeParse({ title: 'T', slug: 'not valid', body: 'b', },).success,);
});

Deno.test('UpdateNewsSchema rejects an empty body', () => {
  assertFalse(UpdateNewsSchema.safeParse({},).success,);
});

Deno.test('CreateNewsSchema accepts optional summary and cover_image_path', () => {
  const result = CreateNewsSchema.safeParse({
    title: 'T',
    slug: 't-slug',
    body: 'body',
    summary: 'A short summary.',
    cover_image_path: 'covers/t-slug.png',
  },);
  assert(result.success,);
});

Deno.test('UpdateNewsSchema accepts a status-only update', () => {
  assert(UpdateNewsSchema.safeParse({ status: 'published', },).success,);
});

Deno.test('UpdateNewsSchema rejects an invalid status', () => {
  assertFalse(UpdateNewsSchema.safeParse({ status: 'archived', },).success,);
});
