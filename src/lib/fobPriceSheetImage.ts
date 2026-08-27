// Branded "Daily Price List" canvas renderer for FOB Pharr + Delivered
// pricing pages only - deliberately a separate module from fobPricing.ts's
// renderPriceSheetPng, which is shared by 13+ other pages (AR, AP, PAS
// Files, Old Age, QC Agenda, Buyers List, Invoicing, etc.) that all want
// the existing plain black/white grid look, not this design.
//
// Matches today's data shape (one row = one variety + one size + one
// price) rather than the reference template's grade x pack-size pivot
// (e.g. a "JBO" row priced under both a "DRC" and a "25#" column) - that
// would need a second free-text dimension FOB items don't currently have.
// A variety (e.g. "Green") gets its own colored bar; each row under it is
// just that variety's size + price(s), one per line.

import type { FobItem } from "./types";
import type { FobItemGroup } from "./fobPricing";

export interface PriceSheetRow {
  size: string;
  prices: string[];
}

export interface PriceSheetVarietyGroup {
  label: string;
  rows: PriceSheetRow[];
}

export interface PriceSheetCategoryBlock {
  category: string;
  groups: PriceSheetVarietyGroup[];
  // Rows dropped because every price column came back "CALL" - never shown
  // as rows themselves. soldOutCount flags that the category has any (so it
  // still earns a slot on the sheet even with zero priced groups);
  // soldOutLabels names the specific sold-out varieties (deduped, blank
  // ones omitted since there's nothing useful to print) for the
  // consolidated sold-out section at the bottom of the sheet.
  soldOutCount: number;
  soldOutLabels: string[];
}

// Sub-groups each commodity group's rows by variety (blank variety just
// gets an unlabeled group, rendered without a colored bar) and turns each
// item into a {size, prices} row via the caller's own price math - shared
// so FOB Pharr / Delivered / East Coast don't each reimplement the same
// variety split three times. A row with no real price in any column (every
// price came back "CALL") is dropped rather than shown - it's dead weight
// on a customer-facing sheet, and this is the one place all three pages'
// rows funnel through.
export function buildCategoryBlocks(
  groups: FobItemGroup[],
  priceValues: (item: FobItem) => string[],
): PriceSheetCategoryBlock[] {
  return groups
    .map((g) => {
      const varietyMap = new Map<string, FobItem[]>();
      for (const item of g.rows) {
        const key = item.variety?.trim() || "";
        const arr = varietyMap.get(key) ?? [];
        arr.push(item);
        varietyMap.set(key, arr);
      }
      let soldOutCount = 0;
      const soldOutLabels: string[] = [];
      const varietyGroups: PriceSheetVarietyGroup[] = Array.from(varietyMap.entries())
        .map(([label, varietyItems]) => {
          const rows = varietyItems.map((item) => ({
            size: [item.unit_per !== null ? String(item.unit_per) : null, item.size].filter(Boolean).join(" / ") || "-",
            prices: priceValues(item),
          }));
          const priced = rows.filter((row) => row.prices.some((p) => p !== "CALL"));
          if (priced.length < rows.length) {
            soldOutCount += rows.length - priced.length;
            if (label && !soldOutLabels.includes(label)) soldOutLabels.push(label);
          }
          return { label, rows: priced };
        })
        .filter((group) => group.rows.length > 0);
      return { category: g.name, groups: varietyGroups, soldOutCount, soldOutLabels };
    })
    .filter((block) => block.groups.length > 0 || block.soldOutCount > 0);
}

// Color scheme for the sheet - header gradient, bracket/accent colors, row
// stripes. PALETTE_DEFAULT (plum/wine into beige) is what all three pages
// render with; the others are alternates to experiment with, passed via
// the `palette` option on renderBrandedPriceSheetPng.
export interface PriceSheetPalette {
  headerGradient: [string, string, string];
  bracket: string;
  accent: string;
  rowStripe: string;
  rowPlain: string;
  cardBorder: string;
  subheaderText: string;
}

export const PALETTE_DEFAULT: PriceSheetPalette = {
  headerGradient: ["#4A2545", "#8B5A6B", "#C9B08A"],
  bracket: "#C9B08A",
  accent: "#4A2545",
  rowStripe: "#F2EAE0",
  rowPlain: "#FFFFFF",
  cardBorder: "#E3DCD0",
  subheaderText: "#F7F0E6",
};

