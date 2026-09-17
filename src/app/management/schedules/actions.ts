"use server";

import { createClient } from "@/lib/supabase/server";
import type { RoleSchedule, RoleScheduleAssignmentType, ScheduleDayHours } from "@/lib/types";

// No revalidatePath - see employee-files/actions.ts for why. The page is
// already force-dynamic, and the client's own optimistic setState already
// reflects each change instantly for whoever's editing.

export interface NewRoleScheduleInput {
  department: string;
  assignmentType: RoleScheduleAssignmentType;
  roleName: string;
  employeeId: string | null;
  // Role rows use these two (unstructured).
  weekAHoursText: string;
  weekBHoursText: string;
  // Person rows use these two instead (day grid).
  weekADays: ScheduleDayHours;
  weekBDays: ScheduleDayHours | null;
}

export async function createRoleSchedule(input: NewRoleScheduleInput): Promise<RoleSchedule> {
  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("role_schedules")
    .select("position")
    .eq("department", input.department)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow as { position: number } | null)?.position ?? -1) + 1;
  const { data, error } = await supabase
    .from("role_schedules")
    .insert({
      department: input.department,
      assignment_type: input.assignmentType,
      role_name: input.roleName,
      employee_id: input.employeeId,
      week_a_hours_text: input.weekAHoursText,
      week_b_hours_text: input.weekBHoursText || null,
      week_a_days: input.assignmentType === "person" ? input.weekADays : null,
      week_b_days: input.assignmentType === "person" ? input.weekBDays : null,
      hours_text: input.weekAHoursText,
      position: nextPosition,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as RoleSchedule;
}

export async function updateRoleSchedule(
  id: string,
  patch: Partial<
    Pick<
      RoleSchedule,
      | "department"
      | "assignment_type"
      | "role_name"
      | "employee_id"
      | "week_a_hours_text"
      | "week_b_hours_text"
      | "week_a_days"
      | "week_b_days"
    >
  >,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("role_schedules").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteRoleSchedule(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("role_schedules").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
