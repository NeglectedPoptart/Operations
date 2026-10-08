"use server";

import { createClient } from "@/lib/supabase/server";
import type { EmployeePayEntry, EmployeePayType } from "@/lib/types";

// Pay history (see migration 133). The table is locked to Admin, Executive and
// the Supreme account in the database itself, so a blocked read/write comes
// back as an error or no rows rather than being filtered here. No
// revalidatePath, for the same reason as the rest of this folder's actions.

export async function getEmployeePay(employeeId: string): Promise<{ entries: EmployeePayEntry[] } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_pay_history")
    .select("*")
    .eq("employee_id", employeeId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return { error: error.message };
  return { entries: (data ?? []) as EmployeePayEntry[] };
}

export async function addEmployeePay(input: {
  employeeId: string;
  effectiveDate: string;
  payType: EmployeePayType;
  amount: number;
  note: string | null;
}): Promise<EmployeePayEntry> {
  if (!input.effectiveDate) throw new Error("Enter the date this pay started.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter the pay amount.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_pay_history")
    .insert({
      employee_id: input.employeeId,
      effective_date: input.effectiveDate,
      pay_type: input.payType,
      amount: input.amount,
      note: input.note?.trim() || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EmployeePayEntry;
}

export async function updateEmployeePay(
  id: string,
  patch: Partial<Pick<EmployeePayEntry, "effective_date" | "pay_type" | "amount" | "note">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_pay_history").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteEmployeePay(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("employee_pay_history").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
