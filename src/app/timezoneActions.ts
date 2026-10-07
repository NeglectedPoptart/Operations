"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/timezones";

// Called by TimezoneSync with whatever zone the person's browser/phone
// reports. Never overwrites a zone that was set by hand on User Roles, and
// never throws - a failure here must not affect the page.
export async function reportTimezone(timeZone: string): Promise<void> {
  try {
    if (!isValidTimeZone(timeZone)) return;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ timezone: timeZone, timezone_source: "auto" })
      .eq("id", user.id)
      .eq("timezone_source", "auto");
  } catch {
    // intentionally swallowed
  }
}
