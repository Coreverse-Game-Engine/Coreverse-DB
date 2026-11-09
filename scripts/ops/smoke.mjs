#!/usr/bin/env node
// Post-deploy smoke test against a running Coreverse DB API (production or
// `supabase start`). Dependency-free (Node >= 22).
//
// ACCESS MODEL (0.5.2): the platform JWT gate is OFF for releases, news,
// events, faq, polls, discussions and docs (signed-out visitors may READ
// public content), and for auth, profiles and send-email. It stays ON for
// teams, requests and projects. Without the gate each public-content function
// answers 401 `unauthorized` itself for a bad token and for any write without
// a user token (_shared/caller.ts withTokenCheck). This script checks:
//   * anonymous reads return data (no token needed),
//   * anonymous writes and bad tokens are rejected by the FUNCTION (a body with
//     a string `error`, which the platform's own 401 does not have),
//   * the gate is still closed for teams / requests / projects,
//   * the two signed-out operations and /profiles/me behave as before.
// Most checks need no credentials. COREVERSE_TEST_TOKEN (any signed-in user's
// access token) only adds the "signed-in caller" checks, which are SKIPPED
// without it.
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
// says it uses COREVERSE_TEST_TOKEN (a signed-out client sends none).
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
  const r = await call('GET', path);
  expect(r.status === 200, `expected 200, got ${brief(r)}`);
  expect(r.json && Array.isArray(r.json.items), 'body has no `items` array');
  expect('next_cursor' in r.json, 'body has no `next_cursor` key');
  return r;
}

// --- signed-out reads: open ------------------------------------------------
// A signed-out client sends NO credentials. Every public-content route must
// answer 200 with data. A 401 whose body has no string `error` comes from the
// platform gateway: that function is still deployed with the gate ON. Redeploy
// it so the verify_jwt = false entry in supabase/config.toml applies.
const PUBLIC_READ_PATHS = [
  '/releases', '/faq?locale=en', '/events?limit=1', '/news?limit=1',
  '/polls?limit=1', '/discussions?limit=1', '/docs/sources',
];
await check('signed-out: public reads answer 200 (no token)', async () => {
  const bad = [];
  for (const path of PUBLIC_READ_PATHS) {
    const r = await call('GET', path);
    if (r.status !== 200) {
      const origin = isErrorBody(r.json) ? 'function' : 'platform gateway';
      bad.push(`${path} -> ${brief(r)} [from ${origin}]`);
    }
  }
  expect(bad.length === 0,
    `signed-out callers cannot read: ${bad.join(' | ')}. A response from the platform gateway means the JWT gate is still on for that function: redeploy it so config.toml applies.`);
});

// --- signed-out writes and bad tokens: rejected by the function ---------------
const UUID = '00000000-0000-4000-8000-000000000000';
const ANON_WRITES = [
  ['POST', '/discussions', {}],
  ['PATCH', `/discussions/${UUID}`, {}],
  ['DELETE', `/discussions/${UUID}`],
  ['POST', `/discussions/${UUID}/replies`, {}],
  ['PATCH', `/discussions/${UUID}/replies/${UUID}`, {}],
  ['POST', `/polls/${UUID}/vote`, {}],
  ['POST', '/polls', {}],
  ['POST', '/news', {}],
  ['PATCH', `/news/${UUID}`, {}],
  ['POST', '/events', {}],
  ['DELETE', `/events/${UUID}`],
  ['POST', '/faq', {}],
  ['PUT', `/faq/${UUID}/translations/en`, {}],
];
await check('signed-out: every write is rejected with 401 `unauthorized` from the function', async () => {
  const bad = [];
  for (const [method, path, body] of ANON_WRITES) {
    const r = await call(method, path, body === undefined ? {} : { body });
    if (r.status !== 401 || r.json?.error !== 'unauthorized') bad.push(`${method} ${path} -> ${brief(r)}`);
  }
  expect(bad.length === 0,
    `expected 401 {error:"unauthorized"} from the function: ${bad.join(' | ')}. This is the response the Website turns into the sign-in screen.`);
});
await check('bad token: a malformed token on a public read -> 401 `unauthorized` from the function', async () => {
  const r = await call('GET', '/faq?locale=en', { headers: { Authorization: 'Bearer not-a-jwt' } });
  expect(r.status === 401, `expected 401, got ${brief(r)}`);
  expect(r.json?.error === 'unauthorized', `401 did not come from the function (${brief(r)})`);
});
await check('docs: POST /docs/reindex without X-Reindex-Token -> 401 from the function (nothing indexed)', async () => {
  const r = await call('POST', '/docs/reindex', { body: {} });
  expect(r.status === 401, `expected 401, got ${brief(r)}${r.status === 500 ? ' (DOCS_REINDEX_TOKEN secret is not set?)' : ''}`);
  expect(r.json?.error === 'unauthorized', `401 did not come from the function (${brief(r)})`);
});

// --- gateway: still closed where every route needs a user -----------------
// teams, requests and projects keep the platform gate ON. If one of these
// answers anything but 401/403, it was deployed with the gate off.
await check('gateway: teams / requests / projects reject signed-out callers', async () => {
  const open = [];
  for (const [method, path] of [
    ['GET', '/projects'],
    ['GET', `/teams/${UUID}/members`],
    ['POST', `/requests/${UUID}/cancel`],
  ]) {
    const r = await call(method, path);
    if (r.status !== 401 && r.status !== 403) open.push(`${method} ${path} -> ${brief(r)}`);
  }
  expect(open.length === 0, `these should be behind the JWT gate: ${open.join(' | ')}`);
});
await check('gateway: a signed-in request passes the gate on a gated function (GET /projects)', needsToken(async () => {
  const r = await call('GET', '/projects', { headers: authed });
  expect(r.status !== 401 && r.status !== 403, `rejected with a valid token: ${brief(r)}`);
}));

