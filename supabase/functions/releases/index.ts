// GET /releases              -> paginated list, optional ?status= filter
// GET /releases/latest        -> latest release for a status channel (default: stable)
// GET /releases/{version}     -> exact-version lookup
//
// This function only performs SELECTs (via releases.list_releases /
// get_latest / get_by_version), so it runs with the anon key rather than
// the service role key -- it relies on the same RLS policies a direct
// client would, it just adds request validation and a stable JSON
// response shape (matching openapi/schemas/Release.yaml) on top.

import { serve, } from '@std/http/server';
import { createClient, } from '@supabase/supabase-js';
import { errorResponse, jsonResponse, withCors, } from '../_shared/http.ts';
import { LatestQuerySchema, ListQuerySchema, VersionParamSchema, } from './schemas.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL',)!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY',)!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY,);

serve(withCors(async (req,) => {
  if (req.method !== 'GET') {
    return errorResponse(
      'method_not_allowed',
      'Only GET is supported on this endpoint.',
      405,
    );
  }

  const url = new URL(req.url,);
  const segments = url.pathname
    .replace(/^\/functions\/v1\/releases\/?/, '',)
    .split('/',)
    .filter(Boolean,);

  try {
    // GET /releases/latest
    if (segments.length === 1 && segments[0] === 'latest') {
      const parsed = LatestQuerySchema.safeParse({
        status: url.searchParams.get('status',) ?? undefined,
      },);
      if (!parsed.success) {
        return errorResponse('invalid_query', parsed.error.message, 400,);
      }

      const { data, error, } = await supabase
        .schema('releases',)
        .rpc('get_latest', { p_status: parsed.data.status, },)
        .maybeSingle();

      if (error) return errorResponse('internal_error', error.message, 500,);
      if (!data) {
        return errorResponse(
          'not_found',
          `No release found for status "${parsed.data.status}".`,
          404,
        );
      }
      return jsonResponse(data,);
    }

    // GET /releases/{version}
    if (segments.length === 1) {
      const versionParsed = VersionParamSchema.safeParse(segments[0],);
      if (!versionParsed.success) {
        return errorResponse(
          'invalid_version',
          `"${segments[0]}" is not a valid version (expected MAJOR.MINOR.PATCH).`,
          400,
        );
      }

      const { data, error, } = await supabase
        .schema('releases',)
        .rpc('get_by_version', { p_version: versionParsed.data, },)
        .maybeSingle();

      if (error) return errorResponse('internal_error', error.message, 500,);
      if (!data) {
        return errorResponse(
          'not_found',
          `No release found for version "${versionParsed.data}".`,
          404,
        );
      }
      return jsonResponse(data,);
    }

    // GET /releases
    if (segments.length === 0) {
      const parsed = ListQuerySchema.safeParse({
        status: url.searchParams.get('status',) ?? undefined,
        limit: url.searchParams.get('limit',) ?? undefined,
        offset: url.searchParams.get('offset',) ?? undefined,
      },);
      if (!parsed.success) {
        return errorResponse('invalid_query', parsed.error.message, 400,);
      }

      const { data, error, } = await supabase
        .schema('releases',)
        .rpc('list_releases', {
          p_status: parsed.data.status ?? null,
          p_limit: parsed.data.limit,
          p_offset: parsed.data.offset,
        },);

      if (error) return errorResponse('internal_error', error.message, 500,);
      return jsonResponse(data,);
    }

    return errorResponse('not_found', 'Unknown releases route.', 404,);
  } catch (err) {
    return errorResponse(
      'internal_error',
      err instanceof Error ? err.message : 'Unexpected error.',
      500,
    );
  }
}),);
