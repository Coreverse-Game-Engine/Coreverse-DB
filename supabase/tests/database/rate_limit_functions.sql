-- Tests for identity.hit_rate_limit (fixed-window rate limiting).
-- Run with: supabase test db

begin;

select plan(7);


-- ---------------------------------------------------------------------
-- 1-3. Up to max_hits requests for a fresh key are all allowed
-- ---------------------------------------------------------------------

select ok(
         identity.hit_rate_limit('test:key:a', 3, 3600),
         'hit 1/3 for a fresh key is allowed'
       );

select ok(
         identity.hit_rate_limit('test:key:a', 3, 3600),
         'hit 2/3 for the same key is allowed'
       );

select ok(
         identity.hit_rate_limit('test:key:a', 3, 3600),
         'hit 3/3 for the same key is allowed'
       );


-- ---------------------------------------------------------------------
-- 4. The (max_hits + 1)th request within the window is refused
-- ---------------------------------------------------------------------

select ok(
         not identity.hit_rate_limit('test:key:a', 3, 3600),
         'hit 4/3 for the same key within the window is refused'
       );


-- ---------------------------------------------------------------------
-- 5. A different key has its own independent budget
-- ---------------------------------------------------------------------

select ok(
         identity.hit_rate_limit('test:key:b', 3, 3600),
         'a different key is unaffected by test:key:a''s budget'
       );


-- ---------------------------------------------------------------------
-- 6. Hits older than the window are pruned, freeing up budget again
-- ---------------------------------------------------------------------

update identity.rate_limit_hits
set created_at = now() - interval '2 hours'
where key = 'test:key:a';

select ok(
         identity.hit_rate_limit('test:key:a', 3, 3600),
         'once prior hits fall outside the window, the key is allowed again'
       );


-- ---------------------------------------------------------------------
-- 7. Invalid arguments raise rather than silently misbehaving
-- ---------------------------------------------------------------------

select throws_like(
         $$ select identity.hit_rate_limit('test:key:c', 0, 3600) $$,
         '%must be positive%',
         'a non-positive max_hits raises'
       );


select * from finish();

rollback;
