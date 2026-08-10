import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { Broker, DestinationCity, Hub, Load } from "@/lib/types";
import BoardClient from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: loads, error: loadsError },
    { data: brokers, error: brokersError },
    { data: hubs, error: hubsError },
    { data: destinationCities, error: destinationCitiesError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("loads")
      .select("*, brokers(id, name), load_stops(*), load_pickups(*)")
      .order("loading_date", { ascending: true })
      .order("position", { foreignTable: "load_stops", ascending: true })
      .order("position", { foreignTable: "load_pickups", ascending: true }),
    supabase.from("brokers").select("*").order("name", { ascending: true }),
    supabase.from("hubs").select("*").order("name", { ascending: true }),
    supabase.from("destination_cities").select("*").order("city", { ascending: true }),
  ]);

  if (loadsError || brokersError || hubsError || destinationCitiesError) {
    return (
      <p className="text-red-600">
        Failed to load board:{" "}
        {loadsError?.message ?? brokersError?.message ?? hubsError?.message ?? destinationCitiesError?.message}
      </p>
    );
  }

  const hubOptions = ((hubs ?? []) as Hub[]).map((h) => h.name);
  const cityOptions = ((destinationCities ?? []) as DestinationCity[]).map((c) => `${c.city}, ${c.state}`);
  const allLoads = (loads ?? []) as unknown as Load[];

  // First time today this user has opened the List page: surface anything
  // still Pending to Load from before today (a load with no date set isn't
  // "before today" - that's a different, already-visible problem) so it
  // doesn't quietly sit unnoticed. null means "already seen today" - not
  // "nothing to show" - so the popup still renders once with an empty state
  // rather than silently never appearing again.
  let initialOverdueLoads: Load[] | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("last_pending_orders_seen_date")
      .eq("id", user.id)
      .single();
    const lastSeen = profile?.last_pending_orders_seen_date as string | null;
    if (lastSeen !== todayISO()) {
      const today = todayISO();
      initialOverdueLoads = allLoads.filter(
        (l) => l.status === "pending_to_load" && l.loading_date !== null && l.loading_date < today,
      );
    }
  }

  return (
    <BoardClient
      loads={allLoads}
      brokers={(brokers ?? []) as Broker[]}
      hubOptions={hubOptions}
      cityOptions={cityOptions}
      initialOverdueLoads={initialOverdueLoads}
    />
  );
}
