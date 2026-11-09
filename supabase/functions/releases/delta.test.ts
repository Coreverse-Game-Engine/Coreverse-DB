import { assertEquals, } from '@std/assert';
import { presentDeltaPlan, type StoredDeltaPlan, } from './delta.ts';

const plan: StoredDeltaPlan = {
  from_version: '1.0.0',
  to_version: '1.2.0',
  os: 'linux',
  architecture: 'x86_64',
  recommended: 'delta',
  reason: 'delta',
  full: {
    download_url: 'https://example.com/e.tar.gz',
    sha256: 'a'.repeat(64,),
    size_bytes: 1000,
  },
  to_manifest: {
    storage_path: 'linux-x86_64/1.2.0/manifest.json',
    sha256: 'c'.repeat(64,),
    size_bytes: 20,
  },
  from_manifest: null,
  steps: [
    {
      from_version: '1.0.0',
      to_version: '1.1.0',
      storage_path: 'linux-x86_64/1.0.0__1.1.0/delta.zip',
      sha256: 'b'.repeat(64,),
      size_bytes: 100,
      algorithm: 'bsdiff',
      format_version: 1,
    },
  ],
  delta_bytes: 100,
  max_steps: 5,
  max_ratio: 0.6,
};

const resolve = (path: string,) => `https://cdn.test/engine-deltas/${path}`;

Deno.test('presentDeltaPlan turns storage paths into URLs and drops the path fields', () => {
  const out = presentDeltaPlan(plan, resolve,);
  assertEquals(
    out.to_manifest?.url,
    'https://cdn.test/engine-deltas/linux-x86_64/1.2.0/manifest.json',
  );
  assertEquals(
    out.steps[0].url,
    'https://cdn.test/engine-deltas/linux-x86_64/1.0.0__1.1.0/delta.zip',
  );
  assertEquals('storage_path' in (out.to_manifest as object), false,);
  assertEquals('storage_path' in out.steps[0], false,);
});

Deno.test('presentDeltaPlan keeps a missing manifest as null', () => {
  assertEquals(presentDeltaPlan(plan, resolve,).from_manifest, null,);
});

Deno.test('presentDeltaPlan passes the verification fields through unchanged', () => {
  const out = presentDeltaPlan(plan, resolve,);
  assertEquals(out.steps[0].sha256, 'b'.repeat(64,),);
  assertEquals(out.steps[0].size_bytes, 100,);
  assertEquals(out.full, plan.full,);
  assertEquals(out.delta_bytes, 100,);
});

Deno.test('presentDeltaPlan with a full recommendation has no steps', () => {
  const out = presentDeltaPlan({
    ...plan,
    recommended: 'full',
    reason: 'no_chain',
    steps: [],
    delta_bytes: null,
  }, resolve,);
  assertEquals(out.steps, [],);
  assertEquals(out.delta_bytes, null,);
});
