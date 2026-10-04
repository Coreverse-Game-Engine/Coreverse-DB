#!/usr/bin/env node
// Post-deploy smoke test against a running Coreverse DB API (production or
// `supabase start`). Dependency-free (Node >= 22).
//
// ACCESS MODEL (0.5.1): the platform JWT gate is ON for every function except
// send-email, auth and profiles. A signed-out caller therefore gets 401 from
// the gateway on every public-data route, and may only use the two
// signed-out operations (POST /auth/password-reset, GET
// /profiles/username-availability). This script checks both halves:
//   * the gate is closed where it must be (anonymous requests are rejected), and
//   * it is open where it must be (the two signed-out operations work, and the
//     rest of /profiles still answers 401 from the function itself).
// Reading real data needs a signed-in user, so those checks need
// COREVERSE_TEST_TOKEN and are SKIPPED without it -- a run without a token is
// not a complete verification.
//
// SAFE BY DEFAULT: only read-only GETs, validation failures (400) and
// unauthenticated calls (401). It never sends a request that could create,
// change or delete data, and never sends an email (the password-reset check
// posts an invalid body, which is rejected before any mail is attempted).
// Destructive / email checks are manual -- see
// docs/src/operations/production-verification.md.
//
// Usage:
//   COREVERSE_BASE_URL=https://<ref>.supabase.co/functions/v1 \
//   COREVERSE_ALLOWED_ORIGIN=https://<website-origin> \
//   COREVERSE_TEST_TOKEN=<a real user's session JWT> \
//   node scripts/ops/smoke.mjs
//
// Requests mimic the SDK: no apikey, and Authorization only where a check
// says it uses COREVERSE_TEST_TOKEN.
//
// Exit code: 0 all passed (skips allowed), 1 any failure.

const BASE = (process.env.COREVERSE_BASE_URL ?? '').replace(/\/+$/, '');
const ORIGIN = process.env.COREVERSE_ALLOWED_ORIGIN ?? '';
const TOKEN = process.env.COREVERSE_TEST_TOKEN ?? '';
const TIMEOUT_MS = Number(process.env.COREVERSE_TIMEOUT_MS ?? 15000);

if (!BASE) {
  console.error('COREVERSE_BASE_URL is required (e.g. https://<ref>.supabase.co/functions/v1).');
  process.exit(2);
}

