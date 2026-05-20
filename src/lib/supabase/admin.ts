import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — server-only.
 *
 * Bypasses RLS. Used for document indexing, where the server writes to
 * system-global tables (shared_documents, chunks) that have no INSERT
 * policy for the `authenticated` role. Always perform an explicit
 * authorization check (room admin) before using this client.
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
