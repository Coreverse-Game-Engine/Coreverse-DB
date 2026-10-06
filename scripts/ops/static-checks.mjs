#!/usr/bin/env node
// Dependency-free repo consistency checks (Phase 6A, step 0). Needs only
// Node -- no pnpm install, no network, no Docker -- so it can run before
// anything else and catches drift the heavier tools find much later.
//
// Checks:
//   1. every $ref file in openapi/** exists, and every openapi/{paths,
//      schemas,parameters}/*.yaml file is in orval.config.ts's
//      externalRefsAllow list (and vice versa)
//   2. every top-level openapi path has a matching Edge Function dir
//   3. every openapi tag has a generated-client barrel export in
//      src/index.ts and src/react.ts
//   4. docs/src/SUMMARY.md links point at files that exist, and every
//      docs/src/**/*.md is linked from SUMMARY.md (mdBook silently drops
//      unlinked pages / fails on missing ones)
//   5. package.json version == openapi info.version (same rule as
//      scripts/check-version-sync.mjs, repeated so one command covers it)
//   6. migration filenames are unique, ordered, and well formed
//   7. migration filenames cited in comments/docs exist
//   8. the platform JWT gate is off for exactly the functions that are meant
//      to serve signed-out callers, and those functions still authenticate
//      the routes that need a user themselves (withTokenCheck, getUser())

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const strict = process.argv.includes('--strict');
const failures = [];
const warnings = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);
// Known open items that belong to a later phase (e.g. barrel exports are
// Phase 7). Reported as warnings; --strict (used from Phase 7 on) makes them fatal.
const warn = (check, msg) => (strict ? failures : warnings).push(`[${check}] ${msg}`);

function walk(dir, ext) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel, ext));
    else if (name.endsWith(ext)) out.push(rel);
  }
  return out;
}

