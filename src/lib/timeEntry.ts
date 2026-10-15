// Typing times of day quickly - "730", "7:30", "12", "3:30p", "1530" - and
// adding up a worked day (in, lunch out, lunch in, out). No Supabase imports.

export type TimeField = "clock_in" | "lunch_out" | "lunch_in" | "clock_out";

export interface DayTimes {
  clock_in: string | null; // "HH:MM" (24 hour)
  lunch_out: string | null;
  lunch_in: string | null;
  clock_out: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// "HH:MM" from what was typed, or null if it isn't a time. With no am/pm typed,
// a bare hour is read the way a shift goes: Clock in 1-11 is morning; for the
// other three, 10-11 is morning, 12 is noon and 1-9 is afternoon. Add "a" or
// "p" (or use 24-hour like 1530 / 0730) to say it exactly.
export function parseTimeInput(raw: string, field: TimeField): string | null {
  let s = raw.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  if (!s) return null;

  let meridiem: "am" | "pm" | null = null;
  const m = /(a|am|p|pm)$/.exec(s);
  if (m) {
    meridiem = m[1].startsWith("a") ? "am" : "pm";
    s = s.slice(0, s.length - m[1].length);
  }

  let hour: number;
  let minute = 0;
  let explicit24 = false;
  if (s.includes(":")) {
    const [h, mi] = s.split(":");
    if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(mi ?? "")) return null;
    hour = Number(h);
    minute = Number(mi);
    explicit24 = h.length === 2 && h.startsWith("0");
  } else if (/^\d{1,2}$/.test(s)) {
    hour = Number(s);
  } else if (/^\d{3,4}$/.test(s)) {
    hour = Number(s.slice(0, s.length - 2));
    minute = Number(s.slice(-2));
    explicit24 = s.length === 4 && s.startsWith("0");
  } else {
    return null;
  }
  if (!Number.isInteger(hour) || minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else if (!explicit24 && hour >= 1 && hour <= 12) {
    if (field === "clock_in") {
      // 1-11 morning, 12 noon - as typed
    } else if (hour === 12) {
      // noon
    } else if (hour <= 9) {
      hour += 12;
    }
    // 10-11 stay in the morning
  }
  return `${pad(hour)}:${pad(minute)}`;
}

// "13:30" -> "1:30 PM"
export function formatTime(value: string | null): string {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${suffix}`;
}

// The database hands back "HH:MM:SS".
export function trimSeconds(value: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

function minutesOf(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export interface DayResult {
  // Worked minutes, or null when there isn't enough to work it out.
  minutes: number | null;
  // Something to look at (times out of order, lunch half entered), or null.
  problem: string | null;
}

export function workedDay(t: DayTimes): DayResult {
  const { clock_in, lunch_out, lunch_in, clock_out } = t;
  if (!clock_in && !lunch_out && !lunch_in && !clock_out) return { minutes: null, problem: null };
  if (!clock_in || !clock_out) return { minutes: null, problem: "Needs a clock in and a clock out" };
  const start = minutesOf(clock_in);
  const end = minutesOf(clock_out);
  if (end <= start) return { minutes: null, problem: "Clock out is before clock in" };

  let lunch = 0;
  if (lunch_out && lunch_in) {
    const a = minutesOf(lunch_out);
    const b = minutesOf(lunch_in);
    if (b <= a) return { minutes: null, problem: "Lunch in is before lunch out" };
    if (a < start || b > end) return { minutes: null, problem: "Lunch is outside the shift" };
    lunch = b - a;
  } else if (lunch_out || lunch_in) {
    return { minutes: end - start, problem: "Lunch is only half entered - not taken off" };
  }
  return { minutes: end - start - lunch, problem: null };
}

// 510 -> "8:30"
export function hoursMinutes(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

// 510 -> "8.50" (payroll-style decimal hours)
export function decimalHours(minutes: number): string {
  return (minutes / 60).toFixed(2);
}
