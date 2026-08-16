"use server";

import { revalidatePath } from "next/cache";
import { sendNotification } from "@/app/management/notifications/actions";
import { createClient } from "@/lib/supabase/server";
import type { ApPayListItem } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/accounting/ap");
  revalidatePath("/accounting/pay-lists");
}

// Builds a pay list from a set of already-open AP payables (chosen via the
// "Add to Pay List" checkbox on the AP page), snapshotting each one's
// fields rather than just storing a reference - see migration_055 for why.
// Notifying recipients reuses the existing page-notification system
// (sendNotification), just called once per selected person since that
// action only supports a single "user" target at a time.
export async function createPayList(
  title: string,
  payableIds: string[],
  recipientUserIds: string[],
): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("Enter a title for the pay list.");
  if (payableIds.length === 0) throw new Error("Add at least one payable to the pay list.");

  const { data: payables, error: payablesError } = await supabase
    .from("ap_payables")
    .select("*, ap_vendors(vendor_code, vendor_name)")
    .in("id", payableIds);
  if (payablesError) throw new Error(payablesError.message);
  if (!payables || payables.length === 0) throw new Error("Couldn't find those payables - try refreshing the page.");

  const { data: payList, error: payListError } = await supabase
    .from("ap_pay_lists")
    .insert({ title: trimmedTitle, created_by: user.id })
    .select("id")
    .single();
  if (payListError || !payList) throw new Error(payListError?.message ?? "Failed to create pay list.");

  const items = payables.map((p, i) => ({
    pay_list_id: payList.id,
    ap_payable_id: p.id,
    vendor_code: p.ap_vendors?.vendor_code ?? "",
    vendor_name: p.ap_vendors?.vendor_name ?? "",
    gl_account_label: p.gl_account_label,
    document: p.document,
    doc_date: p.doc_date,
    type: p.type,
    concept: p.concept,
    balance: p.balance,
    position: i,
  }));
  const { error: itemsError } = await supabase.from("ap_pay_list_items").insert(items);
  if (itemsError) throw new Error(itemsError.message);

  for (const recipientId of recipientUserIds) {
    await sendNotification({
      tabLabel: "Accounting",
      subtabLabel: `Pay List: ${trimmedTitle}`,
      pagePath: "/accounting/pay-lists",
      message: `New pay list submitted with ${items.length} item${items.length === 1 ? "" : "s"} - please review.`,
      updatedBy: null,
      lastEditedAt: new Date().toISOString(),
      targetType: "user",
      targetUserId: recipientId,
      targetRole: null,
    }).catch(() => {});
  }

  revalidateAll();
  return { id: payList.id };
}

export async function updateApPayListItem(
  id: string,
  patch: Partial<Pick<ApPayListItem, "status" | "notes">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("ap_pay_list_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
