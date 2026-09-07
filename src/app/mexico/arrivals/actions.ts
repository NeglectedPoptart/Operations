"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MxArrivalDay, MxArrivalSection, MxTruckPosition } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/mexico/arrivals");
}

export async function addArrivalRow(weekStartDate: string, section: MxArrivalSection, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mx_arrivals")
    .insert({ week_start_date: weekStartDate, section, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateArrivalRow(
  id: string,
  patch: {
    grower_id?: string | null;
    label_id?: string | null;
    commodity_1_id?: string | null;
    commodity_2_id?: string | null;
    commodity_3_id?: string | null;
    commodity_4_id?: string | null;
    boxes_approx?: string | null;
    price_to_grower?: string | null;
    manifesto?: string | null;
    arrival_day?: MxArrivalDay | null;
    notes?: string | null;
    truck_group?: string | null;
    truck_position?: MxTruckPosition | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_arrivals").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteArrivalRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_arrivals").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
