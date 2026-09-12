-- Local dev seed data.
--
-- Releases domain: deliberately includes 1.9.0 / 1.10.0 / 2.0.0 so that
-- semver-aware sorting (vs. lexicographic sorting, which would put 1.10.0
-- before 1.9.0) is exercised by anyone poking at the local DB, and is
-- asserted in supabase/tests/database/releases_functions.sql.

insert into releases.engine_releases
(version, version_major, version_minor, version_patch, release_date, release_notes_summary, status)
values
  ('1.2.0',  1, 2,  0, '2026-03-01', 'Initial public renderer preview.',        'deprecated'),
  ('1.3.0',  1, 3,  0, '2026-05-15', 'Vulkan swapchain stability fixes.',       'stable'),
  ('1.4.0',  1, 4,  0, '2026-07-10', 'Qt6 editor integration.',                 'stable'),
  ('1.9.0',  1, 9,  0, '2026-08-01', 'FFI layer expansion.',                    'stable'),
  ('1.10.0', 1, 10, 0, '2026-08-15', 'VFS and logging bridges.',                'stable'),
  ('2.0.0',  2, 0,  0, '2026-08-28', 'Major architecture revision.',            'beta');

insert into releases.engine_artifacts
(release_id, os, architecture, download_url, sha256, size_bytes, min_requirements, compiler)
select r.id, v.os, v.architecture, v.download_url, v.sha256, v.size_bytes,
       v.min_requirements::jsonb, v.compiler::jsonb
