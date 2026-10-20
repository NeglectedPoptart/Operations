// Each person's NFL team and this week's game, shown at the top of the menu.
// The schedule comes from ESPN's public scoreboard (no key needed); it is
// cached for a few minutes on the server.

export const NFL_TEAMS: { abbr: string; id: number; name: string }[] = [
  { abbr: "ARI", id: 22, name: "Arizona Cardinals" },
  { abbr: "ATL", id: 1, name: "Atlanta Falcons" },
  { abbr: "BAL", id: 33, name: "Baltimore Ravens" },
  { abbr: "BUF", id: 2, name: "Buffalo Bills" },
  { abbr: "CAR", id: 29, name: "Carolina Panthers" },
  { abbr: "CHI", id: 3, name: "Chicago Bears" },
  { abbr: "CIN", id: 4, name: "Cincinnati Bengals" },
  { abbr: "CLE", id: 5, name: "Cleveland Browns" },
  { abbr: "DAL", id: 6, name: "Dallas Cowboys" },
  { abbr: "DEN", id: 7, name: "Denver Broncos" },
  { abbr: "DET", id: 8, name: "Detroit Lions" },
  { abbr: "GB", id: 9, name: "Green Bay Packers" },
  { abbr: "HOU", id: 34, name: "Houston Texans" },
  { abbr: "IND", id: 11, name: "Indianapolis Colts" },
  { abbr: "JAX", id: 30, name: "Jacksonville Jaguars" },
  { abbr: "KC", id: 12, name: "Kansas City Chiefs" },
  { abbr: "LAC", id: 24, name: "Los Angeles Chargers" },
  { abbr: "LAR", id: 14, name: "Los Angeles Rams" },
  { abbr: "LV", id: 13, name: "Las Vegas Raiders" },
  { abbr: "MIA", id: 15, name: "Miami Dolphins" },
  { abbr: "MIN", id: 16, name: "Minnesota Vikings" },
  { abbr: "NE", id: 17, name: "New England Patriots" },
  { abbr: "NO", id: 18, name: "New Orleans Saints" },
  { abbr: "NYG", id: 19, name: "New York Giants" },
  { abbr: "NYJ", id: 20, name: "New York Jets" },
  { abbr: "PHI", id: 21, name: "Philadelphia Eagles" },
  { abbr: "PIT", id: 23, name: "Pittsburgh Steelers" },
  { abbr: "SEA", id: 26, name: "Seattle Seahawks" },
  { abbr: "SF", id: 25, name: "San Francisco 49ers" },
  { abbr: "TB", id: 27, name: "Tampa Bay Buccaneers" },
  { abbr: "TEN", id: 10, name: "Tennessee Titans" },
  { abbr: "WSH", id: 28, name: "Washington Commanders" },
];

// What is saved on the profile when someone says they don't follow the NFL.
export const NFL_NO_TEAM = "none";


export interface NflGameInfo {
  opponent: string; // short name, e.g. "Falcons"
  home: boolean;
  week: number | null;
}

// Everything the menu shows about a person's team.
export interface NflSummary {
  team: string; // short name, e.g. "Bears"
  logo: string | null;
  record: string | null; // "4-2"
  standing: string | null; // "2nd in NFC North"
  last: (NflGameInfo & { mine: number; theirs: number }) | null;
  live: (NflGameInfo & { mine: number; theirs: number; detail?: string }) | null;
  next: (NflGameInfo & { date: string; network?: string }) | null; // date = ISO kickoff, shown in the viewer's time zone
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  team: { abbreviation: string; shortDisplayName: string };
  score?: { value?: number } | string;
}
interface EspnEvent {
  date: string;
  week?: { number?: number };
  competitions: {
    competitors: EspnCompetitor[];
    broadcasts?: { media?: { shortName?: string }; names?: string[] }[];
    status: { type: { state: "pre" | "in" | "post"; completed?: boolean; shortDetail?: string } };
  }[];
}
interface EspnSchedule {
  team?: { shortDisplayName?: string; name?: string; logo?: string; recordSummary?: string; standingSummary?: string };
  events?: EspnEvent[];
}

function scoreOf(c: EspnCompetitor): number {
  return typeof c.score === "object" ? Number(c.score?.value ?? 0) : Number(c.score ?? 0);
}

// ESPN's public team schedule (no key needed), cached a few minutes on the server.
export async function loadNflSummary(abbr: string): Promise<NflSummary | null> {
  const team = NFL_TEAMS.find((t) => t.abbr === abbr);
  if (!team) return null;
  const fallbackName = team.name.split(" ").slice(-1)[0];
  const empty: NflSummary = { team: fallbackName, logo: null, record: null, standing: null, last: null, live: null, next: null };
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/schedule`, { next: { revalidate: 300 } });
    if (!res.ok) return empty;
    const sched = (await res.json()) as EspnSchedule;
    const summary: NflSummary = {
      ...empty,
      team: sched.team?.shortDisplayName ?? sched.team?.name ?? fallbackName,
      logo: sched.team?.logo ?? null,
      record: sched.team?.recordSummary ?? null,
      standing: sched.team?.standingSummary ?? null,
    };
    for (const event of sched.events ?? []) {
      const comp = event.competitions?.[0];
      const mine = comp?.competitors.find((c) => c.team.abbreviation === abbr);
      const theirs = comp?.competitors.find((c) => c.team.abbreviation !== abbr);
      if (!comp || !mine || !theirs) continue;
      const info: NflGameInfo = { opponent: theirs.team.shortDisplayName, home: mine.homeAway === "home", week: event.week?.number ?? null };
      const { state, completed, shortDetail } = comp.status.type;
      if (state === "post" || completed) summary.last = { ...info, mine: scoreOf(mine), theirs: scoreOf(theirs) };
      else if (state === "in") summary.live = { ...info, mine: scoreOf(mine), theirs: scoreOf(theirs), detail: shortDetail };
      else if (!summary.next) {
        const b = comp.broadcasts?.[0];
        summary.next = { ...info, date: event.date, network: b?.media?.shortName ?? b?.names?.[0] };
      }
    }
    return summary;
  } catch {
    return empty;
  }
}
