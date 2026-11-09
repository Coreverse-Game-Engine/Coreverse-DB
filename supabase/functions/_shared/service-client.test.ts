import { assertEquals, assertThrows, } from '@std/assert';
import { resolveServiceRoleKey, } from './service-role-key.ts';

const env = (values: Record<string, string>,) => (name: string,) => values[name];

Deno.test('resolveServiceRoleKey uses the key the platform injects', () => {
  assertEquals(
    resolveServiceRoleKey(env({ SUPABASE_SERVICE_ROLE_KEY: 'injected', },),),
    'injected',
  );
});

Deno.test('resolveServiceRoleKey prefers the injected key over the manual secret', () => {
  assertEquals(
    resolveServiceRoleKey(
      env({ SUPABASE_SERVICE_ROLE_KEY: 'injected', SERVICE_ROLE_KEY: 'manual', },),
    ),
    'injected',
  );
});

Deno.test('resolveServiceRoleKey falls back to SERVICE_ROLE_KEY', () => {
  assertEquals(resolveServiceRoleKey(env({ SERVICE_ROLE_KEY: 'manual', },),), 'manual',);
});

Deno.test('resolveServiceRoleKey skips blank values', () => {
  assertEquals(
    resolveServiceRoleKey(
      env({ SUPABASE_SERVICE_ROLE_KEY: '  ', SERVICE_ROLE_KEY: 'manual', },),
    ),
    'manual',
  );
});

Deno.test('resolveServiceRoleKey throws a readable error when no key is set', () => {
  assertThrows(() => resolveServiceRoleKey(env({},),), Error, 'No service role key',);
});
