"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isSupremeUser } from "@/lib/roles";

// A scare nobody saw within this long is dropped, so someone opening HOPS an hour later isn't ambushed.
const EXPIRES_MS = 15 * 60 * 1000;

// Supreme only: queue a jump scare for one person.
export async function sendScare(targetUserId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isSupremeUser(user.email ?? null)) return { error: "Not allowed." };
  if (!targetUserId) return { error: "Pick a person first." };

  const { error } = await adminClient().from("scares").insert({ target_user_id: targetUserId, created_by: user.id });
  if (error) return { error: /scares/.test(error.message) ? "Scare isn't set up yet - run migration 170." : error.message };
  revalidatePath("/supreme/scare");
  return { ok: true };
}

// Called by every signed-in screen every few seconds: is there a scare waiting for me? Marks it delivered, so it
// only ever shows once (several queued scares collapse into one).
export async function claimScare(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const db = adminClient();
  const since = new Date(Date.now() - EXPIRES_MS).toISOString();
  const { data, error } = await db
    .from("scares")
    .update({ shown_at: new Date().toISOString() })
    .eq("target_user_id", user.id)
    .is("shown_at", null)
    .gte("created_at", since)
    .select("id");
  if (error) return false;
  return (data ?? []).length > 0;
}
