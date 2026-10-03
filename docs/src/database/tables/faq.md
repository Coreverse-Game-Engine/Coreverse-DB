# `content.faq_items` and `content.faq_translations`

## `content.faq_items`

| Column                      | Type             | Notes                                                 |
|-----------------------------|------------------|-------------------------------------------------------|
| `id`                        | `uuid`, PK       |                                                       |
| `category`                  | `text`, nullable | Free text; indexed (`idx_faq_items_category`)         |
| `display_order`             | `int`            | Default `0`; indexed (`idx_faq_items_display_order`)  |
| `created_by`                | `uuid`           | References `identity.profiles(id)`                    |
| `created_at` / `updated_at` | `timestamptz`    | `updated_at` maintained by `trg_faq_items_updated_at` |

## `content.faq_translations`

| Column                      | Type          | Notes                                                                                                                                                                |
|-----------------------------|---------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `faq_item_id`               | `uuid`        | References `content.faq_items(id)` `ON DELETE CASCADE`; part of the PK                                                                                               |
| `locale`                    | `text`        | Part of the PK; `faq_translations_locale_check` restricts it to the Website's locales (`en`, `tr`, `fr`, `de`, `es`, `pt`, `cn`, `ru`, `jp`, `kr`, `pl`, `in`, `sa`) |
| `question`                  | `text`        |                                                                                                                                                                      |
| `answer`                    | `text`        |                                                                                                                                                                      |
| `created_at` / `updated_at` | `timestamptz` | `updated_at` maintained by `trg_faq_translations_updated_at`                                                                                                         |

The composite primary key `(faq_item_id, locale)` guarantees at most one translation per language per item. Deleting an item cascades to its translations.

Both tables are publicly readable (`anon` and `authenticated`); inserts, updates and deletes require `identity.is_platform_moderator()`. The locale list mirrors `supabase/functions/_shared/locales.ts` (`WEBSITE_LOCALES`) — change both together when the Website adds or removes a locale. An item and its first translations are created atomically by [`content.create_faq_item_with_translations()`](../functions/content.md). See [API › FAQ](../../api/resources/faq.md).
