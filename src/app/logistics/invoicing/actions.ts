"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatement } from "@/lib/types";

function revalidateAll(brokerId: string) {
  revalidatePath(`/logistics/invoicing/${brokerId}`);
  revalidatePath("/logistics/invoicing");
}

export async function getInvoiceStatementsForBroker(brokerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoice_statements").select("*").eq("broker_id", brokerId);
  if (error) throw new Error(error.message);
  return (data ?? []) as InvoiceStatement[];
}

export async function toggleRequestStatement(brokerId: string, value: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("brokers").update({ request_statement: value }).eq("id", brokerId);
  if (error) throw new Error(error.message);
  revalidatePath("/logistics/invoicing");
}

// Persists the broker tile order from the Invoicing home page's "Edit
// Layout" mode. orderedIds is the full broker list in its new top-to-bottom
// order; each broker's position is set to its index in that list.
export async function reorderBrokers(orderedIds: string[]) {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from("brokers").update({ position: index }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  revalidatePath("/logistics/invoicing");
}

// Applies the Statement Checker's confirmed results. The statement is the
// source of truth for what's actually been posted: any invoice matched to
// a Posted row is marked Done regardless of its current status here, then
// - no balance shown -> fully paid, so it's removed entirely
// - still has a balance -> stays Done but gets flagged (posted, not paid)
// Anything on this list that doesn't show up anywhere in the pasted
// statement at all is marked Pending, since accounting hasn't posted it.
export async function applyStatementCheck(
  brokerId: string,
  removeIds: string[],
  doneFlagIds: string[],
  pendingIds: string[],
) {
  const supabase = await createClient();

  if (removeIds.length > 0) {
    const { error } = await supabase.from("invoice_statements").delete().in("id", removeIds);
    if (error) throw new Error(error.message);
  }
  if (doneFlagIds.length > 0) {
    const { error } = await supabase
      .from("invoice_statements")
      .update({ status: "done", flagged: true })
      .in("id", doneFlagIds);
    if (error) throw new Error(error.message);
    const { error: activityError } = await supabase
      .from("brokers")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", brokerId);
    if (activityError) throw new Error(activityError.message);
  }
  if (pendingIds.length > 0) {
    const { error } = await supabase
      .from("invoice_statements")
      .update({ status: "pending", flagged: false })
      .in("id", pendingIds);
    if (error) throw new Error(error.message);
  }
  revalidateAll(brokerId);
}
