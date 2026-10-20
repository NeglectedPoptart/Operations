"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

// Saves the name a person wants HOPS to show for them. Empty clears it (HOPS
// goes back to their employee-record name). Like the NFL team, the write goes
// through the service key, scoped strictly to the signed-in user's own row.
export async function saveMyName(name: string): Promise<{ ok: true; name: string } | { error: string }> {
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length > 60) return { error: "Keep the name under 60 characters." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await adminClient()
    .from("profiles")
    .update({ display_name: clean || null })
    .eq("id", user.id);
  if (error) return { error: /display_name/.test(error.message) ? "Names aren't set up yet - ask the admin to run migration 152." : error.message };
  return { ok: true, name: clean };
}
