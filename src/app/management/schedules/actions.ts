"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function revalidateAll() {
  revalidatePath("/management/schedules");
}

export async function createRoleSchedule(department: string, roleName: string, hoursText: string) {
  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("role_schedules")
    .select("position")
    .eq("department", department)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow as { position: number } | null)?.position ?? -1) + 1;
  const { data, error } = await supabase
    .from("role_schedules")
    .insert({ department, role_name: roleName, hours_text: hoursText, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateRoleSchedule(
  id: string,
  patch: { department?: string; role_name?: string; hours_text?: string },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("role_schedules").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteRoleSchedule(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("role_schedules").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
