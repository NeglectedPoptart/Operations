import { createClient } from "@/lib/supabase/server";
import type { FobFreightRate, FobItem } from "@/lib/types";
import FobPharrClient from "./FobPharrClient";

export const dynamic = "force-dynamic";

export default async function FobPharrPage() {
  const supabase = await createClient();

  const [
    { data: items, error: itemsError },
    { data: freightRates, error: freightError },
  ] = await Promise.all([
    supabase.from("fob_items").select("*").order("section", { ascending: true }).order("position", { ascending: true }),
    supabase.from("fob_freight_rates").select("*").order("position", { ascending: true }),
  ]);

  if (itemsError) {
    return <p className="text-red-600">Failed to load FOB Pricing: {itemsError.message}</p>;
  }
  if (freightError) {
    return <p className="text-red-600">Failed to load freight rates: {freightError.message}</p>;
  }

  return (
    <FobPharrClient
      initialItems={(items ?? []) as FobItem[]}
      initialFreightRates={(freightRates ?? []) as FobFreightRate[]}
    />
  );
}
