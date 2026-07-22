import { createClient } from "@/lib/supabase/server";
import type { ColdInventoryItem } from "@/lib/types";
import ColdInventoryClient from "./ColdInventoryClient";

export const dynamic = "force-dynamic";

export default async function ColdInventoryPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cold_inventory_items")
    .select("*")
    .order("manifest_order", { ascending: true })
    .order("column_order", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load Cold Inventory: {error.message}</p>;
  }

  return <ColdInventoryClient initialItems={(data ?? []) as ColdInventoryItem[]} />;
}
