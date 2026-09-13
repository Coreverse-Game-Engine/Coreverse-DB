// GET  /docs/sources   -> catalog of documentation sources (public)
// GET  /docs/search     -> full-text search across all indexed pages (public)
// POST /docs/reindex    -> upsert a source's pages + prune stale ones (CI only)
//
// /docs/reindex is the one route in this whole API that is NOT
// user-authenticated. It's called by other repos' CI (coreverse-engine,
// tutorial repos) after their mdBook build, using a shared secret --
// never a distributed Supabase service-role key. Rationale: handing a
// service-role key to N repos means N places it can leak from and N
// places to rotate it; a single-purpose token scoped to exactly this one
// write operation, checked by this function before it ever touches the
// service-role client, is much easier to reason about and revoke.

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { createServiceClient, } from '../_shared/service-client.ts';
import { errorResponse, jsonResponse, withCors, } from '../_shared/http.ts';
import { ReindexBodySchema, SearchQuerySchema, } from './schemas.ts';

const REINDEX_TOKEN = Deno.env.get('DOCS_REINDEX_TOKEN',);

serve(withCors(async (req,) => {
  const url = new URL(req.url,);
  const path = url.pathname.replace(/^\/functions\/v1\/docs\/?/, '',);

  try {
    // GET /docs/sources
    if (path === 'sources' && req.method === 'GET') {
      const supabase = createUserClient(req,);
      const { data, error, } = await supabase
        .schema('docs',)
        .from('sources',)
        .select('id, kind, title, slug, base_url, current_version_ref',)
        .order('title',);

      if (error) return errorResponse('query_error', error.message, 500,);
      return jsonResponse(data,);
    }

    // GET /docs/search
    if (path === 'search' && req.method === 'GET') {
      const parsed = SearchQuerySchema.safeParse({
        q: url.searchParams.get('q',) ?? undefined,
        kind: url.searchParams.get('kind',) ?? undefined,
        limit: url.searchParams.get('limit',) ?? undefined,
      },);
      if (!parsed.success) return errorResponse('invalid_query', parsed.error.message, 400,);

      const supabase = createUserClient(req,);
      const { data, error, } = await supabase.schema('docs',).rpc('search', {
        p_query: parsed.data.q,
        p_source_kind: parsed.data.kind ?? null,
        p_limit: parsed.data.limit,
      },);

      if (error) return errorResponse('rpc_error', error.message, 500,);
      return jsonResponse(data,);
    }

    // POST /docs/reindex
    if (path === 'reindex' && req.method === 'POST') {
      if (!REINDEX_TOKEN) {
        return errorResponse('misconfigured', 'DOCS_REINDEX_TOKEN is not set.', 500,);
      }
      if (req.headers.get('X-Reindex-Token',) !== REINDEX_TOKEN) {
        return errorResponse('unauthorized', 'Missing or incorrect X-Reindex-Token.', 401,);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = ReindexBodySchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const runStartedAt = new Date().toISOString();
      const service = createServiceClient();

      const { data: source, error: sourceError, } = await service
        .schema('docs',)
        .from('sources',)
        .upsert(parsed.data.source, { onConflict: 'slug', },)
        .select('id',)
        .single();

      if (sourceError || !source) {
        return errorResponse('query_error', sourceError?.message ?? 'upsert failed', 500,);
      }

      const pageRows = parsed.data.pages.map((p,) => ({
        source_id: source.id,
        path: p.path,
        title: p.title,
        content_text: p.content_text ?? null,
      }));

      const { error: pagesError, count: upsertedCount, } = await service
        .schema('docs',)
        .from('pages',)
        .upsert(pageRows, { onConflict: 'source_id,path', count: 'exact', },);

      if (pagesError) return errorResponse('query_error', pagesError.message, 500,);

      // Prune pages for this source that weren't touched in this run --
      // they were removed from the book since the last reindex.
      const { error: pruneError, count: prunedCount, } = await service
        .schema('docs',)
        .from('pages',)
        .delete({ count: 'exact', },)
        .eq('source_id', source.id,)
        .lt('updated_at', runStartedAt,);

      if (pruneError) return errorResponse('query_error', pruneError.message, 500,);

      return jsonResponse({
        source_id: source.id,
        upserted: upsertedCount ?? pageRows.length,
        pruned: prunedCount ?? 0,
      },);
    }

    return errorResponse('not_found', 'Unknown docs route.', 404,);
  } catch (err) {
    return errorResponse(
      'internal_error',
      err instanceof Error ? err.message : 'Unexpected error.',
      500,
    );
  }
}),);
