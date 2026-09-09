import { createClient } from "@/lib/supabase/server";
import type { SrInventoryLot, SrItem, SrVendor } from "@/lib/types";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();

  const [
    { data: items, error: itemsError },
    { data: vendors, error: vendorsError },
    { data: lots, error: lotsError },
  ] = await Promise.all([
    supabase.from("sr_items").select("*").order("name", { ascending: true }),
    supabase.from("sr_vendors").select("*").order("name", { ascending: true }),
    supabase.from("sr_inventory_lots").select("*").order("received_date", { ascending: false }),
  ]);

  const error = itemsError ?? vendorsError ?? lotsError;
  if (error) {
    return <p className="text-red-600">Failed to load Inventory: {error.message}</p>;
  }

  return (
    <InventoryClient
      initialItems={(items ?? []) as SrItem[]}
      initialVendors={(vendors ?? []) as SrVendor[]}
      initialLots={(lots ?? []) as SrInventoryLot[]}
    />
  );
}
