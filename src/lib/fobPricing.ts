import type { FobItem, FobSection } from "./types";

export interface FobItemGroup {
  name: string;
  rows: FobItem[];
}

// Groups items by commodity_group regardless of adjacency (a group's rows
// can be spread across the list after edits/reordering), preserving the
// order each group name first appears in - shared by the FOB Pricing page
// and every per-lane Delivered Pricing sheet derived from it. Sorted by
// position first rather than trusting the caller's array order, so a quick
// "+ Add Item" (given a position below everything else) reliably groups at
// the top, and "+ Add Category" (given one above) at the bottom.
export function groupFobItems(items: FobItem[], section: FobSection): FobItemGroup[] {
  const sectionItems = items.filter((i) => i.section === section).sort((a, b) => a.position - b.position);
  const order: string[] = [];
  const map = new Map<string, FobItem[]>();
  for (const item of sectionItems) {
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
  // Optional and defaulted to "table" below rather than required, so every
  // existing caller across the app that builds a plain {title, headerColor,
  // columnHeaders, rows} object keeps compiling and rendering unchanged.
  kind?: "table";
  title: string;
  headerColor: string;
  columnHeaders: string[];
  rows: MonoRow[];
}

// A real bar-graph, drawn as actual proportional bars (not just a number
// table) - for pages that want their on-screen HorizontalBarChart to look
// the same in a Copy-as-Image export, not reduced to plain figures.
export interface CanvasChartBlock {
  kind: "chart";
  title: string;
  headerColor: string;
  data: { label: string; value: number }[];
  formatValue?: (v: number) => string;
}

// A small stat-tile grid (label + big value per tile), matching the
// "Summary" card style already used on-screen (AP, this Accounting Summary,
// etc.) so a Copy-as-Image export can include the same tiles instead of
// only the underlying tables.
export interface CanvasStatsBlock {
  kind: "stats";
  title: string;
  headerColor: string;
  stats: { label: string; value: string; valueColor?: string }[];
  columns?: number;
}

export type CanvasSection = CanvasBlock | CanvasChartBlock | CanvasStatsBlock;

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

const STAT_TILE_W = 140;
const STAT_TILE_H = 52;
const STAT_LABEL_FONT = "11px Arial, sans-serif";
const STAT_VALUE_FONT = "bold 18px Arial, sans-serif";

const CHART_ROW_H = 26;
const CHART_LABEL_W = 130;
const CHART_BAR_AREA_W = 220;
const CHART_VALUE_W = 80;

function drawTitleBar(ctx: CanvasRenderingContext2D, title: string, headerColor: string, x: number, y: number, width: number) {
  ctx.fillStyle = headerColor;
  ctx.fillRect(x, y, width, BLOCK_TITLE_H);
  ctx.strokeStyle = "#000000";
  ctx.strokeRect(x, y, width, BLOCK_TITLE_H);
  ctx.fillStyle = "#000000";
  ctx.font = CANVAS_FONT_HEADER;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, x + width / 2, y + BLOCK_TITLE_H / 2);
}

function measureStatsBlock(block: CanvasStatsBlock): { width: number; height: number; columns: number } {
  const columns = block.columns ?? (Math.min(3, block.stats.length) || 1);
  const rows = Math.ceil(block.stats.length / columns) || 1;
  return { width: STAT_TILE_W * columns, height: BLOCK_TITLE_H + rows * STAT_TILE_H + 16, columns };
}

function drawStatsBlock(ctx: CanvasRenderingContext2D, block: CanvasStatsBlock, x: number, y: number, width: number, columns: number) {
  drawTitleBar(ctx, block.title, block.headerColor, x, y, width);
  const bodyY = y + BLOCK_TITLE_H;
  const bodyHeight = (Math.ceil(block.stats.length / columns) || 1) * STAT_TILE_H + 16;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, bodyY, width, bodyHeight);
  ctx.strokeStyle = "#000000";
  ctx.strokeRect(x, bodyY, width, bodyHeight);
  const startY = bodyY + 12;
  block.stats.forEach((stat, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const tileX = x + col * STAT_TILE_W + CELL_PAD_X;
    const tileY = startY + row * STAT_TILE_H;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#555555";
    ctx.font = STAT_LABEL_FONT;
    ctx.fillText(stat.label, tileX, tileY);
    ctx.fillStyle = stat.valueColor ?? "#000000";
    ctx.font = STAT_VALUE_FONT;
    ctx.fillText(stat.value, tileX, tileY + 16);
  });
}

function measureChartBlock(block: CanvasChartBlock): { width: number; height: number } {
  const rows = Math.max(block.data.length, 1);
  return { width: CHART_LABEL_W + CHART_BAR_AREA_W + CHART_VALUE_W, height: BLOCK_TITLE_H + rows * CHART_ROW_H + 16 };
}

