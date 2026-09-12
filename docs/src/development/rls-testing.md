# RLS Testing

RLS tests under `supabase/tests/rls/` follow one additional pattern beyond ordinary pgTAP tests: they need to run *as* different roles/users to actually exercise a policy, not just as the superuser pgTAP normally runs as.

## The pattern

```sql
begin;
select plan(<n>);

-- set up fixture rows as an unrestricted role first
insert into identity.teams (id, name, created_by) values (...);

-- switch to simulate an authenticated, specific user
set local role authenticated;
set local request.jwt.claims to '{"sub": "<uuid-of-test-user>"}';

select is(
  (select count(*) from identity.teams where id = '<team-id>'),
  1,
  'team member can see the team'
);

-- switch to a different, non-member user and confirm they cannot
set local request.jwt.claims to '{"sub": "<uuid-of-other-user>"}';

select is(
  (select count(*) from identity.teams where id = '<team-id>'),
  0,
  'non-member cannot see the team'
);

select * from finish();
rollback;
```

`set local role` and `set local request.jwt.claims` are scoped to the current transaction, which is why every test file is wrapped in `begin; ... rollback;` — the role/claim switch (and any fixture rows inserted) disappear automatically at the end.

## What gets tested, per table

For every RLS-protected table: at least one case that should be allowed, and at least one that should be denied, for each distinct policy (read, and any write policy that exists). See [Security › Policies](../security/policies.md) for the policy inventory these tests are exercising.
