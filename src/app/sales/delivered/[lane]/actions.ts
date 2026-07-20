"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Lazily creates the message row on first save so a brand new lane (one
// that only exists as a fob_freight_rates row, with no seeded message yet)
// works without a migration - same "create on first use" pattern as
// createHub/createDestinationCity in the Logistics board actions.
export async function updateDeliveredMessage(lane: string, message: string) {
  const supabase = await createClient();
  const trimmed = message.trim();
  const { error } = await supabase
    .from("delivered_price_messages")
    .upsert({ lane: lane.toLowerCase(), message: trimmed === "" ? null : trimmed }, { onConflict: "lane" });
  if (error) throw new Error(error.message);
  revalidatePath(`/sales/delivered/${lane.toLowerCase()}`);
}
