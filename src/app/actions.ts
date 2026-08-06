"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { PushPlatform } from "@/lib/types";

// Called by the mobile app shell right after it gets a device token from
// FCM/APNs - upserted on the token itself (not user_id) so re-registering
// on the same device just refreshes updated_at, and signing in as a
// different person on that same device reassigns it instead of leaving a
// stale duplicate row pointed at the old account.
export async function registerPushToken(token: string, platform: PushPlatform) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("push_tokens")
    .upsert({ user_id: user.id, platform, token }, { onConflict: "token" });
  if (error) console.error("registerPushToken failed:", error.message);
}

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

export interface PendingNotification {
  recipientId: string;
  notificationId: string;
  tabLabel: string;
  subtabLabel: string;
  pagePath: string;
  message: string;
  updatedBy: string | null;
  lastEditedAt: string | null;
  createdAt: string;
  senderEmail: string | null;
}

interface NotificationRow {
  id: string;
  tab_label: string;
  subtab_label: string;
  page_path: string;
  message: string;
  updated_by: string | null;
  last_edited_at: string | null;
  created_at: string;
  created_by: string | null;
}

// Polled from the global NotificationPopup - unacknowledged notifications
// addressed to the current user, oldest first so they work through them in
// the order they were sent. Deliberately two flat queries instead of one
// embedded select (notification_recipients -> notifications) - an embed
// depends on PostgREST having picked up the FK relationship for these
// brand-new tables, which can lag behind a migration run by hand in the SQL
// Editor; a failure there would silently look identical to "nothing sent."
export async function getPendingNotifications(): Promise<PendingNotification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: recipientRows, error: recipientsError } = await supabase
    .from("notification_recipients")
    .select("id, notification_id")
    .eq("user_id", user.id)
    .is("acknowledged_at", null);
  if (recipientsError) {
    console.error("getPendingNotifications: notification_recipients query failed:", recipientsError.message);
    return [];
  }
  if (!recipientRows || recipientRows.length === 0) return [];

  const notificationIds = recipientRows.map((r) => r.notification_id as string);
  const { data: notifications, error: notificationsError } = await supabase
    .from("notifications")
    .select("id, tab_label, subtab_label, page_path, message, updated_by, last_edited_at, created_at, created_by")
    .in("id", notificationIds);
  if (notificationsError) {
    console.error("getPendingNotifications: notifications query failed:", notificationsError.message);
    return [];
  }

  const rows = (notifications ?? []) as NotificationRow[];
  const notificationById = new Map(rows.map((n) => [n.id, n]));
  const senderIds = [...new Set(rows.map((n) => n.created_by).filter((id): id is string => Boolean(id)))];
  const { data: senders } = senderIds.length > 0
    ? await supabase.from("profiles").select("id, email").in("id", senderIds)
    : { data: [] as { id: string; email: string | null }[] };
  const senderEmailById = new Map((senders ?? []).map((s) => [s.id as string, s.email as string | null]));

  return recipientRows
    .map((r) => {
      const n = notificationById.get(r.notification_id as string);
      if (!n) return null;
      return {
        recipientId: r.id as string,
        notificationId: n.id,
        tabLabel: n.tab_label,
        subtabLabel: n.subtab_label,
        pagePath: n.page_path,
        message: n.message,
        updatedBy: n.updated_by,
        lastEditedAt: n.last_edited_at,
        createdAt: n.created_at,
        senderEmail: n.created_by ? senderEmailById.get(n.created_by) ?? null : null,
      };
    })
    .filter((x): x is PendingNotification => x !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

// Marks one recipient row as seen - called both on a plain "Dismiss" and on
// "Go to page" (navigating away doesn't excuse acknowledging it).
export async function acknowledgeNotification(recipientId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("notification_recipients")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", recipientId)
    .eq("user_id", user.id);
  if (error) console.error("acknowledgeNotification failed:", error.message);
  revalidatePath("/management/notifications");
}