// 1 -- $ref targets + orval allow-list --------------------------------
const openapiFiles = walk('openapi', '.yaml');
const refTargets = new Set();
for (const file of openapiFiles) {
  const src = read(file);
  for (const m of src.matchAll(/\$ref:\s*['"]?([^'"\s#]+\.yaml)(#[^'"\s]*)?['"]?/g)) {
    const target = resolve(root, dirname(file), m[1]);
    const rel = relative(join(root, 'openapi'), target).replaceAll('\\', '/');
    refTargets.add('./' + rel);
    if (!existsSync(target)) fail('refs', `${file} references missing file ${m[1]}`);
  }
}
const orval = read('orval.config.ts');
const allowBlock = orval.match(/externalRefsAllow\s*=\s*\[([\s\S]*?)\];/);
if (!allowBlock) {
  fail('orval', 'could not find externalRefsAllow in orval.config.ts');
} else {
  const allowed = new Set([...allowBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  for (const t of refTargets) {
    if (!allowed.has(t)) fail('orval', `${t} is $ref'd but missing from externalRefsAllow`);
  }
  for (const a of allowed) {
    if (!existsSync(join(root, 'openapi', a))) fail('orval', `externalRefsAllow lists missing file ${a}`);
  }
  for (const f of openapiFiles.filter((f) => /^openapi[\\/](paths|schemas|parameters)[\\/]/.test(f))) {
    const rel = './' + relative('openapi', f).replaceAll('\\', '/');
    if (!allowed.has(rel)) fail('orval', `${rel} exists but is not in externalRefsAllow (orval would reject it if ever $ref'd)`);
  }
}

// 2 -- paths <-> edge function dirs ------------------------------------
const spec = read('openapi/openapi.yaml');
const specPaths = [...spec.matchAll(/^  (\/[^\s:]*):\s*$/gm)].map((m) => m[1]);
const fnDirs = new Set(
  readdirSync(join(root, 'supabase/functions')).filter(
    (n) => !n.startsWith('_') && statSync(join(root, 'supabase/functions', n)).isDirectory(),
  ),
);
for (const p of specPaths) {
  const first = p.split('/')[1];
  if (!fnDirs.has(first)) fail('functions', `openapi path ${p} has no supabase/functions/${first}/`);
}
const specTop = new Set(specPaths.map((p) => p.split('/')[1]));
for (const d of fnDirs) {
  if (d === 'send-email') continue; // auth hook target, intentionally not in openapi
  if (!specTop.has(d)) fail('functions', `supabase/functions/${d}/ has no openapi path`);
}

// 3 -- tags <-> barrels --------------------------------------------------
const tagsBlock = spec.match(/^tags:\n([\s\S]*?)^paths:/m);
const tags = tagsBlock ? [...tagsBlock[1].matchAll(/- name:\s*(\S+)/g)].map((m) => m[1]) : [];
const index = read('src/index.ts');
const react = read('src/react.ts');
for (const tag of tags) {
  if (!index.includes(`generated/endpoints/${tag}/${tag}`)) warn('barrel', `src/index.ts does not export endpoints for tag "${tag}"`);
  if (!index.includes(`generated/zod/${tag}/${tag}`)) warn('barrel', `src/index.ts does not export zod schemas for tag "${tag}"`);
  if (!react.includes(`generated/react/${tag}/${tag}`)) warn('barrel', `src/react.ts does not export hooks for tag "${tag}"`);
}

// 4 -- mdBook SUMMARY <-> pages ------------------------------------------
const summary = read('docs/src/SUMMARY.md');
const linked = new Set();
for (const m of summary.matchAll(/\]\(([^)#\s]+\.md)\)/g)) {
  linked.add(m[1]);
  if (!existsSync(join(root, 'docs/src', m[1]))) fail('docs', `SUMMARY.md links missing page ${m[1]}`);
}
for (const f of walk('docs/src', '.md')) {
  const rel = relative('docs/src', f).replaceAll('\\', '/');
  if (rel !== 'SUMMARY.md' && !linked.has(rel)) fail('docs', `docs/src/${rel} exists but is not linked from SUMMARY.md`);
}

// 5 -- version sync --------------------------------------------------------
const pkgVersion = JSON.parse(read('package.json')).version;
const specVersion = spec.match(/^info:[\s\S]*?^\s+version:\s*["']?([^"'\s]+)/m)?.[1];
if (pkgVersion !== specVersion) fail('version', `package.json ${pkgVersion} != openapi info.version ${specVersion}`);

// 6 -- migrations ------------------------------------------------------------
const migs = readdirSync(join(root, 'supabase/migrations')).filter((n) => n.endsWith('.sql'));
const stamps = migs.map((n) => n.split('_')[0]);
for (const n of migs) if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(n)) fail('migrations', `bad migration filename ${n}`);
if (new Set(stamps).size !== stamps.length) fail('migrations', 'duplicate migration timestamps');

// 7 -- stale migration names cited in comments/docs -----------------------
const migNames = new Set(migs);
const scan = [...walk('supabase/maintenance', '.sql'), ...walk('docs/src', '.md'), 'README.md'];
for (const f of scan) {
  for (const m of readFileSync(join(root, f), 'utf8').matchAll(/\b(\d{14}_[a-z0-9_]+\.sql)\b/g)) {
    if (!migNames.has(m[1])) fail('stale-ref', `${f} cites ${m[1]}, which is not in supabase/migrations/`);
  }
}

// 8 -- JWT gate exemptions -------------------------------------------------
// The Supabase gateway rejects any request without a valid JWT unless a
// function opts out here. Every opt-out is a hole in that gate, so the list is
// pinned: adding a function means editing this list on purpose, together with
// docs/src/security/authentication.md.
//
// PUBLIC_CONTENT functions serve signed-out reads; they must wrap their handler
// in withTokenCheck so that, without the gate, an unusable token and any write
// without a user token still answer 401 from the function itself.
const PUBLIC_CONTENT = ['discussions', 'docs', 'events', 'faq', 'news', 'polls', 'releases'];
const EXPECTED_JWT_EXEMPT = ['auth', 'profiles', 'send-email', ...PUBLIC_CONTENT].sort();
const exempt = [];
for (const section of read('supabase/config.toml').split(/^(?=\[)/m)) {
  const head = section.match(/^\[functions\.([a-z0-9_-]+)\]/);
  if (head && /^\s*verify_jwt\s*=\s*false\s*$/m.test(section)) exempt.push(head[1]);
}
exempt.sort();
if (exempt.join(',') !== EXPECTED_JWT_EXEMPT.join(',')) {
  fail('jwt-gate', `config.toml has verify_jwt = false for [${exempt.join(', ')}], expected exactly [${EXPECTED_JWT_EXEMPT.join(', ')}]`);
}
// teams, requests and projects need a signed-in user on every route, so they
// keep the gate on; name them so a silent opt-out is reported precisely.
for (const fn of ['teams', 'requests', 'projects']) {
  if (exempt.includes(fn)) fail('jwt-gate', `${fn} must keep the platform JWT gate on (every route needs a signed-in user)`);
}
// profiles runs without the gate, so /me and /me/avatar rely on this call.
if (!/auth\.getUser\(\)/.test(read('supabase/functions/profiles/index.ts'))) {
  fail('jwt-gate', 'supabase/functions/profiles/index.ts no longer calls auth.getUser(); with the gate off, /profiles/me would be unauthenticated');
}
// auth runs without the gate, so the only route must stay the rate-limited one.
if (!/hitRateLimit\(/.test(read('supabase/functions/auth/index.ts'))) {
  fail('jwt-gate', 'supabase/functions/auth/index.ts no longer rate limits; it is deployed without the JWT gate');
}
// Every public-content function must wrap its handler in withTokenCheck.
for (const fn of PUBLIC_CONTENT) {
  const src = read(`supabase/functions/${fn}/index.ts`);
  if (!/serve\(\s*withCors\(\s*withTokenCheck\(/.test(src)) {
    fail('jwt-gate', `supabase/functions/${fn}/index.ts is not wrapped in serve(withCors(withTokenCheck(...))); it runs without the platform JWT gate, so anonymous writes and bad tokens would reach its routes`);
  }
  const allowsAnonymousWrites = /anonymousWrites:\s*true/.test(src);
  if (fn === 'docs' && !allowsAnonymousWrites) {
    fail('jwt-gate', 'docs must pass { anonymousWrites: true } to withTokenCheck: POST /docs/reindex is authenticated by X-Reindex-Token, not by a user JWT');
  }
  if (fn !== 'docs' && allowsAnonymousWrites) {
    fail('jwt-gate', `${fn} passes { anonymousWrites: true } to withTokenCheck; only docs (shared-secret reindex) may accept anonymous writes`);
  }
}
// The one anonymous write must stay protected by its shared secret.
if (!/X-Reindex-Token/.test(read('supabase/functions/docs/index.ts'))) {
  fail('jwt-gate', 'supabase/functions/docs/index.ts no longer checks X-Reindex-Token; POST /docs/reindex would be unauthenticated');
}

if (warnings.length) {
  console.warn(`static-checks: ${warnings.length} warning(s) (fatal with --strict)\n` + warnings.map((w) => '  - ' + w).join('\n'));
}
if (failures.length) {
  console.error(`static-checks: ${failures.length} problem(s)\n` + failures.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log(`static-checks: OK (${specPaths.length} paths, ${tags.length} tags, ${migs.length} migrations, ${linked.size} doc pages)`);
