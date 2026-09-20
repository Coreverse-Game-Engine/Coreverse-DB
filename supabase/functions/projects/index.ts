// GET    /projects              -> list visible projects (RLS: own + team-shared), optional ?team_id=
// POST   /projects               -> register a project (archive already uploaded to Storage)
// PATCH  /projects/{projectId}   -> update name/description (owner only, via RLS)
// DELETE /projects/{projectId}   -> delete (owner only, via RLS)
//
// No SECURITY DEFINER functions needed here -- "owner can write, owner or
// team member can read" is a plain RLS predicate (projects_owner_write /
// projects_read), so this is a thin pass-through to PostgREST.

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { createServiceClient, } from '../_shared/service-client.ts';
import { errorResponse, jsonResponse, withCors, } from '../_shared/http.ts';
import { CreateProjectSchema, UpdateProjectSchema, UuidSchema, } from './schemas.ts';

const DOWNLOAD_URL_TTL_SECONDS = 300; // 5 minutes

const SELECT_COLUMNS =
  'id, owner_id, team_id, name, description, archive_path, archive_size_bytes, archive_sha256, created_at, updated_at';

serve(withCors(async (req,) => {
  const url = new URL(req.url,);
  const segments = url.pathname
    .replace(/^\/functions\/v1\/projects\/?/, '',)
    .split('/',)
    .filter(Boolean,);

  const supabase = createUserClient(req,);

  try {
    // GET /projects
    if (segments.length === 0 && req.method === 'GET') {
      let query = supabase.schema('identity',).from('projects',).select(SELECT_COLUMNS,);

      const teamIdParam = url.searchParams.get('team_id',);
      if (teamIdParam) {
        const teamIdParsed = UuidSchema.safeParse(teamIdParam,);
        if (!teamIdParsed.success) {
          return errorResponse('invalid_query', `"${teamIdParam}" is not a valid team_id.`, 400,);
        }
        query = query.eq('team_id', teamIdParsed.data,);
      }

      const { data, error, } = await query;
      if (error) return errorResponse('query_error', error.message, 500,);
      return jsonResponse(data,);
    }

    // POST /projects
    if (segments.length === 0 && req.method === 'POST') {
      const { data: userData, error: authError, } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        return errorResponse('unauthorized', 'A valid session is required.', 401,);
      }

      const body = await req.json().catch(() => ({}));
      const parsed = CreateProjectSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { data, error, } = await supabase
        .schema('identity',)
        .from('projects',)
        .insert({ ...parsed.data, owner_id: userData.user.id, },)
        .select(SELECT_COLUMNS,)
        .single();

      if (error) return errorResponse('query_error', error.message, 500,);
      return jsonResponse(data, 201,);
    }

    const hasProjectId = segments.length === 1 ||
      (segments.length === 2 && segments[1] === 'download');
    const projectIdParsed = hasProjectId ? UuidSchema.safeParse(segments[0],) : null;
    if (hasProjectId && (!projectIdParsed || !projectIdParsed.success)) {
      return errorResponse('invalid_project_id', `"${segments[0]}" is not a valid UUID.`, 400,);
    }

    // GET /projects/{projectId}/download -> short-lived signed URL.
    //
    // Access is checked with the user-scoped client first (normal RLS:
    // owner or team member); only once that passes do we switch to the
    // service-role client to mint the signed URL, since project-archives
    // Storage RLS is intentionally owner-only (see the storage buckets
    // migration) and would reject a team member's direct request.
    if (segments.length === 2 && segments[1] === 'download' && req.method === 'GET') {
      const { data: project, error: readError, } = await supabase
        .schema('identity',)
        .from('projects',)
        .select('archive_path',)
        .eq('id', projectIdParsed!.data,)
        .maybeSingle();

      if (readError) return errorResponse('query_error', readError.message, 500,);
      if (!project) {
        return errorResponse('not_found', 'No project with that id, or no access.', 404,);
      }

      const serviceClient = createServiceClient();
      const { data: signed, error: signError, } = await serviceClient.storage
        .from('project-archives',)
        .createSignedUrl(project.archive_path, DOWNLOAD_URL_TTL_SECONDS,);

      if (signError || !signed) {
        return errorResponse('storage_error', signError?.message ?? 'could not sign URL', 500,);
      }

      return jsonResponse({ url: signed.signedUrl, expires_in: DOWNLOAD_URL_TTL_SECONDS, },);
    }

    // PATCH /projects/{projectId}
    if (segments.length === 1 && req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}));
      const parsed = UpdateProjectSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { data, error, } = await supabase
        .schema('identity',)
        .from('projects',)
        .update(parsed.data,)
        .eq('id', projectIdParsed!.data,)
        .select(SELECT_COLUMNS,)
        .maybeSingle();

      if (error) return errorResponse('query_error', error.message, 500,);
      if (!data) {
        return errorResponse('not_found', 'No project with that id (or not the owner).', 404,);
      }
      return jsonResponse(data,);
    }

    // DELETE /projects/{projectId}
    if (segments.length === 1 && req.method === 'DELETE') {
      const { error, count, } = await supabase
        .schema('identity',)
        .from('projects',)
        .delete({ count: 'exact', },)
        .eq('id', projectIdParsed!.data,);

      if (error) return errorResponse('query_error', error.message, 500,);
      if (!count) {
        return errorResponse('not_found', 'No project with that id (or not the owner).', 404,);
      }
      return new Response(null, { status: 204, },);
    }

    return errorResponse('not_found', 'Unknown projects route.', 404,);
  } catch (err) {
    return errorResponse(
      'internal_error',
      err instanceof Error ? err.message : 'Unexpected error.',
      500,
    );
  }
},),);
