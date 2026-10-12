import { assertEquals, } from '@std/assert';
import { loggingFetch, } from './db-log.ts';

async function withStubbedFetch(
  response: Response,
  run: (logged: unknown[][],) => Promise<void>,
) {
  const realFetch = globalThis.fetch;
  const realError = console.error;
  const logged: unknown[][] = [];
  globalThis.fetch = () => Promise.resolve(response,);
  console.error = (...args: unknown[]) => {
    logged.push(args,);
  };
  try {
    await run(logged,);
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
}

Deno.test('loggingFetch logs a failed PostgREST call and returns the response intact', async () => {
  const body = {
    code: 'PGRST205',
    message: 'Could not find the table',
    hint: null,
    details: 'secret',
  };
  await withStubbedFetch(
    new Response(JSON.stringify(body,), { status: 404, },),
    async (logged,) => {
      const response = await loggingFetch('https://x.supabase.co/rest/v1/faq_items?select=id',);
      assertEquals(response.status, 404,);
      assertEquals(await response.json(), body,);
      assertEquals(logged.length, 1,);
      const entry = JSON.parse(String(logged[0][1],),);
      assertEquals(entry.status, 404,);
      assertEquals(entry.code, 'PGRST205',);
      assertEquals(entry.path, 'faq_items',);
      assertEquals('details' in entry, false,);
    },
  );
});

Deno.test('loggingFetch stays quiet on success, 401 and non-REST calls', async () => {
  await withStubbedFetch(new Response('[]', { status: 200, },), async (logged,) => {
    await loggingFetch('https://x.supabase.co/rest/v1/faq_items',);
    assertEquals(logged.length, 0,);
  },);
  await withStubbedFetch(new Response('{}', { status: 401, },), async (logged,) => {
    await loggingFetch('https://x.supabase.co/rest/v1/faq_items',);
    assertEquals(logged.length, 0,);
  },);
  await withStubbedFetch(new Response('{}', { status: 400, },), async (logged,) => {
    await loggingFetch('https://x.supabase.co/auth/v1/user',);
    assertEquals(logged.length, 0,);
  },);
});
