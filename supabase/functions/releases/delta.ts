// Shapes the jsonb returned by releases.plan_delta into the API response
// (openapi/schemas/DeltaPlan.yaml): Storage paths become public URLs.
//
// Kept separate from index.ts so it can be unit tested without a
// Supabase client or network access.

export const DELTA_BUCKET = 'engine-deltas';

type StoredFile = { storage_path: string; sha256: string; size_bytes: number };

type StoredStep = StoredFile & {
  from_version: string;
  to_version: string;
  algorithm: string;
  format_version: number;
};

// Shape returned by releases.plan_delta (see the migration comment).
export type StoredDeltaPlan = {
  from_version: string;
  to_version: string;
  os: string;
  architecture: string;
  recommended: 'delta' | 'full';
  reason: string;
  full: { download_url: string; sha256: string; size_bytes: number };
  to_manifest: StoredFile | null;
  from_manifest: StoredFile | null;
  steps: StoredStep[];
  delta_bytes: number | null;
  max_steps: number;
  max_ratio: number;
};

function fileWithUrl(file: StoredFile | null, resolveUrl: (path: string,) => string,) {
  if (!file) return null;
  return { url: resolveUrl(file.storage_path,), sha256: file.sha256, size_bytes: file.size_bytes, };
}

export function presentDeltaPlan(plan: StoredDeltaPlan, resolveUrl: (path: string,) => string,) {
  return {
    from_version: plan.from_version,
    to_version: plan.to_version,
    os: plan.os,
    architecture: plan.architecture,
    recommended: plan.recommended,
    reason: plan.reason,
    full: plan.full,
    to_manifest: fileWithUrl(plan.to_manifest, resolveUrl,),
    from_manifest: fileWithUrl(plan.from_manifest, resolveUrl,),
    steps: plan.steps.map((step,) => ({
      from_version: step.from_version,
      to_version: step.to_version,
      url: resolveUrl(step.storage_path,),
      sha256: step.sha256,
      size_bytes: step.size_bytes,
      algorithm: step.algorithm,
      format_version: step.format_version,
    })),
    delta_bytes: plan.delta_bytes,
    max_steps: plan.max_steps,
    max_ratio: plan.max_ratio,
  };
}
