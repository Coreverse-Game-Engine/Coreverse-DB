import { z, } from 'zod';

// cover_image_path is a plain string field here, not something needing
// an upload-and-validate route like avatars (see profiles/schemas.ts
// for why avatar_path specifically was NOT safe as a plain field): news
// writes are already gated to moderator/admin via RLS
// (identity.is_platform_moderator()), so this isn't "any authenticated
// user can point at an arbitrary storage object" the way avatar_path
// on PATCH /profiles/me was -- it's "a trusted role can set a path in
// the news-covers bucket for an article they're already allowed to
// edit". The bucket's own RLS (news_covers_moderator_write, see the
// Phase 3 migration) still gates what actually gets uploaded there.

export const CreateNewsSchema = z.object({
  title: z.string().min(1,).max(200,),
  slug: z.string().min(1,).max(200,).regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'expected a lowercase, hyphenated slug',
  ),
  body: z.string().min(1,).max(50_000,),
  summary: z.string().max(500,).nullable().optional(),
  cover_image_path: z.string().min(1,).nullable().optional(),
},);

export const UpdateNewsSchema = z.object({
  title: z.string().min(1,).max(200,).optional(),
  body: z.string().min(1,).max(50_000,).optional(),
  summary: z.string().max(500,).nullable().optional(),
  cover_image_path: z.string().min(1,).nullable().optional(),
  status: z.enum(['draft', 'published',],).optional(),
},).refine(
  (b,) =>
    b.title !== undefined || b.body !== undefined || b.summary !== undefined ||
    b.cover_image_path !== undefined || b.status !== undefined,
  { message: 'at least one field must be provided', },
);

export const UuidSchema = z.string().uuid();
