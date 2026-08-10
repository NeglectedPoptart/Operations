"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// The "broker carrier manages own rates" RLS policy (migration 049) is what
// actually enforces a carrier can only ever touch its own broker_id - a
// mismatched id here just gets rejected by Postgres rather than trusted
// client-side, same reasoning as updateUserRole's admin-only check.
export async function upsertMyRate(brokerId: string, laneId: string, weekStartDate: string, rate: number | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("broker_rate_entries")
    .upsert(
      { lane_id: laneId, broker_id: brokerId, week_start_date: weekStartDate, rate },
      { onConflict: "lane_id,broker_id,week_start_date" },
    );
  if (error) throw new Error(error.message);
  revalidatePath("/logistics/broker-rate-entry");
  revalidatePath("/logistics/rates");
}
