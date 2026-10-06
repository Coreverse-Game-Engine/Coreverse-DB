import { assertEquals, } from '@std/assert';
import { allowedOrigins, } from './http.ts';

function withOrigins(value: string | undefined, run: () => void,) {
  const previous = Deno.env.get('WEBSITE_ALLOWED_ORIGINS',);
  if (value === undefined) Deno.env.delete('WEBSITE_ALLOWED_ORIGINS',);
  else Deno.env.set('WEBSITE_ALLOWED_ORIGINS', value,);
  try {
    run();
  } finally {
    if (previous === undefined) Deno.env.delete('WEBSITE_ALLOWED_ORIGINS',);
    else Deno.env.set('WEBSITE_ALLOWED_ORIGINS', previous,);
  }
}

Deno.test('allowedOrigins is empty when the secret is not set', () => {
  withOrigins(undefined, () => assertEquals(allowedOrigins(), [],),);
});

Deno.test('allowedOrigins splits on commas and trims whitespace', () => {
  withOrigins(' https://coreverse.dev , http://localhost:3000 ', () => {
    assertEquals(allowedOrigins(), ['https://coreverse.dev', 'http://localhost:3000',],);
  },);
});

Deno.test('allowedOrigins drops a trailing slash so it still matches the Origin header', () => {
  withOrigins('https://coreverse.dev/,https://staging.coreverse.dev', () => {
    assertEquals(allowedOrigins(), ['https://coreverse.dev', 'https://staging.coreverse.dev',],);
  },);
});

Deno.test('allowedOrigins reduces an entry with a path to its origin', () => {
  withOrigins('https://coreverse.dev/en', () => {
    assertEquals(allowedOrigins(), ['https://coreverse.dev',],);
  },);
});

Deno.test('allowedOrigins ignores empty entries and keeps unparseable ones verbatim', () => {
  withOrigins('https://coreverse.dev,,not a url', () => {
    assertEquals(allowedOrigins(), ['https://coreverse.dev', 'not a url',],);
  },);
});
