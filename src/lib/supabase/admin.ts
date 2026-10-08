import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client: bypasses row-level security and can manage auth users.
// Server-only. Every caller must check who is asking first (the signed-in
// user's id, or isSupremeUser) - this client itself checks nothing.
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
