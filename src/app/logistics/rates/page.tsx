import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, prevWeekStart, weekEnd } from "@/lib/dates";
import { computeBookedStatsByLane } from "@/lib/rateAverages";
import type { Broker, BrokerRateEntry, Lane, RateSubmission } from "@/lib/types";
import RatesTabs from "./RatesTabs";
import RouteAveragesTable from "./RouteAveragesTable";
import BrokerTrackerClient from "./BrokerTrackerClient";

export const dynamic = "force-dynamic";

export default async function RatesPage() {
  const supabase = await createClient();

  const currWeek = currentWeekStart();
  const prevWeek = prevWeekStart(currWeek);
  const currWeekEnd = weekEnd(currWeek);

  const [
    { data: userData },
    lanesRes,
    brokersRes,
    entriesRes,
    submissionsRes,
    loadsRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("lanes").select("*").order("from_hub").order("destination"),
    supabase.from("brokers").select("*").order("name"),
    supabase.from("broker_rate_entries").select("*").in("week_start_date", [currWeek, prevWeek]),
    supabase.from("rate_submissions").select("*").in("week_start_date", [currWeek, prevWeek]),
    supabase
      .from("loads")
      .select("source, rate, loading_date, load_stops(destination_city, destination_state, position)")
      .gte("loading_date", currWeek)
      .lte("loading_date", currWeekEnd)
      .not("rate", "is", null),
  ]);

  const error = lanesRes.error ?? brokersRes.error ?? entriesRes.error ?? submissionsRes.error ?? loadsRes.error;
  if (error) {
    return <p className="text-red-600">Failed to load rates data: {error.message}</p>;
  }

  const lanes = (lanesRes.data ?? []) as Lane[];
  const brokers = (brokersRes.data ?? []) as Broker[];
  const allEntries = (entriesRes.data ?? []) as BrokerRateEntry[];
  const currentEntries = allEntries.filter((e) => e.week_start_date === currWeek);
  const prevEntries = allEntries.filter((e) => e.week_start_date === prevWeek);

  const submissions = (submissionsRes.data ?? []) as RateSubmission[];
  const currentSubmission = submissions.find((s) => s.week_start_date === currWeek) ?? null;
  const prevSubmission = submissions.find((s) => s.week_start_date === prevWeek) ?? null;

  const bookedStats = computeBookedStatsByLane(
    (loadsRes.data ?? []) as unknown as {
      source: string | null;
      rate: number | null;
      loading_date: string | null;
      load_stops: { destination_city: string | null; destination_state: string | null; position: number }[];
    }[],
    lanes,
    currWeek,
    currWeekEnd,
  );

  return (
    <RatesTabs
      routeAverages={
        <RouteAveragesTable
          lanes={lanes}
          brokers={brokers}
          currentEntries={currentEntries}
          prevEntries={prevEntries}
          bookedStats={bookedStats}
          currentWeekStart={currWeek}
          prevWeekStart={prevWeek}
        />
      }
      brokerTracker={
        <BrokerTrackerClient
          lanes={lanes}
          brokers={brokers}
          initialWeekStart={currWeek}
          initialEntries={currentEntries}
          initialPrevEntries={prevEntries}
          initialSubmission={currentSubmission}
          initialPrevSubmission={prevSubmission}
          currentUserEmail={userData.user?.email ?? "unknown"}
        />
      }
    />
  );
}