async function call(method, path, { headers = {}, body } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    return { status: res.status, headers: res.headers, json, text };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];
async function check(name, fn) {
  try {
    const out = await fn();
    if (out && out.skip) results.push({ name, status: 'SKIP', note: out.skip });
    else results.push({ name, status: 'PASS', note: (out && out.note) || '' });
  } catch (e) {
    results.push({ name, status: 'FAIL', note: e instanceof Error ? e.message : String(e) });
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
const brief = (r) => `HTTP ${r.status} ${r.text.slice(0, 160).replace(/\s+/g, ' ')}`;
const isErrorBody = (j) => j && typeof j.error === 'string' && typeof j.message === 'string';
const authed = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
const needsToken = (fn) => async () => (TOKEN ? fn() : { skip: 'COREVERSE_TEST_TOKEN not set' });

async function expectEnvelope(path) {
  const r = await call('GET', path, { headers: authed });
  expect(r.status === 200, `expected 200, got ${brief(r)}`);
  expect(r.json && Array.isArray(r.json.items), 'body has no `items` array');
  expect('next_cursor' in r.json, 'body has no `next_cursor` key');
  return r;
}

// --- gateway: closed for signed-out callers ------------------------------
// The SDK sends NO credentials for signed-out callers. With the JWT gate on,
// the platform answers 401 before any of our code runs. If one of these
// returns 200, a function that should be gated was deployed with the gate off
// (check [functions.*] in supabase/config.toml and how it was deployed).
const GATED_PATHS = [
  '/releases', '/faq?locale=en', '/events?limit=1', '/news?limit=1',
  '/polls?limit=1', '/discussions?limit=1', '/docs/sources',
];
await check('gateway: anonymous reads are rejected before the function runs', async () => {
  const open = [];
  for (const path of GATED_PATHS) {
    const r = await call('GET', path);
    if (r.status !== 401 && r.status !== 403) open.push(`${path} -> ${brief(r)}`);
  }
  expect(open.length === 0,
    `signed-out callers can read data (JWT gate is off for these routes): ${open.join(' | ')}`);
});
await check('gateway: a signed-in request passes the gate (GET /releases)', needsToken(async () => {
  const r = await call('GET', '/releases', { headers: authed });
  expect(r.status === 200, `expected 200 with a valid token, got ${brief(r)}`);
}));

// --- reads for signed-in users -----------------------------------------
let eventsPage;
await check('events: GET /events -> {items,next_cursor}', needsToken(async () => { eventsPage = await expectEnvelope('/events?limit=2'); }));
await check('events: next page via next_cursor', needsToken(async () => {
  if (!eventsPage || !eventsPage.json.next_cursor) return { skip: 'fewer than 3 published events (no second page to follow)' };
  const r = await call('GET', `/events?limit=2&cursor=${encodeURIComponent(eventsPage.json.next_cursor)}`, { headers: authed });
  expect(r.status === 200 && Array.isArray(r.json?.items), `expected 200 + items, got ${brief(r)}`);
  const firstIds = new Set(eventsPage.json.items.map((i) => i.id));
  expect(!r.json.items.some((i) => firstIds.has(i.id)), 'second page repeats items from the first page');
}));
await check('events: GET /events/<unknown uuid> -> 404 error body', needsToken(async () => {
  const r = await call('GET', '/events/00000000-0000-4000-8000-000000000000', { headers: authed });
  expect(r.status === 404, `expected 404, got ${brief(r)}`);
  expect(isErrorBody(r.json), 'error body is not {error, message}');
}));
await check('faq: GET /faq?locale=en -> array', needsToken(async () => {
  const r = await call('GET', '/faq?locale=en', { headers: authed });
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 + array, got ${brief(r)}`);
}));
await check('faq: GET /faq?locale=tr -> array', needsToken(async () => {
  const r = await call('GET', '/faq?locale=tr', { headers: authed });
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 + array, got ${brief(r)}`);
}));
await check('faq: unknown locale -> 400', needsToken(async () => {
  const r = await call('GET', '/faq?locale=zz', { headers: authed });
  expect(r.status === 400, `expected 400, got ${brief(r)}`);
  expect(isErrorBody(r.json), 'error body is not {error, message}');
}));
await check('news: paginated envelope', needsToken(async () => { await expectEnvelope('/news?limit=2'); }));
await check('polls: paginated envelope', needsToken(async () => { await expectEnvelope('/polls?limit=2'); }));
await check('discussions: paginated envelope', needsToken(async () => { await expectEnvelope('/discussions?limit=2'); }));
await check('discussions: sort=active|replies and q search accepted', needsToken(async () => {
  for (const q of ['sort=active', 'sort=replies', 'q=test']) {
    const r = await call('GET', `/discussions?limit=1&${q}`, { headers: authed });
    expect(r.status === 200, `${q}: expected 200, got ${brief(r)}`);
  }
}));
await check('discussions: GET /discussions/categories -> [{category,count}]', needsToken(async () => {
  const r = await call('GET', '/discussions/categories', { headers: authed });
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 + array, got ${brief(r)}`);
  if (r.json.length) expect(typeof r.json[0].category === 'string' && typeof r.json[0].count === 'number', 'entries are not {category, count}');
}));
await check('pagination: limit above maximum rejected with 400', needsToken(async () => {
  const r = await call('GET', '/news?limit=1000', { headers: authed });
  expect(r.status === 400, `expected 400, got ${brief(r)}`);
  expect(isErrorBody(r.json), 'error body is not {error, message}');
}));
await check('docs: GET /docs/sources -> array', needsToken(async () => {
  const r = await call('GET', '/docs/sources', { headers: authed });
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 + array, got ${brief(r)}`);
}));

