"use server";

import { revalidatePath } from "next/cache";
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

interface NotificationJoinRow {
  id: string;
  notifications: {
    id: string;
    tab_label: string;
    subtab_label: string;
    page_path: string;
    message: string;
    updated_by: string | null;
    last_edited_at: string | null;
    created_at: string;
    created_by: string | null;
  } | null;
}

// Polled from the global NotificationPopup - unacknowledged notifications
// addressed to the current user, oldest first so they work through them in
// the order they were sent.
export async function getPendingNotifications(): Promise<PendingNotification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notification_recipients")
    .select(
      "id, notifications(id, tab_label, subtab_label, page_path, message, updated_by, last_edited_at, created_at, created_by)",
    )
    .eq("user_id", user.id)
    .is("acknowledged_at", null);
  if (error || !data) return [];

  const rows = data as unknown as NotificationJoinRow[];
  const senderIds = [...new Set(rows.map((r) => r.notifications?.created_by).filter((id): id is string => Boolean(id)))];
  const { data: senders } = senderIds.length > 0
    ? await supabase.from("profiles").select("id, email").in("id", senderIds)
    : { data: [] as { id: string; email: string | null }[] };
  const senderEmailById = new Map((senders ?? []).map((s) => [s.id as string, s.email as string | null]));

  return rows
    .filter((r): r is NotificationJoinRow & { notifications: NonNullable<NotificationJoinRow["notifications"]> } =>
      Boolean(r.notifications),
    )
    .map((r) => ({
      recipientId: r.id,
      notificationId: r.notifications.id,
      tabLabel: r.notifications.tab_label,
      subtabLabel: r.notifications.subtab_label,
      pagePath: r.notifications.page_path,
      message: r.notifications.message,
      updatedBy: r.notifications.updated_by,
      lastEditedAt: r.notifications.last_edited_at,
      createdAt: r.notifications.created_at,
      senderEmail: r.notifications.created_by ? senderEmailById.get(r.notifications.created_by) ?? null : null,
    }))
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
  await supabase
    .from("notification_recipients")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", recipientId)
    .eq("user_id", user.id);
  revalidatePath("/management/notifications");
}
