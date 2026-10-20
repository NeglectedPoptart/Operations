"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveNflTeam } from "@/app/nflActions";
import { NBA_PREFIX, NBA_TEAMS, NFL_NO_TEAM, NFL_TEAMS } from "@/lib/nfl";

export const NFL_CHANGE_EVENT = "hops-nfl-change";

type League = "NFL" | "NBA";

// Asks everyone once who their team is (the next time they are signed in) - an NFL
// or NBA team - and can be opened again from the clock at the top of the menu to change it.
export default function NflTeamPrompt({ team }: { team: string | null }) {
  const router = useRouter();
  // null = never asked. Once they answer (a team, or "none") it never opens by itself again.
  const firstAsk = team === null;
  const [open, setOpen] = useState(firstAsk);
  const [league, setLeague] = useState<League>(team && (team.startsWith(NBA_PREFIX) || team === "SPURS") ? "NBA" : "NFL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(NFL_CHANGE_EVENT, show);
    return () => window.removeEventListener(NFL_CHANGE_EVENT, show);
  }, []);

  async function choose(value: string) {
    setSaving(true);
    setError(null);
    const result = await saveNflTeam(value);
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) return null;
  const options = league === "NFL" ? NFL_TEAMS.map((t) => ({ value: t.abbr, name: t.name })) : NBA_TEAMS.map((t) => ({ value: `${NBA_PREFIX}${t.abbr}`, name: t.name }));
  const current = team === "SPURS" ? `${NBA_PREFIX}SA` : team;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => !firstAsk && setOpen(false)}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 text-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{league === "NFL" ? "🏈" : "🏀"} Who&apos;s your team?</h2>
        <p className="mt-1 text-sm text-black/60">
          One quick question. We&apos;ll show your team&apos;s record, last score and next game at the top of the menu. Pick an NFL team - or an NBA team if you&apos;d rather follow basketball.
        </p>
        <div className="mt-3 flex gap-1.5">
          {(["NFL", "NBA"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLeague(l)}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold ${league === l ? "bg-green-600 text-white" : "border border-black/20 hover:bg-black/5"}`}
            >
              {l === "NFL" ? "🏈 NFL" : "🏀 NBA"}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {options.map((t) => (
            <button
              key={t.value}
              disabled={saving}
              onClick={() => void choose(t.value)}
              className={`rounded-md border px-2 py-1.5 text-left text-sm hover:bg-green-50 disabled:opacity-50 ${current === t.value ? "border-green-600 bg-green-50 font-semibold" : "border-black/15"}`}
            >
              {t.name}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button disabled={saving} onClick={() => void choose(NFL_NO_TEAM)} className="rounded-md border border-black/20 px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50">
            I don&apos;t follow either
          </button>
          {!firstAsk && (
            <button onClick={() => setOpen(false)} className="text-sm text-black/50 hover:underline">
              Cancel
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
