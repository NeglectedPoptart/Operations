import { createClient } from "@/lib/supabase/server";
import type { ColdInventoryImport, ColdInventoryItem } from "@/lib/types";
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

  // The latest emailed Inventory Report - fetched on its own so the page works before migration 161.
  const { data: imports } = await supabase
    .from("cold_inventory_imports")
    .select("id, received_at, from_email, file_name, report_date, status, items_count, note")
    .order("received_at", { ascending: false })
    .limit(1);

  return <ColdInventoryClient initialItems={(data ?? []) as ColdInventoryItem[]} lastEmail={((imports ?? [])[0] ?? null) as ColdInventoryImport | null} />;
}
