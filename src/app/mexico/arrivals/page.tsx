import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, formatDate } from "@/lib/dates";
import type { LoadOption, MxArrival, MxCommodity, MxGrower, MxGrowerLabel } from "@/lib/types";
import ArrivalsClient from "./ArrivalsClient";

export const dynamic = "force-dynamic";

interface LoadForOption {
  id: string;
  loading_date: string | null;
  source: string | null;
  load_stops: { client_name: string | null; position: number }[];
}

export default async function ArrivalsPage() {
  const supabase = await createClient();
  const weekStart = currentWeekStart();

  const [
    { data: growers, error: growersError },
    { data: labels, error: labelsError },
    { data: commodities, error: commoditiesError },
    { data: arrivals, error: arrivalsError },
    { data: loadsForOptions, error: loadsError },
  ] = await Promise.all([
    supabase.from("mx_growers").select("*").order("name", { ascending: true }),
    supabase.from("mx_grower_labels").select("*").order("name", { ascending: true }),
    supabase.from("mx_commodities").select("*").order("name", { ascending: true }),
    supabase.from("mx_arrivals").select("*").eq("week_start_date", weekStart).order("position", { ascending: true }),
    supabase
      .from("loads")
      .select("id, loading_date, source, load_stops(client_name, position)")
      .order("loading_date", { ascending: false }),
  ]);

  const error = growersError ?? labelsError ?? commoditiesError ?? arrivalsError ?? loadsError;
  if (error) {
    return <p className="text-red-600">Failed to load Arrivals: {error.message}</p>;
  }

  // A short "date · origin -> customer" label - just enough to tell loads
  // apart in the pairing dropdown without pulling in the full board query.
  const loadOptions: LoadOption[] = ((loadsForOptions ?? []) as unknown as LoadForOption[]).map((l) => {
    const firstStop = [...l.load_stops].sort((a, b) => a.position - b.position)[0];
    const label = [formatDate(l.loading_date) || "No date", l.source || "?", firstStop?.client_name || "?"].join(" · ");
    return { id: l.id, label };
  });

  return (
    <ArrivalsClient
      initialWeekStart={weekStart}
      growers={(growers ?? []) as MxGrower[]}
      labels={(labels ?? []) as MxGrowerLabel[]}
      commodities={(commodities ?? []) as MxCommodity[]}
      initialArrivals={(arrivals ?? []) as MxArrival[]}
      loadOptions={loadOptions}
    />
  );
}
