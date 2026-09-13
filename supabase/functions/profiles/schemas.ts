import { z, } from 'zod';

// Format mirrors the Website's own signup-time regex
// (src/features/auth/validation.ts createRegisterSchema) exactly, and
// is additionally enforced at the DB level by
// identity.profiles_username_format -- this is the belt to that
// suspenders (a clear 400 with a specific message beats a generic
// query_error surfaced from a check-constraint violation). Uniqueness
// is NOT checked here -- that's the DB unique index
// (idx_profiles_username_lower, case-insensitive); a collision comes
// back from the update call as postgres 23505, which
// profiles/index.ts maps to 409 via statusForPgError.
export const UsernameSchema = z
  .string()
  .min(3,)
  .max(24,)
  .regex(/^[a-zA-Z0-9_]+$/,);

// avatar_path is still accepted here for internal use (the avatar-upload
// route sets it itself after a successful Storage write) -- but as of
// the POST /profiles/me/avatar route, direct client-supplied avatar_path
// values are no longer how avatars get set day-to-day.
export const UpdateProfileSchema = z.object({
  full_name: z.string().min(1,).max(100,).optional(),
  username: UsernameSchema.optional(),
  avatar_path: z.string().min(1,).nullable().optional(),
},).refine(
  (body,) =>
    body.full_name !== undefined || body.username !== undefined || body.avatar_path !== undefined,
  { message: 'at least one of full_name, username or avatar_path must be provided', },
);

// ---------------------------------------------------------------------
// POST /profiles/me/avatar (multipart upload)
//
// Mirrors the avatars bucket's own constraints (see the
// 20260912085602_avatar_upload_and_rate_limit.sql migration) so a bad
// file is rejected with a clear 400 before we ever call Storage.
// ---------------------------------------------------------------------

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const AVATAR_ALLOWED_TYPES = {
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type AvatarAllowedType = keyof typeof AVATAR_ALLOWED_TYPES;

export function isAvatarAllowedType(type: string,): type is AvatarAllowedType {
  return Object.hasOwn(AVATAR_ALLOWED_TYPES, type,);
}

export type AvatarFileValidationError =
  | { code: 'missing_file'; message: string }
  | { code: 'unsupported_type'; message: string }
  | { code: 'too_large'; message: string };

// Validates a File pulled out of a multipart FormData body. Kept as a
// plain function (rather than a zod schema) since zod v4 has no first
// -class File/Blob type and File.size/File.type checks are simple
// enough to express directly.
export function validateAvatarFile(file: File | null,): AvatarFileValidationError | null {
  if (!file || file.size === 0) {
    return { code: 'missing_file', message: 'A non-empty "file" field is required.', };
  }
  if (!isAvatarAllowedType(file.type,)) {
    return {
      code: 'unsupported_type',
      message: `Unsupported file type "${file.type}". Allowed: ${
        Object.keys(AVATAR_ALLOWED_TYPES,).join(', ',)
      }.`,
    };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return {
      code: 'too_large',
      message: `File is ${file.size} bytes; the maximum is ${AVATAR_MAX_BYTES} bytes.`,
    };
  }
  return null;
}
