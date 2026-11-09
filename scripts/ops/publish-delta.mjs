#!/usr/bin/env node
// Publishes Engine delta-update files (Coreverse DB 0.6.0): uploads a file
// manifest or a delta package to the public `engine-deltas` Storage bucket and
// records its path, SHA-256 and size in the database. Dependency-free
// (Node >= 22). Meant for the Engine release pipeline (CI) or a maintainer's
// shell; it writes with the SERVICE ROLE key, so run it only where that secret
// is available and never commit the key.
//
// Usage:
//   export SUPABASE_URL=https://<ref>.supabase.co
//   export SUPABASE_SERVICE_ROLE_KEY=<service role key>
//
//   # 1. the file manifest of one installed tree (one per release + platform)
//   node scripts/ops/publish-delta.mjs manifest \
//     --version 1.2.0 --os linux --arch x86_64 --file ./manifest.json
//
//   # 2. a delta package from an older release to a newer one (same platform)
//   node scripts/ops/publish-delta.mjs delta \
//     --from 1.1.0 --to 1.2.0 --os linux --arch x86_64 --file ./delta.zip
//
//   Add --dry-run to validate and print what would happen without any request.
//
// Both commands are idempotent: re-running replaces the object and updates the
// row. The release and its artifact (same os/architecture) must already exist
// in releases.engine_releases / engine_artifacts; the object is uploaded
// BEFORE the row is written, so a row never points to a missing object.
//
// File formats: docs/src/database/domains/releases.md ("Delta update files").

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const BUCKET = 'engine-deltas';
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const SHA_RE = /^[a-f0-9]{64}$/;
const OSES = ['windows', 'linux', 'macos'];
const ARCHS = ['x86_64', 'arm64'];

function die(message) {
  console.error(`publish-delta: ${message}`);
  process.exit(1);
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { dryRun: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--')) {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      opts[arg.slice(2)] = value;
    } else throw new Error(`unexpected argument ${arg}`);
  }
  return { command, opts };
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// A manifest becomes a directory tree on the user's disk, so it is validated
// as strictly as the Launcher will validate it: relative, normalized,
// forward-slash paths only (no traversal), no duplicates, well-formed hashes.
export function validateManifest(manifest, { version, os, arch }) {
  const errors = [];
  if (manifest?.format !== 1) errors.push('format must be 1');
  if (manifest?.version !== version) errors.push(`version must be ${version}`);
  if (manifest?.os !== os) errors.push(`os must be ${os}`);
  if (manifest?.architecture !== arch) errors.push(`architecture must be ${arch}`);
  if (!Array.isArray(manifest?.files) || manifest.files.length === 0) {
    errors.push('files must be a non-empty array');
    return errors;
  }
  const seen = new Set();
  for (const [i, f] of manifest.files.entries()) {
    const where = `files[${i}]`;
    if (typeof f?.path !== 'string' || f.path.length === 0) { errors.push(`${where}.path must be a string`); continue; }
    const segments = f.path.split('/');
    if (f.path.startsWith('/') || f.path.includes('\\') || f.path.includes('\0') ||
      segments.some((s) => s === '' || s === '.' || s === '..')) {
      errors.push(`${where}.path "${f.path}" must be a relative, normalized, forward-slash path without ".." segments`);
    }
    if (seen.has(f.path)) errors.push(`${where}.path "${f.path}" is listed twice`);
    seen.add(f.path);
    const kind = f.kind ?? 'file';
    if (kind === 'file') {
      if (!Number.isInteger(f.size) || f.size < 0) errors.push(`${where}.size must be a non-negative integer`);
      if (typeof f.sha256 !== 'string' || !SHA_RE.test(f.sha256)) errors.push(`${where}.sha256 must be 64 lowercase hex characters`);
      if (f.mode !== undefined && !Number.isInteger(f.mode)) errors.push(`${where}.mode must be an integer`);
    } else if (kind === 'symlink') {
      if (typeof f.target !== 'string' || f.target.length === 0) errors.push(`${where}.target must be a string`);
    } else {
      errors.push(`${where}.kind must be "file" or "symlink"`);
    }
  }
  return errors;
}

export function storagePathForManifest({ version, os, arch }) {
  return `${os}-${arch}/${version}/manifest.json`;
}

