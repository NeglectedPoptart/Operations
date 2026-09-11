"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

async function requireSelfOrAdminExec(supabase: Awaited<ReturnType<typeof createClient>>, targetUserId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  if (user.id === targetUserId) return;

  const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (error) throw new Error(error.message);
  const isAdminOrExec = (profile.role as Role) === "admin" || (profile.role as Role) === "executive";
  if (!isAdminOrExec) throw new Error("You can only set your own goal.");
}

// Upserts today's goal for a person without clobbering their progress so
// far if one already exists - editing the text/target mid-day shouldn't
// zero out a count they've already been building up.
export async function setDailyGoal(userId: string, goalDate: string, goalText: string, targetCount: number) {
  const supabase = await createClient();
  await requireSelfOrAdminExec(supabase, userId);

  const { data: existing, error: existingError } = await supabase
    .from("crm_daily_goals")
    .select("id")
    .eq("user_id", userId)
    .eq("goal_date", goalDate)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const { data, error } = await supabase
      .from("crm_daily_goals")
      .update({ goal_text: goalText, target_count: targetCount })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/crm", "layout");
    return data;
  }

  const { data, error } = await supabase
    .from("crm_daily_goals")
    .insert({ user_id: userId, goal_date: goalDate, goal_text: goalText, target_count: targetCount, current_count: 0 })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/crm", "layout");
  return data;
}

export async function adjustDailyGoalProgress(goalId: string, userId: string, delta: number) {
  const supabase = await createClient();
  await requireSelfOrAdminExec(supabase, userId);

  const { data: goal, error: goalError } = await supabase
    .from("crm_daily_goals")
    .select("current_count")
    .eq("id", goalId)
    .single();
  if (goalError) throw new Error(goalError.message);

  const nextCount = Math.max(0, goal.current_count + delta);
  const { error } = await supabase.from("crm_daily_goals").update({ current_count: nextCount }).eq("id", goalId);
  if (error) throw new Error(error.message);

  revalidatePath("/crm", "layout");
}

export async function deleteDailyGoal(goalId: string, userId: string) {
  const supabase = await createClient();
  await requireSelfOrAdminExec(supabase, userId);

  const { error } = await supabase.from("crm_daily_goals").delete().eq("id", goalId);
  if (error) throw new Error(error.message);

  revalidatePath("/crm", "layout");
}
