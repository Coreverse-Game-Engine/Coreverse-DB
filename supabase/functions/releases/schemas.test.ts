import { assert, assertEquals, assertFalse, } from '@std/assert';
import {
  DeltaQuerySchema,
  LatestQuerySchema,
  ListQuerySchema,
  VersionParamSchema,
} from './schemas.ts';

Deno.test('VersionParamSchema accepts a valid semver', () => {
  assert(VersionParamSchema.safeParse('1.4.2',).success,);
});

Deno.test('VersionParamSchema rejects a missing patch segment', () => {
  assertFalse(VersionParamSchema.safeParse('1.4',).success,);
});

Deno.test('VersionParamSchema rejects an extra segment', () => {
  assertFalse(VersionParamSchema.safeParse('1.4.2.3',).success,);
});

Deno.test('VersionParamSchema rejects non-numeric input', () => {
  assertFalse(VersionParamSchema.safeParse('foo',).success,);
});

Deno.test('ListQuerySchema applies default limit/offset', () => {
  const result = ListQuerySchema.parse({},);
  assertEquals(result.limit, 20,);
  assertEquals(result.offset, 0,);
});

Deno.test('ListQuerySchema rejects a limit above 100', () => {
  assertFalse(ListQuerySchema.safeParse({ limit: '500', },).success,);
});

Deno.test('ListQuerySchema rejects an unknown status value', () => {
  assertFalse(ListQuerySchema.safeParse({ status: 'nightly', },).success,);
});

Deno.test('LatestQuerySchema defaults status to stable', () => {
  const result = LatestQuerySchema.parse({},);
  assertEquals(result.status, 'stable',);
});

Deno.test('DeltaQuerySchema accepts a complete query', () => {
  const result = DeltaQuerySchema.safeParse({
    from: '1.2.0',
    os: 'linux',
    architecture: 'x86_64',
  },);
  assert(result.success,);
});

Deno.test('DeltaQuerySchema requires from, os and architecture', () => {
  assertFalse(DeltaQuerySchema.safeParse({ os: 'linux', architecture: 'x86_64', },).success,);
  assertFalse(DeltaQuerySchema.safeParse({ from: '1.2.0', architecture: 'x86_64', },).success,);
  assertFalse(DeltaQuerySchema.safeParse({ from: '1.2.0', os: 'linux', },).success,);
});

Deno.test('DeltaQuerySchema rejects a malformed from version', () => {
  assertFalse(
    DeltaQuerySchema.safeParse({ from: '1.2', os: 'linux', architecture: 'x86_64', },).success,
  );
});

Deno.test('DeltaQuerySchema rejects an unknown os or architecture', () => {
  assertFalse(
    DeltaQuerySchema.safeParse({ from: '1.2.0', os: 'freebsd', architecture: 'x86_64', },).success,
  );
  assertFalse(
    DeltaQuerySchema.safeParse({ from: '1.2.0', os: 'linux', architecture: 'riscv', },).success,
  );
});