from releases.engine_releases r
       join (values
               ('1.3.0',  'windows', 'x86_64',
                'https://github.com/Coreverse-Game-Engine/Coreverse-Engine/releases/download/v1.3.0/coreverse-engine-windows-x86_64.zip',
                '1950e0f4afd384b7abe4cec726b5e9aa5aa80710df830e881f7019dd60144b3d',
                184320000,
                '{"os":{"name":"windows","version":"10"},"cpu":{"architecture":"x86_64","cores":4},"ram_gb":8,"disk_gb":15,"gpu":{"required":true,"api":"vulkan","vram_gb":2}}',
                '{"name":"msvc","version":"19.38"}'),

               ('1.4.0',  'windows', 'x86_64',
                'https://github.com/Coreverse-Game-Engine/Coreverse-Engine/releases/download/v1.4.0/coreverse-engine-windows-x86_64.zip',
                '977ab8228b6695bb71bdb321a562f4c3a2236a1bb8767e14bf1ad790230fea2a',
                191234000,
                '{"os":{"name":"windows","version":"10"},"cpu":{"architecture":"x86_64","cores":4},"ram_gb":8,"disk_gb":15,"gpu":{"required":true,"api":"vulkan","vram_gb":2}}',
                '{"name":"msvc","version":"19.40"}'),
               ('1.4.0',  'linux',   'x86_64',
                'https://github.com/Coreverse-Game-Engine/Coreverse-Engine/releases/download/v1.4.0/coreverse-engine-linux-x86_64.tar.gz',
                '11ef107963933e4b2376e5d30e6da6579e56be8f217b57ace51069f2cc152464',
                178900000,
                '{"os":{"name":"linux","version":"22.04"},"cpu":{"architecture":"x86_64","cores":4},"ram_gb":8,"disk_gb":15,"gpu":{"required":true,"api":"vulkan","vram_gb":2}}',
                '{"name":"gcc","version":"13.2"}'),

               ('1.10.0', 'windows', 'x86_64',
                'https://github.com/Coreverse-Game-Engine/Coreverse-Engine/releases/download/v1.10.0/coreverse-engine-windows-x86_64.zip',
                'f9940e9492bf56cdffc77dbb3a4555b8cfd7af3a3812bbe8b0b5f38c08a3e692',
                198765000,
                '{"os":{"name":"windows","version":"11"},"cpu":{"architecture":"x86_64","cores":4},"ram_gb":8,"disk_gb":20,"gpu":{"required":true,"api":"vulkan","vram_gb":4}}',
                '{"name":"msvc","version":"19.44"}'),
               ('1.10.0', 'macos',   'arm64',
                'https://github.com/Coreverse-Game-Engine/Coreverse-Engine/releases/download/v1.10.0/coreverse-engine-macos-arm64.zip',
                'fd09277561013dd2bf16ea2015dda879dfdd1ad3849bdc391b296be86eaf7bae',
                165432000,
                '{"os":{"name":"macos","version":"14"},"cpu":{"architecture":"arm64","cores":4},"ram_gb":8,"disk_gb":20,"gpu":{"required":true,"api":"vulkan","vram_gb":4}}',
                '{"name":"apple-clang","version":"16.0"}'),

               ('2.0.0',  'windows', 'x86_64',
                'https://github.com/Coreverse-Game-Engine/Coreverse-Engine/releases/download/v2.0.0/coreverse-engine-windows-x86_64.zip',
                '499d7cd584bd2a32db82d81299dc46e6731194c143160a56075e25addf2a0be4',
                205000000,
                '{"os":{"name":"windows","version":"11"},"cpu":{"architecture":"x86_64","cores":6},"ram_gb":16,"disk_gb":25,"gpu":{"required":true,"api":"vulkan","vram_gb":4}}',
                '{"name":"msvc","version":"19.44"}'),
               ('2.0.0',  'linux',   'x86_64',
                'https://github.com/Coreverse-Game-Engine/Coreverse-Engine/releases/download/v2.0.0/coreverse-engine-linux-x86_64.tar.gz',
                '93d44ab3f3fd09cf568953ed4c7bec6f9a136497dc3706b8f621c4621a4c5a7d',
                199870000,
                '{"os":{"name":"linux","version":"22.04"},"cpu":{"architecture":"x86_64","cores":6},"ram_gb":16,"disk_gb":25,"gpu":{"required":true,"api":"vulkan","vram_gb":4}}',
                '{"name":"gcc","version":"14.1"}'),
               ('2.0.0',  'macos',   'arm64',
                'https://github.com/Coreverse-Game-Engine/Coreverse-Engine/releases/download/v2.0.0/coreverse-engine-macos-arm64.zip',
                'aad5fda0d3d189655bbc3278b42bbc90653bdf28c22c3cac54d66664a58a3fd2',
                172345000,
                '{"os":{"name":"macos","version":"14"},"cpu":{"architecture":"arm64","cores":6},"ram_gb":16,"disk_gb":25,"gpu":{"required":true,"api":"vulkan","vram_gb":4}}',
                '{"name":"apple-clang","version":"16.0"}')
) as v(version, os, architecture, download_url, sha256, size_bytes, min_requirements, compiler)
            on v.version = r.version;


-- ---------------------------------------------------------------------
-- Identity domain seed data.
--
-- auth.users rows are inserted directly for local dev only -- this
-- mirrors the standard Supabase local-seed pattern. Adjust the column
-- list if your local GoTrue schema version differs.
-- ---------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
    ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
     'authenticated', 'authenticated', 'alice@example.com', crypt('password123', gen_salt('bf')),
     now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Alice Baker"}',
     now(), now()),
    ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
     'authenticated', 'authenticated', 'bora@example.com', crypt('password123', gen_salt('bf')),
     now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Alex Taylor"}',
     now(), now()),
    ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
     'authenticated', 'authenticated', 'ceyda@example.com', crypt('password123', gen_salt('bf')),
     now(), '{"provider":"email","providers":["email"]}', '{"full_name":"John Smith"}',
     now(), now())
on conflict (id) do nothing;
-- The trg_handle_new_auth_user trigger auto-creates matching identity.profiles rows.

-- One team, Alice as owner (via create_team's normal path would need an
-- authenticated session; for seed data we insert directly instead).
insert into identity.teams (id, name, created_by)
values ('44444444-4444-4444-4444-444444444444', 'Coreverse Core Team', '11111111-1111-1111-1111-111111111111');

insert into identity.team_members (team_id, user_id, role)
values
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'admin'),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'member');

-- A pending join request from a fourth (not-yet-created) local test flow
-- is intentionally omitted here since it needs a real fourth auth user;
-- exercise that via the RLS/function tests instead.

