"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isValidTimeZone } from "@/lib/timezones";

// Called by TimezoneSync with whatever zone the person's browser/phone
// reports. Never overwrites a zone that was set by hand on User Roles, and
// never throws - a failure here must not affect the page.
//
// Regular logins can't update their own profile row (row-level security only
// lets admins), so the write goes through the service key - scoped strictly to
// the signed-in user's own id.
export async function reportTimezone(timeZone: string): Promise<void> {
  try {
    if (!isValidTimeZone(timeZone)) return;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await adminClient()
      .from("profiles")
      .update({ timezone: timeZone, timezone_source: "auto" })
      .eq("id", user.id)
      .eq("timezone_source", "auto");
  } catch {
    // intentionally swallowed
  }
}
