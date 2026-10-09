import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { APP_TIMEZONE } from "./dates";
import { niceTicks, type ChartSeries, type SummaryStats } from "./qcCharts";

// The Quality Dashboard exported as a PDF: Harvest Best header with the report
// date and who exported it, a summary of the range, then each chosen chart
// (drawn as vector lines) with its numbers, and optionally a data table.

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = PAGE_H - 102; // below the running header
const BOTTOM = 52;
const TEXT = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.8, 0.8, 0.8);
const GREEN = rgb(0.086, 0.64, 0.29);

function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7E¡-ÿ]/g, "?");
}

function hexColor(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function dayLabel(t: number): string {
  return new Date(t).toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, month: "short", day: "numeric" });
}

function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, month: "numeric", day: "numeric", year: "numeric" });
}

function stamp(d: Date): string {
  return (
    d.toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, month: "short", day: "numeric", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", minute: "2-digit", timeZoneName: "short" })
  );
}

function num(n: number | null, unit: string): string {
  if (n === null) return "-";
  return `${Number(n.toFixed(2))}${unit ? ` ${unit}` : ""}`;
}

export interface PdfChart {
  title: string;
  unit: string;
  fromZero: boolean;
  series: ChartSeries[];
  stats: SummaryStats;
  groupCount: number;
}

export interface PdfTableRow {
  date: string;
  lot: string;
  grower: string;
  result: string;
  values: string[];
}

export interface DashboardPdfInput {
  planName: string;
  from: string;
  to: string;
  compareBy: string; // "Grower", "Inspector" or ""
  inspections: number;
  results: [string, number][];
  exportedBy: string;
  exportedAt: Date;
  charts: PdfChart[];
  logo: Uint8Array | null;
  table: { metricLabels: string[]; rows: PdfTableRow[] } | null;
}

