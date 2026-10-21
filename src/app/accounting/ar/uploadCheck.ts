// Checks a newly chosen AR report against the last one loaded, using the date/time
// each report says it was generated.

export interface LastReport {
  report_at: string | null; // "YYYY-MM-DDTHH:MM:SS" (the run time printed on the report)
  uploaded_by: string | null;
  uploaded_at: string;
  file_name: string | null;
}

export type DateWarning =
  | { kind: "same" }
  | { kind: "older"; days: number }
  | { kind: "close"; days: number };

// Calendar days from the earlier report's date to the later one's.
function dayNumber(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

// A report dated within this many days after the previous one is probably a repeat upload.
export const CLOSE_DAYS = 4;

export function checkReportDate(newAt: string | null, last: LastReport | null): DateWarning | null {
  if (!newAt || !last?.report_at) return null;
  if (newAt === last.report_at) return { kind: "same" };
  const days = dayNumber(newAt) - dayNumber(last.report_at);
  if (days < 0) return { kind: "older", days: -days };
  if (days <= CLOSE_DAYS) return { kind: "close", days };
  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Wed, Oct 7, 2026 at 9:20 AM" - from the report's own clock, never shifted by time zone.
export function formatReportAt(iso: string | null): string {
  if (!iso) return "unknown";
  const [date, time = "00:00:00"] = iso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const [hh, mm] = time.split(":").map(Number);
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${weekday}, ${MONTHS[m - 1]} ${d}, ${y} at ${hour12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`;
}

export function warningText(w: DateWarning, last: LastReport): string {
  const prev = formatReportAt(last.report_at);
  if (w.kind === "same") return `This is the SAME report as the last upload (generated ${prev}).`;
  if (w.kind === "older") return `This report is OLDER than the last upload - it was generated ${w.days} day${w.days === 1 ? "" : "s"} before it (${prev}). Uploading it would roll the list back.`;
  return `This report was generated only ${w.days} day${w.days === 1 ? "" : "s"} after the last upload (${prev}). Reports are usually loaded about once a week.`;
}
