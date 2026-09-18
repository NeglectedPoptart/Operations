"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { MX_ARRIVAL_DAYS } from "@/lib/types";
import type { BroccoliCrownQuality, BroccoliIceQuality, BroccoliLotStatus, MxArrivalDay } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/warehouse/broccoli-inventory");
}

const DAY_INDEX = new Map(MX_ARRIVAL_DAYS.map((d, i) => [d.value, i]));

function parseQty(text: string | null): number | null {
  if (!text) return null;
  const n = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Pulls every lot of any item whose commodity is Broccoli from the
// Shipping/Receiving Inventory prototype ERP, upserting by source_lot_id so
// re-running this only refreshes qty/date on lots already pulled in rather
// than duplicating them (Crown/Ice condition and orders already set here
// are untouched either way).
export async function pullFromWarehouse() {
  const supabase = await createClient();

  const { data: items, error: itemsError } = await supabase.from("sr_items").select("id, label").ilike("commodity", "broccoli");
  if (itemsError) throw new Error(itemsError.message);
  const itemIds = (items ?? []).map((i) => i.id as string);
  if (itemIds.length === 0) return [];
  const labelByItemId = new Map((items ?? []).map((i) => [i.id as string, i.label as string | null]));

  const { data: lots, error: lotsError } = await supabase.from("sr_inventory_lots").select("*").in("item_id", itemIds);
  if (lotsError) throw new Error(lotsError.message);
  if (!lots || lots.length === 0) return [];

  const rows = lots.map((lot) => ({
    status: "on_floor" as BroccoliLotStatus,
    source: "warehouse" as const,
    source_lot_id: lot.id as string,
    lot_number: lot.lot_number as string | null,
    received_date: lot.received_date as string | null,
    label: labelByItemId.get(lot.item_id as string) ?? null,
    qty: lot.qty_on_hand as number | null,
  }));

  const { data, error } = await supabase.from("broccoli_lots").upsert(rows, { onConflict: "source_lot_id" }).select();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

// Pulls every Broccoli-section arrival for the given week from Mexico
// Arrivals, upserting by source_arrival_id (same idempotency reasoning as
// pullFromWarehouse). Any Mexico Order already linked to that arrival (via
// its "Send to Arrivals" action) is carried over as a pre-filled order line
// on the new lot, deduped by source_order_id.
export async function pullFromArrivals(weekStartDate: string) {
  const supabase = await createClient();

  const { data: arrivals, error: arrivalsError } = await supabase
    .from("mx_arrivals")
    .select("*, mx_grower_labels(name)")
    .eq("week_start_date", weekStartDate)
    .eq("section", "broccoli");
  if (arrivalsError) throw new Error(arrivalsError.message);
  if (!arrivals || arrivals.length === 0) return { lots: [], orders: [] };

  const rows = arrivals.map((a) => {
    const dayIndex = a.arrival_day ? DAY_INDEX.get(a.arrival_day as MxArrivalDay) : undefined;
    const receivedDate = dayIndex !== undefined ? addDays(weekStartDate, dayIndex) : null;
    const growerLabel = (a as { mx_grower_labels: { name: string } | null }).mx_grower_labels;
    return {
      status: "inbound" as BroccoliLotStatus,
      source: "arrivals" as const,
      source_arrival_id: a.id as string,
      lot_number: a.manifesto as string | null,
      received_date: receivedDate,
      label: growerLabel?.name ?? null,
      grade: a.grade as string | null,
      qty: parseQty(a.boxes_approx as string | null),
    };
  });

  const { data: lots, error: upsertError } = await supabase
    .from("broccoli_lots")
    .upsert(rows, { onConflict: "source_arrival_id" })
    .select();
  if (upsertError) throw new Error(upsertError.message);

  const lotIdByArrivalId = new Map((lots ?? []).map((l) => [l.source_arrival_id as string, l.id as string]));
  const arrivalIds = arrivals.map((a) => a.id as string);
  const { data: linkedOrders, error: ordersError } = await supabase
    .from("mx_orders")
    .select("*")
    .in("linked_arrival_id", arrivalIds);
  if (ordersError) throw new Error(ordersError.message);

  let orders: unknown[] = [];
  if (linkedOrders && linkedOrders.length > 0) {
    const orderRows = linkedOrders
      .map((o) => {
        const lotId = lotIdByArrivalId.get(o.linked_arrival_id as string);
        if (!lotId) return null;
        return {
          lot_id: lotId,
          source_order_id: o.id as string,
          order_number: (o.po_number as string | null) ?? (o.reference_number as string | null),
          qty: o.qty as number | null,
          notes: o.customer ? `From order: ${o.customer}` : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (orderRows.length > 0) {
      const { data, error } = await supabase.from("broccoli_orders").upsert(orderRows, { onConflict: "source_order_id" }).select();
      if (error) throw new Error(error.message);
      orders = data ?? [];
    }
  }

  revalidateAll();
  return { lots: lots ?? [], orders };
}

export async function moveLotToFloor(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("broccoli_lots").update({ status: "on_floor" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addLot(status: BroccoliLotStatus, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("broccoli_lots")
    .insert({ status, source: "manual", position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateLot(
  id: string,
  patch: {
    lot_number?: string | null;
    received_date?: string | null;
    label?: string | null;
    grade?: string | null;
    qty?: number | null;
    crown_quality?: BroccoliCrownQuality | null;
    ice_quality?: BroccoliIceQuality | null;
    notes?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("broccoli_lots").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteLot(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("broccoli_lots").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addOrder(lotId: string, nextPosition: number, orderNumber: string, qty: number | null, notes: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("broccoli_orders")
    .insert({ lot_id: lotId, position: nextPosition, order_number: orderNumber || null, qty, notes: notes || null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateOrder(id: string, patch: { order_number?: string | null; qty?: number | null; notes?: string | null }) {
  const supabase = await createClient();
  const { error } = await supabase.from("broccoli_orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteOrder(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("broccoli_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
