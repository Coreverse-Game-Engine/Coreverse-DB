import { createClient, } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL',)!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY',)!;

// Unlike releases/index.ts (fully public, read-only), the identity domain
// functions call SECURITY DEFINER Postgres functions that check auth.uid()
// internally (who's the caller, are they the owner/admin/target, etc).
// That only resolves correctly if the caller's own JWT is forwarded to
// PostgREST -- so this client is built per-request from the incoming
// Authorization header, never from a fixed service/anon credential alone.
export function createUserClient(req: Request,) {
  const authHeader = req.headers.get('Authorization',) ?? '';
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader, }, },
    auth: { persistSession: false, },
  },);
}

// For genuinely unauthenticated routes (e.g. POST /auth/password-reset)
// where there is no caller JWT to forward at all -- as opposed to
// createUserClient, which forwards whatever Authorization header the
// request happened to carry. Plain anon-key client, same as what an
// unauthenticated browser session would use.
export function createAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, },
  },);
}
