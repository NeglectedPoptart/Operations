import { createClient } from "@/lib/supabase/server";
import type { RepackAdjustment, RepackItem } from "@/lib/types";
import RepackInventoryClient from "./RepackInventoryClient";

export const dynamic = "force-dynamic";

export default async function RepackInventoryPage() {
  const supabase = await createClient();

  const [{ data: items, error: itemsError }, { data: adjustments, error: adjustmentsError }] = await Promise.all([
    supabase.from("repack_items").select("*").order("position", { ascending: true }),
    supabase.from("repack_adjustments").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }),
  ]);

  if (itemsError) {
    return <p className="text-red-600">Failed to load Repack Inventory: {itemsError.message}</p>;
  }
  if (adjustmentsError) {
    return <p className="text-red-600">Failed to load Repack Inventory history: {adjustmentsError.message}</p>;
  }

  return (
    <RepackInventoryClient
      initialItems={(items ?? []) as RepackItem[]}
      initialAdjustments={(adjustments ?? []) as RepackAdjustment[]}
    />
  );
}
