import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDateSlash } from "./dates";
import type { EmployeeTotal } from "./hoursExport";
import { decimalHours, formatTime, hoursMinutes } from "./timeEntry";

// Everyone's hours for a pay period as one PDF: a totals table for the whole group, then one table per
// employee with their day-by-day times and totals. Runs in the browser from the hours already on screen.

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = PAGE_H - 78; // below the running header
const BOTTOM = 46;
const ROW_H = 17;
const TEXT = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.8, 0.8, 0.8);
const HEAD_BG = rgb(0.92, 0.92, 0.92);
const FOOT_BG = rgb(0.86, 0.93, 0.86);
const GREEN = rgb(0.086, 0.64, 0.29);
const AMBER = rgb(0.75, 0.45, 0);

// The built-in fonts only draw Latin-1.
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E¡-ÿ]/g, "?");
}

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
}

interface Column {
  label: string;
  width: number;
  align?: "left" | "right";
}

export async function buildHoursPdf(input: { totals: EmployeeTotal[]; from: string; to: string; exportedBy?: string }): Promise<Uint8Array> {
  const { totals, from, to } = input;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const range = `${formatDateSlash(from)} - ${formatDateSlash(to)}`;

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = TOP;

  function newPage() {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = TOP;
  }
  function need(h: number) {
    if (y - h < BOTTOM) newPage();
  }

  function fit(text: string, f: PDFFont, size: number, width: number): string {
    let t = safe(text);
    if (f.widthOfTextAtSize(t, size) <= width) return t;
    while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
    return `${t}...`;
  }

  function cellText(text: string, x: number, width: number, align: "left" | "right", f: PDFFont, size: number, color = TEXT) {
    const t = fit(text, f, size, width - 8);
    const w = f.widthOfTextAtSize(t, size);
    page.drawText(t, { x: align === "right" ? x + width - 4 - w : x + 4, y: y - ROW_H + 5, size, font: f, color });
  }

  function row(cols: Column[], values: string[], opts: { head?: boolean; foot?: boolean; colors?: (ReturnType<typeof rgb> | undefined)[] } = {}) {
    need(ROW_H);
    const bg = opts.head ? HEAD_BG : opts.foot ? FOOT_BG : null;
    if (bg) page.drawRectangle({ x: MARGIN, y: y - ROW_H, width: CONTENT_W, height: ROW_H, color: bg });
    let x = MARGIN;
    cols.forEach((c, i) => {
      cellText(values[i] ?? "", x, c.width, c.align ?? "left", opts.head || opts.foot ? bold : font, opts.head ? 8 : 9, opts.colors?.[i] ?? TEXT);
      x += c.width;
    });
    page.drawLine({ start: { x: MARGIN, y: y - ROW_H }, end: { x: MARGIN + CONTENT_W, y: y - ROW_H }, thickness: 0.5, color: RULE });
    y -= ROW_H;
  }

  function header(cols: Column[]) {
    // A header row never sits alone at the bottom of a page.
    need(ROW_H * 3);
    row(cols, cols.map((c) => c.label), { head: true });
  }

  // ---- Totals for everyone -----------------------------------------------------------------
  page.drawText("Employee Hours", { x: MARGIN, y: y, size: 20, font: bold, color: GREEN });
  y -= 20;
  page.drawText(range, { x: MARGIN, y, size: 12, font: bold, color: TEXT });
  y -= 24;

  const grand = totals.reduce((s, t) => s + t.minutes, 0);
  const grandOt = totals.reduce((s, t) => s + t.overtimeMinutes, 0);
  const check = totals.reduce((s, t) => s + t.problems, 0);

  const sumCols: Column[] = [
    { label: "Employee", width: 190 },
    { label: "Days", width: 50, align: "right" },
    { label: "Total hrs", width: 80, align: "right" },
    { label: "Regular", width: 70, align: "right" },
    { label: "Overtime", width: 70, align: "right" },
    { label: "Check", width: 62 },
  ];
  header(sumCols);
  for (const t of totals) {
    row(
      sumCols,
      [
        t.status === "active" ? t.name : `${t.name} (no longer here)`,
        String(t.daysWorked),
        decimalHours(t.minutes),
        decimalHours(t.minutes - t.overtimeMinutes),
        t.overtimeMinutes > 0 ? decimalHours(t.overtimeMinutes) : "-",
        t.problems > 0 ? `${t.problems} to check` : "",
      ],
      { colors: [undefined, undefined, undefined, undefined, t.overtimeMinutes > 0 ? AMBER : undefined, AMBER] },
    );
  }
  row(sumCols, [`${totals.length} employee${totals.length === 1 ? "" : "s"}`, "", decimalHours(grand), decimalHours(grand - grandOt), grandOt > 0 ? decimalHours(grandOt) : "-", check > 0 ? `${check} to check` : ""], { foot: true });

  y -= 8;
  const note = "Overtime is anything over 40 hours in a Monday-to-Sunday week. Days to check have times that don't add up and are not counted in the totals.";
  need(24);
  page.drawText(fit(note, font, 7.5, CONTENT_W), { x: MARGIN, y: y - 8, size: 7.5, font, color: MUTED });
  y -= 14;

  // ---- Each employee, day by day -----------------------------------------------------------
  const dayCols: Column[] = [
    { label: "Date", width: 62 },
    { label: "Day", width: 36 },
    { label: "In", width: 58, align: "right" },
    { label: "Lunch out", width: 62, align: "right" },
    { label: "Lunch in", width: 58, align: "right" },
    { label: "Out", width: 58, align: "right" },
    { label: "Hours", width: 48, align: "right" },
    { label: "Note", width: 150 },
  ];

  for (const t of totals) {
    // Keep a person's whole table on one page when it fits; otherwise start with room for a few days.
    const whole = 34 + ROW_H * (t.days.length + 2);
    need(whole <= TOP - BOTTOM ? whole : 24 + ROW_H * 4);
    y -= 14;
    page.drawText(safe(t.name), { x: MARGIN, y: y - 12, size: 12, font: bold, color: TEXT });
    const summary = `${decimalHours(t.minutes)} hrs (${hoursMinutes(t.minutes)})  |  ${t.daysWorked} day${t.daysWorked === 1 ? "" : "s"}${t.overtimeMinutes > 0 ? `  |  ${decimalHours(t.overtimeMinutes)} overtime` : ""}`;
    const sw = bold.widthOfTextAtSize(safe(summary), 9);
    page.drawText(safe(summary), { x: MARGIN + CONTENT_W - sw, y: y - 12, size: 9, font: bold, color: GREEN });
    y -= 20;
    header(dayCols);
    for (const d of t.days) {
      // A table that has to split carries its header onto the next page.
      if (y - ROW_H * 2 < BOTTOM) {
        newPage();
        header(dayCols);
      }
      const hours = d.minutes !== null ? decimalHours(d.minutes) : "";
      const problem = d.problem ?? (d.minutes === null && (d.clock_in || d.clock_out) ? "Check times" : "");
      row(
        dayCols,
        [formatDateSlash(d.work_date), weekday(d.work_date), formatTime(d.clock_in), formatTime(d.lunch_out), formatTime(d.lunch_in), formatTime(d.clock_out), hours, [problem, d.notes].filter(Boolean).join(" - ")],
        { colors: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, problem ? AMBER : undefined] },
      );
    }
    row(dayCols, ["Total", "", "", "", "", "", decimalHours(t.minutes), t.overtimeMinutes > 0 ? `incl. ${decimalHours(t.overtimeMinutes)} overtime` : ""], { foot: true });
  }

  // ---- Running header and page numbers on every page ---------------------------------------
  const stamp = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText("HARVEST BEST INC.", { x: MARGIN, y: PAGE_H - 34, size: 9, font: bold, color: GREEN });
    p.drawText(`Employee Hours  ${range}`, { x: MARGIN, y: PAGE_H - 46, size: 8, font, color: MUTED });
    p.drawLine({ start: { x: MARGIN, y: PAGE_H - 54 }, end: { x: MARGIN + CONTENT_W, y: PAGE_H - 54 }, thickness: 1, color: GREEN });
    const foot = `Exported ${stamp}${input.exportedBy ? ` by ${safe(input.exportedBy)}` : ""}  |  Page ${i + 1} of ${pages.length}`;
    const w = font.widthOfTextAtSize(foot, 8);
    p.drawText(foot, { x: MARGIN + CONTENT_W - w, y: 24, size: 8, font, color: MUTED });
  });

  return pdf.save();
}
