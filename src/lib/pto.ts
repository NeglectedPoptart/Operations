import { addDays } from "./dates";

// Paid time off: everyone who has been here a year gets one week (5 working
// days) per year of service. A "PTO year" runs from one work anniversary to the
// day before the next, and a week used in one PTO year doesn't carry to the next.
export const PTO_DAYS_PER_YEAR = 5;

// Working days (Monday-Friday) from start to end, both included.
export function weekdaysBetween(start: string, end: string): number {
  let count = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    if (count > 400) break;
  }
  return count;
}

export function addYears(iso: string, years: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export interface PtoYear {
  // 0 = still in the first year (nothing earned yet), 1 = the year after the first anniversary...
  index: number;
  start: string;
  end: string;
  allowance: number;
}

// The PTO year a date falls in, for someone hired on `hire`.
export function ptoYearAt(hire: string, date: string): PtoYear {
  let n = 0;
  while (addYears(hire, n + 1) <= date && n < 80) n++;
  return {
    index: n,
    start: addYears(hire, n),
    end: addDays(addYears(hire, n + 1), -1),
    allowance: n >= 1 ? PTO_DAYS_PER_YEAR : 0,
  };
}

export interface PtoEntryLike {
  start_date: string;
  end_date: string;
  days: number | null;
}

export function entryDays(e: PtoEntryLike): number {
  return e.days ?? weekdaysBetween(e.start_date, e.end_date);
}

export interface PtoBalance {
  year: PtoYear;
  used: number;
  remaining: number;
  // Booked for a later PTO year.
  later: number;
}

export function ptoBalance(hire: string, entries: PtoEntryLike[], today: string): PtoBalance {
  const year = ptoYearAt(hire, today);
  let used = 0;
  let later = 0;
  for (const e of entries) {
    if (e.start_date >= year.start && e.start_date <= year.end) used += entryDays(e);
    else if (e.start_date > year.end) later += entryDays(e);
  }
  return { year, used, remaining: year.allowance - used, later };
}