export async function buildDashboardPdf(input: DashboardPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = input.logo ? await pdf.embedPng(input.logo).catch(() => null) : null;

  let page!: PDFPage;
  let y = TOP;

  const text = (t: string, x: number, yy: number, size: number, font: PDFFont = regular, color = TEXT) =>
    page.drawText(safe(t), { x, y: yy, size, font, color });
  const textRight = (t: string, xRight: number, yy: number, size: number, font: PDFFont = regular, color = TEXT) =>
    page.drawText(safe(t), { x: xRight - font.widthOfTextAtSize(safe(t), size), y: yy, size, font, color });

  function newPage() {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    // running header: logo left, report title + date right
    if (logo) {
      const h = 52;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: MARGIN, y: PAGE_H - 28 - h, width: w, height: h });
    } else {
      text("Harvest Best Inc.", MARGIN, PAGE_H - 52, 16, bold, GREEN);
    }
    textRight("Quality Report", PAGE_W - MARGIN, PAGE_H - 46, 16, bold);
    textRight(`Report date: ${stamp(input.exportedAt)}`, PAGE_W - MARGIN, PAGE_H - 60, 8.5, regular, MUTED);
    textRight(`Exported by: ${input.exportedBy}`, PAGE_W - MARGIN, PAGE_H - 71, 8.5, regular, MUTED);
    page.drawLine({ start: { x: MARGIN, y: PAGE_H - 86 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 86 }, thickness: 1.5, color: GREEN });
    y = TOP;
  }
  function ensure(h: number) {
    if (y - h < BOTTOM) newPage();
  }

  newPage();

  // ---- summary block
  text(input.planName, MARGIN, y - 16, 18, bold);
  y -= 30;
  text(`${dateText(`${input.from}T12:00:00Z`)} - ${dateText(`${input.to}T12:00:00Z`)}`, MARGIN, y, 10, regular, MUTED);
  const meta = [`${input.inspections} inspection${input.inspections === 1 ? "" : "s"}`];
  if (input.compareBy) meta.push(`compared by ${input.compareBy.toLowerCase()}`);
  textRight(meta.join("  |  "), PAGE_W - MARGIN, y, 10, regular, MUTED);
  y -= 16;
  if (input.results.length > 0) {
    let x = MARGIN;
    for (const [name, n] of input.results) {
      const label = `${name}: ${n}`;
      const w = bold.widthOfTextAtSize(safe(label), 9) + 14;
      page.drawRectangle({ x, y: y - 4, width: w, height: 16, color: rgb(0.94, 0.94, 0.94) });
      text(label, x + 7, y + 1, 9, bold);
      x += w + 6;
      if (x > PAGE_W - MARGIN - 60) break;
    }
    y -= 24;
  }
  y -= 6;

  // ---- charts
  const CHART_H = 285;
  for (const chart of input.charts) {
    ensure(CHART_H);
    const top = y;
    text(chart.title, MARGIN, top - 12, 12, bold);
    const plotTop = top - 38;
    const plotH = 165;
    const left = MARGIN + 38;
    const right = PAGE_W - MARGIN - 8;
    const plotW = right - left;

    const all = chart.series.flatMap((s) => [...s.points, ...(s.dots ?? [])]);
    if (all.length === 0) {
      text("No data for this chart in the date range.", MARGIN, plotTop - 30, 10, regular, MUTED);
      y = top - 70;
      continue;
    }
    let xMin = Math.min(...all.map((p) => p.t));
    let xMax = Math.max(...all.map((p) => p.t));
    if (xMin === xMax) {
      xMin -= 43_200_000;
      xMax += 43_200_000;
    }
    let yMin = Math.min(...all.map((p) => p.y));
    let yMax = Math.max(...all.map((p) => p.y));
    if (chart.fromZero) yMin = Math.min(0, yMin);
    const span = yMax - yMin || Math.abs(yMax) || 1;
    if (!chart.fromZero) yMin -= span * 0.08;
    yMax += span * 0.08;
    const ticks = niceTicks(yMin, yMax, 5);
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const px = (t: number) => left + ((t - xMin) / (xMax - xMin)) * plotW;
    const py = (v: number) => plotTop - plotH + ((v - lo) / (hi - lo || 1)) * plotH;

    // grid + y labels
    for (const v of ticks) {
      page.drawLine({ start: { x: left, y: py(v) }, end: { x: right, y: py(v) }, thickness: 0.4, color: RULE });
      textRight(String(v), left - 5, py(v) - 3, 8, regular, MUTED);
    }
    if (chart.unit) text(chart.unit, MARGIN, plotTop + 6, 8, regular, MUTED);
    // x labels
    for (let i = 0; i < 6; i++) {
      const t = xMin + ((xMax - xMin) * i) / 5;
      const label = dayLabel(t);
      const w = regular.widthOfTextAtSize(label, 8);
      text(label, Math.min(Math.max(px(t) - w / 2, left - 10), right - w + 8), plotTop - plotH - 13, 8, regular, MUTED);
    }
    page.drawLine({ start: { x: left, y: plotTop - plotH }, end: { x: right, y: plotTop - plotH }, thickness: 0.8, color: MUTED });

    for (const s of chart.series) {
      const color = hexColor(s.color);
      for (const d of s.dots ?? []) page.drawCircle({ x: px(d.t), y: py(d.y), size: 1.6, color, opacity: 0.3 });
      const pts = [...s.points].sort((a, b) => a.t - b.t);
      for (let i = 1; i < pts.length; i++) {
        page.drawLine({ start: { x: px(pts[i - 1].t), y: py(pts[i - 1].y) }, end: { x: px(pts[i].t), y: py(pts[i].y) }, thickness: 1.4, color });
      }
      for (const p of pts) page.drawCircle({ x: px(p.t), y: py(p.y), size: 2.6, color, borderColor: rgb(1, 1, 1), borderWidth: 0.8 });
    }

    // legend when comparing
    let ly = plotTop - plotH - 28;
    if (chart.series.length > 1) {
      let lx = MARGIN;
      for (const s of chart.series) {
        const w = regular.widthOfTextAtSize(safe(s.name), 8) + 20;
        if (lx + w > PAGE_W - MARGIN) {
          lx = MARGIN;
          ly -= 11;
        }
        page.drawCircle({ x: lx + 3, y: ly + 3, size: 3, color: hexColor(s.color) });
        text(s.name, lx + 10, ly, 8);
        lx += w;
      }
      ly -= 14;
    } else {
      ly -= 2;
    }

    // numbers row
    const stats: [string, string][] = [
      ["Inspections", String(chart.stats.count)],
      ["Average", num(chart.stats.average, chart.unit)],
      ["Lowest", num(chart.stats.min, chart.unit)],
      ["Highest", num(chart.stats.max, chart.unit)],
      ["Most recent", num(chart.stats.latest, chart.unit)],
    ];
    const colW = CONTENT_W / stats.length;
    stats.forEach(([label, value], i) => {
      text(label, MARGIN + i * colW, ly, 7.5, regular, MUTED);
      text(value, MARGIN + i * colW, ly - 12, 11, bold);
    });
    y = ly - 34;
  }

  // ---- data table (one row per inspection)
  if (input.table && input.table.rows.length > 0) {
    newPage();
    text("Data", MARGIN, y - 14, 14, bold);
    y -= 28;
    const fixed = [
      { label: "Date", w: 52 },
      { label: "Lot", w: 78 },
      { label: "Grower", w: 92 },
      { label: "Result", w: 52 },
    ];
    const metricW = Math.max(40, (CONTENT_W - fixed.reduce((s, c) => s + c.w, 0)) / Math.max(1, input.table.metricLabels.length));
    const cols = [...fixed, ...input.table.metricLabels.map((label) => ({ label, w: metricW }))];
    const drawHeader = () => {
      page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 14, color: rgb(0.93, 0.93, 0.93) });
      let x = MARGIN + 3;
      for (const c of cols) {
        text(c.label.length > Math.floor(c.w / 3.6) ? `${c.label.slice(0, Math.floor(c.w / 3.6) - 1)}.` : c.label, x, y, 7.5, bold);
        x += c.w;
      }
      y -= 16;
    };
    drawHeader();
    for (const r of input.table.rows) {
      if (y - 12 < BOTTOM) {
        newPage();
        drawHeader();
      }
      const cells = [r.date, r.lot, r.grower, r.result, ...r.values];
      let x = MARGIN + 3;
      cells.forEach((c, i) => {
        const w = cols[i].w;
        const max = Math.floor(w / 3.5);
        text(c.length > max ? `${c.slice(0, max - 1)}.` : c, x, y, 7.5);
        x += w;
      });
      page.drawLine({ start: { x: MARGIN, y: y - 3 }, end: { x: PAGE_W - MARGIN, y: y - 3 }, thickness: 0.3, color: RULE });
      y -= 12;
    }
  }

  // ---- footers
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(safe(`Harvest Best - HOPS Quality  |  Exported by ${input.exportedBy}`), { x: MARGIN, y: 28, size: 7.5, font: regular, color: MUTED });
    const mid = `Page ${i + 1} of ${pages.length}`;
    p.drawText(mid, { x: PAGE_W - MARGIN - regular.widthOfTextAtSize(mid, 7.5), y: 28, size: 7.5, font: regular, color: MUTED });
  });

  return pdf.save();
}
