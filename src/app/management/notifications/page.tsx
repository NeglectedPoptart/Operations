import { createClient } from "@/lib/supabase/server";
import { getLastEditedMap } from "@/lib/notificationBreakdown";
import type { Profile, SentNotification } from "@/lib/types";
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
    sentRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getLastEditedMap(supabase),
    supabase.from("profiles").select("*").order("email", { ascending: true }),
    supabase
      .from("notifications")
      .select("*, notification_recipients(id, notification_id, user_id, acknowledged_at)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (profilesRes.error) {
    return <p className="text-red-600">Failed to load users: {profilesRes.error.message}</p>;
  }
  if (sentRes.error) {
    return <p className="text-red-600">Failed to load notifications: {sentRes.error.message}</p>;
  }

  return (
    <NotificationsClient
      profiles={(profilesRes.data ?? []) as Profile[]}
      lastEditedMap={lastEditedMap}
      sent={(sentRes.data ?? []) as SentNotification[]}
      currentUserEmail={user?.email ?? null}
    />
  );
}
