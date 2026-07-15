// All "today"/"this week" calculations use a fixed business timezone rather than
// the server's local time, since serverless hosts (Vercel) run in UTC regardless
// of where the trucks actually are. Change this if the dispatch office is elsewhere.
export const APP_TIMEZONE = "America/Chicago";

export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Monday of the ISO week containing dateStr (YYYY-MM-DD, treated as a plain calendar date).
export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sun ... 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(dateStr, diff);
}

export function currentWeekStart(): string {
  return mondayOf(todayISO());
}

export function weekEnd(weekStart: string): string {
  return addDays(weekStart, 6);
}

export function prevWeekStart(weekStart: string): string {
  return addDays(weekStart, -7);
}

export function nextWeekStart(weekStart: string): string {
  return addDays(weekStart, 7);
}

export function formatWeekLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${weekEnd(weekStart)}T00:00:00Z`);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(start)} - ${fmt(end)}`;
}

// Accepts military-style digit entry ("1400", "900") and returns a 12-hour
// clock string ("2:00 PM", "9:00 AM"). Anything that isn't 3-4 plain digits
// (already-formatted text like "8:30 AM", partial input, etc.) passes through
// unchanged so manual entries are never mangled.
export function formatMilitaryInput(raw: string): string {
  const trimmed = raw.trim();
  if (!/^\d{3,4}$/.test(trimmed)) return raw;

  const padded = trimmed.padStart(4, "0");
  const hour = Number(padded.slice(0, 2));
  const minute = Number(padded.slice(2, 4));
  if (hour > 23 || minute > 59) return raw;

  const period = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// First of the month containing dateStr.
export function monthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Last day of the month containing monthStartStr (which must be a "-01" date).
export function monthEnd(monthStartStr: string): string {
  return addDays(addMonths(monthStartStr, 1), -1);
}

export function currentMonthStart(): string {
  return monthStart(todayISO());
}

export function formatMonthLabel(monthStartStr: string): string {
  const d = new Date(`${monthStartStr}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
