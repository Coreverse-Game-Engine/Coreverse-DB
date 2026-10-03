import { assert, assertFalse, } from '@std/assert';
import { CreateEventSchema, UpdateEventSchema, } from './schemas.ts';

const VALID = {
  title: 'Launch Party',
  slug: 'launch-party',
  description: 'Come celebrate the launch.',
  starts_at: '2026-11-01T18:00:00Z',
};

Deno.test('CreateEventSchema accepts a valid body', () => {
  assert(CreateEventSchema.safeParse(VALID,).success,);
});

Deno.test('CreateEventSchema rejects an uppercase slug', () => {
  assertFalse(CreateEventSchema.safeParse({ ...VALID, slug: 'Launch-Party', },).success,);
});

Deno.test('CreateEventSchema rejects a slug with spaces', () => {
  assertFalse(CreateEventSchema.safeParse({ ...VALID, slug: 'launch party', },).success,);
});

Deno.test('CreateEventSchema rejects a non-datetime starts_at', () => {
  assertFalse(CreateEventSchema.safeParse({ ...VALID, starts_at: 'next Tuesday', },).success,);
});

Deno.test('CreateEventSchema accepts optional location, ends_at, registration_url', () => {
  const result = CreateEventSchema.safeParse({
    ...VALID,
    location: 'Istanbul',
    ends_at: '2026-11-01T21:00:00Z',
    registration_url: 'https://example.com/rsvp',
  },);
  assert(result.success,);
});

Deno.test('CreateEventSchema rejects ends_at before starts_at', () => {
  assertFalse(
    CreateEventSchema.safeParse({
      ...VALID,
      starts_at: '2026-11-01T18:00:00Z',
      ends_at: '2026-11-01T17:00:00Z',
    },).success,
  );
});

Deno.test('CreateEventSchema rejects a non-URL registration_url', () => {
  assertFalse(CreateEventSchema.safeParse({ ...VALID, registration_url: 'not-a-url', },).success,);
});

Deno.test('UpdateEventSchema rejects an empty body', () => {
  assertFalse(UpdateEventSchema.safeParse({},).success,);
});

Deno.test('UpdateEventSchema accepts a status-only update', () => {
  assert(UpdateEventSchema.safeParse({ status: 'published', },).success,);
});

Deno.test('UpdateEventSchema rejects an invalid status', () => {
  assertFalse(UpdateEventSchema.safeParse({ status: 'archived', },).success,);
});

Deno.test('UpdateEventSchema rejects ends_at before starts_at when both are provided', () => {
  assertFalse(
    UpdateEventSchema.safeParse({
      starts_at: '2026-11-01T18:00:00Z',
      ends_at: '2026-11-01T10:00:00Z',
    },).success,
  );
});

Deno.test('UpdateEventSchema accepts ends_at alone (starts_at compared by the DB constraint)', () => {
  assert(UpdateEventSchema.safeParse({ ends_at: '2026-11-01T10:00:00Z', },).success,);
});
