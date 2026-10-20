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
// NBA teams can be followed instead of an NFL team (same panel, same saved field). They are
// saved as "NBA:" + the abbreviation, because NBA and NFL abbreviations overlap (CHI, DAL, ...).
export const NBA_PREFIX = "NBA:";
export const NBA_TEAMS: { abbr: string; id: number; name: string }[] = [
  { abbr: "ATL", id: 1, name: "Atlanta Hawks" },
  { abbr: "BOS", id: 2, name: "Boston Celtics" },
  { abbr: "BKN", id: 17, name: "Brooklyn Nets" },
  { abbr: "CHA", id: 30, name: "Charlotte Hornets" },
  { abbr: "CHI", id: 4, name: "Chicago Bulls" },
  { abbr: "CLE", id: 5, name: "Cleveland Cavaliers" },
  { abbr: "DAL", id: 6, name: "Dallas Mavericks" },
  { abbr: "DEN", id: 7, name: "Denver Nuggets" },
  { abbr: "DET", id: 8, name: "Detroit Pistons" },
  { abbr: "GS", id: 9, name: "Golden State Warriors" },
  { abbr: "HOU", id: 10, name: "Houston Rockets" },
  { abbr: "IND", id: 11, name: "Indiana Pacers" },
  { abbr: "LAC", id: 12, name: "LA Clippers" },
  { abbr: "LAL", id: 13, name: "Los Angeles Lakers" },
  { abbr: "MEM", id: 29, name: "Memphis Grizzlies" },
  { abbr: "MIA", id: 14, name: "Miami Heat" },
  { abbr: "MIL", id: 15, name: "Milwaukee Bucks" },
  { abbr: "MIN", id: 16, name: "Minnesota Timberwolves" },
  { abbr: "NO", id: 3, name: "New Orleans Pelicans" },
  { abbr: "NY", id: 18, name: "New York Knicks" },
  { abbr: "OKC", id: 25, name: "Oklahoma City Thunder" },
  { abbr: "ORL", id: 19, name: "Orlando Magic" },
  { abbr: "PHI", id: 20, name: "Philadelphia 76ers" },
  { abbr: "PHX", id: 21, name: "Phoenix Suns" },
  { abbr: "POR", id: 22, name: "Portland Trail Blazers" },
  { abbr: "SAC", id: 23, name: "Sacramento Kings" },
  { abbr: "SA", id: 24, name: "San Antonio Spurs" },
  { abbr: "TOR", id: 28, name: "Toronto Raptors" },
  { abbr: "UTAH", id: 26, name: "Utah Jazz" },
  { abbr: "WSH", id: 27, name: "Washington Wizards" },
];

// Earlier version of the picker saved "SPURS" for the San Antonio Spurs.
const LEGACY_SPURS = "SPURS";

// Is this a value that can be saved as someone's team?
export function isTeamChoice(value: string): boolean {
  return (
    value === NFL_NO_TEAM ||
    value === LEGACY_SPURS ||
    NFL_TEAMS.some((t) => t.abbr === value) ||
    (value.startsWith(NBA_PREFIX) && NBA_TEAMS.some((t) => t.abbr === value.slice(NBA_PREFIX.length)))
  );
}

// Where a saved team's schedule comes from on ESPN.
function sourceFor(value: string): { sport: string; id: number; abbr: string; fallbackName: string } | null {
  const lastWord = (name: string) => name.split(" ").slice(-1)[0];
  const nbaAbbr = value === LEGACY_SPURS ? "SA" : value.startsWith(NBA_PREFIX) ? value.slice(NBA_PREFIX.length) : null;
  if (nbaAbbr) {
    const t = NBA_TEAMS.find((x) => x.abbr === nbaAbbr);
    return t ? { sport: "basketball/nba", id: t.id, abbr: t.abbr, fallbackName: t.name.endsWith("76ers") ? "76ers" : lastWord(t.name) } : null;
  }
  const team = NFL_TEAMS.find((t) => t.abbr === value);
  return team ? { sport: "football/nfl", id: team.id, abbr: team.abbr, fallbackName: lastWord(team.name) } : null;
}

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
export async function loadNflSummary(value: string): Promise<NflSummary | null> {
  const source = sourceFor(value);
  if (!source) return null;
  const abbr = source.abbr;
  const empty: NflSummary = { team: source.fallbackName, logo: null, record: null, standing: null, last: null, live: null, next: null };
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${source.sport}/teams/${source.id}/schedule`, { next: { revalidate: 300 } });
    if (!res.ok) return empty;
    const sched = (await res.json()) as EspnSchedule;
    const summary: NflSummary = {
      ...empty,
      team: sched.team?.shortDisplayName ?? sched.team?.name ?? source.fallbackName,
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
