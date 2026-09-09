import { createClient } from "@/lib/supabase/server";
import type { SrItem, SrPoLine, SrPurchaseOrder, SrVendor } from "@/lib/types";
import PoEntryClient from "./PoEntryClient";

export const dynamic = "force-dynamic";

export default async function PoEntryPage() {
  const supabase = await createClient();

  const [
    { data: purchaseOrders, error: poError },
    { data: lines, error: linesError },
    { data: items, error: itemsError },
    { data: vendors, error: vendorsError },
  ] = await Promise.all([
    supabase.from("sr_purchase_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("sr_po_lines").select("*").order("position", { ascending: true }),
    supabase.from("sr_items").select("*").order("name", { ascending: true }),
    supabase.from("sr_vendors").select("*").order("name", { ascending: true }),
  ]);

  const error = poError ?? linesError ?? itemsError ?? vendorsError;
  if (error) {
    return <p className="text-red-600">Failed to load PO Entry: {error.message}</p>;
  }

  return (
    <PoEntryClient
      initialPurchaseOrders={(purchaseOrders ?? []) as SrPurchaseOrder[]}
      initialLines={(lines ?? []) as SrPoLine[]}
      items={(items ?? []) as SrItem[]}
      vendors={(vendors ?? []) as SrVendor[]}
    />
  );
}
