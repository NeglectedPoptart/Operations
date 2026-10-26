"use server";

import { revalidatePath } from "next/cache";
import { personName } from "@/lib/displayName";
import { canOpenPage } from "@/lib/pageAccess";
import { createClient } from "@/lib/supabase/server";

// Marks a received load as paid (or un-marks it) so it stops showing as due.
export async function setArrivalPaid(id: string, paid: boolean): Promise<{ ok: true; paidAt: string | null; paidBy: string | null } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await canOpenPage(supabase, user, "/mexico/ap-summary"))) return { error: "Not allowed." };
  const paidAt = paid ? new Date().toISOString() : null;
  const paidBy = paid ? await personName(supabase, user) : null;
  const { error } = await supabase.from("mx_arrivals").update({ ap_paid_at: paidAt, ap_paid_by: paidBy }).eq("id", id);
  if (error) return { error: /ap_paid/.test(error.message) ? "AP payments aren't set up yet - ask the admin to run migration 156." : error.message };
  revalidatePath("/mexico/ap-summary");
  return { ok: true, paidAt, paidBy };
}
