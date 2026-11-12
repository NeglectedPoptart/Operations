import { addDays, mondayOf } from "./dates";
import { decimalHours, formatTime, hoursMinutes, workedDay } from "./timeEntry";

// Every employee's hours for a date range, added up for payroll. No Supabase imports.

export interface ExportDay {
  employee_id: string;
  work_date: string;
  clock_in: string | null;
  lunch_out: string | null;
  lunch_in: string | null;
  clock_out: string | null;
  notes: string | null;
}

export interface ExportEmployee {
  id: string;
  name: string;
  status: string;
}

export interface EmployeeTotal {
  id: string;
  name: string;
  status: string;
  daysWorked: number;
  minutes: number;
  overtimeMinutes: number; // over 40 hours in any Monday-Sunday week inside the range
  problems: number; // days with times that need a look (not counted in the total)
  days: (ExportDay & { minutes: number | null; problem: string | null })[];
}

export const OVERTIME_AFTER_MINUTES = 40 * 60;

// One entry per employee that has anything in the range, sorted by name.
export function totalEmployees(employees: ExportEmployee[], days: ExportDay[]): EmployeeTotal[] {
  const byEmployee = new Map<string, ExportDay[]>();
  for (const d of days) (byEmployee.get(d.employee_id) ?? byEmployee.set(d.employee_id, []).get(d.employee_id)!).push(d);

  const out: EmployeeTotal[] = [];
  for (const e of employees) {
    const mine = (byEmployee.get(e.id) ?? []).sort((a, b) => a.work_date.localeCompare(b.work_date));
    if (mine.length === 0) continue;
    const worked = mine.map((d) => ({ ...d, ...workedDay(d) }));
    const perWeek = new Map<string, number>();
    let minutes = 0;
    let daysWorked = 0;
    let problems = 0;
    for (const d of worked) {
      if (d.minutes !== null) {
        minutes += d.minutes;
        daysWorked++;
        const wk = mondayOf(d.work_date);
        perWeek.set(wk, (perWeek.get(wk) ?? 0) + d.minutes);
      }
      if (d.problem || (d.minutes === null && (d.clock_in || d.clock_out || d.lunch_in || d.lunch_out))) problems++;
    }
    const overtimeMinutes = [...perWeek.values()].reduce((s, m) => s + Math.max(0, m - OVERTIME_AFTER_MINUTES), 0);
    out.push({ id: e.id, name: e.name, status: e.status, daysWorked, minutes, overtimeMinutes, problems, days: worked });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n");

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
}

// One row per employee: totals for the range.
export function summaryRows(totals: EmployeeTotal[], from: string, to: string): string[][] {
  return [
    ["Employee", "Status", "From", "To", "Days worked", "Total hours", "Total (h:mm)", "Regular hours", "Overtime hours (over 40/wk)", "Days to check"],
    ...totals.map((t) => [
      t.name,
      t.status === "active" ? "Active" : "No longer here",
      from,
      to,
      String(t.daysWorked),
      decimalHours(t.minutes),
      hoursMinutes(t.minutes),
      decimalHours(t.minutes - t.overtimeMinutes),
      decimalHours(t.overtimeMinutes),
      String(t.problems),
    ]),
  ];
}

// One row per day worked, with the clock times.
export function detailRows(totals: EmployeeTotal[]): string[][] {
  const rows: string[][] = [["Employee", "Date", "Day", "In", "Lunch out", "Lunch in", "Out", "Hours", "Note", "Check"]];
  for (const t of totals) {
    for (const d of t.days) {
      rows.push([
        t.name,
        d.work_date,
        weekday(d.work_date),
        formatTime(d.clock_in),
        formatTime(d.lunch_out),
        formatTime(d.lunch_in),
        formatTime(d.clock_out),
        d.minutes !== null ? decimalHours(d.minutes) : "",
        d.notes ?? "",
        d.problem ?? "",
      ]);
    }
  }
  return rows;
}

export const toCsv = csv;
// Tab-separated, for pasting straight into Excel or an email.
export const toTsv = (rows: string[][]) => rows.map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");

// The Monday-to-Sunday week before the one containing `today`.
export function lastWeek(today: string): { from: string; to: string } {
  const thisMonday = mondayOf(today);
  return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
}
