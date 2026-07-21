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
