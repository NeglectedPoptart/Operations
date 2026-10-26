import { addDays } from "./dates";
import { MX_ARRIVAL_DAYS, type MxArrival, type MxArrivalDay } from "./types";

// Mexico > AP Summary: every load that has arrived, how many days ago, the grower's AP terms
// and when payment is due. All dates are plain calendar days (YYYY-MM-DD).

const DAY_INDEX = new Map<MxArrivalDay, number>(MX_ARRIVAL_DAYS.map((d, i) => [d.value, i]));

// The day the sheet says the load arrives (its week's Monday plus the arrival day).
export function scheduledArrivalDate(a: Pick<MxArrival, "week_start_date" | "arrival_day">): string {
  const idx = a.arrival_day ? DAY_INDEX.get(a.arrival_day) : undefined;
  return idx !== undefined ? addDays(a.week_start_date, idx) : a.week_start_date;
}

// When the load really arrived, for counting days: the scheduled day, unless the Arrived box
// was ticked on an earlier day (it came early). A box ticked late doesn't push the date back.
// `arrivedTickDate` is the day the box was ticked (in the company's time zone), if recorded.
export function effectiveArrivalDate(scheduled: string, arrivedTickDate: string | null): string {
  return arrivedTickDate && arrivedTickDate < scheduled ? arrivedTickDate : scheduled;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

export type PayState = "paid" | "no_terms" | "overdue" | "due_today" | "soon" | "ok";

export interface PayInfo {
  daysSince: number;
  dueDate: string | null;
  // Days until payment is due (negative = past due).
  daysLeft: number | null;
  state: PayState;
}

export function payInfo(arrival: string, today: string, termsDays: number | null, paid: boolean, warnDays: number): PayInfo {
  const daysSince = daysBetween(arrival, today);
  if (termsDays === null) return { daysSince, dueDate: null, daysLeft: null, state: paid ? "paid" : "no_terms" };
  const dueDate = addDays(arrival, termsDays);
  const daysLeft = daysBetween(today, dueDate);
  if (paid) return { daysSince, dueDate, daysLeft, state: "paid" };
  const state: PayState = daysLeft < 0 ? "overdue" : daysLeft === 0 ? "due_today" : daysLeft <= warnDays ? "soon" : "ok";
  return { daysSince, dueDate, daysLeft, state };
}

export function payLabel(info: PayInfo): string {
  switch (info.state) {
    case "paid":
      return "Paid";
    case "no_terms":
      return "No terms set";
    case "overdue":
      return `Past due ${Math.abs(info.daysLeft ?? 0)} day${Math.abs(info.daysLeft ?? 0) === 1 ? "" : "s"}`;
    case "due_today":
      return "Due today";
    default:
      return `Due in ${info.daysLeft} day${info.daysLeft === 1 ? "" : "s"}`;
  }
}
