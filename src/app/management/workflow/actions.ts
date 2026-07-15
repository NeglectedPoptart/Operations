"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { WorkflowSection, WorkflowStatus } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/management/workflow");
}

export async function createWorkflowTask(section: WorkflowSection, name: string, isPermanent: boolean) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("workflow_tasks")
    .select("position")
    .eq("section", section)
    .order("position", { ascending: false })
    .limit(1);
  const nextPosition = (existing?.[0]?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("workflow_tasks")
    .insert({ section, position: nextPosition, name: trimmed, is_permanent: isPermanent })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateWorkflowTaskStatus(id: string, status: WorkflowStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from("workflow_tasks").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateWorkflowTaskNotes(id: string, notes: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflow_tasks")
    .update({ notes: notes.trim() === "" ? null : notes.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteWorkflowTask(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("workflow_tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// "Reset Day": one-off tasks added just for today are removed entirely;
// standing (permanent) tasks go back to Pending with notes cleared.
export async function resetWorkflowDay() {
  const supabase = await createClient();

  const { error: deleteError } = await supabase.from("workflow_tasks").delete().eq("is_permanent", false);
  if (deleteError) throw new Error(deleteError.message);

  const { error: updateError } = await supabase
    .from("workflow_tasks")
    .update({ status: "pending", notes: null })
    .eq("is_permanent", true);
  if (updateError) throw new Error(updateError.message);

  revalidateAll();
}
