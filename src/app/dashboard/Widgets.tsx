"use client";

import type { ReactNode } from "react";
import NotesPad from "@/components/notes/NotesPad";
import type { DashboardData } from "@/lib/dashboardTypes";
import { rgbaOf } from "@/lib/pendingOrders";

export interface WidgetDef {
  id: string;
  label: string;
  // The page a click on the widget's title opens.
  href: string | null;
}

export const WIDGETS: WidgetDef[] = [
  { id: "orders", label: "Orders pending", href: "/warehouse/orders" },
  { id: "loads", label: "Loads on the road", href: "/logistics/board" },
  { id: "arrivals", label: "Arrivals today", href: "/mexico/arrivals" },
  { id: "qc", label: "QC results today", href: "/qc/inspections" },
  { id: "trend", label: "Quality trend", href: "/qc/dashboard" },
  { id: "ar", label: "AR aging", href: "/accounting/ar" },
  { id: "cold", label: "Cold inventory", href: "/warehouse/cold-inventory" },
  { id: "buyers", label: "Buyers list", href: "/buyers/buyers-list" },
  { id: "agents", label: "Agents", href: "/submanagement/agents" },
  { id: "out", label: "Out today", href: "/management/schedules" },
  { id: "devices", label: "Devices", href: "/supreme/devices" },
  { id: "notes", label: "My notes", href: null },
];

function Big({ children, tone }: { children: ReactNode; tone?: "bad" | "good" }) {
  return (
    <span className={`text-2xl font-bold leading-none ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-green-700 dark:text-green-400" : ""}`}>{children}</span>
  );
}

function Row({ left, right, tone }: { left: ReactNode; right?: ReactNode; tone?: "bad" | "warn" | "good" }) {
  const color = tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-green-700 dark:text-green-400" : "text-black/60 dark:text-white/60";
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="min-w-0 truncate">{left}</span>
      {right !== undefined && <span className={`shrink-0 ${color}`}>{right}</span>}
    </div>
  );
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const num = (n: number) => n.toLocaleString("en-US");

function Sparkline({ points }: { points: { date: string; value: number }[] }) {
  if (points.length < 2) return <p className="text-xs text-black/40 dark:text-white/40">Not enough inspections yet.</p>;
  const w = 220;
  const h = 56;
  const max = Math.max(...points.map((p) => p.value), 1);
  const x = (i: number) => (i / (points.length - 1)) * (w - 8) + 4;
  const y = (v: number) => h - 6 - (v / max) * (h - 12);
  const last = points[points.length - 1];
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label="Average defect percentage by day">
        <polyline fill="none" stroke="#16a34a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")} />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r="3" fill="#16a34a" />
      </svg>
      <p className="text-[11px] text-black/50 dark:text-white/50">Average total defects by day · latest {last.value}%</p>
    </div>
  );
}

