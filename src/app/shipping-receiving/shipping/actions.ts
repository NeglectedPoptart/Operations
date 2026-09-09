"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";

function revalidateAll() {
  revalidatePath("/shipping-receiving/shipping");
  revalidatePath("/shipping-receiving/order-entry");
  revalidatePath("/shipping-receiving/inventory");
}

// Ships everything still outstanding on a sales order: for each line,
// deducts from that item's available lots oldest-received first (FIFO,
// matching the pallet-tag rotation the Inventory page is built around)
// until the line's ordered quantity is covered or stock runs out, then
// marks the order Shipped. A lot that hits zero on-hand flips to "shipped"
// status so Inventory stops offering it.
export async function shipSalesOrder(soId: string) {
  const supabase = await createClient();

  const { data: soLines, error: linesError } = await supabase.from("sr_so_lines").select("*").eq("so_id", soId);
  if (linesError) throw new Error(linesError.message);

  for (const line of soLines ?? []) {
    if (!line.item_id) continue;
    const remainingToShip = (line.qty_ordered ?? 0) - line.qty_shipped;
    if (remainingToShip <= 0) continue;

    const { data: lots, error: lotsError } = await supabase
      .from("sr_inventory_lots")
      .select("*")
      .eq("item_id", line.item_id)
      .eq("status", "available")
      .gt("qty_on_hand", 0)
      .order("received_date", { ascending: true });
    if (lotsError) throw new Error(lotsError.message);

    let toShip = remainingToShip;
    for (const lot of lots ?? []) {
      if (toShip <= 0) break;
      const onHand = lot.qty_on_hand ?? 0;
      const deduct = Math.min(toShip, onHand);
      const newQtyOnHand = onHand - deduct;
      const { error: lotUpdateError } = await supabase
        .from("sr_inventory_lots")
        .update({ qty_on_hand: newQtyOnHand, status: newQtyOnHand <= 0 ? "shipped" : "available" })
        .eq("id", lot.id);
      if (lotUpdateError) throw new Error(lotUpdateError.message);
      toShip -= deduct;
    }

    const actuallyShipped = remainingToShip - toShip;
    if (actuallyShipped > 0) {
      const { error: lineUpdateError } = await supabase
        .from("sr_so_lines")
        .update({ qty_shipped: line.qty_shipped + actuallyShipped })
        .eq("id", line.id);
      if (lineUpdateError) throw new Error(lineUpdateError.message);
    }
  }

  const { error: soUpdateError } = await supabase
    .from("sr_sales_orders")
    .update({ status: "shipped", ship_date: todayISO() })
    .eq("id", soId);
  if (soUpdateError) throw new Error(soUpdateError.message);

  revalidateAll();
}
