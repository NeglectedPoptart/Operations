import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { ensureTodayFobItems } from "@/lib/fobDaily";
import type { DeliveredPriceMessage, FobFreightRate } from "@/lib/types";
import EastCoastPricingClient from "./EastCoastPricingClient";

export const dynamic = "force-dynamic";

const LANES = ["NC", "MD", "PA", "NJ"];
const DEFAULT_MESSAGE =
  "Please find our current price sheet attached for your review, If you have any questions or would like to discuss volume pricing or specific product needs please let us know!";

export default async function EastCoastPricingPage() {
  const supabase = await createClient();

  const [items, { data: freightRates, error: freightError }, { data: messageRow, error: messageError }] = await Promise.all([
    ensureTodayFobItems(supabase, todayISO()),
    supabase.from("fob_freight_rates").select("*").in("lane", LANES),
    supabase.from("delivered_price_messages").select("*").eq("lane", "east-coast").maybeSingle(),
  ]);

  if (freightError) {
    return <p className="text-red-600">Failed to load freight rates: {freightError.message}</p>;
  }
  if (messageError) {
    return <p className="text-red-600">Failed to load the sheet message: {messageError.message}</p>;
  }

  const rates = (freightRates ?? []) as FobFreightRate[];
  const missing = LANES.filter((lane) => !rates.some((r) => r.lane.toUpperCase() === lane));
  if (missing.length > 0) {
    return (
      <p className="text-black/60 dark:text-white/60">
        Missing a freight rate for: {missing.join(", ")} - add these lanes on the FOB Pricing page&apos;s Freight
        Rates table first.
      </p>
    );
  }

  return (
    <EastCoastPricingClient
      items={items}
      lanes={LANES}
      freightRates={rates}
      initialMessage={(messageRow as DeliveredPriceMessage | null)?.message ?? DEFAULT_MESSAGE}
    />
  );
}
