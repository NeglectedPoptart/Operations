// Parses a "Price Comparison Sales Summary" workbook - a sales team's own
// cross-vendor reference sheet, not a single vendor's price list. Shape:
// Category | Item / Pack Size | <Vendor 1> | <Vendor 2> | ... | Lowest
// Price | Best Supplier | Notes - one row per item, one column per vendor,
// "—"/blank meaning that vendor didn't quote it. Category is usually only
// filled on a group's first row (via a merged cell), hence the forward-fill
// below - kept even though the two known producers of this format
// (ExcelJS reading merged cells, or a plain unmerged sheet) may already
// repeat it themselves.

import { normalizeCategory } from "./priceSheetParse";

export interface ComparisonItem {
  category: string;
  itemLabel: string;
  // Keyed by the sheet's own vendor column header text (e.g. "Mexfresh
  // TX") - resolving that to an actual vendor record is a separate,
  // explicit mapping step in the UI, never guessed silently here.
  pricesByColumn: Record<string, number | null>;
}

export interface ParsePriceComparisonResult {
  vendorColumns: string[];
  items: ComparisonItem[];
  error?: string;
}

const IGNORED_COLUMN_NAMES = new Set(["category", "item / pack size", "item/pack size", "lowest price", "best supplier", "notes"]);
const NO_QUOTE_VALUES = new Set(["", "—", "-", "n/a", "na"]);

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function parsePriceComparisonSheet(grid: string[][]): ParsePriceComparisonResult {
  const headerRowIdx = grid.findIndex((row) => norm(row[0] ?? "") === "category");
  if (headerRowIdx === -1) {
    return {
      vendorColumns: [],
      items: [],
      error: "Couldn't find a header row starting with \"Category\" - check this is a Price Comparison Sales Summary export.",
    };
  }

  const headerRow = grid[headerRowIdx];
  const vendorColumns: { index: number; name: string }[] = [];
  headerRow.forEach((cell, index) => {
    if (index <= 1) return; // Category, Item / Pack Size
    const name = (cell ?? "").trim();
    if (name === "" || IGNORED_COLUMN_NAMES.has(norm(name))) return;
    vendorColumns.push({ index, name });
  });

  if (vendorColumns.length === 0) {
    return { vendorColumns: [], items: [], error: "Found a header row but no vendor columns after it." };
  }

  let currentCategory = "";
  const items: ComparisonItem[] = [];

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const category = (row[0] ?? "").trim();
    const itemLabel = (row[1] ?? "").trim();
    if (category === "" && itemLabel === "") continue; // blank separator row
    if (itemLabel === "") continue; // e.g. a footer/notes row with only col0 filled
    if (category !== "") currentCategory = category;

    const pricesByColumn: Record<string, number | null> = {};
    for (const vc of vendorColumns) {
      const raw = (row[vc.index] ?? "").trim();
      if (raw === "" || NO_QUOTE_VALUES.has(norm(raw))) continue;
      if (norm(raw) === "call") {
        pricesByColumn[vc.name] = null;
        continue;
      }
      const price = Number(raw.replace(/,/g, ""));
      if (Number.isFinite(price)) pricesByColumn[vc.name] = price;
    }
    if (Object.keys(pricesByColumn).length === 0) continue; // no vendor quoted this row at all

    items.push({ category: normalizeCategory(currentCategory), itemLabel, pricesByColumn });
  }

  if (items.length === 0) {
    return { vendorColumns: vendorColumns.map((v) => v.name), items: [], error: "No priced rows found under the header." };
  }

  return { vendorColumns: vendorColumns.map((v) => v.name), items };
}
