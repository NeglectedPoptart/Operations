import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { currentWeekStart, prevWeekStart, todayISO } from "@/lib/dates";
import { computeLaneWeekStats } from "@/lib/laneStats";
import { topChangedLanes } from "@/lib/laneChange";
import { summarizeByNextStep } from "@/lib/oldAgeSummary";
import type { Broker, BrokerRateEntry, Lane, LocalInbound, OldAgeNextStep } from "@/lib/types";
import PieChart from "@/components/PieChart";
import HorizontalBarChart from "@/components/HorizontalBarChart";

export const dynamic = "force-dynamic";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function StatTile({
  label,
  value,
  href,
  alert = false,
}: {
  label: string;
  value: number;
  href: string;
  alert?: boolean;
}) {
  const flagged = alert && value > 0;
  return (
    <Link
      href={href}
      className={`rounded-lg border p-4 shadow-sm transition hover:border-green-600 ${
        flagged ? "border-red-300 dark:border-red-800" : "border-black/10 dark:border-white/10"
      }`}
    >
      <p className={`text-3xl font-bold ${flagged ? "text-red-600 dark:text-red-400" : ""}`}>{value}</p>
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
    </Link>
  );
}

function CategoryHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b-2 border-black/20 pb-1 text-xl font-extrabold uppercase tracking-wide text-black/80 dark:border-white/20 dark:text-white/80">
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-lg font-bold text-green-700 dark:text-green-400">{children}</h3>
  );
}

