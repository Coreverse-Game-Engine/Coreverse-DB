// Resolves a batch of identity.profiles rows (author embeds) for
// content-domain list/detail responses.
//
// Why a separate query instead of a PostgREST embed (the usual
// `.select('*, author:profiles(...)')` shorthand): these edge functions
// query `.schema('content',)`, and the FK from e.g.
// discussions.author_id points into `identity.profiles` -- a different
// exposed schema. PostgREST embedding across the two would need both
// schemas configured together for the same request, which isn't how
// these functions are set up (each calls .schema('content') or
// .schema('identity') for one request, not both). A second, explicit
// query is the boring, unambiguous option and doesn't depend on
// PostgREST's cross-schema relationship detection actually working the
// way you'd expect it to.

import type { createUserClient, } from './supabase-client.ts';
import { publicUrlWithCacheBust, } from './storage.ts';

export interface AuthorSummary {
  id: string;
  username: string;
  avatar_url: string | null;
}

// Fetches { id, username, avatar_url } for every id in authorIds, as a
// Map for O(1) lookup while attaching to each row. Missing/unreadable
// profiles (shouldn't happen given the FK, but defensively) are just
// absent from the map -- callers should treat a missing entry as
// "unknown author" rather than throwing.
export async function fetchAuthors(
  supabase: ReturnType<typeof createUserClient>,
  authorIds: string[],
): Promise<Map<string, AuthorSummary>> {
  const uniqueIds = [...new Set(authorIds,),];
  const map = new Map<string, AuthorSummary>();
  if (uniqueIds.length === 0) return map;

  const { data, error, } = await supabase
    .schema('identity',)
    .from('profiles',)
    .select('id, username, avatar_path, updated_at',)
    .in('id', uniqueIds,);

  // A failure here shouldn't fail the whole list request -- the
  // caller's primary content already loaded successfully. Authors just
  // come back missing (falling through to "unknown author" below) and
  // the row itself still renders.
  if (error || !data) return map;

  for (const row of data) {
    map.set(row.id, {
      id: row.id,
      username: row.username,
      avatar_url: publicUrlWithCacheBust(
        supabase.storage,
        'avatars',
        row.avatar_path,
        row.updated_at,
      ),
    },);
  }
  return map;
}

// The shape to fall back to when a row's author_id has no entry in the
// map (deleted profile, or the lookup above failed) -- keeps `author`
// present with a consistent shape rather than making every consumer
// null-check it.
export function unknownAuthor(authorId: string,): AuthorSummary {
  return { id: authorId, username: '[unknown]', avatar_url: null, };
}
