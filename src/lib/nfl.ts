// Each person's NFL team and this week's game, shown at the top of the menu.
// The schedule comes from ESPN's public scoreboard (no key needed); it is
// cached for a few minutes on the server.

export const NFL_TEAMS: { abbr: string; name: string }[] = [
  { abbr: "ARI", name: "Arizona Cardinals" },
  { abbr: "ATL", name: "Atlanta Falcons" },
  { abbr: "BAL", name: "Baltimore Ravens" },
  { abbr: "BUF", name: "Buffalo Bills" },
  { abbr: "CAR", name: "Carolina Panthers" },
  { abbr: "CHI", name: "Chicago Bears" },
  { abbr: "CIN", name: "Cincinnati Bengals" },
  { abbr: "CLE", name: "Cleveland Browns" },
  { abbr: "DAL", name: "Dallas Cowboys" },
  { abbr: "DEN", name: "Denver Broncos" },
  { abbr: "DET", name: "Detroit Lions" },
  { abbr: "GB", name: "Green Bay Packers" },
  { abbr: "HOU", name: "Houston Texans" },
  { abbr: "IND", name: "Indianapolis Colts" },
  { abbr: "JAX", name: "Jacksonville Jaguars" },
  { abbr: "KC", name: "Kansas City Chiefs" },
  { abbr: "LAC", name: "Los Angeles Chargers" },
  { abbr: "LAR", name: "Los Angeles Rams" },
  { abbr: "LV", name: "Las Vegas Raiders" },
  { abbr: "MIA", name: "Miami Dolphins" },
  { abbr: "MIN", name: "Minnesota Vikings" },
  { abbr: "NE", name: "New England Patriots" },
  { abbr: "NO", name: "New Orleans Saints" },
  { abbr: "NYG", name: "New York Giants" },
  { abbr: "NYJ", name: "New York Jets" },
  { abbr: "PHI", name: "Philadelphia Eagles" },
  { abbr: "PIT", name: "Pittsburgh Steelers" },
  { abbr: "SEA", name: "Seattle Seahawks" },
  { abbr: "SF", name: "San Francisco 49ers" },
  { abbr: "TB", name: "Tampa Bay Buccaneers" },
  { abbr: "TEN", name: "Tennessee Titans" },
  { abbr: "WSH", name: "Washington Commanders" },
];

// What is saved on the profile when someone says they don't follow the NFL.
export const NFL_NO_TEAM = "none";

export interface NflGame {
  state: "none" | "bye" | "scheduled" | "live" | "final";
  week: number | null;
  team: string; // short name, e.g. "Bears"
  logo: string | null;
  opponent?: string; // short name, e.g. "Falcons"
  home?: boolean;
  date?: string; // ISO kickoff time - shown in the viewer's own time zone
  network?: string;
  detail?: string; // live: "Q3 4:12"
  score?: { mine: number; theirs: number };
}

interface EspnTeam {
  abbreviation: string;
  shortDisplayName: string;
  logo?: string;
}
interface EspnCompetitor {
  homeAway: "home" | "away";
  team: EspnTeam;
  score?: string;
}
interface EspnEvent {
  date: string;
  competitions: {
    competitors: EspnCompetitor[];
    broadcasts?: { names?: string[] }[];
    status: { type: { state: "pre" | "in" | "post"; shortDetail?: string } };
  }[];
}
interface EspnScoreboard {
  week?: { number?: number; teamsOnBye?: EspnTeam[] };
  events?: EspnEvent[];
}

const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function loadNflGame(abbr: string): Promise<NflGame> {
  const fallback: NflGame = { state: "none", week: null, team: NFL_TEAMS.find((t) => t.abbr === abbr)?.name.split(" ").slice(-1)[0] ?? abbr, logo: null };
  try {
    const res = await fetch(SCOREBOARD_URL, { next: { revalidate: 300 } });
    if (!res.ok) return fallback;
    const board = (await res.json()) as EspnScoreboard;
    const week = board.week?.number ?? null;

    for (const event of board.events ?? []) {
      const comp = event.competitions?.[0];
      const mine = comp?.competitors.find((c) => c.team.abbreviation === abbr);
      const theirs = comp?.competitors.find((c) => c.team.abbreviation !== abbr);
      if (!comp || !mine || !theirs) continue;
      const state = comp.status.type.state;
      return {
        state: state === "pre" ? "scheduled" : state === "in" ? "live" : "final",
        week,
        team: mine.team.shortDisplayName,
        logo: mine.team.logo ?? null,
        opponent: theirs.team.shortDisplayName,
        home: mine.homeAway === "home",
        date: event.date,
        network: comp.broadcasts?.[0]?.names?.[0],
        detail: state === "in" ? comp.status.type.shortDetail : undefined,
        score: state === "pre" ? undefined : { mine: Number(mine.score ?? 0), theirs: Number(theirs.score ?? 0) },
      };
    }

    const bye = board.week?.teamsOnBye?.find((t) => t.abbreviation === abbr);
    if (bye) return { state: "bye", week, team: bye.shortDisplayName, logo: bye.logo ?? null };
    return { ...fallback, week };
  } catch {
    return fallback;
  }
}
