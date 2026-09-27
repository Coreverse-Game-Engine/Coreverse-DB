// Shared keyset ("cursor") pagination for list endpoints.
//
// Why keyset instead of offset/limit: offset pagination re-numbers
// every page when a row is inserted/deleted ahead of the cursor (a new
// discussion pushes everything else's "page 2" forward by one, so a
// client paging through misses or repeats a row), and OFFSET N still
// has to scan and discard N rows server-side. A keyset cursor pins the
// page to "everything after this specific row", which is what these
// list endpoints actually want. `releases` deliberately keeps its
// existing offset/limit (`?limit=&?offset=`) instead -- it's a
// different domain with its own established contract, out of scope
// here.
//
// The cursor encodes the last row's (created_at, id) from the previous
// page. `created_at` alone isn't a safe cursor: rows created in the
// same transaction (or the same millisecond under load) can tie, and
// without a tiebreaker a client can silently skip or repeat rows
// across that tie. `id` (a uuid) breaks ties deterministically as long
// as the same (created_at, id) ordering is used consistently for both
// the ORDER BY and the cursor comparison -- see buildCursorFilter and
// its ORDER BY note below.

import { errorResponse, } from './http.ts';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type SortOrder = 'asc' | 'desc';

export interface Cursor {
  createdAt: string;
  id: string;
}

export interface PageParams {
  limit: number;
  cursor: Cursor | null;
}

// Base64, not base64url or anything fancier -- this is an opaque token
// as far as clients are concerned (nothing should ever try to read
// createdAt/id back out of it client-side), plain base64 is the least
// ceremony that survives a URL query string when percent-encoded.
export function encodeCursor(createdAt: string, id: string,): string {
  return btoa(`${createdAt}|${id}`,);
}

function decodeCursor(raw: string,): Cursor | null {
  try {
    const decoded = atob(raw,);
    const sep = decoded.indexOf('|',);
    if (sep === -1) return null;
    const createdAt = decoded.slice(0, sep,);
    const id = decoded.slice(sep + 1,);
    if (!createdAt || !id || Number.isNaN(Date.parse(createdAt,),)) return null;
    return { createdAt, id, };
  } catch {
    return null;
  }
}

// Reads `?limit=` and `?cursor=` off the request URL. Returns either
// the parsed params or a ready-to-return 400 Response -- callers should
// check `'error' in result` before touching `.limit`/`.cursor`.
export function parsePagination(
  url: URL,
): PageParams | { error: Response } {
  let limit = DEFAULT_PAGE_SIZE;
  const limitParam = url.searchParams.get('limit',);
  if (limitParam !== null) {
    const n = Number(limitParam,);
    if (!Number.isInteger(n,) || n < 1 || n > MAX_PAGE_SIZE) {
      return {
        error: errorResponse(
          'invalid_query',
          `limit must be an integer between 1 and ${MAX_PAGE_SIZE}.`,
          400,
        ),
      };
    }
    limit = n;
  }

  let cursor: Cursor | null = null;
  const cursorParam = url.searchParams.get('cursor',);
  if (cursorParam !== null) {
    const decoded = decodeCursor(cursorParam,);
    if (!decoded) {
      return { error: errorResponse('invalid_query', 'cursor is malformed.', 400,), };
    }
    cursor = decoded;
  }

  return { limit, cursor, };
}

// Builds the PostgREST `.or()` filter string for "rows after this
// cursor" under a given sort order on (created_at, id). For 'desc'
// (newest first): created_at < cursor.createdAt, OR (created_at =
// cursor.createdAt AND id < cursor.id). 'asc' is the mirror image.
//
// The caller MUST order by created_at then id, in the same direction
// used here -- e.g. `.order('created_at', { ascending: false,
// },).order('id', { ascending: false, },)` alongside
// buildCursorFilter(cursor, 'desc'). A mismatched sort/filter direction
// won't error, it'll just silently return rows out of cursor order.
export function buildCursorFilter(cursor: Cursor, order: SortOrder,): string {
  const op = order === 'desc' ? 'lt' : 'gt';
  const createdAt = cursor.createdAt;
  const id = cursor.id;
  return `created_at.${op}.${createdAt},and(created_at.eq.${createdAt},id.${op}.${id})`;
}

export interface Page<T,> {
  items: T[];
  next_cursor: string | null;
}

// Turns `limit + 1` fetched rows into a page: ask the query for one
// more row than `limit` (see usage below), and if it comes back, that
// row itself is dropped -- its existence is only there to prove a next
// page exists, so `next_cursor` can be built from the *last kept* row
// without an extra COUNT/HEAD request.
export function paginate<T extends { created_at: string; id: string },>(
  rows: T[],
  limit: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit,) : rows;
  const last = items[items.length - 1];
  return {
    items,
    next_cursor: hasMore && last ? encodeCursor(last.created_at, last.id,) : null,
  };
}
