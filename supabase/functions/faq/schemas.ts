import { z, } from 'zod';
import { WEBSITE_LOCALES, } from '../_shared/locales.ts';

// FAQ is the first translated content in this domain -- see the Phase 4
// migration's design notes for why translations are a separate
// per-locale row (content.faq_translations) rather than a jsonb blob
// on content.faq_items.

export const LocaleSchema = z.enum(WEBSITE_LOCALES,);

const TranslationSchema = z.object({
  question: z.string().min(1,).max(300,),
  answer: z.string().min(1,).max(5_000,),
},);

export const CreateFaqItemSchema = z.object({
  category: z.string().min(1,).max(100,).nullable().optional(),
  display_order: z.number().int().optional(),

  translations: z
    .partialRecord(LocaleSchema, TranslationSchema,)
    .refine(
      (translations,) => Object.keys(translations,).length > 0,
      {
        message: 'at least one translation is required',
      },
    ),
},);

export const UpdateFaqItemSchema = z
  .object({
    category: z.string().min(1,).max(100,).nullable().optional(),
    display_order: z.number().int().optional(),
  },)
  .refine(
    (body,) =>
      body.category !== undefined ||
      body.display_order !== undefined,
    {
      message: 'at least one field must be provided',
    },
  );

export const UpsertTranslationSchema = TranslationSchema;

export const UuidSchema = z.string().uuid();
