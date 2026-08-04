"use server";

import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";

// Marks the Warehouse/QC daily reminder modal (rendered from the root
// layout) as seen for today, so it doesn't show again until tomorrow.
export async function markDailyReminderSeen() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ last_reminder_seen_date: todayISO() }).eq("id", user.id);
}
