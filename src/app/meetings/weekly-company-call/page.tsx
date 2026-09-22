import { currentWeekStart, prevWeekStart } from "@/lib/dates";
import { computeLaneWeekStats } from "@/lib/laneStats";
import { createClient } from "@/lib/supabase/server";
import type { Broker, BrokerRateEntry, Lane, QcInspection } from "@/lib/types";
import WeeklyCompanyCallClient, { type LaneRateRow } from "./WeeklyCompanyCallClient";

export const dynamic = "force-dynamic";

export default async function WeeklyCompanyCallPage() {
  const supabase = await createClient();
  const currWeek = currentWeekStart();
  const prevWeek = prevWeekStart(currWeek);

  const [inspectionsRes, lanesRes, brokersRes, entriesRes, salesOrdersReportRes] = await Promise.all([
    supabase.from("qc_inspections").select("*").order("entry_date", { ascending: true }),
    supabase.from("lanes").select("*").order("position").order("from_hub").order("destination"),
    supabase.from("brokers").select("*").order("name"),
    supabase.from("broker_rate_entries").select("*").in("week_start_date", [currWeek, prevWeek]),
    supabase.from("weekly_sales_orders_report").select("*").eq("report_key", "current").maybeSingle(),
  ]);

  const error = inspectionsRes.error ?? lanesRes.error ?? brokersRes.error ?? entriesRes.error ?? salesOrdersReportRes.error;
  if (error) {
    return <p className="text-red-600">Failed to load data: {error.message}</p>;
  }

  const reportRow = salesOrdersReportRes.data;
  let salesOrdersUpdatedByEmail: string | null = null;
  if (reportRow?.updated_by) {
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", reportRow.updated_by).maybeSingle();
    salesOrdersUpdatedByEmail = (profile?.email as string | null) ?? null;
  }

  const lanes = (lanesRes.data ?? []) as Lane[];
  const otrBrokers = ((brokersRes.data ?? []) as Broker[]).filter((b) => b.category === "otr");
  const allEntries = (entriesRes.data ?? []) as BrokerRateEntry[];
  const currentStats = computeLaneWeekStats(
    lanes,
    otrBrokers,
    allEntries.filter((e) => e.week_start_date === currWeek),
  );
  const prevStats = computeLaneWeekStats(
    lanes,
    otrBrokers,
    allEntries.filter((e) => e.week_start_date === prevWeek),
  );

  const laneRates: LaneRateRow[] = lanes.map((lane) => ({
    id: lane.id,
    fromHub: lane.from_hub,
    destination: lane.destination,
    toTruck: currentStats.get(lane.id)?.lo?.rate ?? null,
    lastWeekToTruck: prevStats.get(lane.id)?.lo?.rate ?? null,
  }));

  return (
    <WeeklyCompanyCallClient
      qcInspections={(inspectionsRes.data ?? []) as QcInspection[]}
      laneRates={laneRates}
      initialSalesOrdersReport={{
        rawText: (reportRow?.raw_text as string | null) ?? null,
        updatedByEmail: salesOrdersUpdatedByEmail,
        updatedAt: (reportRow?.updated_at as string | null) ?? null,
      }}
    />
  );
}