// --- profiles ----------------------------------------------------------
await check('profiles: username-availability (unused name) -> {available:boolean}', async () => {
  const name = 'smoke_' + Math.random().toString(36).slice(2, 10);
  const r = await call('GET', `/profiles/username-availability?username=${name}`);
  expect(r.status !== 401 && r.status !== 403,
    `rejected before the function (${brief(r)}): the JWT gate is on for profiles, so the signup form cannot check usernames`);
  expect(r.status === 200, `expected 200, got ${brief(r)}`);
  expect(typeof r.json?.available === 'boolean', 'body has no boolean `available`');
  expect(r.json.available === true, `random unused name reported as taken (${name})`);
});
await check('profiles: username-availability invalid format -> 400', async () => {
  const r = await call('GET', '/profiles/username-availability?username=a!');
  expect(r.status === 400, `expected 400, got ${brief(r)}`);
});
// profiles is deployed with the gate OFF, so these 401s must come from the
// function itself (body `{error: 'unauthorized', ...}`), not from the gateway
// (whose body has no string `error`). That is what proves /me is protected by
// the in-function check and not by a gate that is no longer there.
await check('profiles: GET /profiles/me without token -> 401 from the function', async () => {
  const r = await call('GET', '/profiles/me');
  expect(r.status === 401, `expected 401, got ${brief(r)}`);
  expect(r.json?.error === 'unauthorized',
    `401 did not come from the function (${brief(r)}); is the JWT gate still on for profiles? -- then username-availability is unreachable signed-out`);
});
await check('profiles: GET /profiles/me with a malformed token -> 401', async () => {
  const r = await call('GET', '/profiles/me', { headers: { Authorization: 'Bearer not-a-jwt' } });
  expect(r.status === 401, `expected 401, got ${brief(r)}`);
});
await check('profiles: DELETE /profiles/me without token -> 401 (nothing deleted)', async () => {
  const r = await call('DELETE', '/profiles/me');
  expect(r.status === 401, `expected 401, got ${brief(r)}`);
});
await check('profiles: POST /profiles/me/avatar without token -> 401', async () => {
  const r = await call('POST', '/profiles/me/avatar');
  expect(r.status === 401, `expected 401, got ${brief(r)}`);
});
await check('profiles: GET /profiles/me with COREVERSE_TEST_TOKEN -> profile incl. platform_role', async () => {
  if (!TOKEN) return { skip: 'COREVERSE_TEST_TOKEN not set' };
  const r = await call('GET', '/profiles/me', { headers: authed });
  expect(r.status === 200, `expected 200, got ${brief(r)}`);
  expect(r.json && 'username' in r.json, 'profile has no `username`');
  expect(r.json && 'platform_role' in r.json, 'profile has no `platform_role` (0.5.0 field)');
});

// --- auth (no mail is ever sent: body is invalid) ------------------------
await check('auth: signed-out POST /auth/password-reset with empty body -> 400 (no email sent)', async () => {
  const r = await call('POST', '/auth/password-reset', { body: {} });
  expect(r.status !== 401 && r.status !== 403,
    `rejected before the function (${brief(r)}): the JWT gate is on for auth, so nobody can recover a password`);
  expect(r.status === 400, `expected 400, got ${brief(r)}`);
  expect(isErrorBody(r.json), 'error body is not {error, message}');
});

// --- CORS --------------------------------------------------------------
await check('cors: preflight from allowed origin is echoed', async () => {
  if (!ORIGIN) return { skip: 'COREVERSE_ALLOWED_ORIGIN not set' };
  const r = await call('OPTIONS', '/events', {
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization, content-type' },
  });
  expect(r.status !== 401 && r.status !== 403,
    `preflight rejected by the JWT gate (${brief(r)}): browsers send no Authorization on OPTIONS, so every browser call to this function would fail`);
  expect(r.status === 204 || r.status === 200, `expected 204/200, got ${brief(r)}`);
  expect(r.headers.get('access-control-allow-origin') === ORIGIN,
    `Access-Control-Allow-Origin is "${r.headers.get('access-control-allow-origin')}", expected "${ORIGIN}" -- check WEBSITE_ALLOWED_ORIGINS`);
});
await check('cors: preflight from foreign origin is NOT allowed', async () => {
  const r = await call('OPTIONS', '/events', {
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
  });
  expect(r.headers.get('access-control-allow-origin') === null, 'foreign origin was allowed');
});

// --- report ---------------------------------------------------------------
const w = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.status.padEnd(4)}  ${r.name.padEnd(w)}${r.note ? '  -- ' + r.note : ''}`);
}
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped  (base: ${BASE})`);
process.exit(count('FAIL') ? 1 : 0);
