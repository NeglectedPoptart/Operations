"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedMxOrderRow } from "@/lib/mxOrdersParse";
import type { MxArrivalDay, MxArrivalSection, MxOrderStatus } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function revalidateAll() {
  revalidatePath("/mexico/orders");
  revalidatePath("/mexico/arrivals");
}

// Finds an existing row by name (case-insensitive) in one of Arrivals'
// lookup tables, creating it if it doesn't exist yet - same "find or
// create" convention as the Arrivals paste importer, duplicated here rather
// than imported since it's the only piece of that file this needs.
async function resolveByName(
  supabase: SupabaseClient,
  table: "mx_growers" | "mx_grower_labels" | "mx_commodities",
  name: string,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select("id, name")
    .ilike("name", trimmed)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.id as string;

  const { data: created, error: createError } = await supabase.from(table).insert({ name: trimmed }).select("id").single();
  if (createError) throw new Error(createError.message);
  return created.id as string;
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

// Creates the Arrivals row that's sourcing a fulfilled order - grower/
// label/commodity resolved by name (creating whichever doesn't exist yet),
// the order's own customer/PO/ref folded into Notes so the arrival stays
// traceable back to what asked for it. Stores the new arrival's id on the
// order so it can't be sent twice; also (idempotently) marks the order
// fulfilled, in case this was reached without going through the status
// pill first.
export async function sendOrderToArrivals(
  id: string,
  arrivalInput: {
    weekStartDate: string;
    section: MxArrivalSection;
    growerName: string;
    labelName: string;
    commodityName: string;
    boxesApprox: string;
    priceToGrower: string;
    manifesto: string;
    arrivalDay: MxArrivalDay | null;
    orderTag: string;
  },
) {
  const supabase = await createClient();

  const [growerId, labelId, commodityId] = await Promise.all([
    resolveByName(supabase, "mx_growers", arrivalInput.growerName),
    resolveByName(supabase, "mx_grower_labels", arrivalInput.labelName),
    resolveByName(supabase, "mx_commodities", arrivalInput.commodityName),
  ]);

  const { data: existingArrivals, error: existingError } = await supabase
    .from("mx_arrivals")
    .select("position")
    .eq("week_start_date", arrivalInput.weekStartDate)
    .eq("section", arrivalInput.section);
  if (existingError) throw new Error(existingError.message);
  const nextPosition = (existingArrivals ?? []).reduce((max, r) => Math.max(max, r.position), 0) + 1;

  const { data: arrival, error: insertError } = await supabase
    .from("mx_arrivals")
    .insert({
      week_start_date: arrivalInput.weekStartDate,
      section: arrivalInput.section,
      position: nextPosition,
      grower_id: growerId,
      label_id: labelId,
      commodity_1_id: commodityId,
      boxes_approx: arrivalInput.boxesApprox || null,
      price_to_grower: arrivalInput.priceToGrower || null,
      manifesto: arrivalInput.manifesto || null,
      arrival_day: arrivalInput.arrivalDay,
      notes: arrivalInput.orderTag || null,
    })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await supabase
    .from("mx_orders")
    .update({ status: "fulfilled", linked_arrival_id: arrival.id })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

  revalidateAll();
  return arrival;
}