// The original orange-to-green branded reference look - kept around in
// case there's ever a reason to switch back, but no longer the default.
export const PALETTE_ORIGINAL_ORANGE: PriceSheetPalette = {
  headerGradient: ["#C0532D", "#B87A1B", "#7DB63A"],
  bracket: "#8DC63F",
  accent: "#C0532D",
  rowStripe: "#EFF2D6",
  rowPlain: "#FFFFFF",
  cardBorder: "#E4E1CE",
  subheaderText: "#FFF6E6",
};

// Cool and crisp - navy into slate blue into a soft teal, mustard-gold
// brackets for contrast.
export const PALETTE_HARBOR_BLUE: PriceSheetPalette = {
  headerGradient: ["#1F3350", "#3B5B7A", "#5FA8A0"],
  bracket: "#D4A017",
  accent: "#1F3350",
  rowStripe: "#E7EEF2",
  rowPlain: "#FFFFFF",
  cardBorder: "#D6E0E6",
  subheaderText: "#EFF5F7",
};

const FONT_TITLE = "bold 58px Georgia, 'Times New Roman', serif";
const FONT_LOGO_FALLBACK = "bold 20px Georgia, serif";
const FONT_SUBHEADER = "bold 21px Arial, sans-serif";
const FONT_CATEGORY = "bold 19px Georgia, 'Times New Roman', serif";
const FONT_VARIETY = "bold 15px Arial, sans-serif";
const FONT_VARIETY_SMALL = "bold 11px Arial, sans-serif";
const FONT_ROW = "15px Arial, sans-serif";
const FONT_ROW_PRICE = "bold 15px Arial, sans-serif";
const FONT_FOOTER = "10px Arial, sans-serif";
const FONT_SOLD_OUT_TITLE = "bold 16px Georgia, 'Times New Roman', serif";
const FONT_SOLD_OUT_CATEGORY = "bold 13px Arial, sans-serif";
const FONT_SOLD_OUT_LABELS = "13px Arial, sans-serif";

const MARGIN = 24;
const COL_GAP = 18;
const BLOCK_GAP = 16;
const CARD_PAD_TOP = 14;
const CARD_PAD_BOTTOM = 12;
const CARD_RADIUS = 10;
const TITLE_PAD_X = 16;
const CATEGORY_TITLE_H = 30;
const VARIETY_BAR_H = 28;
const ROW_H = 26;
const CELL_PAD_X = 12;
const HEADER_H = 175;
const PRICE_COL_W = 68;
const SOLD_OUT_TITLE_H = 34;
const SOLD_OUT_LINE_H = 19;
const SOLD_OUT_ENTRY_GAP = 6;
const SOLD_OUT_TITLE_TEXT = "SOLD OUT - PLEASE CALL FOR PREBOOK";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function measureBlockHeight(block: PriceSheetCategoryBlock): number {
  let h = CARD_PAD_TOP + CATEGORY_TITLE_H;
  for (const g of block.groups) {
    if (g.label) h += VARIETY_BAR_H;
    h += g.rows.length * ROW_H;
  }
  return h + CARD_PAD_BOTTOM;
}

function priceColBounds(rightEdge: number, priceZoneW: number, colCount: number, colIndex: number) {
  const colW = priceZoneW / colCount;
  const left = rightEdge - priceZoneW + colW * colIndex;
  return { right: left + colW, center: left + colW / 2 };
}

// Two-tone "[ CATEGORY ]" title: accent-colored brackets, accent category
// name - canvas fillText is single-color per call, so this draws the three
// segments back to back, measuring each to place the next.
function drawBracketTitle(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, palette: PriceSheetPalette) {
  ctx.font = FONT_CATEGORY;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let cursorX = x;
  const segments: [string, string][] = [
    ["[ ", palette.bracket],
    [text.toUpperCase(), palette.accent],
    [" ]", palette.bracket],
  ];
  for (const [segment, color] of segments) {
    ctx.fillStyle = color;
    ctx.fillText(segment, cursorX, y);
    cursorX += ctx.measureText(segment).width;
  }
}

