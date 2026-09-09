"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { SrPoStatus } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/shipping-receiving/po-entry");
  revalidatePath("/shipping-receiving/inventory");
}

export async function createPurchaseOrder(poNumber: string, vendorId: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sr_purchase_orders")
    .insert({ po_number: poNumber, vendor_id: vendorId, order_date: todayISO() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updatePurchaseOrder(
  id: string,
  patch: { po_number?: string; vendor_id?: string | null; order_date?: string | null; status?: SrPoStatus; notes?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_purchase_orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deletePurchaseOrder(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_purchase_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addPoLine(poId: string, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sr_po_lines")
    .insert({ po_id: poId, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updatePoLine(id: string, patch: { item_id?: string | null; qty_ordered?: number | null; unit_cost?: number | null }) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_po_lines").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deletePoLine(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_po_lines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// The one action that actually connects PO Entry to Inventory: receiving a
// line creates a real inventory lot (pallet-tag style) for whatever quantity
// just arrived - not the whole line at once, so a line can be received in
// multiple partial shipments over time - then bumps the line's running
// qty_received and recomputes the PO's overall status from all its lines.
export async function receivePoLine(
  lineId: string,
  poId: string,
  itemId: string | null,
  vendorId: string | null,
  qty: number,
  unitCost: number | null,
  lotNumber: string,
  warehouse: string,
) {
  const supabase = await createClient();

  const { error: lotError } = await supabase.from("sr_inventory_lots").insert({
    item_id: itemId,
    lot_number: lotNumber || null,
    vendor_id: vendorId,
    po_id: poId,
    received_date: todayISO(),
    qty_received: qty,
    qty_on_hand: qty,
    unit_cost: unitCost,
    warehouse: warehouse || null,
    status: "available",
  });
  if (lotError) throw new Error(lotError.message);

  const { data: line, error: lineFetchError } = await supabase
    .from("sr_po_lines")
    .select("qty_received")
    .eq("id", lineId)
    .single();
  if (lineFetchError) throw new Error(lineFetchError.message);
  const newQtyReceived = (line.qty_received ?? 0) + qty;
  const { error: lineUpdateError } = await supabase.from("sr_po_lines").update({ qty_received: newQtyReceived }).eq("id", lineId);
  if (lineUpdateError) throw new Error(lineUpdateError.message);

  const { data: allLines, error: allLinesError } = await supabase
    .from("sr_po_lines")
    .select("qty_ordered, qty_received")
    .eq("po_id", poId);
  if (allLinesError) throw new Error(allLinesError.message);
  const totalOrdered = (allLines ?? []).reduce((s, l) => s + (l.qty_ordered ?? 0), 0);
  const totalReceived = (allLines ?? []).reduce((s, l) => s + (l.qty_received ?? 0), 0);
  let status: SrPoStatus = "open";
  if (totalOrdered > 0 && totalReceived >= totalOrdered) status = "received";
  else if (totalReceived > 0) status = "partial";
  const { error: poUpdateError } = await supabase.from("sr_purchase_orders").update({ status }).eq("id", poId);
  if (poUpdateError) throw new Error(poUpdateError.message);

  revalidateAll();
  return { newQtyReceived, status };
}
