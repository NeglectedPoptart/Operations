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
}

// Sub-groups each commodity group's rows by variety (blank variety just
// gets an unlabeled group, rendered without a colored bar) and turns each
// item into a {size, prices} row via the caller's own price math - shared
// so FOB Pharr / Delivered / East Coast don't each reimplement the same
// variety split three times.
export function buildCategoryBlocks(
  groups: FobItemGroup[],
  priceValues: (item: FobItem) => string[],
): PriceSheetCategoryBlock[] {
  return groups.map((g) => {
    const varietyMap = new Map<string, FobItem[]>();
    for (const item of g.rows) {
      const key = item.variety?.trim() || "";
      const arr = varietyMap.get(key) ?? [];
      arr.push(item);
      varietyMap.set(key, arr);
    }
    const varietyGroups: PriceSheetVarietyGroup[] = Array.from(varietyMap.entries()).map(([label, varietyItems]) => ({
      label,
      rows: varietyItems.map((item) => ({
        size: [item.unit_per !== null ? String(item.unit_per) : null, item.size].filter(Boolean).join(" / ") || "-",
        prices: priceValues(item),
      })),
    }));
    return { category: g.name, groups: varietyGroups };
  });
}

const FONT_TITLE = "bold 42px Georgia, 'Times New Roman', serif";
const FONT_LOGO_FALLBACK = "bold 20px Georgia, serif";
const FONT_BADGE = "bold 15px Arial, sans-serif";
const FONT_CATEGORY = "italic bold 14px Georgia, serif";
const FONT_VARIETY = "bold 12px Arial, sans-serif";
const FONT_VARIETY_SMALL = "bold 9px Arial, sans-serif";
const FONT_ROW = "12px Arial, sans-serif";
const FONT_ROW_PRICE = "bold 11px Arial, sans-serif";
const FONT_FOOTER = "9px Arial, sans-serif";

const MARGIN = 24;
const COL_GAP = 18;
const BLOCK_GAP = 16;
const CATEGORY_TITLE_H = 26;
const VARIETY_BAR_H = 22;
const ROW_H = 20;
const CELL_PAD_X = 10;
const HEADER_H = 170;
const PRICE_COL_W = 56;

const GREEN_DARK = "#2B4E38";
const VARIETY_BAR_COLOR = "#C0532D";
const ROW_STRIPE = "#EAF3DE";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function measureBlockHeight(block: PriceSheetCategoryBlock): number {
  let h = CATEGORY_TITLE_H;
  for (const g of block.groups) {
    if (g.label) h += VARIETY_BAR_H;
    h += g.rows.length * ROW_H;
  }
  return h;
}

function priceColBounds(rightEdge: number, priceZoneW: number, colCount: number, colIndex: number) {
  const colW = priceZoneW / colCount;
  const left = rightEdge - priceZoneW + colW * colIndex;
  return { right: left + colW, center: left + colW / 2 };
}

function drawCategoryBlock(
  ctx: CanvasRenderingContext2D,
  block: PriceSheetCategoryBlock,
  x: number,
  y: number,
  width: number,
  priceColumns: string[],
) {
  let cursorY = y;
  const priceZoneW = Math.min(width * 0.6, PRICE_COL_W * priceColumns.length);

  ctx.font = FONT_CATEGORY;
  ctx.fillStyle = GREEN_DARK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`[ ${block.category.toUpperCase()} ]`, x, cursorY + 16);
  ctx.strokeStyle = "#D9DBC9";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, cursorY + 22);
  ctx.lineTo(x + width, cursorY + 22);
  ctx.stroke();
  cursorY += CATEGORY_TITLE_H;

  for (const group of block.groups) {
    if (group.label) {
      ctx.fillStyle = VARIETY_BAR_COLOR;
      ctx.fillRect(x, cursorY, width, VARIETY_BAR_H);
      ctx.fillStyle = "#ffffff";
      ctx.font = FONT_VARIETY;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(group.label.toUpperCase(), x + CELL_PAD_X, cursorY + VARIETY_BAR_H / 2 + 1);

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
      if (i % 2 === 0) {
        ctx.fillStyle = ROW_STRIPE;
        ctx.fillRect(x, cursorY, width, ROW_H);
      }
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

export async function renderBrandedPriceSheetPng(opts: {
  badgeText: string;
  priceColumns: string[];
  blocks: PriceSheetCategoryBlock[];
  subtitle?: string;
  footerNote?: string;
  columns?: number;
  scale?: number;
}): Promise<Blob> {
  const {
    badgeText,
    priceColumns,
    blocks,
    subtitle,
    footerNote = "***All prices are F.O.B. ***Prices and availability subject to change without notice. ***Good delivery standards apply, excluding bruising and/or discoloration following bruising and/or freeze damage.",
    columns = 3,
    scale = 2,
  } = opts;

  const canvasWidth = 1000;
  const contentWidth = canvasWidth - MARGIN * 2;
  const colWidth = (contentWidth - COL_GAP * (columns - 1)) / columns;

  const columnBlocks = packColumns(blocks, columns);
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

  const canvasHeight = HEADER_H + subtitleH + MARGIN + bodyHeight + footerHeight + MARGIN;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(canvasWidth * scale);
  canvas.height = Math.ceil(canvasHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#F3F1E7";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Header band - diagonal orange-to-green gradient, matching the brand's
  // reference "Daily Price List" letterhead.
  const gradient = ctx.createLinearGradient(0, 0, canvasWidth, HEADER_H);
  gradient.addColorStop(0, "#C0532D");
  gradient.addColorStop(0.55, "#B87A1B");
  gradient.addColorStop(1, "#7DB63A");
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
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("DAILY PRICE LIST", MARGIN, 122);

  ctx.font = FONT_BADGE;
  const badgePadX = 16;
  const badgeW = ctx.measureText(badgeText).width + badgePadX * 2;
  const badgeH = 32;
  const badgeY = 134;
  drawRoundedRect(ctx, MARGIN, badgeY, badgeW, badgeH, 16);
  ctx.fillStyle = "#7DB63A";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, MARGIN + badgePadX, badgeY + badgeH / 2 + 1);

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
      drawCategoryBlock(ctx, block, x, y, colWidth, priceColumns);
      y += measureBlockHeight(block) + BLOCK_GAP;
    }
  });
  bodyY += bodyHeight;

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
