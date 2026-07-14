import { createClient } from "@/lib/supabase/server";
import type { Broker, DestinationCity, Hub, Load } from "@/lib/types";
import BoardClient from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const supabase = await createClient();

  const [
    { data: loads, error: loadsError },
    { data: brokers, error: brokersError },
    { data: hubs, error: hubsError },
    { data: destinationCities, error: destinationCitiesError },
  ] = await Promise.all([
    supabase
      .from("loads")
      .select("*, brokers(id, name), load_stops(*)")
      .order("loading_date", { ascending: true })
      .order("position", { foreignTable: "load_stops", ascending: true }),
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

  return (
    <BoardClient
      loads={(loads ?? []) as unknown as Load[]}
      brokers={(brokers ?? []) as Broker[]}
      hubOptions={hubOptions}
      cityOptions={cityOptions}
    />
  );
}
