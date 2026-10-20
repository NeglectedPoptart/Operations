"use client";

import { useEffect, useState } from "react";
import { getNflSummary } from "@/app/nflActions";
import { NFL_NO_TEAM, type NflSummary } from "@/lib/nfl";
import { NFL_CHANGE_EVENT } from "./NflTeamPrompt";

const REFRESH_MS = 10 * 60_000;

function zoneName(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
}

function kickoff(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

// The top of the menu: the time and time zone where you are, and your NFL
// team - record, last score, and the next game (kickoff shown in your own time zone).
export default function SidebarClock({ team, compact = false }: { team: string | null; compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  const [info, setInfo] = useState<NflSummary | null>(null);
  const hasTeam = !!team && team !== NFL_NO_TEAM;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!hasTeam) return;
    let cancelled = false;
    const load = () =>
      getNflSummary(team!)
        .then((g) => !cancelled && setInfo(g))
        .catch(() => {});
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [team, hasTeam]);

  const time = now ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const zone = now ? zoneName(now) : "";
  const openPicker = () => window.dispatchEvent(new Event(NFL_CHANGE_EVENT));

  const vs = (home: boolean) => (home ? "vs" : "@");
  const resultOf = (mine: number, theirs: number) => (mine > theirs ? "W" : mine < theirs ? "L" : "T");

  if (compact) {
    const next = info?.next;
    return (
      <div className="min-w-0 text-center leading-tight text-white">
        <p className="text-sm font-semibold">
          {time} <span className="text-[11px] font-normal text-sidebar-text-muted">{zone}</span>
        </p>
        {hasTeam && info && (
          <p className="truncate text-[11px] text-sidebar-text-muted">
            {info.team}
            {info.record ? ` ${info.record}` : ""}
            {info.live ? ` · LIVE ${info.live.mine}-${info.live.theirs}` : next ? ` · ${vs(next.home)} ${next.opponent} ${kickoff(next.date)}` : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md bg-black/20 px-3 py-2 leading-tight">
      <p className="text-center text-lg font-bold text-white">
        {time} <span className="text-xs font-medium text-sidebar-text-muted">{zone}</span>
      </p>
      {hasTeam ? (
        <button onClick={openPicker} title="Change my NFL team" className="mt-1.5 block w-full border-t border-sidebar-border pt-1.5 text-left">
          {info ? (
            <>
              <span className="flex items-center gap-1.5">
                {info.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={info.logo} alt="" className="h-6 w-6 shrink-0 object-contain" onError={(e) => (e.currentTarget.style.display = "none")} />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-white">
                    {info.team}
                    {info.record ? ` · ${info.record}` : ""}
                  </span>
                  {info.standing && <span className="block truncate text-[10px] text-sidebar-text-muted">{info.standing}</span>}
                </span>
              </span>
              {info.live && (
                <span className="mt-1 block text-[11px] font-semibold text-amber-300">
                  LIVE {info.live.mine}-{info.live.theirs} {vs(info.live.home)} {info.live.opponent}
                  {info.live.detail ? ` · ${info.live.detail}` : ""}
                </span>
              )}
              {info.last && (
                <span className="mt-1 block text-[11px] text-sidebar-text">
                  <span className="text-sidebar-text-muted">Last: </span>
                  <span className={`font-semibold ${resultOf(info.last.mine, info.last.theirs) === "W" ? "text-green-300" : resultOf(info.last.mine, info.last.theirs) === "L" ? "text-red-300" : ""}`}>
                    {resultOf(info.last.mine, info.last.theirs)} {info.last.mine}-{info.last.theirs}
                  </span>{" "}
                  {vs(info.last.home)} {info.last.opponent}
                </span>
              )}
              {info.next && (
                <span className="mt-0.5 block text-[11px] text-sidebar-text">
                  <span className="text-sidebar-text-muted">Next: </span>
                  {vs(info.next.home)} {info.next.opponent}
                  <span className="block text-sidebar-text-muted">
                    {kickoff(info.next.date)}
                    {info.next.network ? ` · ${info.next.network}` : ""}
                  </span>
                </span>
              )}
              {!info.next && !info.live && <span className="mt-0.5 block text-[11px] text-sidebar-text-muted">No upcoming game on the schedule.</span>}
            </>
          ) : (
            <span className="text-[11px] text-sidebar-text-muted">Checking your team...</span>
          )}
        </button>
      ) : (
        <div className="mt-0.5 text-center">
          <button onClick={openPicker} className="text-[11px] text-sidebar-text-muted hover:text-white hover:underline">
            🏈 Pick your NFL team
          </button>
        </div>
      )}
    </div>
  );
}