// --- signed-out content: shape ---------------------------------------------
let eventsPage;
await check('events: GET /events -> {items,next_cursor}', async () => { eventsPage = await expectEnvelope('/events?limit=2'); });
await check('events: next page via next_cursor', async () => {
  if (!eventsPage || !eventsPage.json.next_cursor) return { skip: 'fewer than 3 published events (no second page to follow)' };
  const r = await call('GET', `/events?limit=2&cursor=${encodeURIComponent(eventsPage.json.next_cursor)}`);
  expect(r.status === 200 && Array.isArray(r.json?.items), `expected 200 + items, got ${brief(r)}`);
  const firstIds = new Set(eventsPage.json.items.map((i) => i.id));
  expect(!r.json.items.some((i) => firstIds.has(i.id)), 'second page repeats items from the first page');
});
await check('events: GET /events/<unknown uuid> -> 404 error body', async () => {
  const r = await call('GET', `/events/${UUID}`);
  expect(r.status === 404, `expected 404, got ${brief(r)}`);
  expect(isErrorBody(r.json), 'error body is not {error, message}');
});
await check('faq: GET /faq?locale=en -> array', async () => {
  const r = await call('GET', '/faq?locale=en');
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 + array, got ${brief(r)}`);
});
await check('faq: GET /faq?locale=tr -> array', async () => {
  const r = await call('GET', '/faq?locale=tr');
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 + array, got ${brief(r)}`);
});
await check('faq: unknown locale -> 400', async () => {
  const r = await call('GET', '/faq?locale=zz');
  expect(r.status === 400, `expected 400, got ${brief(r)}`);
  expect(isErrorBody(r.json), 'error body is not {error, message}');
});
await check('news: paginated envelope', async () => { await expectEnvelope('/news?limit=2'); });
let pollsPage;
await check('polls: paginated envelope', async () => { pollsPage = await expectEnvelope('/polls?limit=2'); });
await check('polls: signed-out list has my_option_id null and results are readable', async () => {
  if (!pollsPage || pollsPage.json.items.length === 0) return { skip: 'no polls to inspect' };
  for (const poll of pollsPage.json.items) {
    expect(poll.my_option_id === null || poll.my_option_id === undefined, `poll ${poll.id} carries my_option_id for a signed-out caller`);
  }
  const r = await call('GET', `/polls/${pollsPage.json.items[0].id}/results`);
  expect(r.status === 200, `expected 200 for results, got ${brief(r)}`);
});
await check('discussions: paginated envelope', async () => { await expectEnvelope('/discussions?limit=2'); });
await check('discussions: sort=active|replies and q search accepted', async () => {
  for (const q of ['sort=active', 'sort=replies', 'q=test']) {
    const r = await call('GET', `/discussions?limit=1&${q}`);
    expect(r.status === 200, `${q}: expected 200, got ${brief(r)}`);
  }
});
await check('discussions: GET /discussions/categories -> [{category,count}]', async () => {
  const r = await call('GET', '/discussions/categories');
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 + array, got ${brief(r)}`);
  if (r.json.length) expect(typeof r.json[0].category === 'string' && typeof r.json[0].count === 'number', 'entries are not {category, count}');
});
await check('pagination: limit above maximum rejected with 400', async () => {
  const r = await call('GET', '/news?limit=1000');
  expect(r.status === 400, `expected 400, got ${brief(r)}`);
  expect(isErrorBody(r.json), 'error body is not {error, message}');
});
await check('docs: GET /docs/sources -> array', async () => {
  const r = await call('GET', '/docs/sources');
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 + array, got ${brief(r)}`);
});
await check('docs: GET /docs/search?q=coreverse -> array', async () => {
  const r = await call('GET', '/docs/search?q=coreverse&limit=1');
  expect(r.status === 200 && Array.isArray(r.json), `expected 200 + array, got ${brief(r)}`);
});
await check('releases: GET /releases signed out -> 200', async () => {
  const r = await call('GET', '/releases');
  expect(r.status === 200, `expected 200, got ${brief(r)}`);
});

// --- signed-in callers ---------------------------------------------------------
await check('signed-in: GET /releases with a valid token -> 200', needsToken(async () => {
  const r = await call('GET', '/releases', { headers: authed });
  expect(r.status === 200, `expected 200 with a valid token, got ${brief(r)}`);
}));
await check('signed-in: GET /polls carries my_option_id (null or an option id)', needsToken(async () => {
  const r = await call('GET', '/polls?limit=2', { headers: authed });
  expect(r.status === 200 && Array.isArray(r.json?.items), `expected 200 + items, got ${brief(r)}`);
  for (const poll of r.json.items) expect('my_option_id' in poll, `poll ${poll.id} has no my_option_id key`);
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
await check('cors: preflight on a gated function (/projects) is not rejected by the gateway', async () => {
  if (!ORIGIN) return { skip: 'COREVERSE_ALLOWED_ORIGIN not set' };
  const r = await call('OPTIONS', '/projects', {
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization, content-type' },
  });
  expect(r.status === 204 || r.status === 200,
    `preflight answered ${brief(r)}: browsers send no Authorization on OPTIONS, so browser calls to gated functions (teams, requests, projects) would fail`);
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
