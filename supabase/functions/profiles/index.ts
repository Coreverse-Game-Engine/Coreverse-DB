// GET   /profiles/me
// PATCH /profiles/me
// POST  /profiles/me/avatar
//
// GET/PATCH operate on the caller's own row only. GET resolves it via
// supabase.auth.getUser() (reading the forwarded JWT); PATCH goes through
// RLS (profiles_self_update: id = auth.uid()) as a normal PostgREST
// update -- profile writes don't need a SECURITY DEFINER function since
// "can I edit my own row" is a simple RLS predicate, unlike the team
// role/consent logic.
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
import { errorResponse, jsonResponse, statusForPgError, withCors, } from '../_shared/http.ts';
import {
  AVATAR_ALLOWED_TYPES,
  type AvatarAllowedType,
  UpdateProfileSchema,
  validateAvatarFile,
} from './schemas.ts';

function withAvatarUrl(
  supabase: ReturnType<typeof createUserClient>,
  row: { avatar_path: string | null; [key: string]: unknown },
) {
  const { avatar_path, ...rest } = row;
  const avatar_url = avatar_path
    ? supabase.storage.from('avatars',).getPublicUrl(avatar_path,).data.publicUrl
    : null;
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

serve(withCors(async (req,) => {
  const url = new URL(req.url,);
  const path = url.pathname.replace(/^\/functions\/v1\/profiles\/?/, '',);

  if (path !== 'me' && path !== 'me/avatar') {
    return errorResponse('not_found', 'Unknown profiles route.', 404,);
  }

  const supabase = createUserClient(req,);

  try {
    const { data: userData, error: authError, } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      return errorResponse('unauthorized', 'A valid session is required.', 401,);
    }
    const userId = userData.user.id;

    if (path === 'me/avatar') {
      if (req.method !== 'POST') {
        return errorResponse('method_not_allowed', 'Only POST is supported on this route.', 405,);
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
      if (existingError) return errorResponse('query_error', existingError.message, 500,);
      if (!existing) return errorResponse('not_found', 'No profile found for this user.', 404,);
      const previousPath = existing.avatar_path;

      const { error: uploadError, } = await serviceClient.storage
        .from('avatars',)
        .upload(storagePath, fileOrNull!, { contentType, upsert: true, },);

      if (uploadError) {
        return errorResponse('storage_error', uploadError.message, 500,);
      }

      const { data, error, } = await serviceClient
        .schema('identity',)
        .from('profiles',)
        .update({ avatar_path: storagePath, },)
        .eq('id', userId,)
        .select('id, full_name, username, avatar_path, created_at, updated_at',)
        .maybeSingle();

      if (error) return errorResponse('query_error', error.message, statusForPgError(error.code,),);
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

      if (error) return errorResponse('query_error', error.message, 500,);
      if (!data) return errorResponse('not_found', 'No profile found for this user.', 404,);
      return jsonResponse(withAvatarUrl(supabase, data,),);
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
      // not a server one.
      if (error) return errorResponse('query_error', error.message, statusForPgError(error.code,),);
      if (!data) return errorResponse('not_found', 'No profile found for this user.', 404,);
      return jsonResponse(withAvatarUrl(supabase, data,),);
    }

    return errorResponse('method_not_allowed', 'Only GET and PATCH are supported.', 405,);
  } catch (err) {
    return errorResponse(
      'internal_error',
      err instanceof Error ? err.message : 'Unexpected error.',
      500,
    );
  }
}),);
