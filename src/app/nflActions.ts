"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isTeamChoice, loadNflSummary, type NflSummary } from "@/lib/nfl";

// Saves the team a person picked: an NFL team, the Spurs, or "none".
// Regular logins can't update their own profile row (row-level security only
// lets admins), so the write goes through the service key - scoped strictly to
// the signed-in user's own id, like reportTimezone.
export async function saveNflTeam(abbr: string): Promise<{ ok: true } | { error: string }> {
  if (!isTeamChoice(abbr)) return { error: "Unknown team." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await adminClient().from("profiles").update({ nfl_team: abbr }).eq("id", user.id);
  if (error) return { error: error.message };
  return { ok: true };
}

// Record, last score and next game for a team, for the clock at the top of the menu.
export async function getNflSummary(abbr: string): Promise<NflSummary | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isTeamChoice(abbr)) return null;
  return loadNflSummary(abbr);
}
