import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, formatDate } from "@/lib/dates";
import type { LoadOption, MxArrival, MxCommodity, MxGrower, MxGrowerLabel } from "@/lib/types";
import ArrivalsClient from "./ArrivalsClient";

export const dynamic = "force-dynamic";

interface LoadForOption {
  id: string;
  loading_date: string | null;
  source: string | null;
  load_stops: { client_name: string | null; order_number: string | null; position: number }[];
}

// "date · origin -> customer · #order" - enough to tell loads apart in the
// pairing dropdown. A multi-drop load lists every order number (same
// convention as LoadSummary's own header line), not just the first stop's.
function loadOptionLabel(l: LoadForOption): string {
  const stops = [...l.load_stops].sort((a, b) => a.position - b.position);
  const firstStop = stops[0];
  const orderPart =
    stops.length > 1
      ? stops.map((s) => (s.order_number ? `#${s.order_number}` : "—")).join(", ")
      : firstStop?.order_number
        ? `#${firstStop.order_number}`
        : null;
  return [formatDate(l.loading_date) || "No date", l.source || "?", firstStop?.client_name || "?", orderPart]
    .filter(Boolean)
    .join(" · ");
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
      .select("id, loading_date, source, load_stops(client_name, order_number, position)")
      // Only loads still awaiting pickup - once a load's on the road or
      // complete it's no longer a meaningful pairing target for an inbound
      // that hasn't even crossed yet.
      .eq("status", "pending_to_load")
      .order("loading_date", { ascending: false }),
  ]);

  const error = growersError ?? labelsError ?? commoditiesError ?? arrivalsError ?? loadsError;
  if (error) {
    return <p className="text-red-600">Failed to load Arrivals: {error.message}</p>;
  }

  const loadOptions: LoadOption[] = ((loadsForOptions ?? []) as unknown as LoadForOption[]).map((l) => ({
    id: l.id,
    label: loadOptionLabel(l),
  }));

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
