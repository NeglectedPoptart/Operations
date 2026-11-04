import { graphConfigured } from "@/lib/agents/graph";
import { todayISO } from "@/lib/dates";
import { isSupremeUser } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { buildReports, defaultRange, rangeLabel } from "@/lib/weeklyReports/reports";
import WeeklyReportsClient from "./WeeklyReportsClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function WeeklyReportsPage({ searchParams }: { searchParams: Promise<{ end?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isSupremeUser(user?.email ?? null)) return <p className="text-sm text-black/60 dark:text-white/60">Weekly Reports is only available to the owner account.</p>;

  const { end: endParam } = await searchParams;
  const today = todayISO();
  const end = endParam && /^\d{4}-\d{2}-\d{2}$/.test(endParam) ? endParam : today;
  const range = defaultRange(end);

  const [reports, settings] = await Promise.all([
    buildReports(supabase, range),
    supabase.from("app_settings").select("value").eq("key", "weekly_report_recipients").maybeSingle(),
  ]);
  const saved = ((settings.data?.value as { emails?: string[] } | undefined)?.emails ?? []).join(", ");

  return (
    <WeeklyReportsClient
      end={end}
      today={today}
      label={rangeLabel(range)}
      reports={reports}
      initialRecipients={saved}
      canSend={graphConfigured()}
    />
  );
}
