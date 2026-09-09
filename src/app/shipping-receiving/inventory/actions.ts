"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SrLotStatus } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/shipping-receiving/inventory");
  revalidatePath("/shipping-receiving/po-entry");
  revalidatePath("/shipping-receiving/order-entry");
  revalidatePath("/shipping-receiving/shipping");
}

// Items ---------------------------------------------------------------------------

export async function createItem(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sr_items").insert({ name }).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateItem(
  id: string,
  patch: { name?: string; pack_style?: string | null; size?: string | null; unit?: string | null; category?: string | null; active?: boolean },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Vendors -------------------------------------------------------------------------

export async function createVendor(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sr_vendors").insert({ name }).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateVendor(
  id: string,
  patch: { name?: string; contact_name?: string | null; phone?: string | null; email?: string | null; notes?: string | null },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_vendors").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteVendor(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_vendors").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Inventory Lots ------------------------------------------------------------------

export async function addLot() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sr_inventory_lots").insert({}).select().single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateLot(
  id: string,
  patch: {
    item_id?: string | null;
    lot_number?: string | null;
    vendor_id?: string | null;
    received_date?: string | null;
    qty_received?: number | null;
    qty_on_hand?: number | null;
    unit_cost?: number | null;
    warehouse?: string | null;
    status?: SrLotStatus;
    notes?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_inventory_lots").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteLot(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sr_inventory_lots").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
