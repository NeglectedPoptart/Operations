import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/dates";
import type { MxArrival, MxCommodity, MxGrower, MxGrowerLabel } from "@/lib/types";
import ArrivalsClient from "./ArrivalsClient";

export const dynamic = "force-dynamic";

export default async function ArrivalsPage() {
  const supabase = await createClient();
  const weekStart = currentWeekStart();

  const [
    { data: growers, error: growersError },
    { data: labels, error: labelsError },
    { data: commodities, error: commoditiesError },
    { data: arrivals, error: arrivalsError },
  ] = await Promise.all([
    supabase.from("mx_growers").select("*").order("name", { ascending: true }),
    supabase.from("mx_grower_labels").select("*").order("name", { ascending: true }),
    supabase.from("mx_commodities").select("*").order("name", { ascending: true }),
    supabase.from("mx_arrivals").select("*").eq("week_start_date", weekStart).order("position", { ascending: true }),
  ]);

  const error = growersError ?? labelsError ?? commoditiesError ?? arrivalsError;
  if (error) {
    return <p className="text-red-600">Failed to load Arrivals: {error.message}</p>;
  }

  return (
    <ArrivalsClient
      initialWeekStart={weekStart}
      growers={(growers ?? []) as MxGrower[]}
      labels={(labels ?? []) as MxGrowerLabel[]}
      commodities={(commodities ?? []) as MxCommodity[]}
      initialArrivals={(arrivals ?? []) as MxArrival[]}
    />
  );
}