function drawCategoryBlock(
  ctx: CanvasRenderingContext2D,
  block: PriceSheetCategoryBlock,
  x: number,
  y: number,
  width: number,
  priceColumns: string[],
  palette: PriceSheetPalette,
) {
  const totalHeight = measureBlockHeight(block);
  const priceZoneW = Math.min(width * 0.6, PRICE_COL_W * priceColumns.length);

  ctx.save();
  ctx.shadowColor = "rgba(30, 25, 10, 0.12)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  drawRoundedRect(ctx, x, y, width, totalHeight, CARD_RADIUS);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  drawRoundedRect(ctx, x, y, width, totalHeight, CARD_RADIUS);
  ctx.clip();

  let cursorY = y + CARD_PAD_TOP;
  drawBracketTitle(ctx, block.category, x + TITLE_PAD_X, cursorY + 19, palette);
  cursorY += CATEGORY_TITLE_H;

  for (const group of block.groups) {
    // A single price column (e.g. plain FOB) has no separate column-header
    // text competing for the bar's right side, so the label itself sits
    // there instead - multi-column pages (LTL/FTL, lane rates) keep it on
    // the left so it doesn't collide with those column headers.
    const labelAlignRight = priceColumns.length <= 1;

    if (group.label) {
      ctx.fillStyle = palette.accent;
      ctx.fillRect(x, cursorY, width, VARIETY_BAR_H);
      ctx.fillStyle = "#ffffff";
      ctx.font = FONT_VARIETY;
      ctx.textBaseline = "middle";
      if (labelAlignRight) {
        ctx.textAlign = "right";
        ctx.fillText(group.label.toUpperCase(), x + width - CELL_PAD_X, cursorY + VARIETY_BAR_H / 2 + 1);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(group.label.toUpperCase(), x + CELL_PAD_X, cursorY + VARIETY_BAR_H / 2 + 1);
      }

      if (priceColumns.length > 1) {
        ctx.font = FONT_VARIETY_SMALL;
        ctx.textAlign = "center";
        priceColumns.forEach((label, i) => {
          const { center } = priceColBounds(x + width, priceZoneW, priceColumns.length, i);
          ctx.fillText(label, center, cursorY + VARIETY_BAR_H / 2 + 1);
        });
      }
      cursorY += VARIETY_BAR_H;
    }

    group.rows.forEach((row, i) => {
      ctx.fillStyle = i % 2 === 0 ? palette.rowStripe : palette.rowPlain;
      ctx.fillRect(x, cursorY, width, ROW_H);
      ctx.font = FONT_ROW;
      ctx.fillStyle = "#1F2B22";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(row.size, x + CELL_PAD_X, cursorY + ROW_H / 2 + 1);

      ctx.font = FONT_ROW_PRICE;
      ctx.fillStyle = "#1F2B22";
      ctx.textAlign = "right";
      row.prices.forEach((price, colIndex) => {
        const { right } = priceColBounds(x + width, priceZoneW, priceColumns.length, colIndex);
        ctx.fillText(price, right - 6, cursorY + ROW_H / 2 + 1);
      });
      cursorY += ROW_H;
    });
  }

  ctx.restore();

  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x + 0.5, y + 0.5, width - 1, totalHeight - 1, CARD_RADIUS);
  ctx.stroke();
}

// Greedy column-balancing (masonry-style): each block goes into whichever
// column is currently shortest, so a tall block (e.g. Bell Peppers with
// four varieties) doesn't leave the rest of that column's page half-empty
// the way simple round-robin or row-major placement would.
function packColumns(blocks: PriceSheetCategoryBlock[], columns: number): PriceSheetCategoryBlock[][] {
  const heights = blocks.map((b) => measureBlockHeight(b));
  const columnBlocks: PriceSheetCategoryBlock[][] = Array.from({ length: columns }, () => []);
  const columnHeights = new Array(columns).fill(0);
  blocks.forEach((block, i) => {
    let shortest = 0;
    for (let c = 1; c < columns; c++) {
      if (columnHeights[c] < columnHeights[shortest]) shortest = c;
    }
    columnBlocks[shortest].push(block);
    columnHeights[shortest] += heights[i] + BLOCK_GAP;
  });
  return columnBlocks;
}

function soldOutEntryText(block: PriceSheetCategoryBlock): string {
  return block.soldOutLabels.length > 0
    ? `${block.category.toUpperCase()}: ${block.soldOutLabels.join(", ")}`
    : block.category.toUpperCase();
}