export function storagePathForDelta({ from, to, os, arch }) {
  return `${os}-${arch}/${from}__${to}/delta.zip`;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

function api(base, key) {
  const headers = (extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, ...extra });

  async function expectOk(res, what) {
    if (res.ok) return res;
    const body = await res.text().catch(() => '');
    throw new Error(`${what} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }

  return {
    async releaseId(version) {
      const res = await expectOk(
        await fetch(`${base}/rest/v1/engine_releases?version=eq.${version}&select=id`, {
          headers: headers({ 'Accept-Profile': 'releases' }),
        }),
        `looking up release ${version}`,
      );
      const rows = await res.json();
      if (!rows.length) throw new Error(`release ${version} does not exist in releases.engine_releases`);
      return rows[0].id;
    },
    async upload(path, bytes, contentType) {
      await expectOk(
        await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
          method: 'POST',
          headers: headers({ 'Content-Type': contentType, 'x-upsert': 'true' }),
          body: bytes,
        }),
        `uploading ${path}`,
      );
    },
    async setManifest(releaseId, os, arch, row) {
      const res = await expectOk(
        await fetch(
          `${base}/rest/v1/engine_artifacts?release_id=eq.${releaseId}&os=eq.${os}&architecture=eq.${arch}`,
          {
            method: 'PATCH',
            headers: headers({ 'Content-Profile': 'releases', 'Content-Type': 'application/json', Prefer: 'return=representation' }),
            body: JSON.stringify(row),
          },
        ),
        'recording the manifest',
      );
      if ((await res.json()).length !== 1) {
        throw new Error(`no engine_artifacts row for release ${releaseId} ${os}/${arch} -- create the artifact first`);
      }
    },
    async upsertDelta(row) {
      await expectOk(
        await fetch(`${base}/rest/v1/engine_deltas?on_conflict=from_release_id,to_release_id,os,architecture`, {
          method: 'POST',
          headers: headers({ 'Content-Profile': 'releases', 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify(row),
        }),
        'recording the delta',
      );
    },
  };
}

export async function run(argv, env = process.env) {
  const { command, opts } = parseArgs(argv);
  if (command !== 'manifest' && command !== 'delta') {
    throw new Error('first argument must be "manifest" or "delta" (see the header of this script)');
  }
  const { os, arch, file } = opts;
  if (!OSES.includes(os)) throw new Error(`--os must be one of ${OSES.join(', ')}`);
  if (!ARCHS.includes(arch)) throw new Error(`--arch must be one of ${ARCHS.join(', ')}`);
  if (!file) throw new Error('--file is required');
  const bytes = readFileSync(file);
  if (bytes.length === 0) throw new Error(`${file} is empty`);
  const sha256 = sha256Hex(bytes);

  let plan;
  if (command === 'manifest') {
    const { version } = opts;
    if (!VERSION_RE.test(version ?? '')) throw new Error('--version must be MAJOR.MINOR.PATCH');
    let manifest;
    try { manifest = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`${file} is not valid JSON`); }
    const errors = validateManifest(manifest, { version, os, arch });
    if (errors.length) throw new Error(`invalid manifest:\n  - ${errors.join('\n  - ')}`);
    plan = {
      path: storagePathForManifest({ version, os, arch }),
      contentType: 'application/json',
      summary: `manifest for ${version} ${os}/${arch} (${manifest.files.length} files)`,
    };
  } else {
    const { from, to } = opts;
    if (!VERSION_RE.test(from ?? '') || !VERSION_RE.test(to ?? '')) throw new Error('--from and --to must be MAJOR.MINOR.PATCH');
    if (compareVersions(from, to) >= 0) throw new Error('--from must be older than --to');
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error(`${file} is not a ZIP archive`);
    plan = {
      path: storagePathForDelta({ from, to, os, arch }),
      contentType: 'application/zip',
      summary: `delta ${from} -> ${to} ${os}/${arch}`,
    };
  }

  console.log(`${plan.summary}: ${bytes.length} bytes, sha256 ${sha256}`);
  console.log(`  -> ${BUCKET}/${plan.path}`);
  if (opts.dryRun) {
    console.log('dry run: nothing was uploaded or written.');
    return;
  }

  const base = (env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!base || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  const client = api(base, key);

  if (command === 'manifest') {
    const releaseId = await client.releaseId(opts.version);
    await client.upload(plan.path, bytes, plan.contentType);
    await client.setManifest(releaseId, os, arch, {
      manifest_path: plan.path,
      manifest_sha256: sha256,
      manifest_size_bytes: bytes.length,
    });
  } else {
    const [fromId, toId] = await Promise.all([client.releaseId(opts.from), client.releaseId(opts.to)]);
    await client.upload(plan.path, bytes, plan.contentType);
    await client.upsertDelta({
      from_release_id: fromId,
      to_release_id: toId,
      os,
      architecture: arch,
      storage_path: plan.path,
      sha256,
      size_bytes: bytes.length,
      algorithm: 'bsdiff',
      format_version: 1,
    });
  }
  console.log('published.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).catch((err) => die(err.message));
}
