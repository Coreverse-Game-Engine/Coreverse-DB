import { assert, assertFalse, } from '@std/assert';
import {
  CreateFaqItemSchema,
  LocaleSchema,
  UpdateFaqItemSchema,
  UpsertTranslationSchema,
} from './schemas.ts';

Deno.test('LocaleSchema accepts a supported locale', () => {
  assert(LocaleSchema.safeParse('tr',).success,);
});

Deno.test('LocaleSchema rejects an unsupported locale', () => {
  assertFalse(LocaleSchema.safeParse('xx',).success,);
});

Deno.test('CreateFaqItemSchema accepts a body with one translation', () => {
  const result = CreateFaqItemSchema.safeParse({
    translations: {
      en: {
        question: 'Is it free?',
        answer: 'Yes.',
      },
    },
  },);

  assert(result.success,);
});

Deno.test('CreateFaqItemSchema accepts multiple locales', () => {
  const result = CreateFaqItemSchema.safeParse({
    category: 'billing',
    display_order: 1,
    translations: {
      en: {
        question: 'Is it free?',
        answer: 'Yes.',
      },
      tr: {
        question: 'Ücretsiz mi?',
        answer: 'Evet.',
      },
    },
  },);

  assert(result.success,);
});

Deno.test('CreateFaqItemSchema rejects an empty translations object', () => {
  assertFalse(
    CreateFaqItemSchema.safeParse({
      translations: {},
    },).success,
  );
});

Deno.test('CreateFaqItemSchema rejects an unsupported locale key', () => {
  assertFalse(
    CreateFaqItemSchema.safeParse({
      translations: {
        xx: {
          question: 'Q',
          answer: 'A',
        },
      },
    },).success,
  );
});

Deno.test(
  'CreateFaqItemSchema rejects a translation missing an answer',
  () => {
    assertFalse(
      CreateFaqItemSchema.safeParse({
        translations: {
          en: {
            question: 'Q',
          },
        },
      },).success,
    );
  },
);

Deno.test('UpdateFaqItemSchema rejects an empty body', () => {
  assertFalse(UpdateFaqItemSchema.safeParse({},).success,);
});

Deno.test('UpdateFaqItemSchema accepts a category-only update', () => {
  assert(
    UpdateFaqItemSchema.safeParse({
      category: 'billing',
    },).success,
  );
});

Deno.test('UpdateFaqItemSchema accepts category: null (clearing it)', () => {
  assert(
    UpdateFaqItemSchema.safeParse({
      category: null,
    },).success,
  );
});

Deno.test('UpsertTranslationSchema requires both question and answer', () => {
  assertFalse(
    UpsertTranslationSchema.safeParse({
      question: 'Q',
    },).success,
  );

  assert(
    UpsertTranslationSchema.safeParse({
      question: 'Q',
      answer: 'A',
    },).success,
  );
});
