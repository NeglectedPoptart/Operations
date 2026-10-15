"use server";

import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/dates";
import { trimSeconds, type DayTimes } from "@/lib/timeEntry";

export interface HoursRow extends DayTimes {
  work_date: string;
  notes: string | null;
}

// One employee's days for a week (Monday start).
export async function getEmployeeHours(employeeId: string, weekStart: string): Promise<HoursRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_hours")
    .select("work_date, clock_in, lunch_out, lunch_in, clock_out, notes")
    .eq("employee_id", employeeId)
    .gte("work_date", weekStart)
    .lte("work_date", addDays(weekStart, 6))
    .order("work_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    work_date: r.work_date as string,
    clock_in: trimSeconds(r.clock_in as string | null),
    lunch_out: trimSeconds(r.lunch_out as string | null),
    lunch_in: trimSeconds(r.lunch_in as string | null),
    clock_out: trimSeconds(r.clock_out as string | null),
    notes: (r.notes as string | null) ?? null,
  }));
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Saves one day (all four times and the note together; a day with nothing in it is removed).
export async function saveEmployeeHours(employeeId: string, row: HoursRow): Promise<{ error: string } | { ok: true }> {
  for (const v of [row.clock_in, row.lunch_out, row.lunch_in, row.clock_out]) {
    if (v !== null && !TIME.test(v)) return { error: "That isn't a valid time." };
  }
  const supabase = await createClient();
  const empty = !row.clock_in && !row.lunch_out && !row.lunch_in && !row.clock_out && !(row.notes ?? "").trim();
  if (empty) {
    const { error } = await supabase.from("employee_hours").delete().eq("employee_id", employeeId).eq("work_date", row.work_date);
    return error ? { error: error.message } : { ok: true };
  }
  const { error } = await supabase.from("employee_hours").upsert(
    {
      employee_id: employeeId,
      work_date: row.work_date,
      clock_in: row.clock_in,
      lunch_out: row.lunch_out,
      lunch_in: row.lunch_in,
      clock_out: row.clock_out,
      notes: (row.notes ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,work_date" },
  );
  return error ? { error: error.message } : { ok: true };
}
