import { createClient } from "@/lib/supabase/server";
import type { PriceSheetItem, Vendor, VendorCommodity } from "@/lib/types";
import VendorCatalogClient from "./VendorCatalogClient";

export const dynamic = "force-dynamic";

export default async function VendorCatalogPage() {
  const supabase = await createClient();

  const [
    { data: vendors, error: vendorsError },
    { data: commodities, error: commoditiesError },
    { data: items, error: itemsError },
  ] = await Promise.all([
    supabase.from("vendors").select("*").order("name", { ascending: true }),
    supabase.from("vendor_commodities").select("*"),
    supabase.from("price_sheet_items").select("*"),
  ]);

  if (vendorsError) {
    return <p className="text-red-600">Failed to load vendors: {vendorsError.message}</p>;
  }
  if (commoditiesError) {
    return <p className="text-red-600">Failed to load vendor commodities: {commoditiesError.message}</p>;
  }
  if (itemsError) {
    return <p className="text-red-600">Failed to load price sheets: {itemsError.message}</p>;
  }

  return (
    <VendorCatalogClient
      vendors={(vendors ?? []) as Vendor[]}
      commodities={(commodities ?? []) as VendorCommodity[]}
      items={(items ?? []) as PriceSheetItem[]}
    />
  );
}
