import { APP_TIMEZONE } from "../dates";

// Fixed daily send times for the Load ETA agent, in the business timezone.
// Kept free of any HOPS/Supabase imports so the arithmetic can be checked on
// its own.

export const DEFAULT_SEND_TIMES = ["05:00", "09:00", "13:00", "17:00", "21:00"];
export const DEFAULT_WINDOW_START = "05:00";
export const DEFAULT_WINDOW_END = "21:30";

// A slot whose tick got delayed can still go out for this long after its
// start; beyond that it is skipped rather than sent late.
const CATCH_UP_MS = 2 * 3_600_000;

export interface SlotConfig {
  send_times?: string[];
  window_start?: string;
  window_end?: string;
}

function minutesOf(hhmm: string | undefined, fallback: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim()) ?? /^(\d{1,2}):(\d{2})$/.exec(fallback)!;
  return Number(m[1]) * 60 + Number(m[2]);
}

interface Parts {
  year: number;
  month: number;
  day: number;
  minutes: number;
}

function zonedParts(date: Date): Parts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const get = (type: string) => Number(f.formatToParts(date).find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day"), minutes: get("hour") * 60 + get("minute") };
}

// The UTC instant at which the clock in APP_TIMEZONE reads the given date
// and minutes-of-day.
function zonedInstant(year: number, month: number, day: number, minutes: number): Date {
  const naive = Date.UTC(year, month - 1, day, 0, minutes);
  const offsetOf = (ms: number) => {
    const p = zonedParts(new Date(ms));
    return Date.UTC(p.year, p.month - 1, p.day, 0, p.minutes) - ms;
  };
  let ms = naive - offsetOf(naive);
  ms = naive - offsetOf(ms); // settles the guess across a daylight-saving change
  return new Date(ms);
}

export function inWindow(now: Date, config: SlotConfig): boolean {
  const { minutes } = zonedParts(now);
  return (
    minutes >= minutesOf(config.window_start, DEFAULT_WINDOW_START) &&
    minutes <= minutesOf(config.window_end, DEFAULT_WINDOW_END)
  );
}

// The send slot "now" belongs to - the latest of today's slots that has
// started, was within the last 2 hours, and falls inside the sending window -
// or null when nothing is due. Returned as the UTC instant the slot began.
export function currentSlot(now: Date, config: SlotConfig): Date | null {
  if (!inWindow(now, config)) return null;
  const today = zonedParts(now);
  const times = (config.send_times?.length ? config.send_times : DEFAULT_SEND_TIMES)
    .map((t) => minutesOf(t, "00:00"))
    .sort((a, b) => a - b);
  const windowStart = minutesOf(config.window_start, DEFAULT_WINDOW_START);
  const windowEnd = minutesOf(config.window_end, DEFAULT_WINDOW_END);

  let best: Date | null = null;
  for (const m of times) {
    if (m < windowStart || m > windowEnd) continue;
    const start = zonedInstant(today.year, today.month, today.day, m);
    const age = now.getTime() - start.getTime();
    if (age >= 0 && age < CATCH_UP_MS) best = start;
  }
  return best;
}
