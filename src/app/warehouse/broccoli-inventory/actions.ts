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

// Cold Inventory's own "commodity" text is a full free-text description
// like "BROCCOLI FUCHOY GREEN #2" - the trailing "#1"/"#2" is the same Grade
// convention used everywhere else in this session, so it's worth pulling
// out; the rest doesn't map cleanly to Label, so it's kept verbatim in notes
// rather than guessed at.
function gradeFromCommodityText(commodity: string): string | null {
  const match = commodity.match(/#(\d+)\s*$/);
  return match ? `#${match[1]}` : null;
}

// Pulls every Cold Inventory row whose commodity mentions Broccoli - Cold
// Inventory (not the Shipping/Receiving prototype ERP) turned out to be the
// warehouse's actual day-to-day floor tracking. Splits into insert (brand
// new lots, which also get label/grade/notes seeded) vs update (lots
// already pulled in before, which only get qty/lot_number refreshed) so a
// second pull doesn't clobber Crown/Ice condition, or a grade/notes
// correction the user already made by hand.
export async function pullFromWarehouse() {
  const supabase = await createClient();

  const { data: items, error: itemsError } = await supabase.from("cold_inventory_items").select("*").ilike("commodity", "%broccoli%");
  if (itemsError) throw new Error(itemsError.message);
  if (!items || items.length === 0) return [];

  const { data: existingLots, error: existingError } = await supabase
    .from("broccoli_lots")
    .select("id, source_lot_id")
    .in(
      "source_lot_id",
      items.map((i) => i.id as string),
    );
  if (existingError) throw new Error(existingError.message);
  const existingBySourceId = new Map((existingLots ?? []).map((l) => [l.source_lot_id as string, l.id as string]));

  const newItems = items.filter((i) => !existingBySourceId.has(i.id as string));
  const existingItems = items.filter((i) => existingBySourceId.has(i.id as string));

  const results: unknown[] = [];

  if (newItems.length > 0) {
    const insertRows = newItems.map((item) => ({
      status: "on_floor" as BroccoliLotStatus,
      source: "warehouse" as const,
      source_lot_id: item.id as string,
      lot_number: item.manifest as string,
      qty: item.qty as number,
      grade: gradeFromCommodityText(item.commodity as string),
      notes: `Cold Inventory: ${item.commodity} (size ${item.size})`,
    }));
    const { data, error } = await supabase.from("broccoli_lots").insert(insertRows).select();
    if (error) throw new Error(error.message);
    results.push(...(data ?? []));
  }

  if (existingItems.length > 0) {
    const updateRows = existingItems.map((item) => ({
      source_lot_id: item.id as string,
      lot_number: item.manifest as string,
      qty: item.qty as number,
    }));
    const { data, error } = await supabase.from("broccoli_lots").upsert(updateRows, { onConflict: "source_lot_id" }).select();
    if (error) throw new Error(error.message);
    results.push(...(data ?? []));
  }

  revalidateAll();
  return results;
}

// Pulls every Broccoli-section arrival for the given week from Mexico
// Arrivals. Same insert-vs-update split as pullFromWarehouse: a lot already
// pulled in only gets qty/lot_number/received_date refreshed, not
// label/grade (in case corrected by hand since). Any Mexico Order already
// linked to that arrival (via its "Send to Arrivals" action) is carried
// over as a pre-filled order line on the new lot, deduped by
// source_order_id.
export async function pullFromArrivals(weekStartDate: string) {
  const supabase = await createClient();

  const { data: arrivals, error: arrivalsError } = await supabase
    .from("mx_arrivals")
    .select("*, mx_grower_labels(name)")
    .eq("week_start_date", weekStartDate)
    .eq("section", "broccoli");
  if (arrivalsError) throw new Error(arrivalsError.message);
  if (!arrivals || arrivals.length === 0) return { lots: [], orders: [] };

  const { data: existingLots, error: existingError } = await supabase
    .from("broccoli_lots")
    .select("id, source_arrival_id")
    .in(
      "source_arrival_id",
      arrivals.map((a) => a.id as string),
    );
  if (existingError) throw new Error(existingError.message);
  const existingBySourceId = new Map((existingLots ?? []).map((l) => [l.source_arrival_id as string, l.id as string]));

  function fieldsFor(a: Record<string, unknown>) {
    const dayIndex = a.arrival_day ? DAY_INDEX.get(a.arrival_day as MxArrivalDay) : undefined;
    const receivedDate = dayIndex !== undefined ? addDays(weekStartDate, dayIndex) : null;
    return {
      lot_number: a.manifesto as string | null,
      received_date: receivedDate,
      qty: parseQty(a.boxes_approx as string | null),
    };
  }

  const newArrivals = arrivals.filter((a) => !existingBySourceId.has(a.id as string));
  const existingArrivals = arrivals.filter((a) => existingBySourceId.has(a.id as string));

  const lots: unknown[] = [];

  if (newArrivals.length > 0) {
    const insertRows = newArrivals.map((a) => {
      const growerLabel = (a as { mx_grower_labels: { name: string } | null }).mx_grower_labels;
      return {
        status: "inbound" as BroccoliLotStatus,
        source: "arrivals" as const,
        source_arrival_id: a.id as string,
        label: growerLabel?.name ?? null,
        grade: a.grade as string | null,
        ...fieldsFor(a),
      };
    });
    const { data, error } = await supabase.from("broccoli_lots").insert(insertRows).select();
    if (error) throw new Error(error.message);
    lots.push(...(data ?? []));
  }

  if (existingArrivals.length > 0) {
    const updateRows = existingArrivals.map((a) => ({ source_arrival_id: a.id as string, ...fieldsFor(a) }));
    const { data, error } = await supabase.from("broccoli_lots").upsert(updateRows, { onConflict: "source_arrival_id" }).select();
    if (error) throw new Error(error.message);
    lots.push(...(data ?? []));
  }

  const lotIdByArrivalId = new Map((lots as { id: string; source_arrival_id: string | null }[]).map((l) => [l.source_arrival_id as string, l.id]));
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
  return { lots, orders };
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
