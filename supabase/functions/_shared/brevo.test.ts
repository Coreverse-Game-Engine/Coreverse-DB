import { assertEquals, assertRejects, } from '@std/assert';
import { sendBrevoEmail, } from './brevo.ts';

const message = { to: 'user@example.com', subject: 'Subject', htmlContent: '<p>Hi</p>', };

Deno.test('sendBrevoEmail posts the message with the api key', async () => {
  const original = globalThis.fetch;
  let captured: { url: string; init: RequestInit | undefined } | undefined;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit,) => {
    captured = { url: String(url,), init, };
    return Promise.resolve(new Response('{}', { status: 201, },),);
  }) as typeof fetch;
  try {
    await sendBrevoEmail('key-123', message,);
  } finally {
    globalThis.fetch = original;
  }
  assertEquals(captured?.url, 'https://api.brevo.com/v3/smtp/email',);
  assertEquals((captured?.init?.headers as Record<string, string>)['api-key'], 'key-123',);
  const body = JSON.parse(String(captured?.init?.body,),);
  assertEquals(body.to, [{ email: 'user@example.com', },],);
  assertEquals(body.subject, 'Subject',);
});

Deno.test('sendBrevoEmail throws on a non-2xx response', async () => {
  const original = globalThis.fetch;
  globalThis.fetch =
    (() => Promise.resolve(new Response('nope', { status: 401, },),)) as typeof fetch;
  try {
    await assertRejects(() => sendBrevoEmail('bad', message,), Error, '401',);
  } finally {
    globalThis.fetch = original;
  }
});
