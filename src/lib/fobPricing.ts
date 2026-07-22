import type { FobItem, FobSection } from "./types";

export interface FobItemGroup {
  name: string;
  rows: FobItem[];
}

// Groups items by commodity_group regardless of adjacency (a group's rows
// can be spread across the list after edits/reordering), preserving the
// order each group name first appears in - shared by the FOB Pricing page
// and every per-lane Delivered Pricing sheet derived from it.
export function groupFobItems(items: FobItem[], section: FobSection): FobItemGroup[] {
  const order: string[] = [];
  const map = new Map<string, FobItem[]>();
  for (const item of items) {
    if (item.section !== section) continue;
    if (!map.has(item.commodity_group)) {
      map.set(item.commodity_group, []);
      order.push(item.commodity_group);
    }
    map.get(item.commodity_group)!.push(item);
  }
  return order.map((name) => ({ name, rows: map.get(name)! }));
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Delivered pricing always rounds UP to the nearest $0.05 (14.01 -> 14.05,
// 24.24 -> 24.25) - never down, so freight cost is never under-recovered.
// Scaling to nickel units before ceil-ing avoids floating point noise (e.g.
// 14.75 stored as 14.750000000000002) causing an already-exact value to
// get bumped up to the next nickel.
export function roundUpToNickel(value: number): number {
  const scaled = value * 20;
  const rounded = Math.round(scaled * 1e6) / 1e6;
  return Math.ceil(rounded) / 20;
}

// Plain-text table formatting for WhatsApp, which strips HTML/table markup
// on paste and only keeps its own markdown (*bold*, and ```monospace```
// fencing that preserves fixed-width alignment). A group-header row has no
// cells; a data row has no group name - column 0 (commodity name) is left
// aligned, every other column is right aligned like a normal price table.
export interface MonoRow {
  group?: string;
  cells?: string[];
}

export function buildMonospaceTable(headers: string[], rows: MonoRow[]): string {
  const widths = headers.map((h) => h.length);
  for (const r of rows) {
    if (!r.cells) continue;
    r.cells.forEach((c, i) => {
      widths[i] = Math.max(widths[i] ?? 0, c.length);
    });
  }
  const padCell = (s: string, width: number, alignRight: boolean) => {
    const gap = " ".repeat(Math.max(0, width - s.length));
    return alignRight ? gap + s : s + gap;
  };
  const formatRow = (cells: string[]) => cells.map((c, i) => padCell(c, widths[i], i > 0)).join("  ").trimEnd();

  const lines = [formatRow(headers)];
  for (const r of rows) {
    if (r.group) {
      lines.push(r.group);
    } else if (r.cells) {
      lines.push(formatRow(r.cells));
    }
  }
  return lines.join("\n");
}

// Interleaves each group's name-only row with its items' formatted cells -
// the shared row shape used by both the WhatsApp monospace table and the
// canvas image renderer below.
export function toMonoRows(groups: FobItemGroup[], rowValues: (item: FobItem) => string[]): MonoRow[] {
  const rows: MonoRow[] = [];
  for (const g of groups) {
    rows.push({ group: g.name });
    for (const item of g.rows) rows.push({ cells: rowValues(item) });
  }
  return rows;
}

// Builds one *bold title* + ```monospace table``` block for a commodity
// section (Western Veg / Hot House), ready to concatenate into a full
// WhatsApp message.
export function buildWhatsAppSection(
  sectionTitle: string,
  groups: FobItemGroup[],
  headers: string[],
  rowValues: (item: FobItem) => string[],
): string {
  const table = buildMonospaceTable(headers, toMonoRows(groups, rowValues));
  return `*${sectionTitle}*\n\`\`\`\n${table}\n\`\`\``;
}

// Draws a price sheet straight onto a canvas (rectangles + text, no HTML/SVG
// involved) so it comes out as a real image with the same colors/borders as
// the email/Excel-style version - unlike WhatsApp's text box, an image
// pasted as a photo doesn't get its formatting stripped. Drawing natively
// like this (rather than rasterizing HTML via an SVG foreignObject) also
// sidesteps a hard browser restriction: Chromium taints any canvas drawn
// from a foreignObject-based SVG image regardless of its content, so
// canvas.toBlob()/toDataURL() throws a SecurityError no matter what.
export interface CanvasBlock {
  title: string;
  headerColor: string;
  columnHeaders: string[];
  rows: MonoRow[];
}

const CANVAS_FONT = "12px Arial, sans-serif";
const CANVAS_FONT_BOLD = "bold 12px Arial, sans-serif";
const CANVAS_FONT_TITLE = "bold 20px Arial, sans-serif";
const CANVAS_FONT_MESSAGE = "12.5px Arial, sans-serif";
const CANVAS_FONT_HEADER = "bold 13px Arial, sans-serif";
const CELL_PAD_X = 8;
const ROW_H = 22;
const COL_HEADER_H = 24;
const BLOCK_TITLE_H = 26;
const BLOCK_GAP = 24;
const LINE_H = 18;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function measureBlockColWidths(ctx: CanvasRenderingContext2D, block: CanvasBlock): number[] {
  ctx.font = CANVAS_FONT_HEADER;
  const widths = block.columnHeaders.map((h) => ctx.measureText(h).width);
  ctx.font = CANVAS_FONT;
  for (const r of block.rows) {
    if (!r.cells) continue;
    r.cells.forEach((c, i) => {
      widths[i] = Math.max(widths[i] ?? 0, ctx.measureText(c).width);
    });
  }
  return widths.map((w) => w + CELL_PAD_X * 2);
}

function drawBlock(ctx: CanvasRenderingContext2D, block: CanvasBlock, x: number, y: number, colWidths: number[]) {
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  let cursorY = y;

  ctx.fillStyle = block.headerColor;
  ctx.fillRect(x, cursorY, tableWidth, BLOCK_TITLE_H);
  ctx.strokeStyle = "#000000";
  ctx.strokeRect(x, cursorY, tableWidth, BLOCK_TITLE_H);
  ctx.fillStyle = "#000000";
  ctx.font = CANVAS_FONT_HEADER;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(block.title, x + tableWidth / 2, cursorY + BLOCK_TITLE_H / 2);
  cursorY += BLOCK_TITLE_H;

  ctx.fillStyle = "#dddddd";
  ctx.fillRect(x, cursorY, tableWidth, COL_HEADER_H);
  let colX = x;
  ctx.font = CANVAS_FONT_HEADER;
  block.columnHeaders.forEach((h, i) => {
    ctx.strokeRect(colX, cursorY, colWidths[i], COL_HEADER_H);
    ctx.fillStyle = "#000000";
    ctx.textAlign = i === 0 ? "left" : "right";
    const textX = i === 0 ? colX + CELL_PAD_X : colX + colWidths[i] - CELL_PAD_X;
    ctx.fillText(h, textX, cursorY + COL_HEADER_H / 2);
    colX += colWidths[i];
  });
  cursorY += COL_HEADER_H;

  for (const r of block.rows) {
    if (r.group) {
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(x, cursorY, tableWidth, ROW_H);
      ctx.strokeRect(x, cursorY, tableWidth, ROW_H);
      ctx.fillStyle = "#000000";
      ctx.font = CANVAS_FONT_BOLD;
      ctx.textAlign = "left";
      ctx.fillText(r.group, x + CELL_PAD_X, cursorY + ROW_H / 2);
    } else if (r.cells) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, cursorY, tableWidth, ROW_H);
      colX = x;
      ctx.font = CANVAS_FONT;
      r.cells.forEach((c, i) => {
        ctx.strokeStyle = "#000000";
        ctx.strokeRect(colX, cursorY, colWidths[i], ROW_H);
        ctx.fillStyle = "#000000";
        ctx.textAlign = i === 0 ? "left" : "right";
        const textX = i === 0 ? colX + CELL_PAD_X : colX + colWidths[i] - CELL_PAD_X;
        ctx.fillText(c, textX, cursorY + ROW_H / 2);
        colX += colWidths[i];
      });
    }
    cursorY += ROW_H;
  }
}

