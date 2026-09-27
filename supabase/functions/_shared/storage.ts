// Resolves a Storage path to a public URL with a cache-busting
// ?v=<version> query param appended. Shared by anything that stores a
// path to a public bucket and re-uploads to the same object name
// (avatars: {user_id}.png; news covers keyed by article) -- without
// this, a re-upload keeps the same public URL, so browsers/CDNs keep
// serving the old image. `version` is typically the row's updated_at.
export function publicUrlWithCacheBust(
  storage: {
    from: (bucket: string,) => { getPublicUrl: (path: string,) => { data: { publicUrl: string } } };
  },
  bucket: string,
  path: string | null,
  version: string | null,
): string | null {
  if (!path) return null;
  const base = storage.from(bucket,).getPublicUrl(path,).data.publicUrl;
  return version ? `${base}?v=${encodeURIComponent(version,)}` : base;
}
