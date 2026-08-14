import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { ensureTodayFobItems } from "@/lib/fobDaily";
import { computeTodayVendorAverages } from "@/lib/fobVendorCompare";
import type { FobFreightRate, PriceSheetItem, Vendor } from "@/lib/types";
import FobPharrClient from "./FobPharrClient";

export const dynamic = "force-dynamic";

export default async function FobPharrPage() {
  const supabase = await createClient();
  const today = todayISO();

  const [items, { data: freightRates, error: freightError }, { data: priceSheetItems, error: priceSheetItemsError }, { data: vendors, error: vendorsError }] =
    await Promise.all([
      ensureTodayFobItems(supabase, today),
      supabase.from("fob_freight_rates").select("*").order("position", { ascending: true }),
      supabase.from("price_sheet_items").select("*"),
      supabase.from("vendors").select("*"),
    ]);

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
      initialDate={today}
      initialItems={items}
      initialFreightRates={(freightRates ?? []) as FobFreightRate[]}
      vendorAverages={Object.fromEntries(vendorAverages)}
    />
  );
}
