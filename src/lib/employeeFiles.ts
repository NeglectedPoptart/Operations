export interface UpcomingAnniversary {
  // Which anniversary this is (1st year, 2nd year, ...).
  year: number;
  // ISO date the anniversary actually falls on.
  date: string;
  daysAway: number;
}

// The next work anniversary on or after today, treating start_date as a
// plain calendar date (matching this app's other date-math in
// src/lib/dates.ts, which is all UTC-midnight-based). Returns null for an
// employee who hasn't completed a first year yet - there's no "0-year
// anniversary" to alert on.
export function nextAnniversary(startDateIso: string, todayIso: string): UpcomingAnniversary | null {
  const start = new Date(`${startDateIso}T00:00:00Z`);
  const today = new Date(`${todayIso}T00:00:00Z`);
  const startYear = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();

  let candidateYear = today.getUTCFullYear();
  let candidate = new Date(Date.UTC(candidateYear, month, day));
  if (candidate.getTime() < today.getTime()) {
    candidateYear += 1;
    candidate = new Date(Date.UTC(candidateYear, month, day));
  }

  const yearsSinceStart = candidateYear - startYear;
  if (yearsSinceStart < 1) return null;

  const daysAway = Math.round((candidate.getTime() - today.getTime()) / 86400000);
  return { year: yearsSinceStart, date: candidate.toISOString().slice(0, 10), daysAway };
}
