import { createClient } from "@/lib/supabase/server";
import { loadRepacks } from "@/lib/repacksLoad";
import type { RepackItem } from "@/lib/types";
import RepacksClient from "./RepacksClient";

export const dynamic = "force-dynamic";

export default async function RepacksPage() {
  const supabase = await createClient();
  const [loaded, { data: items }] = await Promise.all([
    loadRepacks(supabase),
    supabase.from("repack_items").select("*").order("position", { ascending: true }),
  ]);

  if ("error" in loaded) {
    return <p className="text-red-600">Failed to load Repacks: {loaded.error}. If this says the table is missing, run migration 157 first.</p>;
  }
  return <RepacksClient initialRepacks={loaded.repacks} supplyItems={(items ?? []) as RepackItem[]} />;
}
