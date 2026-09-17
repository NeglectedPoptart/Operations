import { createClient } from "@/lib/supabase/server";
import type {
  SrInventoryLot,
  SrItem,
  SrPoLine,
  SrPurchaseOrder,
  SrSalesOrder,
  SrSoLine,
  SrVendor,
} from "@/lib/types";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();

  const [
    { data: items, error: itemsError },
    { data: vendors, error: vendorsError },
    { data: lots, error: lotsError },
    { data: purchaseOrders, error: posError },
    { data: poLines, error: poLinesError },
    { data: salesOrders, error: sosError },
    { data: soLines, error: soLinesError },
  ] = await Promise.all([
    supabase.from("sr_items").select("*").order("name", { ascending: true }),
    supabase.from("sr_vendors").select("*").order("name", { ascending: true }),
    supabase.from("sr_inventory_lots").select("*").order("received_date", { ascending: false }),
    supabase.from("sr_purchase_orders").select("*"),
    supabase.from("sr_po_lines").select("*"),
    supabase.from("sr_sales_orders").select("*"),
    supabase.from("sr_so_lines").select("*"),
  ]);

  const error = itemsError ?? vendorsError ?? lotsError ?? posError ?? poLinesError ?? sosError ?? soLinesError;
  if (error) {
    return <p className="text-red-600">Failed to load Inventory: {error.message}</p>;
  }

  return (
    <InventoryClient
      initialItems={(items ?? []) as SrItem[]}
      initialVendors={(vendors ?? []) as SrVendor[]}
      initialLots={(lots ?? []) as SrInventoryLot[]}
      purchaseOrders={(purchaseOrders ?? []) as SrPurchaseOrder[]}
      poLines={(poLines ?? []) as SrPoLine[]}
      salesOrders={(salesOrders ?? []) as SrSalesOrder[]}
      soLines={(soLines ?? []) as SrSoLine[]}
    />
  );
}
