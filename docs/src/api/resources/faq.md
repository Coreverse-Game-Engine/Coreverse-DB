# FAQ

| Method   | Path                              | Auth                       | Does                                                                           |
|----------|-----------------------------------|----------------------------|--------------------------------------------------------------------------------|
| `GET`    | `/faq`                            | Public                     | List FAQ entries flattened to one locale (`?locale=`, optional `?category=`)   |
| `POST`   | `/faq`                            | Required (moderator/admin) | Create an item together with its translations, atomically                      |
| `GET`    | `/faq/{faqId}`                    | Public                     | Fetch one item with **every** locale it has a translation for                  |
| `PATCH`  | `/faq/{faqId}`                    | Required (moderator/admin) | Update the item's `category` / `display_order`                                 |
| `DELETE` | `/faq/{faqId}`                    | Required (moderator/admin) | Delete an item and all of its translations                                     |
| `PUT`    | `/faq/{faqId}/translations/{locale}` | Required (moderator/admin) | Create or replace one locale's translation                                  |
| `DELETE` | `/faq/{faqId}/translations/{locale}` | Required (moderator/admin) | Remove one locale's translation                                             |

FAQ is the one translated content type in the API. A FAQ **item** holds only language-independent data (`category`, `display_order`); the question and answer text live in per-locale **translations**. Two response shapes follow from that:

- `GET /faq` returns `FaqEntry` objects flattened to the requested locale — what a public FAQ page renders.
- Everything else (`GET /faq/{faqId}` and the write endpoints) returns `FaqItem`, with a `translations` object keyed by locale code (`{ "en": { question, answer }, "tr": { ... } }`) — what an editing view needs.

`GET /faq` is a plain array, **not** cursor-paginated: it is a small, bounded dataset meant to be fetched whole, ordered by category and then `display_order`. `locale` defaults to `en`; an unrecognized locale is a `400`. Only items that have a translation for the requested locale are returned — there is **no fallback** to another language, so a half-translated item simply doesn't appear in the locales it lacks.

Supported locale codes mirror the Website's: `en`, `tr`, `fr`, `de`, `es`, `pt`, `cn`, `ru`, `jp`, `kr`, `pl`, `in`, `sa`. The list lives in two places that must change together — the `faq_translations_locale_check` constraint and `supabase/functions/_shared/locales.ts`.

`POST /faq` must include at least one translation; the item and its translations are created in one transaction through `content.create_faq_item_with_translations()` (a FAQ item with no text would be meaningless). Reads are public (`anon` and `authenticated`); all writes are moderator/admin only. See [Database › Tables › FAQ](../../database/tables/faq.md).
