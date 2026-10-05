import { isTrackedEmail, type AuditEventType } from "@/lib/auditTracked";
import { createClient } from "@/lib/supabase/server";

// Never throws - an audit-log hiccup must not break the action it is
// recording. `who` can be passed when the caller already has the user (e.g.
// straight after sign-in); otherwise the current session is used. Only the
// people in TRACKED_HANDLES (auditTracked.ts) are ever recorded.
export async function logActivity(
  eventType: AuditEventType,
  summary: string,
  details?: Record<string, unknown>,
  who?: { email: string; userId: string },
) {
  try {
    const supabase = await createClient();
    let email = who?.email ?? null;
    let userId = who?.userId ?? null;
    if (!email) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      email = user?.email ?? null;
      userId = user?.id ?? null;
    }
    if (!email || !userId || !isTrackedEmail(email)) return;

    await supabase.from("audit_log").insert({
      user_id: userId,
      user_email: email.toLowerCase(),
      event_type: eventType,
      summary,
      details: details ?? null,
    });
  } catch {
    // intentionally swallowed
  }
}
