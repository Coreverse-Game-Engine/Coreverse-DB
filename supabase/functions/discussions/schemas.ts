import { z, } from 'zod';

// Trim + lowercase, applied at write time (not just display) so
// "Modding", "modding", and " modding " all land in the same category
// row -- otherwise ?category= filtering and the categories aggregate
// (content.discussion_categories()) fragment into near-duplicate
// buckets. Categories are still free text, not a fixed/localized set
// (deliberate -- see the Phase 3 plan notes), this is just consistent
// casing/whitespace, not a controlled vocabulary.
export const normalizeCategory = (value: string,) => value.trim().toLowerCase();

export const CreateDiscussionSchema = z.object({
  title: z.string().min(1,).max(200,),
  body: z.string().min(1,).max(20_000,),
  category: z.string().max(50,).transform(normalizeCategory,).nullable().optional(),
},);

export const UpdateDiscussionSchema = z.object({
  title: z.string().min(1,).max(200,).optional(),
  body: z.string().min(1,).max(20_000,).optional(),
  is_locked: z.boolean().optional(),
},).refine((b,) => b.title !== undefined || b.body !== undefined || b.is_locked !== undefined, {
  message: 'at least one field must be provided',
},);

export const CreateReplySchema = z.object({
  body: z.string().min(1,).max(5_000,),
},);

export const UpdateReplySchema = z.object({
  body: z.string().min(1,).max(5_000,).optional(),
  deleted: z.boolean().optional(),
},).refine((b,) => b.body !== undefined || b.deleted !== undefined, {
  message: 'at least one field must be provided',
},);

export const UuidSchema = z.string().uuid();

export const SORT_VALUES = ['recent', 'active', 'replies',] as const;
export type DiscussionSort = (typeof SORT_VALUES)[number];
