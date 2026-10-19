"use client";

import { useEffect, useState } from "react";
import { getNflGame } from "@/app/nflActions";
import { NFL_NO_TEAM, type NflGame } from "@/lib/nfl";
import { NFL_CHANGE_EVENT } from "./NflTeamPrompt";

const GAME_REFRESH_MS = 10 * 60_000;

function zoneName(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
}

function kickoff(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

// The top of the menu: the time and time zone where you are, and this week's
// game for your NFL team (kickoff shown in your own time zone).
export default function SidebarClock({ team, compact = false }: { team: string | null; compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  const [game, setGame] = useState<NflGame | null>(null);
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
      getNflGame(team!)
        .then((g) => !cancelled && setGame(g))
        .catch(() => {});
    void load();
    const t = setInterval(load, GAME_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [team, hasTeam]);

  const time = now ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const zone = now ? zoneName(now) : "";
  const openPicker = () => window.dispatchEvent(new Event(NFL_CHANGE_EVENT));

  let gameLine: string | null = null;
  let gameSub: string | null = null;
  let gameTone = "text-white";
  if (hasTeam && game) {
    const vs = game.home ? "vs" : "@";
    if (game.state === "scheduled" && game.date) {
      gameLine = `${game.team} ${vs} ${game.opponent}`;
      gameSub = [kickoff(game.date), game.network].filter(Boolean).join(" · ");
    } else if (game.state === "live") {
      gameLine = `${game.team} ${game.score?.mine}, ${game.opponent} ${game.score?.theirs}`;
      gameSub = ["LIVE", game.detail].filter(Boolean).join(" · ");
      gameTone = "text-amber-300";
    } else if (game.state === "final" && game.score) {
      const won = game.score.mine > game.score.theirs;
      gameLine = `${game.team} ${game.score.mine}, ${game.opponent} ${game.score.theirs}`;
      gameSub = game.score.mine === game.score.theirs ? "Final · Tie" : won ? "Final · Win" : "Final · Loss";
      gameTone = won ? "text-green-300" : "text-white";
    } else if (game.state === "bye") {
      gameLine = `${game.team} - bye week`;
    } else {
      gameLine = `No ${game.team} game found this week`;
    }
  }

  if (compact) {
    return (
      <div className="min-w-0 text-center leading-tight text-white">
        <p className="text-sm font-semibold">
          {time} <span className="text-[11px] font-normal text-sidebar-text-muted">{zone}</span>
        </p>
        {gameLine && <p className={`truncate text-[11px] ${gameTone}`}>{gameLine}{gameSub ? ` · ${gameSub}` : ""}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md bg-black/20 px-3 py-2 text-center leading-tight">
      <p className="text-lg font-bold text-white">
        {time} <span className="text-xs font-medium text-sidebar-text-muted">{zone}</span>
      </p>
      {hasTeam && (
        <button onClick={openPicker} title="Change my NFL team" className="mt-1 block w-full text-center">
          {game?.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.logo} alt="" className="mx-auto mb-0.5 h-6 w-6 object-contain" onError={(e) => (e.currentTarget.style.display = "none")} />
          )}
          <span className={`block text-xs font-semibold ${gameTone}`}>{gameLine ?? "Checking this week's game..."}</span>
          {gameSub && <span className="block text-[11px] text-sidebar-text-muted">{gameSub}</span>}
        </button>
      )}
      {!hasTeam && (
        <button onClick={openPicker} className="mt-0.5 text-[11px] text-sidebar-text-muted hover:text-white hover:underline">
          🏈 Pick your NFL team
        </button>
      )}
    </div>
  );
}
