import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { computeTodayVendorAverages } from "@/lib/fobVendorCompare";
import type { FobFreightRate, FobItem, PriceSheetItem, Vendor } from "@/lib/types";
import FobPharrClient from "./FobPharrClient";

export const dynamic = "force-dynamic";

export default async function FobPharrPage() {
  const supabase = await createClient();

  const [
    { data: items, error: itemsError },
    { data: freightRates, error: freightError },
    { data: priceSheetItems, error: priceSheetItemsError },
    { data: vendors, error: vendorsError },
  ] = await Promise.all([
    supabase.from("fob_items").select("*").order("section", { ascending: true }).order("position", { ascending: true }),
    supabase.from("fob_freight_rates").select("*").order("position", { ascending: true }),
    supabase.from("price_sheet_items").select("*"),
    supabase.from("vendors").select("*"),
  ]);

  if (itemsError) {
    return <p className="text-red-600">Failed to load FOB Pricing: {itemsError.message}</p>;
  }
  if (freightError) {
    return <p className="text-red-600">Failed to load freight rates: {freightError.message}</p>;
  }
  if (priceSheetItemsError) {
    return <p className="text-red-600">Failed to load vendor price sheets: {priceSheetItemsError.message}</p>;
  }
  if (vendorsError) {
    return <p className="text-red-600">Failed to load vendors: {vendorsError.message}</p>;
  }

  const vendorAverages = computeTodayVendorAverages(
    (priceSheetItems ?? []) as PriceSheetItem[],
    (vendors ?? []) as Vendor[],
    todayISO(),
  );

  return (
    <FobPharrClient
      initialItems={(items ?? []) as FobItem[]}
      initialFreightRates={(freightRates ?? []) as FobFreightRate[]}
      vendorAverages={Object.fromEntries(vendorAverages)}
    />
  );
}