export async function renderPriceSheetPng(opts: {
  title: string;
  message: string;
  blocks: CanvasBlock[];
  scale?: number;
}): Promise<Blob> {
  const { title, message, blocks, scale = 2 } = opts;
  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("Canvas is not supported in this browser");

  const blockColWidths = blocks.map((b) => measureBlockColWidths(mctx, b));
  const blockWidths = blockColWidths.map((widths) => widths.reduce((a, b) => a + b, 0));

  const contentWidth = blockWidths.reduce((a, b) => a + b, 0) + BLOCK_GAP * Math.max(0, blocks.length - 1);
  const canvasWidth = Math.max(contentWidth, 400);

  mctx.font = CANVAS_FONT_MESSAGE;
  const messageLines = message ? wrapText(mctx, message, canvasWidth - CELL_PAD_X * 4) : [];
  const messageBoxHeight = messageLines.length > 0 ? messageLines.length * LINE_H + 16 : 0;
  const titleAreaHeight = 34 + (messageBoxHeight > 0 ? messageBoxHeight + 10 : 0);

  const tableAreaHeight = Math.max(
    ...blocks.map((b) => BLOCK_TITLE_H + COL_HEADER_H + b.rows.length * ROW_H),
  );
  const canvasHeight = titleAreaHeight + tableAreaHeight + 16;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(canvasWidth * scale);
  canvas.height = Math.ceil(canvasHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#000000";
  ctx.font = CANVAS_FONT_TITLE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, canvasWidth / 2, 20);

  let y = 34;
  if (messageLines.length > 0) {
    ctx.strokeStyle = "#000000";
    ctx.strokeRect(0, y, canvasWidth, messageBoxHeight);
    ctx.font = CANVAS_FONT_MESSAGE;
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    const startY = y + 8 + LINE_H / 2;
    messageLines.forEach((line, i) => {
      ctx.fillText(line, canvasWidth / 2, startY + i * LINE_H);
    });
    y += messageBoxHeight + 10;
  }

  let x = 0;
  blocks.forEach((block, i) => {
    drawBlock(ctx, block, x, y, blockColWidths[i]);
    x += blockWidths[i] + BLOCK_GAP;
  });

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to export price sheet image"));
    }, "image/png");
  });
}

// Puts a PNG directly on the clipboard as an image (so it can be pasted
// straight into WhatsApp/email as a photo) where supported; falls back to
// triggering a file download so it can be attached manually.
export async function copyOrDownloadPng(blob: Blob, filename: string): Promise<"copied" | "downloaded"> {
  try {
    if (typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return "copied";
    }
  } catch {
    // Clipboard image write unsupported/denied - fall through to download.
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "downloaded";
}
