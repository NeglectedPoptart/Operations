import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repack, RepackSupply } from "./repacks";

// Loads repacks (newest first) with the Repack Inventory supplies each one used.
// Used by Warehouse > Repacks and the Weekly Company Call. `since` limits it to repacks on or
// after that date. Returns an error message instead of throwing when the table is not set up yet
// (migration 157), so the pages that show repacks as one section among others keep working.
export async function loadRepacks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  since?: string,
): Promise<{ repacks: Repack[] } | { error: string }> {
  let query = supabase.from("repacks").select("*").order("repack_date", { ascending: false }).order("created_at", { ascending: false });
  if (since) query = query.gte("repack_date", since);
  const { data, error } = await query;
  if (error) return { error: error.message };

  const ids = (data ?? []).map((r) => r.id as string);
  const byRepack = new Map<string, RepackSupply[]>();
  if (ids.length > 0) {
    const { data: adj } = await supabase.from("repack_adjustments").select("repack_id, item_id, qty, repack_items(name)").in("repack_id", ids);
    for (const a of (adj ?? []) as unknown as { repack_id: string; item_id: string; qty: number; repack_items: { name: string } | null }[]) {
      const list = byRepack.get(a.repack_id) ?? [];
      list.push({ itemId: a.item_id, name: a.repack_items?.name ?? "?", qty: Math.abs(Number(a.qty)) });
      byRepack.set(a.repack_id, list);
    }
  }

  return {
    repacks: (data ?? []).map((r) => ({
      id: r.id as string,
      repack_date: r.repack_date as string,
      product_in: (r.product_in as string) ?? "",
      qty_in: r.qty_in === null ? null : Number(r.qty_in),
      product_out: (r.product_out as string) ?? "",
      qty_out: r.qty_out === null ? null : Number(r.qty_out),
      cartons_used: r.cartons_used === null ? null : Number(r.cartons_used),
      carton_type: (r.carton_type as string | null) ?? null,
      cost: r.cost === null ? null : Number(r.cost),
      notes: (r.notes as string | null) ?? null,
      created_by: (r.created_by as string | null) ?? null,
      supplies: byRepack.get(r.id as string) ?? [],
    })),
  };
}
