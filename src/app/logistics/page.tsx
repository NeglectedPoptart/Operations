import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayISO } from "@/lib/dates";
import { groupByLoadingDate } from "@/lib/loadGrouping";
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

function PendingLoadCard({ load }: { load: Load }) {
  return (
    <div className="rounded-lg border border-black/10 p-3 shadow-sm dark:border-white/10">
      <LoadSummary load={load} dateFirst />
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const today = todayISO();

  const [
    { data: loadingToday, error: e1 },
    { data: pendingToLoad, error: e2 },
    { data: deliveringToday, error: e3 },
    { data: onTheRoad, error: e4 },
    { count: missingAppointmentCount, error: e5 },
  ] = await Promise.all([
    supabase
      .from("loads")
      .select("*, brokers(id, name), load_stops(*)")
      .eq("loading_date", today)
      .order("position", { foreignTable: "load_stops", ascending: true }),
    supabase
      .from("loads")
      .select("*, brokers(id, name), load_stops(*)")
      .eq("status", "pending_to_load")
      .order("loading_date", { ascending: true })
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
    supabase
      .from("load_stops")
      .select("*, loads!inner(status)", { count: "exact", head: true })
      .is("appointment", null)
      .neq("loads.status", "complete"),
  ]);

  if (e1 || e2 || e3 || e4 || e5) {
    return (
      <p className="text-red-600">
        Failed to load home data: {e1?.message ?? e2?.message ?? e3?.message ?? e4?.message ?? e5?.message}
      </p>
    );
  }

  const loading = (loadingToday ?? []) as unknown as Load[];
  const pending = (pendingToLoad ?? []) as unknown as Load[];
  const delivering = (deliveringToday ?? []) as unknown as DeliveringStop[];
  const onRoad = (onTheRoad ?? []) as unknown as Load[];
  const missingAppointments = missingAppointmentCount ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Logistics Summary</h1>
        <Link href="/logistics/board" className="text-sm font-medium text-green-600 hover:underline">
          Go to full board →
        </Link>
      </div>

      <Link
        href="/logistics/board"
        className={`block rounded-lg border p-3 text-sm font-medium shadow-sm ${
          missingAppointments > 0
            ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
            : "border-black/10 text-black/60 dark:border-white/10 dark:text-white/60"
        }`}
      >
        {missingAppointments} order{missingAppointments === 1 ? "" : "s"} missing an appointment (or FCFS note)
      </Link>

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
          Pending to Load <span className="text-sm font-normal text-black/40">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">Nothing pending to load.</p>
        ) : (
          <div className="space-y-5">
            {groupByLoadingDate(pending).map((group) => (
              <div key={group.date ?? "no-date"}>
                <h3 className="mb-2 text-sm font-semibold text-black/60 dark:text-white/60">
                  {group.date ? formatDate(group.date) : "No Date Set"}{" "}
                  <span className="font-normal text-black/40">({group.loads.length})</span>
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.loads.map((l) => (
                    <PendingLoadCard key={l.id} load={l} />
                  ))}
                </div>
              </div>
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
