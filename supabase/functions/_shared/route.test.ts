import { assertEquals, } from '@std/assert';
import { routePath, routeSegments, } from './route.ts';

const at = (pathname: string,) => new URL(`https://example.test${pathname}?locale=tr`,);

Deno.test('routeSegments is empty for the bare function path in both shapes', () => {
  assertEquals(routeSegments(at('/faq',), 'faq',), [],);
  assertEquals(routeSegments(at('/faq/',), 'faq',), [],);
  assertEquals(routeSegments(at('/functions/v1/faq',), 'faq',), [],);
  assertEquals(routeSegments(at('/functions/v1/faq/',), 'faq',), [],);
});

Deno.test('routeSegments returns sub-routes in both shapes', () => {
  assertEquals(routeSegments(at('/discussions/categories',), 'discussions',), ['categories',],);
  assertEquals(
    routeSegments(at('/functions/v1/discussions/categories',), 'discussions',),
    ['categories',],
  );
  assertEquals(
    routeSegments(at('/polls/0b1f6a2e-0000-4000-8000-000000000000/vote',), 'polls',),
    ['0b1f6a2e-0000-4000-8000-000000000000', 'vote',],
  );
  assertEquals(
    routeSegments(at('/functions/v1/faq/abc/translations/tr',), 'faq',),
    ['abc', 'translations', 'tr',],
  );
});

Deno.test('routeSegments does not treat a longer function name as a match', () => {
  assertEquals(routeSegments(at('/faqs',), 'faq',), ['faqs',],);
  assertEquals(routeSegments(at('/functions/v1/faqs/x',), 'faq',), ['faqs', 'x',],);
});

Deno.test('routeSegments does not strip another function name', () => {
  assertEquals(routeSegments(at('/polls',), 'faq',), ['polls',],);
});

Deno.test('routePath returns the remainder as a string in both shapes', () => {
  assertEquals(routePath(at('/profiles/me',), 'profiles',), 'me',);
  assertEquals(routePath(at('/functions/v1/profiles/me',), 'profiles',), 'me',);
  assertEquals(routePath(at('/profiles/me/avatar',), 'profiles',), 'me/avatar',);
  assertEquals(routePath(at('/auth/password-reset',), 'auth',), 'password-reset',);
  assertEquals(routePath(at('/functions/v1/auth/password-reset',), 'auth',), 'password-reset',);
  assertEquals(routePath(at('/docs',), 'docs',), '',);
});
