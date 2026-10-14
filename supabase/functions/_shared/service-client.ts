import { createClient, } from '@supabase/supabase-js';
import { loggingFetch, } from './db-log.ts';
import { resolveServiceRoleKey, } from './service-role-key.ts';

// Use sparingly and only after the caller's access has already been
// verified with a user-scoped client (createUserClient) against normal
// RLS. This client bypasses RLS entirely.
//
// The key comes from resolveServiceRoleKey() (service-role-key.ts): the
// platform-injected SUPABASE_SERVICE_ROLE_KEY first, then SERVICE_ROLE_KEY.
export function createServiceClient() {
  return createClient(Deno.env.get('SUPABASE_URL',)!, resolveServiceRoleKey(), {
    global: { fetch: loggingFetch, },
    auth: { persistSession: false, },
  },);
}
