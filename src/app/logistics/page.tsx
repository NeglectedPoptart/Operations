import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { Load } from "@/lib/types";
import LoadSummary from "@/components/LoadSummary";
import DeliveringCard, { type DeliveringStop } from "./DeliveringCard";
import OnTheRoadCard from "./OnTheRoadCard";

export const dynamic = "force-dynamic";

function LoadingCard({ load }: { load: Load }) {
  return (
    <div className="rounded-lg border border-black/10 p-3 shadow-sm dark:border-white/10">
      <LoadSummary load={load} />
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const today = todayISO();

  const [
    { data: loadingToday, error: e1 },
    { data: deliveringToday, error: e2 },
    { data: onTheRoad, error: e3 },
  ] = await Promise.all([
    supabase
      .from("loads")
      .select("*, brokers(id, name), load_stops(*)")
      .eq("loading_date", today)
      .order("position", { foreignTable: "load_stops", ascending: true }),
    supabase
      .from("load_stops")
      .select("*, loads!inner(id, source, rate, notes, brokers(id, name))")
      .eq("delivery_date", today)
      .neq("loads.status", "complete")
      .order("delivery_time", { ascending: true }),
    supabase
      .from("loads")
      .select("*, brokers(id, name), load_stops(*)")
      .eq("status", "on_the_road")
      .order("position", { foreignTable: "load_stops", ascending: true }),
  ]);

  if (e1 || e2 || e3) {
    return <p className="text-red-600">Failed to load home data: {e1?.message ?? e2?.message ?? e3?.message}</p>;
  }

  const loading = (loadingToday ?? []) as unknown as Load[];
  const delivering = (deliveringToday ?? []) as unknown as DeliveringStop[];
  const onRoad = (onTheRoad ?? []) as unknown as Load[];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Logistics Summary</h1>
        <Link href="/logistics/board" className="text-sm font-medium text-green-600 hover:underline">
          Go to full board →
        </Link>
      </div>

      <section>
        <h2 className="mb-3 border-b-2 border-green-600 pb-2 text-lg font-bold text-green-700 dark:text-green-400">
          Loading Today <span className="text-sm font-normal text-black/40">({loading.length})</span>
        </h2>
        {loading.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">Nothing scheduled to load today.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {loading.map((l) => (
              <LoadingCard key={l.id} load={l} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 border-b-2 border-green-600 pb-2 text-lg font-bold text-green-700 dark:text-green-400">
          Delivering Today <span className="text-sm font-normal text-black/40">({delivering.length})</span>
        </h2>
        {delivering.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">Nothing scheduled to deliver today.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {delivering.map((s) => (
              <DeliveringCard key={s.id} stop={s} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 border-b-2 border-green-600 pb-2 text-lg font-bold text-green-700 dark:text-green-400">
          On the Road <span className="text-sm font-normal text-black/40">({onRoad.length})</span>
        </h2>
        {onRoad.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">Nothing on the road right now.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {onRoad.map((l) => (
              <OnTheRoadCard key={l.id} load={l} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
