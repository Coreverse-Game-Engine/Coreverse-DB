// GET    /profiles/me
// PATCH  /profiles/me
// DELETE /profiles/me
// POST   /profiles/me/avatar
// DELETE /profiles/me/avatar
// GET    /profiles/username-availability?username=
//
// GET/PATCH operate on the caller's own row only. GET resolves it via
// supabase.auth.getUser() (reading the forwarded JWT); PATCH goes through
// RLS (profiles_self_update: id = auth.uid()) as a normal PostgREST
// update -- profile writes don't need a SECURITY DEFINER function since
// "can I edit my own row" is a simple RLS predicate, unlike the team
// role/consent logic.
//
// DELETE /profiles/me deletes the account itself (via the Auth admin
// API, after a precondition check -- see the handler below and the
// Phase 5 migration's comment for exactly which FKs now allow this and
// which still block it on purpose), not just the profile row.
//
// POST /profiles/me/avatar is different: the client no longer writes to
// the avatars bucket directly (avatars_self_write/update/delete were
// dropped in 20260912085602_avatar_upload_and_rate_limit.sql). Instead
// this route accepts a multipart upload, validates it server-side, and
// writes to Storage itself with the service role -- the avatars bucket
// now only grants clients public *read* access.

import { serve, } from '@std/http/server';
import { createUserClient, } from '../_shared/supabase-client.ts';
import { createServiceClient, } from '../_shared/service-client.ts';
import { publicUrlWithCacheBust, } from '../_shared/storage.ts';
import { callerIp, hitRateLimit, } from '../_shared/rate-limit.ts';
import {
  errorResponse,
  jsonResponse,
  safeDbErrorMessage,
  statusForPgError,
  withCors,
} from '../_shared/http.ts';
import {
  AVATAR_ALLOWED_TYPES,
  type AvatarAllowedType,
  UpdateProfileSchema,
  UsernameAvailabilityQuerySchema,
  validateAvatarFile,
} from './schemas.ts';

function withAvatarUrl(
  supabase: ReturnType<typeof createUserClient>,
  row: { avatar_path: string | null; updated_at?: string; [key: string]: unknown },
) {
  const { avatar_path, ...rest } = row;
  const avatar_url = publicUrlWithCacheBust(
    supabase.storage,
    'avatars',
    avatar_path,
    rest.updated_at ?? null,
  );
  return { ...rest, avatar_url, };
}

// Extension is derived server-side from the validated content type --
// the client never gets to name the path. Flat `{user_id}.<ext>`,
// same convention as the original client-direct-write design; `upsert:
// true` means re-uploading always overwrites, so there's never an
// orphaned old avatar left behind when someone switches PNG <-> WebP.
function avatarStoragePath(userId: string, type: AvatarAllowedType,): string {
  return `${userId}.${AVATAR_ALLOWED_TYPES[type]}`;
}

// Generous enough for a typing-debounced availability check, tight
// enough that it can't be used to sweep the username space quickly.
const USERNAME_CHECK_LIMIT = { maxHits: 30, windowSeconds: 60, }; // 30 / min, per IP

