import { createClient } from "@/lib/supabase/server";
import type { RepackCost } from "@/lib/types";
import CostsClient from "./CostsClient";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("repack_costs")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load Costs: {error.message}</p>;
  }

  return <CostsClient initialRepackRows={(data ?? []) as RepackCost[]} />;
}
