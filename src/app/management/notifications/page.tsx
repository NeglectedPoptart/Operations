import { createClient } from "@/lib/supabase/server";
import { getLastEditedMap } from "@/lib/notificationBreakdown";
import { getPageStatusLog } from "@/app/actions";
import type { AppNotification, NotificationRecipient, Profile, SentNotification } from "@/lib/types";
import NotificationsClient from "./NotificationsClient";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    lastEditedMap,
    profilesRes,
    notificationsRes,
    pageStatusLog,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getLastEditedMap(supabase),
    supabase.from("profiles").select("*").order("email", { ascending: true }),
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50),
    getPageStatusLog(100),
  ]);

  if (profilesRes.error) {
    return <p className="text-red-600">Failed to load users: {profilesRes.error.message}</p>;
  }
  if (notificationsRes.error) {
    return <p className="text-red-600">Failed to load notifications: {notificationsRes.error.message}</p>;
  }

  const notifications = (notificationsRes.data ?? []) as AppNotification[];

  // Two flat queries (notifications, then recipients by notification_id)
  // instead of one embedded select - avoids depending on PostgREST having
  // already picked up the FK relationship for these tables.
  const notificationIds = notifications.map((n) => n.id);
  const recipientsRes =
    notificationIds.length > 0
      ? await supabase.from("notification_recipients").select("*").in("notification_id", notificationIds)
      : { data: [] as NotificationRecipient[], error: null };
  if (recipientsRes.error) {
    return <p className="text-red-600">Failed to load notification recipients: {recipientsRes.error.message}</p>;
  }

  const recipients = (recipientsRes.data ?? []) as NotificationRecipient[];
  const recipientsByNotificationId = new Map<string, NotificationRecipient[]>();
  for (const r of recipients) {
    if (!recipientsByNotificationId.has(r.notification_id)) recipientsByNotificationId.set(r.notification_id, []);
    recipientsByNotificationId.get(r.notification_id)!.push(r);
  }
  const sent: SentNotification[] = notifications.map((n) => ({
    ...n,
    notification_recipients: recipientsByNotificationId.get(n.id) ?? [],
  }));

  return (
    <NotificationsClient
      profiles={(profilesRes.data ?? []) as Profile[]}
      lastEditedMap={lastEditedMap}
      sent={sent}
      currentUserEmail={user?.email ?? null}
      pageStatusLog={pageStatusLog}
    />
  );
}
