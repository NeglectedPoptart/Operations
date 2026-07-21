"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const LANE = "east-coast";

// Same lazy-create-on-first-save pattern as the single-lane Delivered
// Pricing pages (see src/app/sales/delivered/[lane]/actions.ts).
export async function updateEastCoastMessage(message: string) {
  const supabase = await createClient();
  const trimmed = message.trim();
  const { error } = await supabase
    .from("delivered_price_messages")
    .upsert({ lane: LANE, message: trimmed === "" ? null : trimmed }, { onConflict: "lane" });
  if (error) throw new Error(error.message);
  revalidatePath(`/sales/delivered/${LANE}`);
}