// A single bar showing the whole PAS Files list at a glance: how much of it
// needs contact or escalation, stacked left to right against the total.
function PasBreakdownBar({
  total,
  needingContact,
  needingEscalation,
}: {
  total: number;
  needingContact: number;
  needingEscalation: number;
}) {
  const normal = Math.max(total - needingContact - needingEscalation, 0);
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div className="space-y-3">
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
        {normal > 0 && <div className="h-full bg-green-500" style={{ width: `${pct(normal)}%` }} />}
        {needingContact > 0 && <div className="h-full bg-yellow-400" style={{ width: `${pct(needingContact)}%` }} />}
        {needingEscalation > 0 && <div className="h-full bg-red-500" style={{ width: `${pct(needingEscalation)}%` }} />}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <p>
          Total PAS Files: <span className="font-semibold">{total}</span>
        </p>
        <p>
          Needing Contact:{" "}
          <span className="font-semibold text-yellow-700 dark:text-yellow-400">{needingContact}</span>
        </p>
        <p>
          Needing Escalation:{" "}
          <span className="font-semibold text-red-700 dark:text-red-400">{needingEscalation}</span>
        </p>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const supabase = await createClient();

  const currWeek = currentWeekStart();
  const prevWeek = prevWeekStart(currWeek);
  const today = todayISO();

  const [
    pendingTodayRes,
    pendingRes,
    onRoadRes,
    lanesRes,
    brokersRes,
    entriesRes,
    holdoverPendingInboundRes,
    holdoverPendingChangesRes,
    holdoverCancelledRes,
    localInboundsRes,
    oldAgeNextStepsRes,
    pasTotalRes,
    pasContactRes,
    pasEscalationRes,
    missingAppointmentRes,
  ] = await Promise.all([
    supabase
      .from("loads")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_to_load")
      .eq("loading_date", today),
    supabase.from("loads").select("*", { count: "exact", head: true }).eq("status", "pending_to_load"),
    supabase.from("loads").select("*", { count: "exact", head: true }).eq("status", "on_the_road"),
    supabase.from("lanes").select("*"),
    supabase.from("brokers").select("*"),
    supabase.from("broker_rate_entries").select("*").in("week_start_date", [currWeek, prevWeek]),
    supabase
      .from("am_holdovers")
      .select("*", { count: "exact", head: true })
      .eq("entry_date", today)
      .eq("status", "pending_inbound"),
    supabase
      .from("am_holdovers")
      .select("*", { count: "exact", head: true })
      .eq("entry_date", today)
      .eq("status", "pending_changes"),
    supabase
      .from("am_holdovers")
      .select("*", { count: "exact", head: true })
      .eq("entry_date", today)
      .eq("status", "cancelled"),
    supabase.from("local_inbounds").select("id, po, vendor, eta, status").eq("entry_date", today),
    supabase.from("old_age_items").select("next_step"),
    supabase.from("pas_files").select("*", { count: "exact", head: true }),
    supabase.from("pas_files").select("*", { count: "exact", head: true }).eq("highlight", "yellow"),
    supabase.from("pas_files").select("*", { count: "exact", head: true }).eq("highlight", "red"),
    supabase
      .from("load_stops")
      .select("*, loads!inner(status)", { count: "exact", head: true })
      .is("appointment", null)
      .neq("loads.status", "complete"),
  ]);

  const error =
    pendingTodayRes.error ??
    pendingRes.error ??
    onRoadRes.error ??
    lanesRes.error ??
    brokersRes.error ??
    entriesRes.error ??
    holdoverPendingInboundRes.error ??
    holdoverPendingChangesRes.error ??
    holdoverCancelledRes.error ??
    localInboundsRes.error ??
    oldAgeNextStepsRes.error ??
    pasTotalRes.error ??
    pasContactRes.error ??
    pasEscalationRes.error ??
    missingAppointmentRes.error;
  if (error) {
    return <p className="text-red-600">Failed to load dashboard: {error.message}</p>;
  }

  const lanes = (lanesRes.data ?? []) as Lane[];
  const brokers = (brokersRes.data ?? []) as Broker[];
  const allEntries = (entriesRes.data ?? []) as BrokerRateEntry[];
  const currentEntries = allEntries.filter((e) => e.week_start_date === currWeek);
  const prevEntries = allEntries.filter((e) => e.week_start_date === prevWeek);

  const currentStats = computeLaneWeekStats(lanes, brokers, currentEntries);
  const prevStats = computeLaneWeekStats(lanes, brokers, prevEntries);
  const changedLanes = topChangedLanes(lanes, currentStats, prevStats, 3);

  const holdoverSlices = [
    { label: "Pending Inbound", value: holdoverPendingInboundRes.count ?? 0, colorVar: "var(--series-1)" },
    { label: "Pending Changes", value: holdoverPendingChangesRes.count ?? 0, colorVar: "var(--series-2)" },
    { label: "Cancelled", value: holdoverCancelledRes.count ?? 0, colorVar: "var(--series-3)" },
  ];

  const oldAgeNextStepSummary = summarizeByNextStep(
    (oldAgeNextStepsRes.data ?? []) as { next_step: OldAgeNextStep | null }[],
  );

  const localInbounds = (localInboundsRes.data ?? []) as Pick<LocalInbound, "id" | "po" | "vendor" | "eta" | "status">[];
  const pendingInbounds = localInbounds.filter((i) => i.status === "pending");
  const arrivedInboundsCount = localInbounds.filter((i) => i.status === "arrived").length;

  return (
    <div className="home-dashboard space-y-10">
      <h1 className="text-2xl font-bold">Home</h1>

      <div className="space-y-5">
        <CategoryHeading>Logistics</CategoryHeading>

        <section>
          <SubHeading>Loads</SubHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Pending Today" value={pendingTodayRes.count ?? 0} href="/logistics/board" />
            <StatTile label="Total Pending" value={pendingRes.count ?? 0} href="/logistics/board" />
            <StatTile label="On the Road" value={onRoadRes.count ?? 0} href="/logistics/board" />
            <StatTile
              label="Missing Appointments"
              value={missingAppointmentRes.count ?? 0}
              href="/logistics/board"
              alert
            />
          </div>
        </section>

        <section>
          <SubHeading>Freight Rates - Most Changed Lanes</SubHeading>
          {changedLanes.length === 0 ? (
            <p className="text-sm text-black/40 dark:text-white/40">
              Not enough submitted rate history yet - need at least two weeks of quotes on the same lane to compare.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {changedLanes.map(({ lane, prevAvg, currAvg, pctChange }) => {
                const up = pctChange > 0;
                return (
                  <Link
                    href="/logistics/rates"
                    key={lane.id}
                    className={`rounded-lg border p-4 shadow-sm ${
                      up ? "border-red-300 dark:border-red-800" : "border-green-300 dark:border-green-800"
                    }`}
                  >
                    <p className="font-medium">
                      {lane.from_hub} → {lane.destination}
                    </p>
                    <p className="text-sm text-black/60 dark:text-white/60">
                      {money(prevAvg)} → {money(currAvg)}
                    </p>
                    <p
                      className={`mt-1 text-lg font-bold ${
                        up ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                      }`}
                    >
                      {up ? "↑" : "↓"} {Math.abs(pctChange).toFixed(1)}%
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="space-y-5">
        <CategoryHeading>Warehouse</CategoryHeading>

        <section>
          <SubHeading>AM Holdovers (Today)</SubHeading>
          <div className="rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <PieChart slices={holdoverSlices} />
          </div>
        </section>

        <section>
          <SubHeading>Local Inbounds (Today)</SubHeading>
          <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <div>
              <p className="text-sm font-medium">Pending to Arrive ({pendingInbounds.length})</p>
              {pendingInbounds.length === 0 ? (
                <p className="text-sm text-black/40 dark:text-white/40">Nothing pending.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm text-black/70 dark:text-white/70">
                  {pendingInbounds.map((i) => (
                    <li key={i.id}>
                      {i.vendor || "(no vendor)"}
                      {i.po && ` · PO ${i.po}`} — ETA {i.eta || "—"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-sm font-medium">
              Arrived: <span className="text-green-700 dark:text-green-400">{arrivedInboundsCount}</span>
            </p>
          </div>
        </section>
      </div>

      <div className="space-y-5">
        <CategoryHeading>QC</CategoryHeading>

        <section>
          <SubHeading>Old Age - Next Steps</SubHeading>
          <div className="rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <HorizontalBarChart data={oldAgeNextStepSummary} />
          </div>
        </section>
      </div>

      <div className="space-y-5">
        <CategoryHeading>Compliance</CategoryHeading>

        <section>
          <SubHeading>PAS Files</SubHeading>
          <div className="rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <PasBreakdownBar
              total={pasTotalRes.count ?? 0}
              needingContact={pasContactRes.count ?? 0}
              needingEscalation={pasEscalationRes.count ?? 0}
            />
          </div>
        </section>
      </div>

      <style>{`
        .home-dashboard {
          --series-1: #2a78d6;
          --series-2: #eda100;
          --series-3: #e34948;
        }
        @media (prefers-color-scheme: dark) {
          .home-dashboard {
            --series-1: #3987e5;
            --series-2: #c98500;
            --series-3: #e66767;
          }
        }
      `}</style>
    </div>
  );
}