export function WidgetBody({
  id,
  data,
}: {
  id: string;
  data: DashboardData | null;
}) {
  if (id === "notes") return <NotesPad compact />;
  if (!data) return <p className="text-xs text-black/40 dark:text-white/40">Loading...</p>;
  const missing = <p className="text-xs text-amber-600">Couldn&apos;t load this one.</p>;

  switch (id) {
    case "orders": {
      const d = data.orders;
      if (!d) return missing;
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Today", d.today],
              ["Tomorrow", d.tomorrow],
              ["Later", d.later],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded bg-black/5 px-1 py-1 dark:bg-white/10">
                <div className="text-[10px] text-black/55 dark:text-white/55">{label}</div>
                <Big>{value}</Big>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {d.labels.map((l) => (
              <span key={l.name} className="rounded border border-black/20 px-1.5 py-px text-[10px] text-black" style={{ backgroundColor: rgbaOf(l.color, Math.max(l.opacity, 0.3)) }}>
                {l.name} {l.count}
              </span>
            ))}
            <span className="rounded border border-black/20 bg-white px-1.5 py-px text-[10px] text-black">No label {d.noLabel}</span>
          </div>
        </div>
      );
    }
    case "loads": {
      const d = data.loads;
      if (!d) return missing;
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <Big>{d.onRoad}</Big>
            <span className="text-xs text-black/60 dark:text-white/60">on the road</span>
            {d.podPending > 0 && <span className="ml-auto text-xs text-amber-600">{d.podPending} waiting on POD</span>}
          </div>
          {d.list.map((l) => (
            <Row key={l.id} left={l.label} right={l.eta ?? "no ETA"} tone={l.eta ? undefined : "warn"} />
          ))}
          {d.onRoad === 0 && <p className="text-xs text-black/40 dark:text-white/40">Nothing on the road.</p>}
        </div>
      );
    }
    case "arrivals": {
      const d = data.arrivals;
      if (!d) return missing;
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <Big>{d.total}</Big>
            <span className="text-xs text-black/60 dark:text-white/60">loads today · {d.arrived} arrived</span>
          </div>
          {d.list.map((a, i) => (
            <Row key={i} left={`${a.grower}${a.commodity ? ` - ${a.commodity}` : ""}`} right={a.arrived ? "arrived" : "due"} tone={a.arrived ? "good" : undefined} />
          ))}
          {d.total === 0 && <p className="text-xs text-black/40 dark:text-white/40">Nothing booked for today.</p>}
        </div>
      );
    }
    case "qc": {
      const d = data.qc;
      if (!d) return missing;
      const total = Math.max(1, d.total);
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <Big>{d.total}</Big>
            <span className="text-xs text-black/60 dark:text-white/60">inspections today</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded bg-black/10 dark:bg-white/15">
            <div style={{ width: `${(d.pass / total) * 100}%`, background: "#639922" }} />
            <div style={{ width: `${(d.caution / total) * 100}%`, background: "#EF9F27" }} />
            <div style={{ width: `${(d.fail / total) * 100}%`, background: "#E24B4A" }} />
          </div>
          <p className="text-[11px] text-black/55 dark:text-white/55">
            {d.pass} pass · {d.caution} caution · {d.fail} fail/urgent
          </p>
          {d.worst.map((w, i) => (
            <Row key={i} left={`${w.lot} ${w.product}`} right={w.result} tone="bad" />
          ))}
        </div>
      );
    }
    case "trend": {
      const d = data.trend;
      if (!d) return missing;
      return <Sparkline points={d.points} />;
    }
    case "ar": {
      const d = data.ar;
      if (!d) return missing;
      const max = Math.max(1, ...d.buckets.map((b) => b.value));
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <Big>{money(d.total)}</Big>
            <span className="text-xs text-black/60 dark:text-white/60">outstanding</span>
          </div>
          {d.buckets.map((b) => (
            <div key={b.label} className="flex items-center gap-2 text-[11px]">
              <span className="w-12 shrink-0 text-black/55 dark:text-white/55">{b.label}</span>
              <div className="h-2 flex-1 rounded bg-black/10 dark:bg-white/15">
                <div className="h-2 rounded bg-green-600" style={{ width: `${(b.value / max) * 100}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right">{money(b.value)}</span>
            </div>
          ))}
          {d.escalated > 0 && <p className="text-[11px] text-red-600">{d.escalated} escalated</p>}
        </div>
      );
    }
    case "cold": {
      const d = data.cold;
      if (!d) return missing;
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <Big tone={d.issues + d.dumps > 0 ? "bad" : undefined}>{d.issues + d.dumps}</Big>
            <span className="text-xs text-black/60 dark:text-white/60">flagged of {d.items} items</span>
          </div>
          <Row left="Issue" right={d.issues} tone={d.issues > 0 ? "warn" : undefined} />
          <Row left="Dump" right={d.dumps} tone={d.dumps > 0 ? "bad" : undefined} />
          <Row left="Cases on hand" right={num(d.cases)} />
        </div>
      );
    }
    case "buyers": {
      const d = data.buyers;
      if (!d) return missing;
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <Big>{d.count}</Big>
            <span className="text-xs text-black/60 dark:text-white/60">lines to buy</span>
          </div>
          {d.top.map((t, i) => (
            <Row key={i} left={t.name} right={num(t.qty)} />
          ))}
        </div>
      );
    }
    case "agents": {
      const d = data.agents;
      if (!d) return missing;
      return (
        <div className="space-y-1.5">
          <Row left="Emails to approve" right={d.drafts} tone={d.drafts > 0 ? "warn" : undefined} />
          <Row left="Replies to review" right={d.replies} tone={d.replies > 0 ? "warn" : undefined} />
          <Row left="People who answered (24h)" right={d.answeredToday} tone="good" />
        </div>
      );
    }
    case "out": {
      const d = data.out;
      if (!d) return missing;
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <Big>{d.today.length}</Big>
            <span className="text-xs text-black/60 dark:text-white/60">out today</span>
          </div>
          {d.today.map((p, i) => (
            <Row key={i} left={p.name} right={p.kind} />
          ))}
          {d.startingThisWeek > 0 && <p className="text-[11px] text-black/50 dark:text-white/50">{d.startingThisWeek} more starting this week</p>}
        </div>
      );
    }
    case "devices": {
      const d = data.devices;
      if (!d) return missing;
      return (
        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2">
            <Big tone={d.flagged > 0 ? "bad" : undefined}>{d.flagged}</Big>
            <span className="text-xs text-black/60 dark:text-white/60">need follow-up</span>
          </div>
          <Row left="Unassigned" right={d.unassigned} />
          <Row left="Total devices" right={d.total} />
        </div>
      );
    }
    default:
      return null;
  }
}