serve(withCors(async (req,) => {
  const url = new URL(req.url,);
  const path = url.pathname.replace(/^\/functions\/v1\/profiles\/?/, '',);

  if (path !== 'me' && path !== 'me/avatar' && path !== 'username-availability') {
    return errorResponse('not_found', 'Unknown profiles route.', 404,);
  }

  const supabase = createUserClient(req,);

  try {
    // Public route -- handled before the session check below on
    // purpose: a signed-out user picking a username at signup needs
    // this too. The caller's JWT (if any) is still forwarded via
    // `supabase`, which is what lets identity.is_username_available()
    // treat a signed-in caller's *own* username as available.
    if (path === 'username-availability') {
      if (req.method !== 'GET') {
        return errorResponse('method_not_allowed', 'Only GET is supported on this route.', 405,);
      }

      const parsed = UsernameAvailabilityQuerySchema.safeParse({
        username: url.searchParams.get('username',) ?? undefined,
      },);
      if (!parsed.success) return errorResponse('invalid_query', parsed.error.message, 400,);

      const allowed = await hitRateLimit(
        `username-check:ip:${callerIp(req,)}`,
        USERNAME_CHECK_LIMIT,
      );
      if (!allowed) {
        return errorResponse(
          'rate_limited',
          'Too many username checks. Try again shortly.',
          429,
          { 'Retry-After': String(USERNAME_CHECK_LIMIT.windowSeconds,), },
        );
      }

      const { data, error, } = await supabase
        .schema('identity',)
        .rpc('is_username_available', { p_username: parsed.data.username, },);
      if (error) return errorResponse('rpc_error', safeDbErrorMessage(500,), 500,);

      return jsonResponse({ available: data === true, },);
    }

    const { data: userData, error: authError, } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      return errorResponse('unauthorized', 'A valid session is required.', 401,);
    }
    const userId = userData.user.id;

    if (path === 'me/avatar' && req.method === 'DELETE') {
      const serviceClient = createServiceClient();

      const { data: existing, error: existingError, } = await serviceClient
        .schema('identity',)
        .from('profiles',)
        .select('avatar_path',)
        .eq('id', userId,)
        .maybeSingle();
      if (existingError) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!existing) return errorResponse('not_found', 'No profile found for this user.', 404,);
      if (!existing.avatar_path) {
        return errorResponse('not_found', 'This profile has no avatar to remove.', 404,);
      }

      const { data, error, } = await serviceClient
        .schema('identity',)
        .from('profiles',)
        .update({ avatar_path: null, },)
        .eq('id', userId,)
        .select('id, full_name, username, avatar_path, created_at, updated_at',)
        .maybeSingle();
      if (error) {
        const status = statusForPgError(error.code,);
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      if (!data) return errorResponse('not_found', 'No profile found for this user.', 404,);

      // Best-effort cleanup, same as the switch-extension path in the
      // upload handler below -- not worth failing the request over.
      await serviceClient.storage.from('avatars',).remove([existing.avatar_path,],);

      return jsonResponse(withAvatarUrl(supabase, data,),);
    }

    if (path === 'me/avatar') {
      if (req.method !== 'POST') {
        return errorResponse(
          'method_not_allowed',
          'Only POST and DELETE are supported on this route.',
          405,
        );
      }

      const form = await req.formData().catch(() => null);
      const file = form?.get('file',);
      const fileOrNull = file instanceof File ? file : null;

      const validationError = validateAvatarFile(fileOrNull,);
      if (validationError) {
        const status = validationError.code === 'too_large' ? 413 : 400;
        return errorResponse(validationError.code, validationError.message, status,);
      }
      // validateAvatarFile already narrowed this, but re-check the type
      // here too so TypeScript knows fileOrNull.type is AvatarAllowedType.
      const contentType = fileOrNull!.type as AvatarAllowedType;
      const storagePath = avatarStoragePath(userId, contentType,);

      const serviceClient = createServiceClient();

      // Read the existing avatar_path first: if the caller is switching
      // extensions (png -> webp or vice versa) the new upload lands at a
      // different object name, so the old one needs an explicit delete
      // afterwards -- upsert alone only dedupes when the extension is
      // unchanged.
      const { data: existing, error: existingError, } = await serviceClient
        .schema('identity',)
        .from('profiles',)
        .select('avatar_path',)
        .eq('id', userId,)
        .maybeSingle();
      if (existingError) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!existing) return errorResponse('not_found', 'No profile found for this user.', 404,);
      const previousPath = existing.avatar_path;

      const { error: uploadError, } = await serviceClient.storage
        .from('avatars',)
        .upload(storagePath, fileOrNull!, { contentType, upsert: true, },);

      if (uploadError) {
        return errorResponse('storage_error', safeDbErrorMessage(500,), 500,);
      }

      const { data, error, } = await serviceClient
        .schema('identity',)
        .from('profiles',)
        .update({ avatar_path: storagePath, },)
        .eq('id', userId,)
        .select('id, full_name, username, avatar_path, created_at, updated_at',)
        .maybeSingle();

      if (error) {
        const status = statusForPgError(error.code,);
        return errorResponse('query_error', safeDbErrorMessage(status,), status,);
      }
      if (!data) return errorResponse('not_found', 'No profile found for this user.', 404,);

      if (previousPath && previousPath !== storagePath) {
        // Best-effort cleanup -- not worth failing the request over.
        await serviceClient.storage.from('avatars',).remove([previousPath,],);
      }

      return jsonResponse(withAvatarUrl(supabase, data,),);
    }

    if (req.method === 'GET') {
      const { data, error, } = await supabase
        .schema('identity',)
        .from('profiles',)
        .select('id, full_name, username, avatar_path, created_at, updated_at',)
        .eq('id', userId,)
        .maybeSingle();

      if (error) return errorResponse('query_error', safeDbErrorMessage(500,), 500,);
      if (!data) return errorResponse('not_found', 'No profile found for this user.', 404,);

      // Separate query, not a join: platform_roles is its own table
      // (identity.platform_roles) with its own self-only RLS
      // (platform_roles_self_read) -- there's no row for most users
      // (not every profile has a role), so maybeSingle() returning null
      // just means "no elevated role", not an error.
      const { data: roleRow, } = await supabase
        .schema('identity',)
        .from('platform_roles',)
        .select('role',)
        .eq('user_id', userId,)
        .maybeSingle();

      return jsonResponse({
        ...withAvatarUrl(supabase, data,),
        platform_role: roleRow?.role ?? null,
      },);
    }

    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}));
      const parsed = UpdateProfileSchema.safeParse(body,);
      if (!parsed.success) return errorResponse('invalid_body', parsed.error.message, 400,);

      const { data, error, } = await supabase
        .schema('identity',)
        .from('profiles',)
        .update(parsed.data,)
        .eq('id', userId,)
        .select('id, full_name, username, avatar_path, created_at, updated_at',)
        .maybeSingle();

      // statusForPgError maps 23505 (username already taken, via
      // idx_profiles_username_lower) to 409 and 42501 (RLS denial) to
      // 403; anything else -> 400. Not a 500: a rejected update because
      // the value the caller sent is invalid/taken is a client error,
      // not a server one. The 23505 case gets its own `username_taken`
      // code rather than falling into generic `query_error`, so the
      // Website can key a specific message off it without having to
      // sniff `message` text.
      if (error) {
        const status = statusForPgError(error.code,);
        const code = error.code === '23505' ? 'username_taken' : 'query_error';
        return errorResponse(code, safeDbErrorMessage(status,), status,);
      }
      if (!data) return errorResponse('not_found', 'No profile found for this user.', 404,);
      return jsonResponse(withAvatarUrl(supabase, data,),);
    }

    if (req.method === 'DELETE') {
      // Precondition-checked rather than attempting
      // serviceClient.auth.admin.deleteUser() and parsing whatever
      // error it happens to surface: the GoTrue admin API returns an
      // opaque AuthError, not a structured Postgres error code the way
      // a direct PostgREST call does, so there's no reliable way to
      // tell "blocked by content" apart from any other failure after
      // the fact. Querying the still-blocking tables directly (see the
      // Phase 5 migration's comment for which FKs were loosened and
      // which weren't, and why) gives an accurate, itemized reason
      // instead.
      //
      // Every count below reads a row the caller already has RLS
      // access to as themselves (author_id/owner_id/created_by =
      // auth.uid(), or team_members.user_id = auth.uid()), so this
      // runs on the user-scoped client, not the service client.
      const [teams, projects, news, events, faq, discussions, replies,] = await Promise.all([
        supabase.schema('identity',).from('team_members',).select('team_id', {
          count: 'exact',
          head: true,
        },).eq('user_id', userId,).eq('role', 'owner',),
        supabase.schema('identity',).from('projects',).select('id', {
          count: 'exact',
          head: true,
        },)
          .eq('owner_id', userId,),
        supabase.schema('content',).from('news',).select('id', { count: 'exact', head: true, },).eq(
          'author_id',
          userId,
        ),
        supabase.schema('content',).from('events',).select('id', { count: 'exact', head: true, },)
          .eq('author_id', userId,),
        supabase.schema('content',).from('faq_items',).select('id', {
          count: 'exact',
          head: true,
        },)
          .eq('created_by', userId,),
        supabase.schema('content',).from('discussions',).select('id', {
          count: 'exact',
          head: true,
        },)
          .eq('author_id', userId,),
        supabase.schema('content',).from('discussion_replies',).select('id', {
          count: 'exact',
          head: true,
        },).eq('author_id', userId,),
      ],);

      const blockers: Array<{ reason: string; count: number }> = [
        { reason: 'owns_teams', count: teams.count ?? 0, },
        { reason: 'owns_projects', count: projects.count ?? 0, },
        { reason: 'authored_news', count: news.count ?? 0, },
        { reason: 'authored_events', count: events.count ?? 0, },
        { reason: 'created_faq_items', count: faq.count ?? 0, },
        { reason: 'authored_discussions', count: discussions.count ?? 0, },
        { reason: 'authored_discussion_replies', count: replies.count ?? 0, },
      ].filter((b,) => b.count > 0);

      if (blockers.length > 0) {
        return jsonResponse(
          {
            error: 'account_has_content',
            message:
              'This account still owns or authored content that must be transferred or removed first.',
            blockers,
          },
          409,
        );
      }

      const serviceClient = createServiceClient();

      // Best-effort: an avatar left behind after the profile row (and
      // its own avatar_path) is gone is just an orphaned object in a
      // bucket keyed by user id, not a correctness problem, so this
      // doesn't block deletion on storage succeeding.
      await serviceClient.storage.from('avatars',).remove([
        `${userId}.png`,
        `${userId}.webp`,
      ],);

      const { error: deleteError, } = await serviceClient.auth.admin.deleteUser(userId,);
      if (deleteError) {
        return errorResponse('internal_error', safeDbErrorMessage(500,), 500,);
      }

      return new Response(null, { status: 204, },);
    }

    return errorResponse('method_not_allowed', 'Only GET, PATCH and DELETE are supported.', 405,);
  } catch (_err) {
    return errorResponse('internal_error', safeDbErrorMessage(500,), 500,);
  }
},),);
