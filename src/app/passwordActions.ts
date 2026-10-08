"use server";

import { createClient as createBareClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { passwordProblem } from "@/lib/passwordRules";

// Change the signed-in person's own password. The current password has to be
// given again (so a borrowed, still-signed-in screen can't change it), and the
// new one has to meet the rules - checked here, not just in the form.
export async function changeOwnPassword(current: string, next: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "You're not signed in." };

  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next === current) return { error: "Choose a new password that's different from the current one." };

  // Check the current password on a throwaway client so this can't touch the
  // real session's cookies.
  const check = createBareClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: wrong } = await check.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) return { error: "The current password isn't right." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };

  // Remember when (never the password). Best-effort: the column comes from a
  // later migration and a profile row can only be written by an admin through
  // the signed-in client, so this goes through the service key.
  try {
    await adminClient().from("profiles").update({ password_changed_at: new Date().toISOString() }).eq("id", user.id);
  } catch {
    // intentionally swallowed
  }
  return { ok: true };
}