// Same greedy column-balancing idea as packColumns, but for the wrapped
// text lines of the consolidated sold-out section rather than whole cards.
function layoutSoldOutColumns(
  ctx: CanvasRenderingContext2D,
  blocks: PriceSheetCategoryBlock[],
  columns: number,
  colWidth: number,
): { lines: string[]; height: number }[][] {
  ctx.font = FONT_SOLD_OUT_CATEGORY;
  const measured = blocks.map((b) => {
    const lines = wrapFooter(ctx, soldOutEntryText(b), colWidth - CELL_PAD_X * 2);
    return { lines, height: lines.length * SOLD_OUT_LINE_H + SOLD_OUT_ENTRY_GAP };
  });
  const cols: { lines: string[]; height: number }[][] = Array.from({ length: columns }, () => []);
  const colHeights = new Array(columns).fill(0);
  measured.forEach((entry) => {
    let shortest = 0;
    for (let c = 1; c < columns; c++) {
      if (colHeights[c] < colHeights[shortest]) shortest = c;
    }
    cols[shortest].push(entry);
    colHeights[shortest] += entry.height;
  });
  return cols;
}

function soldOutSectionHeight(cols: { lines: string[]; height: number }[][]): number {
  if (cols.every((c) => c.length === 0)) return 0;
  const tallest = Math.max(...cols.map((c) => c.reduce((sum, e) => sum + e.height, 0)));
  return SOLD_OUT_TITLE_H + tallest;
}

function drawSoldOutSection(
  ctx: CanvasRenderingContext2D,
  cols: { lines: string[]; height: number }[][],
  x: number,
  y: number,
  totalWidth: number,
  colWidth: number,
  colGap: number,
  palette: PriceSheetPalette,
) {
  ctx.font = FONT_SOLD_OUT_TITLE;
  ctx.fillStyle = palette.accent;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(SOLD_OUT_TITLE_TEXT, x, y + 20);
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + SOLD_OUT_TITLE_H - 6);
  ctx.lineTo(x + totalWidth, y + SOLD_OUT_TITLE_H - 6);
  ctx.stroke();

  const bodyY = y + SOLD_OUT_TITLE_H;
  ctx.font = FONT_SOLD_OUT_CATEGORY;
  ctx.fillStyle = "#5B5648";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  cols.forEach((col, i) => {
    const colX = x + i * (colWidth + colGap);
    let cursorY = bodyY + SOLD_OUT_LINE_H - 5;
    col.forEach(({ lines }) => {
      lines.forEach((line, li) => {
        ctx.font = li === 0 ? FONT_SOLD_OUT_CATEGORY : FONT_SOLD_OUT_LABELS;
        ctx.fillText(line, colX, cursorY);
        if (li < lines.length - 1) cursorY += SOLD_OUT_LINE_H;
      });
      cursorY += SOLD_OUT_LINE_H + SOLD_OUT_ENTRY_GAP;
    });
  });
}

