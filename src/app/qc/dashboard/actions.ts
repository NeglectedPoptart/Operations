"use server";

import { createClient } from "@/lib/supabase/server";
import { APP_TIMEZONE, addDays } from "@/lib/dates";
import type { ChartInspection } from "@/lib/qcCharts";

// The instant a calendar day starts on the business clock (Central), so "from
// 10/1" really begins at Central midnight whatever the server's zone.
function centralDayStart(date: string): string {
  for (const offsetHours of [5, 6]) {
    const candidate = new Date(`${date}T${String(offsetHours).padStart(2, "0")}:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(candidate);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    if (`${get("year")}-${get("month")}-${get("day")}` === date && get("hour") === "00") return candidate.toISOString();
  }
  return new Date(`${date}T06:00:00Z`).toISOString();
}

// One plan's inspections in a date range - just what the charts need.
export async function getChartData(
  planId: string,
  from: string,
  to: string,
): Promise<{ rows: ChartInspection[] } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qc_lot_inspections")
    .select("id, inspection_time, grower, lot_number, inspector_name, product_label, sample_size, defects, samples, result")
    .eq("plan_id", planId)
    .gte("inspection_time", centralDayStart(from))
    .lt("inspection_time", centralDayStart(addDays(to, 1)))
    .order("inspection_time", { ascending: true })
    .limit(3000);
  if (error) return { error: error.message };
  return { rows: (data ?? []) as ChartInspection[] };
}
