"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentEvent } from "@/lib/agents/types";
import { TICK_STATUS_KEY, type TickStatus } from "@/lib/agents/status";

// A live view of HOPS's background worker: is it working right now, what it is doing, when it last checked the
// HOP@ inbox and what it did with what it found, plus the newest things it logged. Refreshes itself every few
// seconds, so it can be left open while an email is on its way.

const POLL_MS = 4000;
const TIMER_MINUTES = 15;
// The timer is every 15 minutes; this long without a pass starting means it has stopped.
const STALE_MINUTES = 35;

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const KIND_STYLE: Record<string, string> = {
  error: "text-red-600 dark:text-red-400",
  inbox: "text-blue-700 dark:text-blue-300",
  reply: "text-green-700 dark:text-green-400",
};

export default function LiveStatus({ initialEvents, agentName }: { initialEvents: AgentEvent[]; agentName: Record<string, string> }) {
  const [status, setStatus] = useState<TickStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>(initialEvents.slice(0, 12));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    async function load() {
      const [{ data: row }, { data: ev }] = await Promise.all([
        supabase.from("agent_state").select("value").eq("key", TICK_STATUS_KEY).maybeSingle(),
        supabase.from("agent_events").select("*").order("created_at", { ascending: false }).limit(12),
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
  const stale = !running && status && minutesSinceStart > STALE_MINUTES;
  const nextIn = status && !running ? Math.max(0, Math.ceil(TIMER_MINUTES - minutesSinceStart)) : null;

  let dot = "bg-green-500";
  let headline = "Idle - waiting for the next check";
  if (!loaded) {
    dot = "bg-black/20";
    headline = "Checking...";
  } else if (!status) {
    dot = "bg-amber-500";
    headline = "No check recorded yet - the first one shows up within 15 minutes";
  } else if (running) {
    dot = "bg-amber-500 animate-pulse";
    headline = "Working now";
  } else if (stale) {
    dot = "bg-red-500";
    headline = `HOPS hasn't checked in ${Math.round(minutesSinceStart)} minutes - the 15-minute timer may have stopped`;
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/15 p-4 dark:border-white/15">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${dot}`} />
          <h2 className="text-sm font-bold">{headline}</h2>
        </div>
        {status && !running && nextIn !== null && !stale && (
          <span className="text-xs text-black/50 dark:text-white/50">Checks every {TIMER_MINUTES} minutes - next in about {nextIn} min</span>
        )}
      </div>

      {running && status && (
        <div className="space-y-1.5">
          <p className="text-sm">
            {status.step} <span className="text-xs text-black/50 dark:text-white/50">({Math.max(0, Math.round((now - startedMs) / 1000))}s{status.source === "button" ? ", started by you" : ""})</span>
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded bg-black/10 dark:bg-white/10">
            <div className="h-full w-1/3 animate-pulse rounded bg-amber-500" />
          </div>
        </div>
      )}

      {status && !running && status.finishedAt && (
        <p className="text-sm">
          Last check {ago(status.finishedAt, now)}:{" "}
          {status.seen === 0 ? "no new email" : `${status.seen} new email${status.seen === 1 ? "" : "s"} seen`}
          {status.handled > 0 && ` · ${status.handled} handled`}
          {status.left > 0 && ` · ${status.left} left for a person`}
          {status.error && <span className="text-red-600 dark:text-red-400"> · it hit a problem: {status.error}</span>}
        </p>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">Latest activity</p>
        {events.length === 0 ? (
          <p className="text-xs text-black/50 dark:text-white/50">Nothing yet.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="w-20 shrink-0 text-black/50 dark:text-white/50">{ago(e.created_at, now)}</span>
                <span className={KIND_STYLE[e.kind] ?? ""}>
                  {e.agent_id && <span className="font-medium">{agentName[e.agent_id] ?? "Agent"}: </span>}
                  {e.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