export async function renderBrandedPriceSheetPng(opts: {
  subheaderText: string;
  priceColumns: string[];
  blocks: PriceSheetCategoryBlock[];
  subtitle?: string;
  footerNote?: string;
  columns?: number;
  scale?: number;
  palette?: PriceSheetPalette;
  // Rows with no real price are always left out of the main grid - this
  // only controls whether every category that had any gets named (with its
  // sold-out varieties) in one consolidated section at the bottom of the
  // sheet, below everything that's actually quoted. Off by default.
  showSoldOutSection?: boolean;
}): Promise<Blob> {
  const {
    subheaderText,
    priceColumns,
    blocks,
    subtitle,
    footerNote = "***All prices are F.O.B. ***Prices and availability subject to change without notice. ***Good delivery standards apply, excluding bruising and/or discoloration following bruising and/or freeze damage.",
    columns = 3,
    scale = 2,
    palette = PALETTE_DEFAULT,
    showSoldOutSection = false,
  } = opts;

  const canvasWidth = 1000;
  const contentWidth = canvasWidth - MARGIN * 2;
  const colWidth = (contentWidth - COL_GAP * (columns - 1)) / columns;

  // Only categories with something actually quoted appear in the main
  // grid - anything sold-out-only moves entirely to the consolidated
  // section below (when shown at all).
  const visibleBlocks = blocks.filter((b) => b.groups.length > 0);
  const soldOutBlocks = showSoldOutSection ? blocks.filter((b) => b.soldOutCount > 0) : [];

  const columnBlocks = packColumns(visibleBlocks, columns);
  const columnHeights = columnBlocks.map((col) => col.reduce((sum, b) => sum + measureBlockHeight(b) + BLOCK_GAP, 0));
  const bodyHeight = Math.max(...columnHeights, 0);

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");
  if (!mctx) throw new Error("Canvas is not supported in this browser");
  mctx.font = FONT_FOOTER;
  const footerLines = footerNote ? wrapFooter(mctx, footerNote, contentWidth) : [];
  const footerHeight = footerLines.length > 0 ? footerLines.length * 12 + 12 : 0;

  mctx.font = FONT_ROW;
  const subtitleLines = subtitle ? wrapFooter(mctx, subtitle, contentWidth - 32) : [];
  const subtitleH = subtitleLines.length > 0 ? subtitleLines.length * 16 + 20 : 0;

  const soldOutCols = layoutSoldOutColumns(mctx, soldOutBlocks, columns, colWidth);
  const soldOutH = soldOutBlocks.length > 0 ? soldOutSectionHeight(soldOutCols) + MARGIN : 0;

  const canvasHeight = HEADER_H + subtitleH + MARGIN + bodyHeight + soldOutH + footerHeight + MARGIN;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(canvasWidth * scale);
  canvas.height = Math.ceil(canvasHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#F3F1E7";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Header band - diagonal gradient, matching the brand's reference "Daily
  // Price List" letterhead.
  const gradient = ctx.createLinearGradient(0, 0, canvasWidth, HEADER_H);
  gradient.addColorStop(0, palette.headerGradient[0]);
  gradient.addColorStop(0.55, palette.headerGradient[1]);
  gradient.addColorStop(1, palette.headerGradient[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, HEADER_H);

  try {
    const logo = await loadImage("/logo-harvest-best-white.png");
    const logoH = 56;
    const logoW = logoH * (logo.width / logo.height);
    ctx.drawImage(logo, MARGIN, 20, logoW, logoH);
  } catch {
    ctx.font = FONT_LOGO_FALLBACK;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("Harvest Best", MARGIN, 30);
  }

  ctx.font = FONT_TITLE;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("DAILY PRICE LIST", canvasWidth / 2, 128);

  ctx.font = FONT_SUBHEADER;
  ctx.fillStyle = palette.subheaderText;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  try {
    ctx.letterSpacing = "3px";
  } catch {
    // letterSpacing isn't supported by every canvas implementation - the
    // subheader still reads fine without the extra tracking.
  }
  ctx.fillText(subheaderText.toUpperCase(), canvasWidth / 2, 158);
  try {
    ctx.letterSpacing = "0px";
  } catch {
    /* see above */
  }

  if (subtitleLines.length > 0) {
    ctx.fillStyle = "#FDFCF7";
    ctx.fillRect(0, HEADER_H, canvasWidth, subtitleH);
    ctx.font = FONT_ROW;
    ctx.fillStyle = "#3A3F33";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lineH = 16;
    const startY = HEADER_H + (subtitleH - subtitleLines.length * lineH) / 2 + lineH / 2;
    subtitleLines.forEach((line, i) => {
      ctx.fillText(line, canvasWidth / 2, startY + i * lineH);
    });
  }

  let bodyY = HEADER_H + subtitleH + MARGIN;
  columnBlocks.forEach((col, i) => {
    const x = MARGIN + i * (colWidth + COL_GAP);
    let y = bodyY;
    for (const block of col) {
      drawCategoryBlock(ctx, block, x, y, colWidth, priceColumns, palette);
      y += measureBlockHeight(block) + BLOCK_GAP;
    }
  });
  bodyY += bodyHeight;

  if (soldOutBlocks.length > 0) {
    drawSoldOutSection(ctx, soldOutCols, MARGIN, bodyY + MARGIN, contentWidth, colWidth, COL_GAP, palette);
    bodyY += soldOutH;
  }

  if (footerLines.length > 0) {
    ctx.font = FONT_FOOTER;
    ctx.fillStyle = "#7C8878";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    footerLines.forEach((line, i) => {
      ctx.fillText(line, MARGIN, bodyY + 16 + i * 12);
    });
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to export price sheet image"));
    }, "image/png");
  });
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapFooter(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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
  return lines;
}
