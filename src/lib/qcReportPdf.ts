import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { APP_TIMEZONE } from "./dates";
import { defectTotals, percentText, sampleValueText, type QcLotInspection } from "./qcPlans";

// The inspection report: same sections as the LotPath reports (header block,
// defects with count and % of sample size, numbered samples, photo grid), one
// document used for viewing, printing and emailing.

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = PAGE_H - 70; // below the running header
const BOTTOM = 60; // above the footer
const LABEL_COLOR = rgb(0.45, 0.45, 0.45);
const TEXT_COLOR = rgb(0.05, 0.05, 0.05);
const RULE_COLOR = rgb(0.75, 0.75, 0.75);

// Helvetica (WinAnsi) can't draw every character - keep Spanish accents and the
// degree sign, swap look-alike punctuation, and show anything else as "?".
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/ /g, " ")
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of safe(text).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        line = trial;
      } else {
        if (line) out.push(line);
        // A single word wider than the column is broken up.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > maxWidth) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
          out.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
    }
    out.push(line);
  }
  return out;
}

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, month: "numeric", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", minute: "2-digit" });
  return `${date} ${time}`;
}

export interface ReportPhoto {
  bytes: Uint8Array;
}

export async function buildInspectionPdf(inspection: QcLotInspection, photos: ReportPhoto[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const config = inspection.plan_snapshot.config;
  const year = new Date(inspection.inspection_time).toLocaleDateString("en-US", { timeZone: APP_TIMEZONE, year: "numeric" });
  const runningHeader = {
    left: "Harvest Best Inc.",
    center: inspection.inspector_name ?? "",
    right: `Crop Year ${year}`,
  };

  let page!: PDFPage;
  let y = TOP;

  function newPage() {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    const size = 9;
    page.drawText(safe(runningHeader.left), { x: MARGIN, y: PAGE_H - 40, size, font: regular, color: TEXT_COLOR });
    const cw = regular.widthOfTextAtSize(safe(runningHeader.center), size);
    page.drawText(safe(runningHeader.center), { x: (PAGE_W - cw) / 2, y: PAGE_H - 40, size, font: regular, color: TEXT_COLOR });
    const rw = regular.widthOfTextAtSize(safe(runningHeader.right), size);
    page.drawText(safe(runningHeader.right), { x: PAGE_W - MARGIN - rw, y: PAGE_H - 40, size, font: regular, color: TEXT_COLOR });
    y = TOP;
  }
  function ensure(height: number) {
    if (y - height < BOTTOM) newPage();
  }
  function rule(thick = false) {
    ensure(10);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: thick ? 1.5 : 0.6, color: thick ? TEXT_COLOR : RULE_COLOR });
    y -= 12;
  }

  const labelX = MARGIN;
  const valueX = MARGIN + 150;
  const valueW = 215;
  const col2LabelX = MARGIN + 380;
  const col2ValueX = MARGIN + 380;

  // A label + value row; the value wraps inside its column.
  function infoRow(labelText: string, value: string) {
    const lines = wrap(value || "", regular, 10, valueW);
    ensure(lines.length * 13 + 4);
    page.drawText(safe(labelText), { x: labelX, y, size: 10, font: regular, color: LABEL_COLOR });
    lines.forEach((l, i) => page.drawText(l, { x: valueX, y: y - i * 13, size: 10, font: regular, color: TEXT_COLOR }));
    y -= Math.max(1, lines.length) * 13 + 4;
  }

  newPage();

  // ---- title
  const title = safe(inspection.plan_name);
  page.drawText(title, { x: MARGIN, y: y - 14, size: 20, font: bold, color: TEXT_COLOR });
  y -= 34;
  rule(true);

  // ---- header block (right column: times)
  const headerTop = y;
  infoRow("Commodity Name", inspection.commodity);
  infoRow("Control Point Name", inspection.control_point ?? "");
  infoRow("Inspected By", inspection.inspector_name ?? "");
  for (const f of config.headerFields) infoRow(f.label, inspection.header[f.key] ?? "");
  infoRow("Notes #1", inspection.notes_1 ?? "");
  infoRow("Notes #2", inspection.notes_2 ?? "");
  infoRow("Final inspection result", inspection.result ?? "");
  const headerEnd = y;
  // Times sit in a second column at the top of the block (first page only).
  const rightPage = pdf.getPage(0);
  rightPage.drawText("Inspection Time", { x: col2LabelX, y: headerTop, size: 10, font: regular, color: LABEL_COLOR });
  rightPage.drawText(safe(when(inspection.inspection_time)), { x: col2ValueX, y: headerTop - 13, size: 10, font: regular, color: TEXT_COLOR });
  rightPage.drawText("Sample Time", { x: col2LabelX, y: headerTop - 32, size: 10, font: regular, color: LABEL_COLOR });
  rightPage.drawText(safe(when(inspection.sample_time ?? inspection.inspection_time)), { x: col2ValueX, y: headerTop - 45, size: 10, font: regular, color: TEXT_COLOR });
  y = Math.min(y, headerEnd);
  y -= 4;
  rule(true);

  // ---- defects
  if (inspection.defects.length > 0) {
    ensure(40);
    page.drawText("Defects", { x: MARGIN, y: y - 12, size: 15, font: bold, color: TEXT_COLOR });
    y -= 30;
    const size = inspection.sample_size;
    const nameW = 300;

    const row = (name: string, count: number | string, pct: string, strong = false) => {
      const lines = wrap(name, strong ? bold : regular, 10, nameW);
      ensure(lines.length * 13 + 4);
      lines.forEach((l, i) =>
        page.drawText(l, { x: MARGIN, y: y - i * 13, size: 10, font: strong ? bold : regular, color: strong ? TEXT_COLOR : LABEL_COLOR }),
      );
      page.drawText(String(count), { x: MARGIN + 335, y, size: 10, font: strong ? bold : regular, color: TEXT_COLOR });
      if (pct) page.drawText(pct, { x: MARGIN + 395, y, size: 10, font: bold, color: TEXT_COLOR });
      y -= lines.length * 13 + 4;
    };

    row("Sample Size", size ?? "", "");
    const totals = defectTotals(inspection.defects);
    for (const [severity, heading, totalLabel, totalValue] of [
      ["serious", "Serious Defects", "Total Serious Defects", totals.serious],
      ["non_serious", "Non-Serious Defects", "Total Non-Serious Defects", totals.nonSerious],
    ] as const) {
      ensure(20);
      page.drawText(heading, { x: MARGIN, y, size: 10, font: bold, color: TEXT_COLOR });
      y -= 17;
      for (const d of inspection.defects.filter((x) => x.severity === severity)) {
        row(d.name, d.count, d.count > 0 ? percentText(d.count, size) : "");
      }
      ensure(24);
      page.drawLine({ start: { x: MARGIN, y: y + 11 }, end: { x: PAGE_W - MARGIN, y: y + 11 }, thickness: 0.6, color: RULE_COLOR });
      row(totalLabel, totalValue, percentText(totalValue, size), true);
    }
    page.drawLine({ start: { x: MARGIN, y: y + 11 }, end: { x: PAGE_W - MARGIN, y: y + 11 }, thickness: 0.6, color: RULE_COLOR });
    row("Total Defects", totals.total, percentText(totals.total, size), true);
    y -= 4;
  }

  // ---- samples
  inspection.samples.forEach((sample, i) => {
    ensure(40 + config.sampleFields.length * 17);
    rule(true);
    page.drawText(`Sample ${i + 1}`, { x: MARGIN, y: y - 4, size: 15, font: bold, color: TEXT_COLOR });
    y -= 26;
    for (const f of config.sampleFields) infoRow(f.label, sampleValueText(f, sample[f.key]));
  });

  // ---- photos (3 across, bordered cells)
  if (photos.length > 0) {
    newPage();
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: TEXT_COLOR });
    page.drawText("Photos", { x: MARGIN, y: y - 24, size: 15, font: bold, color: TEXT_COLOR });
    y -= 38;

    const cols = 3;
    const cellW = CONTENT_W / cols;
    const cellH = cellW * 0.78;
    const pad = 5;
    for (let i = 0; i < photos.length; i += cols) {
      ensure(cellH + 2);
      for (let c = 0; c < cols && i + c < photos.length; c++) {
        const x = MARGIN + c * cellW;
        page.drawRectangle({ x, y: y - cellH, width: cellW, height: cellH, borderColor: RULE_COLOR, borderWidth: 0.6 });
        let image: PDFImage | null = null;
        try {
          const bytes = photos[i + c].bytes;
          const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
          image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        } catch {
          image = null; // a format PDF can't embed (e.g. HEIC)
        }
        if (image) {
          const scale = Math.min((cellW - pad * 2) / image.width, (cellH - pad * 2) / image.height);
          const w = image.width * scale;
          const h = image.height * scale;
          page.drawImage(image, { x: x + (cellW - w) / 2, y: y - cellH + (cellH - h) / 2, width: w, height: h });
        } else {
          page.drawText("(photo can't be shown)", { x: x + pad, y: y - cellH / 2, size: 8, font: regular, color: LABEL_COLOR });
        }
      }
      y -= cellH;
    }
  }

  // ---- footers (need the final page count)
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const size = 8;
    p.drawText("Harvest Best - HOPS Quality", { x: MARGIN, y: 30, size, font: regular, color: TEXT_COLOR });
    const mid = `${i + 1} of ${pages.length}`;
    p.drawText(mid, { x: (PAGE_W - regular.widthOfTextAtSize(mid, size)) / 2, y: 30, size, font: regular, color: TEXT_COLOR });
    const right = "harvestbestinc.com";
    p.drawText(right, { x: PAGE_W - MARGIN - regular.widthOfTextAtSize(right, size), y: 30, size, font: regular, color: TEXT_COLOR });
  });

  return pdf.save();
}
