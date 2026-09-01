import { currentWeekStart } from "@/lib/dates";
import { computeLaneWeekStats } from "@/lib/laneStats";
import { createClient } from "@/lib/supabase/server";
import type { Broker, BrokerRateEntry, Lane, QcInspection } from "@/lib/types";
import WeeklyCompanyCallClient, { type LaneRateRow } from "./WeeklyCompanyCallClient";

export const dynamic = "force-dynamic";

export default async function WeeklyCompanyCallPage() {
  const supabase = await createClient();
  const currWeek = currentWeekStart();

  const [inspectionsRes, lanesRes, brokersRes, entriesRes] = await Promise.all([
    supabase.from("qc_inspections").select("*").order("entry_date", { ascending: true }),
    supabase.from("lanes").select("*").order("position").order("from_hub").order("destination"),
    supabase.from("brokers").select("*").order("name"),
    supabase.from("broker_rate_entries").select("*").eq("week_start_date", currWeek),
  ]);

  const error = inspectionsRes.error ?? lanesRes.error ?? brokersRes.error ?? entriesRes.error;
  if (error) {
    return <p className="text-red-600">Failed to load data: {error.message}</p>;
  }

  const lanes = (lanesRes.data ?? []) as Lane[];
  const otrBrokers = ((brokersRes.data ?? []) as Broker[]).filter((b) => b.category === "otr");
  const entries = (entriesRes.data ?? []) as BrokerRateEntry[];
  const laneStats = computeLaneWeekStats(lanes, otrBrokers, entries);

  const laneRates: LaneRateRow[] = lanes.map((lane) => ({
    id: lane.id,
    fromHub: lane.from_hub,
    destination: lane.destination,
    toTruck: laneStats.get(lane.id)?.lo?.rate ?? null,
  }));

  return (
    <WeeklyCompanyCallClient qcInspections={(inspectionsRes.data ?? []) as QcInspection[]} laneRates={laneRates} />
  );
}
