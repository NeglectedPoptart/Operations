"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedMxOrderRow } from "@/lib/mxOrdersParse";
import type { MxOrderStatus } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/mexico/orders");
}

function dedupeKey(r: {
  customer: string;
  commodity: string;
  delivery_date: string | null;
  loading_date: string | null;
  po_number: string | null;
  reference_number: string | null;
  qty: number | null;
}): string {
  return [
    r.customer.trim().toLowerCase(),
    r.commodity.trim().toLowerCase(),
    r.delivery_date ?? "",
    r.loading_date ?? "",
    (r.po_number ?? "").trim().toLowerCase(),
    (r.reference_number ?? "").trim().toLowerCase(),
    r.qty ?? "",
  ].join("|");
}

// Each customer's paste is their own new asks, not a full weekly snapshot
// (unlike Arrivals) - so this only skips rows that look like an exact
// re-paste of something already on the list, rather than replacing
// everything for that customer.
export async function importMxOrders(rows: ParsedMxOrderRow[]) {
  const supabase = await createClient();
  if (rows.length === 0) return [];

  const { data: existing, error: existingError } = await supabase
    .from("mx_orders")
    .select("customer, commodity, delivery_date, loading_date, po_number, reference_number, qty, position");
  if (existingError) throw new Error(existingError.message);

  const existingKeys = new Set((existing ?? []).map((r) => dedupeKey(r)));
  let nextPosition = (existing ?? []).reduce((max, r) => Math.max(max, r.position), 0) + 1;

  const seenInBatch = new Set<string>();
  const toInsert = [];
  for (const row of rows) {
    const key = dedupeKey(row);
    if (existingKeys.has(key) || seenInBatch.has(key)) continue;
    seenInBatch.add(key);
    toInsert.push({ ...row, position: nextPosition++ });
  }

  if (toInsert.length === 0) return [];

  const { data, error } = await supabase.from("mx_orders").insert(toInsert).select();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function addOrderRow(customer: string, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mx_orders")
    .insert({ customer, commodity: "", position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateOrderRow(
  id: string,
  patch: {
    customer?: string;
    commodity?: string;
    plu?: string | null;
    size?: string | null;
    coo?: string | null;
    grade?: string | null;
    qty?: number | null;
    qty_unit?: string | null;
    po_number?: string | null;
    reference_number?: string | null;
    loading_date?: string | null;
    delivery_date?: string | null;
    status?: MxOrderStatus;
    notes?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteOrderRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
