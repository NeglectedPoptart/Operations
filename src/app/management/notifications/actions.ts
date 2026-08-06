"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPushToTokens } from "@/lib/push";
import type { Role } from "@/lib/roles";
import type { NotificationTargetType } from "@/lib/types";

export interface SendNotificationInput {
  tabLabel: string;
  subtabLabel: string;
  pagePath: string;
  message: string;
  updatedBy: string | null;
  lastEditedAt: string | null;
  targetType: NotificationTargetType;
  targetUserId: string | null;
  targetRole: Role | null;
}

// Fans out one notification_recipients row per person - a "role" target is
// resolved to its member list at send time (a snapshot: someone who joins
// that role later doesn't retroactively see old notifications).
export async function sendNotification(input: SendNotificationInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  let recipientIds: string[] = [];
  if (input.targetType === "user") {
    if (!input.targetUserId) throw new Error("Pick a person to notify.");
    recipientIds = [input.targetUserId];
  } else {
    if (!input.targetRole) throw new Error("Pick a group to notify.");
    const { data: profiles, error } = await supabase.from("profiles").select("id").eq("role", input.targetRole);
    if (error) throw new Error(error.message);
    recipientIds = (profiles ?? []).map((p) => p.id as string);
    if (recipientIds.length === 0) throw new Error("No one currently has that role.");
  }

  const { data: notification, error: insertError } = await supabase
    .from("notifications")
    .insert({
      tab_label: input.tabLabel,
      subtab_label: input.subtabLabel,
      page_path: input.pagePath,
      message: input.message,
      updated_by: input.updatedBy,
      last_edited_at: input.lastEditedAt,
      target_type: input.targetType,
      target_role: input.targetType === "role" ? input.targetRole : null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError || !notification) throw new Error(insertError?.message ?? "Failed to create notification.");

  const { error: recipientsError } = await supabase
    .from("notification_recipients")
    .insert(recipientIds.map((userId) => ({ notification_id: notification.id, user_id: userId })));
  if (recipientsError) throw new Error(recipientsError.message);

  // Best-effort - the in-app popup (polled from any open tab/app instance)
  // is the notification of record regardless of whether this succeeds; push
  // just gets it in front of someone whose app isn't currently open.
  const { data: pushTokens } = await supabase.from("push_tokens").select("token").in("user_id", recipientIds);
  const tokens = (pushTokens ?? []).map((t) => t.token as string);
  await sendPushToTokens(
    tokens,
    `Attention ${input.tabLabel}`,
    `${input.subtabLabel} sheet has been Updated`,
    { pagePath: input.pagePath },
  );

  revalidatePath("/management/notifications");
}
