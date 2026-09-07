import { createClient } from "@/lib/supabase/server";
import type { MxCommodity, MxGrower, MxGrowerLabel } from "@/lib/types";
import GrowersClient from "./GrowersClient";

export const dynamic = "force-dynamic";

export default async function GrowersPage() {
  const supabase = await createClient();

  const [{ data: growers, error: growersError }, { data: labels, error: labelsError }, { data: commodities, error: commoditiesError }] =
    await Promise.all([
      supabase.from("mx_growers").select("*").order("name", { ascending: true }),
      supabase.from("mx_grower_labels").select("*").order("name", { ascending: true }),
      supabase.from("mx_commodities").select("*").order("name", { ascending: true }),
    ]);

  if (growersError || labelsError || commoditiesError) {
    return (
      <p className="text-red-600">
        Failed to load Growers: {growersError?.message ?? labelsError?.message ?? commoditiesError?.message}
      </p>
    );
  }

  return (
    <GrowersClient
      initialGrowers={(growers ?? []) as MxGrower[]}
      initialLabels={(labels ?? []) as MxGrowerLabel[]}
      initialCommodities={(commodities ?? []) as MxCommodity[]}
    />
  );
}
