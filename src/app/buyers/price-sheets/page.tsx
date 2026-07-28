import { createClient } from "@/lib/supabase/server";
import type { PriceSheetItem, Vendor } from "@/lib/types";
import PriceSheetsClient from "./PriceSheetsClient";

export const dynamic = "force-dynamic";

export default async function PriceSheetsPage() {
  const supabase = await createClient();

  const [{ data: vendors, error: vendorsError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from("vendors").select("*").order("position", { ascending: true }).order("name", { ascending: true }),
    supabase.from("price_sheet_items").select("*").order("position", { ascending: true }),
  ]);

  if (vendorsError) {
    return <p className="text-red-600">Failed to load vendors: {vendorsError.message}</p>;
  }
  if (itemsError) {
    return <p className="text-red-600">Failed to load price sheets: {itemsError.message}</p>;
  }

  return (
    <PriceSheetsClient
      initialVendors={(vendors ?? []) as Vendor[]}
      initialItems={(items ?? []) as PriceSheetItem[]}
    />
  );
}
