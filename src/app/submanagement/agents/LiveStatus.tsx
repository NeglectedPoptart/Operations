"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentEvent } from "@/lib/agents/types";
import { TICK_STATUS_KEY, type TickStatus } from "@/lib/agents/status";
import { forceCheckNow } from "./actions";

// HOPS mission control: a live picture of the background worker. Email comes in on the left, passes through the
// HOPS core, and flows out to the part of the app it feeds. Packets move while a pass is running, a ring around the
// core counts down to the next 15-minute check, each destination lights up when something just landed there, and
// the strip underneath shows the last 24 hours. Refreshes itself every few seconds.

const POLL_MS = 4000;
const TIMER_MINUTES = 15;
// The timer is every 15 minutes; this long without a pass starting means it has stopped.
const STALE_MINUTES = 35;
const DAY_MS = 24 * 3_600_000;
const FRESH_MS = 120_000;

interface Lane {
  key: string;
  label: string;
  color: string;
  test: (agent: string, message: string) => boolean;
}

// Where an event "lands". First match wins.
const LANES: Lane[] = [
  { key: "loads", label: "Loads & PODs", color: "#38bdf8", test: (a, m) => /load eta/i.test(a) || /\b(load|pod|carrier reply)\b/i.test(m) },
  { key: "invoices", label: "Invoices", color: "#a78bfa", test: (a, m) => /statement/i.test(a) || /statement|invoice/i.test(m) },
  { key: "qc", label: "QC inspections", color: "#34d399", test: (_a, m) => /lotpath|inspection/i.test(m) },
  { key: "inventory", label: "Cold inventory", color: "#22d3ee", test: (_a, m) => /inventory/i.test(m) },
  { key: "sheets", label: "Price sheets", color: "#fbbf24", test: (a, m) => /delivered sheets|carrier rates/i.test(a) || /price sheet|\bsheet\b|fob|availability/i.test(m) },
  { key: "customers", label: "Customers", color: "#f472b6", test: (a, m) => /customer/i.test(a) || /customer/i.test(m) },
];

function laneOf(agent: string, message: string): Lane | null {
  return LANES.find((l) => l.test(agent, message)) ?? null;
}

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const KIND_STYLE: Record<string, string> = {
  error: "text-red-400",
  inbox: "text-sky-300",
  reply: "text-emerald-300",
};

// Geometry of the diagram (viewBox 0 0 900 430).
const CORE = { x: 390, y: 215 };
const INBOX = { x: 80, y: 215 };
const LANE_X = 722;
const laneY = (i: number) => 50 + i * 66;
const RING_R = 78;
const RING_LEN = 2 * Math.PI * RING_R;

