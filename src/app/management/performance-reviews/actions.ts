"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MajorIssueType } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/management/performance-reviews");
}

// Employees - same "type to add" pattern as Callout Sheet's own createEmployee,
// duplicated here rather than imported cross-page per this app's convention.
export async function createEmployee(name: string, title: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").insert({ name, title }).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

// Quick Notes -------------------------------------------------------------------

export async function addQuickNote(employeeName: string, year: number, quarter: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performance_review_quick_notes")
    .insert({ employee_name: employeeName, year, quarter })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateQuickNote(
  id: string,
  patch: {
    note?: string;
    occurred_date?: string | null;
    follow_up_notes?: string | null;
    follow_up_date?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("performance_review_quick_notes").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteQuickNote(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("performance_review_quick_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Improvements --------------------------------------------------------------------

export async function addImprovement(employeeName: string, year: number, quarter: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performance_review_improvements")
    .insert({ employee_name: employeeName, year, quarter })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateImprovement(id: string, patch: { note?: string; occurred_date?: string | null }) {
  const supabase = await createClient();
  const { error } = await supabase.from("performance_review_improvements").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteImprovement(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("performance_review_improvements").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Major Issues (Warnings) ----------------------------------------------------------

export async function addMajorIssue(employeeName: string, year: number, quarter: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("performance_review_major_issues")
    .insert({ employee_name: employeeName, year, quarter })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateMajorIssue(
  id: string,
  patch: {
    occurred_date?: string | null;
    issue_type?: MajorIssueType | null;
    description?: string | null;
    action_plan?: string | null;
    review_date?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("performance_review_major_issues").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteMajorIssue(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("performance_review_major_issues").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
