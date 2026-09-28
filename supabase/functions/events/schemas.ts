import { z, } from 'zod';

// Modeled on news/schemas.ts's CreateNewsSchema/UpdateNewsSchema --
// events is the same moderator-write, draft/published domain, just
// with date/location/registration fields instead of a cover image.

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const CreateEventSchema = z.object({
  title: z.string().min(1,).max(200,),
  slug: z.string().min(1,).max(200,).regex(SLUG_REGEX, 'expected a lowercase, hyphenated slug',),
  description: z.string().min(1,).max(20_000,),
  location: z.string().max(300,).nullable().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().nullable().optional(),
  registration_url: z.string().url().max(2000,).nullable().optional(),
},).refine(
  (b,) => !b.ends_at || new Date(b.ends_at,) >= new Date(b.starts_at,),
  { message: 'ends_at must not be before starts_at', path: ['ends_at',], },
);

export const UpdateEventSchema = z.object({
  title: z.string().min(1,).max(200,).optional(),
  description: z.string().min(1,).max(20_000,).optional(),
  location: z.string().max(300,).nullable().optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().nullable().optional(),
  registration_url: z.string().url().max(2000,).nullable().optional(),
  status: z.enum(['draft', 'published',],).optional(),
},).refine(
  (b,) =>
    b.title !== undefined || b.description !== undefined || b.location !== undefined ||
    b.starts_at !== undefined || b.ends_at !== undefined || b.registration_url !== undefined ||
    b.status !== undefined,
  { message: 'at least one field must be provided', },
).refine(
  // Only checkable here when both ends up on the same request; a
  // request that changes only one of the pair relies on the DB's
  // events_ends_at_after_starts_at check constraint instead (it always
  // has both the incoming and existing values available).
  (b,) => !(b.starts_at && b.ends_at) || new Date(b.ends_at,) >= new Date(b.starts_at,),
  { message: 'ends_at must not be before starts_at', path: ['ends_at',], },
);

export const UuidSchema = z.string().uuid();
