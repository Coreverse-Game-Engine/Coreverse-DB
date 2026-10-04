import { assertEquals, } from '@std/assert';
import { classifyCaller, withTokenCheck, } from './caller.ts';

const NOW = 1_800_000_000;

function jwt(payload: Record<string, unknown>,): string {
  const encode = (value: unknown,) =>
    btoa(JSON.stringify(value,),).replace(/\+/g, '-',).replace(/\//g, '_',).replace(/=+$/, '',);
  return `${encode({ alg: 'HS256', typ: 'JWT', },)}.${encode(payload,)}.signature`;
}

function request(method: string, authorization?: string,): Request {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('Authorization', authorization,);
  return new Request('https://example.test/functions/v1/news', { method, headers, },);
}

Deno.test('no Authorization header is anonymous', () => {
  assertEquals(classifyCaller(request('GET',), NOW,), 'anonymous',);
});

Deno.test('the public anon key is anonymous', () => {
  const token = jwt({ role: 'anon', exp: NOW + 3600, },);
  assertEquals(classifyCaller(request('GET', `Bearer ${token}`,), NOW,), 'anonymous',);
});

Deno.test('a publishable key is anonymous', () => {
  assertEquals(classifyCaller(request('GET', 'Bearer sb_publishable_abc123',), NOW,), 'anonymous',);
});

Deno.test('an unexpired authenticated token is a user', () => {
  const token = jwt({ role: 'authenticated', sub: 'u1', exp: NOW + 60, },);
  assertEquals(classifyCaller(request('GET', `Bearer ${token}`,), NOW,), 'user',);
});

Deno.test('an expired token is invalid', () => {
  const token = jwt({ role: 'authenticated', sub: 'u1', exp: NOW - 1, },);
  assertEquals(classifyCaller(request('GET', `Bearer ${token}`,), NOW,), 'invalid',);
});

Deno.test('malformed credentials are invalid', () => {
  assertEquals(classifyCaller(request('GET', 'Bearer not-a-jwt',), NOW,), 'invalid',);
  assertEquals(classifyCaller(request('GET', 'Basic abc',), NOW,), 'invalid',);
  assertEquals(classifyCaller(request('GET', 'Bearer ',), NOW,), 'invalid',);
  assertEquals(classifyCaller(request('GET', 'Bearer a.b.c',), NOW,), 'invalid',);
});

Deno.test('an unrecognized role is invalid', () => {
  const token = jwt({ role: 'something_else', exp: NOW + 60, },);
  assertEquals(classifyCaller(request('GET', `Bearer ${token}`,), NOW,), 'invalid',);
});

const ok = () => Promise.resolve(new Response('ok', { status: 200, },),);

Deno.test('withTokenCheck lets an anonymous GET through', async () => {
  const res = await withTokenCheck(ok,)(request('GET',),);
  assertEquals(res.status, 200,);
});

Deno.test('withTokenCheck answers 401 unauthorized to an anonymous write', async () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE',]) {
    const res = await withTokenCheck(ok,)(request(method,),);
    assertEquals(res.status, 401, method,);
    assertEquals((await res.json()).error, 'unauthorized', method,);
  }
});

Deno.test('withTokenCheck lets an anonymous write through when the function authenticates it itself', async () => {
  const res = await withTokenCheck(ok, { anonymousWrites: true, },)(request('POST',),);
  assertEquals(res.status, 200,);
});

Deno.test('withTokenCheck answers 401 to a garbage token even on a GET', async () => {
  const res = await withTokenCheck(ok,)(request('GET', 'Bearer garbage',),);
  assertEquals(res.status, 401,);
  assertEquals((await res.json()).error, 'unauthorized',);
});
