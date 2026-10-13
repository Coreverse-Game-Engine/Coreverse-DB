import { createClient, } from '@supabase/supabase-js';
import { loggingFetch, } from './db-log.ts';

// The Edge Functions runtime injects the service role key as
// SUPABASE_SERVICE_ROLE_KEY. It does NOT inject a variable called
// SERVICE_ROLE_KEY: that name is only set by hand (supabase/.env.production,
// supabase/functions/.env). Reading only SERVICE_ROLE_KEY made every route that
// needs the service client (rate limiting on discussions/polls/news/auth,
// avatar upload and removal, account deletion) throw "supabaseKey is required"
// on a project where nobody had set that secret, which the handlers answer
// with a generic 500 internal_error.
//
// The injected key is preferred: it is always the project's current key and
// cannot go stale after a key rotation. SERVICE_ROLE_KEY stays as a fallback
// so an environment that only sets the manual secret keeps working.
const KEY_ENV_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY',] as const;

export function resolveServiceRoleKey(
  read: (name: string,) => string | undefined = (name,) => Deno.env.get(name,),
): string {
  for (const name of KEY_ENV_NAMES) {
    const value = read(name,)?.trim();
    if (value) return value;
  }
  throw new Error(
    `No service role key: set one of ${KEY_ENV_NAMES.join(', ',)} for this Edge Function.`,
  );
}

// Use sparingly and only after the caller's access has already been
// verified with a user-scoped client (createUserClient) against normal
// RLS. This client bypasses RLS entirely.
export function createServiceClient() {
  return createClient(Deno.env.get('SUPABASE_URL',)!, resolveServiceRoleKey(), {
    global: { fetch: loggingFetch, },
    auth: { persistSession: false, },
  },);
}