export default function LiveStatus({ initialEvents, agentName }: { initialEvents: AgentEvent[]; agentName: Record<string, string> }) {
  const [status, setStatus] = useState<TickStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>(initialEvents);
  const [now, setNow] = useState(() => Date.now());
  const [forcing, startForce] = useTransition();
  const [forceMsg, setForceMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    async function load() {
      const since = new Date(Date.now() - DAY_MS).toISOString();
      const [{ data: row }, { data: ev }] = await Promise.all([
        supabase.from("agent_state").select("value").eq("key", TICK_STATUS_KEY).maybeSingle(),
        supabase.from("agent_events").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(400),
      ]);
      if (!alive) return;
      try {
        setStatus(row?.value ? (JSON.parse(row.value as string) as TickStatus) : null);
      } catch {
        setStatus(null);
      }
      if (ev) setEvents(ev as AgentEvent[]);
      setLoaded(true);
      setNow(Date.now());
    }
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const startedMs = status ? new Date(status.startedAt).getTime() : 0;
  const minutesSinceStart = status ? (now - startedMs) / 60000 : 0;
  // A pass that says "running" for more than 3 minutes died part-way (a pass is capped at 60 seconds).
  const running = status?.state === "running" && minutesSinceStart < 3;
  const stale = !running && !!status && minutesSinceStart > STALE_MINUTES;
  const nextIn = status && !running ? Math.max(0, Math.ceil(TIMER_MINUTES - minutesSinceStart)) : null;
  const progress = status && !running ? Math.min(1, Math.max(0, minutesSinceStart / TIMER_MINUTES)) : 0;

  // Per destination: how many things landed in the last 24 hours, and whether one just did.
  const laneStats = useMemo(() => {
    const stats = new Map<string, { count: number; fresh: boolean; errors: number }>();
    for (const l of LANES) stats.set(l.key, { count: 0, fresh: false, errors: 0 });
    for (const e of events) {
      const lane = laneOf(e.agent_id ? (agentName[e.agent_id] ?? "") : "", e.message);
      if (!lane) continue;
      const s = stats.get(lane.key)!;
      s.count++;
      if (e.kind === "error") s.errors++;
      if (now - new Date(e.created_at).getTime() < FRESH_MS) s.fresh = true;
    }
    return stats;
  }, [events, agentName, now]);

  // Events per hour, oldest -> newest, for the strip under the diagram.
  const hours = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => 0);
    for (const e of events) {
      const age = now - new Date(e.created_at).getTime();
      const i = 23 - Math.floor(age / 3_600_000);
      if (i >= 0 && i < 24) buckets[i]++;
    }
    return buckets;
  }, [events, now]);
  const peak = Math.max(1, ...hours);
  const total24 = hours.reduce((a, b) => a + b, 0);
  const errors24 = events.filter((e) => e.kind === "error").length;
  const feed = events.slice(0, 10);

  let accent = "#34d399";
  let headline = "All quiet - waiting for the next check";
  if (!loaded) {
    accent = "#64748b";
    headline = "Connecting...";
  } else if (!status) {
    accent = "#fbbf24";
    headline = "No check recorded yet - the first one shows up within 15 minutes";
  } else if (running) {
    accent = "#fbbf24";
    headline = "Working now";
  } else if (stale) {
    accent = "#f87171";
    headline = `HOPS hasn't checked in ${Math.round(minutesSinceStart)} minutes - the 15-minute timer may have stopped`;
  }

  const lastCheck =
    status && !running && status.finishedAt
      ? `Last check ${ago(status.finishedAt, now)}: ${status.seen === 0 ? "no new email" : `${status.seen} new email${status.seen === 1 ? "" : "s"}`}${status.handled > 0 ? ` · ${status.handled} handled` : ""}${status.left > 0 ? ` · ${status.left} left for a person` : ""}`
      : null;

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-white/10 p-4 text-slate-100 shadow-lg"
      style={{ background: "radial-gradient(1200px 500px at 40% 0%, #16264a 0%, #0b1220 55%, #070b14 100%)" }}
    >
      <style>{`
        @keyframes hops-flow { to { stroke-dashoffset: -28; } }
        @keyframes hops-spin { to { transform: rotate(360deg); } }
        @keyframes hops-breathe { 0%,100% { opacity: .35; transform: scale(1); } 50% { opacity: .75; transform: scale(1.06); } }
        @keyframes hops-ping { 0% { opacity: .7; transform: scale(1); } 100% { opacity: 0; transform: scale(2.2); } }
        .hops-flow { animation: hops-flow 1s linear infinite; }
        .hops-spin { animation: hops-spin 2.4s linear infinite; transform-origin: ${CORE.x}px ${CORE.y}px; }
        .hops-breathe { animation: hops-breathe 3.2s ease-in-out infinite; transform-origin: ${CORE.x}px ${CORE.y}px; }
        .hops-ping { animation: hops-ping 1.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
        @media (prefers-reduced-motion: reduce) { .hops-flow, .hops-spin, .hops-breathe, .hops-ping { animation: none; } }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            {(running || (!stale && loaded)) && <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${running ? "animate-ping" : ""}`} style={{ background: accent }} />}
            <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: accent }} />
          </span>
          <h2 className="text-sm font-bold tracking-wide">{headline}</h2>
        </div>
        <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">
          {running && status ? `${Math.max(0, Math.round((now - startedMs) / 1000))}s${status.source === "button" ? " · started by you" : ""}` : nextIn !== null && !stale ? `Checks every ${TIMER_MINUTES} min · next in about ${nextIn} min` : ""}
        </span>
        <button
          type="button"
          disabled={forcing || running}
          onClick={() => {
            setForceMsg(null);
            startForce(async () => {
              const r = await forceCheckNow();
              setForceMsg("error" in r ? r.error : r.seen === 0 && r.handled === 0 && r.created === 0 ? "Checked - nothing new." : `Checked - ${r.seen} new email${r.seen === 1 ? "" : "s"}, ${r.handled} handled${r.created > 0 ? `, ${r.created} email${r.created === 1 ? "" : "s"} sent or drafted` : ""}.`);
            });
          }}
          className="rounded-md border border-amber-400/60 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-50"
        >
          {forcing || running ? "Checking..." : "⚡ Check now"}
        </button>
        </div>
      </div>
      {forceMsg && <p className="mt-1 text-xs text-amber-200">{forceMsg}</p>}
      {lastCheck && (
        <p className="mt-1 text-xs text-slate-300">
          {lastCheck}
          {status?.error && <span className="text-red-400"> · it hit a problem: {status.error}</span>}
        </p>
      )}

      <svg viewBox="0 0 900 430" className="mt-2 w-full" role="img" aria-label="HOPS processing flow">
        <defs>
          <radialGradient id="hops-core" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#1e3a6e" />
            <stop offset="100%" stopColor="#0a1530" />
          </radialGradient>
          <filter id="hops-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <path id="hops-in" d={`M ${INBOX.x + 38} ${INBOX.y} L ${CORE.x - RING_R - 6} ${CORE.y}`} />
          {LANES.map((l, i) => (
            <path key={l.key} id={`hops-out-${l.key}`} d={`M ${CORE.x + RING_R + 6} ${CORE.y} C ${CORE.x + 190} ${CORE.y}, ${LANE_X - 190} ${laneY(i)}, ${LANE_X - 46} ${laneY(i)}`} />
          ))}
        </defs>

        {/* faint grid */}
        <g stroke="#ffffff" strokeOpacity="0.04">
          {Array.from({ length: 10 }, (_, i) => (
            <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="430" />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 100 + 15} x2="900" y2={i * 100 + 15} />
          ))}
        </g>

        {/* wires */}
        <use href="#hops-in" fill="none" stroke={running ? "#fbbf24" : "#334155"} strokeWidth="2" strokeDasharray="6 8" className={running ? "hops-flow" : ""} />
        {LANES.map((l) => {
          const s = laneStats.get(l.key)!;
          const lit = s.fresh || running;
          return <use key={l.key} href={`#hops-out-${l.key}`} fill="none" stroke={lit ? l.color : "#1e293b"} strokeOpacity={s.fresh ? 1 : running ? 0.55 : 1} strokeWidth={s.fresh ? 2.5 : 1.8} strokeDasharray="6 8" className={lit ? "hops-flow" : ""} />;
        })}

        {/* packets: email in while working, results out to wherever something just landed */}
        {running &&
          [0, 0.6, 1.2].map((d) => (
            <circle key={`in${d}`} r="5" fill="#fde68a" filter="url(#hops-glow)">
              <animateMotion dur="1.8s" begin={`${d}s`} repeatCount="indefinite">
                <mpath href="#hops-in" />
              </animateMotion>
            </circle>
          ))}
        {LANES.map((l) => {
          const s = laneStats.get(l.key)!;
          if (!s.fresh) return null;
          return [0, 1].map((d) => (
            <circle key={`${l.key}${d}`} r="5" fill={l.color} filter="url(#hops-glow)">
              <animateMotion dur="2s" begin={`${d}s`} repeatCount="indefinite">
                <mpath href={`#hops-out-${l.key}`} />
              </animateMotion>
            </circle>
          ));
        })}

        {/* inbox */}
        <g>
          {running && <circle cx={INBOX.x} cy={INBOX.y} r="38" fill="none" stroke="#fbbf24" strokeWidth="2" className="hops-ping" />}
          <circle cx={INBOX.x} cy={INBOX.y} r="38" fill="#0f1b33" stroke={running ? "#fbbf24" : "#475569"} strokeWidth="2" filter={running ? "url(#hops-glow)" : undefined} />
          <rect x={INBOX.x - 17} y={INBOX.y - 11} width="34" height="22" rx="3" fill="none" stroke="#e2e8f0" strokeWidth="2" />
          <path d={`M ${INBOX.x - 17} ${INBOX.y - 9} L ${INBOX.x} ${INBOX.y + 3} L ${INBOX.x + 17} ${INBOX.y - 9}`} fill="none" stroke="#e2e8f0" strokeWidth="2" />
          <text x={INBOX.x} y={INBOX.y + 62} textAnchor="middle" fontSize="13" fontWeight="700" fill="#e2e8f0">
            HOP@ inbox
          </text>
          <text x={INBOX.x} y={INBOX.y + 80} textAnchor="middle" fontSize="11" fill="#94a3b8">
            {status ? `${status.seen} new last check` : "waiting"}
          </text>
        </g>

        {/* core */}
        <g>
          <circle cx={CORE.x} cy={CORE.y} r={RING_R + 14} fill={accent} opacity="0.12" className="hops-breathe" />
          <circle cx={CORE.x} cy={CORE.y} r={RING_R} fill="none" stroke="#1e293b" strokeWidth="6" />
          {running ? (
            <circle cx={CORE.x} cy={CORE.y} r={RING_R} fill="none" stroke="#fbbf24" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${RING_LEN * 0.22} ${RING_LEN}`} className="hops-spin" filter="url(#hops-glow)" />
          ) : (
            <circle
              cx={CORE.x}
              cy={CORE.y}
              r={RING_R}
              fill="none"
              stroke={accent}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${RING_LEN * progress} ${RING_LEN}`}
              transform={`rotate(-90 ${CORE.x} ${CORE.y})`}
              filter="url(#hops-glow)"
            />
          )}
          <circle cx={CORE.x} cy={CORE.y} r={RING_R - 12} fill="url(#hops-core)" stroke="#2b4a86" strokeWidth="1.5" />
          <text x={CORE.x} y={CORE.y - 2} textAnchor="middle" fontSize="30" fontWeight="800" letterSpacing="2" fill="#f1f5f9">
            HOPS
          </text>
          <text x={CORE.x} y={CORE.y + 20} textAnchor="middle" fontSize="12" fill={accent}>
            {running ? "processing" : stale ? "stalled?" : nextIn !== null ? `next in ${nextIn}m` : "standing by"}
          </text>
        </g>
        {running && status && (
          <text x={CORE.x} y={CORE.y + RING_R + 34} textAnchor="middle" fontSize="12" fill="#fde68a">
            {status.step.length > 70 ? `${status.step.slice(0, 69)}…` : status.step}
          </text>
        )}

        {/* destinations */}
        {LANES.map((l, i) => {
          const s = laneStats.get(l.key)!;
          const y = laneY(i);
          return (
            <g key={l.key}>
              {s.fresh && <circle cx={LANE_X} cy={y} r="26" fill="none" stroke={l.color} strokeWidth="2" className="hops-ping" />}
              <circle cx={LANE_X} cy={y} r="26" fill="#0f1b33" stroke={s.fresh ? l.color : s.count > 0 ? `${l.color}99` : "#334155"} strokeWidth={s.fresh ? 3 : 2} filter={s.fresh ? "url(#hops-glow)" : undefined} />
              <text x={LANE_X} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="800" fill={s.count > 0 ? l.color : "#64748b"}>
                {s.count}
              </text>
              <text x={LANE_X + 38} y={y - 2} fontSize="13" fontWeight="700" fill="#e2e8f0">
                {l.label}
              </text>
              <text x={LANE_X + 38} y={y + 14} fontSize="11" fill={s.errors > 0 ? "#f87171" : "#94a3b8"}>
                {s.errors > 0 ? `${s.errors} problem${s.errors === 1 ? "" : "s"} · ` : ""}
                {s.count === 0 ? "nothing in 24h" : "last 24h"}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 24-hour strip */}
      <div className="mt-1">
        <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-400">
          <span>Last 24 hours</span>
          <span>
            {total24} event{total24 === 1 ? "" : "s"}
            {errors24 > 0 && <span className="text-red-400"> · {errors24} problem{errors24 === 1 ? "" : "s"}</span>}
          </span>
        </div>
        <div className="flex h-14 items-end gap-[3px]">
          {hours.map((n, i) => (
            <div key={i} className="flex h-full flex-1 items-end" title={`${n} event${n === 1 ? "" : "s"}, ${24 - i - 1}h ago`}>
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${Math.max(n === 0 ? 4 : 10, (n / peak) * 100)}%`,
                  background: n === 0 ? "#1e293b" : "linear-gradient(to top, #0ea5e9, #67e8f9)",
                  boxShadow: n > 0 && i === 23 ? "0 0 10px #67e8f9" : undefined,
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
          <span>24h ago</span>
          <span>now</span>
        </div>
      </div>

      {/* live feed */}
      <div className="mt-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Live feed</p>
        {feed.length === 0 ? (
          <p className="text-xs text-slate-500">Nothing yet.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {feed.map((e) => {
              const agent = e.agent_id ? (agentName[e.agent_id] ?? "Agent") : "";
              const lane = laneOf(agent, e.message);
              return (
                <li key={e.id} className="flex gap-2">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: e.kind === "error" ? "#f87171" : (lane?.color ?? "#64748b") }} />
                  <span className="w-16 shrink-0 text-slate-500">{ago(e.created_at, now)}</span>
                  <span className={KIND_STYLE[e.kind] ?? "text-slate-200"}>
                    {agent && <span className="font-semibold">{agent}: </span>}
                    {e.message}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