function drawChartBlock(ctx: CanvasRenderingContext2D, block: CanvasChartBlock, x: number, y: number, width: number) {
  drawTitleBar(ctx, block.title, block.headerColor, x, y, width);
  const bodyY = y + BLOCK_TITLE_H;
  const bodyHeight = Math.max(block.data.length, 1) * CHART_ROW_H + 16;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, bodyY, width, bodyHeight);
  ctx.strokeStyle = "#000000";
  ctx.strokeRect(x, bodyY, width, bodyHeight);

  const formatValue = block.formatValue ?? ((v: number) => String(v));
  if (block.data.length === 0) {
    ctx.fillStyle = "#666666";
    ctx.font = CANVAS_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No data yet.", x + width / 2, bodyY + bodyHeight / 2);
    return;
  }

  const maxVal = Math.max(1, ...block.data.map((d) => d.value));
  let rowY = bodyY + 8;
  for (const d of block.data) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000000";
    ctx.font = CANVAS_FONT;
    ctx.fillText(d.label, x + CELL_PAD_X, rowY + CHART_ROW_H / 2, CHART_LABEL_W - CELL_PAD_X * 2);

    const barAreaX = x + CHART_LABEL_W;
    const barAreaW = CHART_BAR_AREA_W - CELL_PAD_X;
    const barW = Math.max(4, (d.value / maxVal) * barAreaW);
    ctx.fillStyle = "#e5e5e5";
    ctx.fillRect(barAreaX, rowY + 4, barAreaW, CHART_ROW_H - 8);
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(barAreaX, rowY + 4, barW, CHART_ROW_H - 8);

    ctx.textAlign = "right";
    ctx.fillStyle = "#000000";
    ctx.font = CANVAS_FONT_BOLD;
    ctx.fillText(formatValue(d.value), x + width - CELL_PAD_X, rowY + CHART_ROW_H / 2);
    rowY += CHART_ROW_H;
  }
}

export async function renderPriceSheetPng(opts: {
  title: string;
  message: string;
  // Either flat `blocks` (laid out per `direction`, as before) or `rows` - an
  // array of horizontal rows (each row's blocks side by side, rows stacked
  // vertically) for a mixed layout, e.g. a stats tile + a chart side by
  // side, with tables stacked underneath. `rows` takes precedence when given.
  blocks?: CanvasSection[];
  rows?: CanvasSection[][];
  scale?: number;
  direction?: "row" | "column";
}): Promise<Blob> {
  const { title, message, scale = 2, direction = "row" } = opts;
  const rows: CanvasSection[][] =
    opts.rows ?? (direction === "row" ? [opts.blocks ?? []] : (opts.blocks ?? []).map((b) => [b]));

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("Canvas is not supported in this browser");

  // Each block measures/draws itself according to its own kind - table is
  // the default for any block with no kind (every pre-existing caller).
  function measureOne(b: CanvasSection): { width: number; height: number; colWidths: number[] | null; columns: number | null } {
    if (b.kind === "chart") {
      const m = measureChartBlock(b);
      return { width: m.width, height: m.height, colWidths: null, columns: null };
    }
    if (b.kind === "stats") {
      const m = measureStatsBlock(b);
      return { width: m.width, height: m.height, colWidths: null, columns: m.columns };
    }
    const colWidths = measureBlockColWidths(mctx!, b);
    return { width: colWidths.reduce((a, c) => a + c, 0), height: BLOCK_TITLE_H + COL_HEADER_H + b.rows.length * ROW_H, colWidths, columns: null };
  }

  const rowDims = rows.map((row) => row.map(measureOne));
  const rowWidths = rowDims.map((dims) => dims.reduce((a, d) => a + d.width, 0) + BLOCK_GAP * Math.max(0, dims.length - 1));
  const rowHeights = rowDims.map((dims) => Math.max(0, ...dims.map((d) => d.height)));

  const canvasWidth = Math.max(...rowWidths, 400);

  mctx.font = CANVAS_FONT_MESSAGE;
  const messageLines = message ? wrapText(mctx, message, canvasWidth - CELL_PAD_X * 4) : [];
  const messageBoxHeight = messageLines.length > 0 ? messageLines.length * LINE_H + 16 : 0;
  const titleAreaHeight = 34 + (messageBoxHeight > 0 ? messageBoxHeight + 10 : 0);

  const tableAreaHeight = rowHeights.reduce((a, b) => a + b, 0) + BLOCK_GAP * Math.max(0, rows.length - 1);
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

  rows.forEach((row, rowIndex) => {
    let x = 0;
    row.forEach((block, colIndex) => {
      const dims = rowDims[rowIndex][colIndex];
      if (block.kind === "chart") drawChartBlock(ctx, block, x, y, dims.width);
      else if (block.kind === "stats") drawStatsBlock(ctx, block, x, y, dims.width, dims.columns!);
      else drawBlock(ctx, block, x, y, dims.colWidths!);
      x += dims.width + BLOCK_GAP;
    });
    y += rowHeights[rowIndex] + BLOCK_GAP;
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