insert into identity.projects
(owner_id, team_id, name, description, archive_path, archive_size_bytes, archive_sha256)
values
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444',
   'sample-project-alpha', 'Example team-owned project for local dev.',
   'project-archives/11111111-1111-1111-1111-111111111111/sample-project-alpha.tar.zst',
   4200000, '4c5674f172e6f1999c07f1c029af5c3fcc701f75dd72cc85f9d32f77fc6af5da'),
  ('33333333-3333-3333-3333-333333333333', null,
   'sample-project-beta', 'Example personal (non-team) project for local dev.',
   'project-archives/33333333-3333-3333-3333-333333333333/sample-project-beta.tar.zst',
   1800000, 'f33e328e465eb73059d8e2e1f9c5eb0ba5d8f1784976503edf516719953f7575');


-- ---------------------------------------------------------------------
-- Content domain seed data (uses the same fixture users as identity).
-- ---------------------------------------------------------------------

insert into identity.platform_roles (user_id, role)
values ('11111111-1111-1111-1111-111111111111', 'admin');

insert into content.news (title, slug, body, author_id, status, published_at)
values
  ('Coreverse Engine 2.0 Announced', 'coreverse-engine-2.0-announced',
   'Example news content -- An article describing the architectural changes in version 2.0.',
   '11111111-1111-1111-1111-111111111111', 'published', now()),
  ('Upcoming Features', 'upcoming-features',
   'A news report in draft form -- not yet published.',
   '11111111-1111-1111-1111-111111111111', 'draft', null);

insert into content.polls (id, question, created_by, closes_at)
values (
         '55555555-5555-5555-5555-555555555555',
         'Which renderer do you use most often?',
         '11111111-1111-1111-1111-111111111111',
         now() + interval '30 days'
       );

insert into content.poll_options (id, poll_id, label, display_order)
values
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'Vulkan', 1),
  ('77777777-7777-7777-7777-777777777777', '55555555-5555-5555-5555-555555555555', 'OpenGL', 2);

insert into content.poll_votes (poll_id, option_id, user_id)
values ('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666',
        '22222222-2222-2222-2222-222222222222');

insert into content.discussions (id, title, body, author_id, category)
values (
         '88888888-8888-8888-8888-888888888888',
         'Vulkan swapchain issue',
         'Example discussion content -- I''m getting an error during swapchain rebuild.',
         '33333333-3333-3333-3333-333333333333',
         'help'
       );

insert into content.discussion_replies (discussion_id, author_id, body)
values (
         '88888888-8888-8888-8888-888888888888',
         '22222222-2222-2222-2222-222222222222',
         'You can resolve this with the VK_ERROR_OUT_OF_DATE_KHR check, and look at the relevant PR.'
       );


-- ---------------------------------------------------------------------
-- Docs domain seed data.
-- ---------------------------------------------------------------------

insert into docs.sources (id, kind, title, slug, base_url, current_version_ref)
values
  ('99999999-0000-0000-0000-000000000001', 'engine_mdbook', 'Coreverse Engine Docs',
   'engine', 'https://docs.coreverse.dev/engine/', '2.0.0'),
  ('99999999-0000-0000-0000-000000000002', 'tutorial', 'Getting Started Tutorials',
   'tutorials', 'https://docs.coreverse.dev/tutorials/', null);

insert into docs.pages (source_id, path, title, content_text)
values
  ('99999999-0000-0000-0000-000000000001', 'getting-started/installation', 'Installation',
   'Coreverse Engine installation requires CMake and Ninja. First, install the dependencies with vcpkg, then run the cmake --preset command in the build directory.'),
  ('99999999-0000-0000-0000-000000000001', 'rendering/vulkan-setup', 'Vulkan Setup',
   'The Vulkan renderer uses the volk, VulkanHeaders, and VMA libraries. The steps for creating VulkanContext are described on this page.'),
  ('99999999-0000-0000-0000-000000000002', 'first-project/hello-triangle', 'Hello Triangle',
   'This tutorial will show you how to create your first project with Coreverse Engine and render a triangle on the screen.');
