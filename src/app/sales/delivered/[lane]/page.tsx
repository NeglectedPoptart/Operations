import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { ensureTodayFobItems } from "@/lib/fobDaily";
import type { DeliveredPriceMessage, FobFreightRate } from "@/lib/types";
import DeliveredPricingClient from "./DeliveredPricingClient";

export const dynamic = "force-dynamic";

const DEFAULT_MESSAGE =
  "Please find our current price sheet attached for your review, If you have any questions or would like to discuss volume pricing or specific product needs please let us know!";

export default async function DeliveredPricingPage({ params }: { params: Promise<{ lane: string }> }) {
  const { lane } = await params;
  const supabase = await createClient();

  const [items, { data: freightRates, error: freightError }, { data: messageRow, error: messageError }] = await Promise.all([
    ensureTodayFobItems(supabase, todayISO()),
    supabase.from("fob_freight_rates").select("*").ilike("lane", lane).maybeSingle(),
    supabase.from("delivered_price_messages").select("*").eq("lane", lane.toLowerCase()).maybeSingle(),
  ]);

  if (freightError) {
    return <p className="text-red-600">Failed to load freight rates: {freightError.message}</p>;
  }
  if (messageError) {
    return <p className="text-red-600">Failed to load the sheet message: {messageError.message}</p>;
  }
  if (!freightRates) {
    return (
      <p className="text-black/60 dark:text-white/60">
        No freight rate found for &quot;{lane}&quot; - add a lane matching this name on the FOB Pricing page&apos;s
        Freight Rates table first.
      </p>
    );
  }

  return (
    <DeliveredPricingClient
      lane={lane}
      items={items}
      freightRate={freightRates as FobFreightRate}
      initialMessage={(messageRow as DeliveredPriceMessage | null)?.message ?? DEFAULT_MESSAGE}
    />
  );
}
