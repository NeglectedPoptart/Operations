// Warehouse > Repacks (migration 157): one record per repack job.

export interface RepackSupply {
  itemId: string;
  name: string;
  qty: number; // positive = how many were used
}

export interface Repack {
  id: string;
  repack_date: string;
  product_in: string;
  qty_in: number | null;
  product_out: string;
  qty_out: number | null;
  cartons_used: number | null;
  carton_type: string | null;
  cost: number | null;
  notes: string | null;
  created_by: string | null;
  // The Repack Inventory supplies this job used (they were taken off the shelf when it was saved).
  supplies: RepackSupply[];
}

export const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const qtyText = (n: number | null) => (n === null ? "" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));

// Cost per case coming out, when both are known.
export function costPerCase(r: Pick<Repack, "cost" | "qty_out">): number | null {
  return r.cost !== null && r.qty_out !== null && r.qty_out > 0 ? r.cost / r.qty_out : null;
}
