"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function upsertRateEntry(
  laneId: string,
  brokerId: string,
  weekStartDate: string,
  rate: number | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("broker_rate_entries")
    .upsert(
      { lane_id: laneId, broker_id: brokerId, week_start_date: weekStartDate, rate },
      { onConflict: "lane_id,broker_id,week_start_date" },
    );
  if (error) throw new Error(error.message);
  revalidatePath("/logistics/rates");
  revalidatePath("/");
}

export async function createLane(fromHub: string, destination: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lanes")
    .insert({ from_hub: fromHub, destination })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/logistics/rates");
  return data;
}

export async function createBroker(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("brokers").insert({ name }).select().single();
  if (error) throw new Error(error.message);
  revalidatePath("/logistics/rates");
  revalidatePath("/logistics/board");
  return data;
}

export async function deleteLane(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("lanes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/logistics/rates");
  revalidatePath("/");
}

export async function submitWeek(weekStartDate: string, submittedByEmail: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("rate_submissions")
    .upsert(
      { week_start_date: weekStartDate, submitted_by: submittedByEmail, submitted_at: new Date().toISOString() },
      { onConflict: "week_start_date" },
    );
  if (error) throw new Error(error.message);
  revalidatePath("/logistics/rates");
  revalidatePath("/");
}

export async function unlockWeek(weekStartDate: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("rate_submissions").delete().eq("week_start_date", weekStartDate);
  if (error) throw new Error(error.message);
  revalidatePath("/logistics/rates");
  revalidatePath("/");
}
