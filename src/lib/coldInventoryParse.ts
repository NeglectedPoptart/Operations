// Parses a paste of the cold storage pivot report: two header rows
// (Commodity, forward-filled across its size/Subtotal span; then Size, with
// a literal "Subtotal" marking the column to skip) followed by 3 metric rows
// per Manifest (Days In Storage / Sum of Pallets / Sum of On Hand Cases) -
// only the last of those three is kept, as the on-hand qty. The trailing
// "Grand Total" column and row are dropped entirely.
export interface ParsedColdInventoryItem {
  manifest: string;
  commodity: string;
  size: string;
  qty: number;
  manifestOrder: number;
  columnOrder: number;
}

const QTY_METRIC_LABEL = "sum of on hand cases";
const METRIC_LABELS = new Set(["days in storage", "sum of pallets", QTY_METRIC_LABEL]);

function normCell(s: string | undefined): string {
  return (s ?? "").trim();
}

function normalizeCommodityForMatch(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}

// Packaging/material line items, not actual produce inventory - always
// excluded, along with any manifest whose only entries are these columns
// (which happens automatically once they're never added to colInfo below).
const EXCLUDED_COMMODITIES = new Set(
  ["EMPTY BROC BOX CHENEY 20LB", "EMPTY CELERY CHENEY BOX", "EMPTY LETTUCE BOX", "BOX BELL PEPPER"].map(
    normalizeCommodityForMatch,
  ),
);

export function parseColdInventoryPaste(raw: string): { items: ParsedColdInventoryItem[]; error: string | null } {
  const lines = raw.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 3) {
    return { items: [], error: "Not enough rows - paste the full report including both header rows." };
  }
  const rows = lines.map((l) => l.split("\t"));
  const headerRow1 = rows[0];
  const headerRow2 = rows[1];

  // Forward-fill the commodity header across its merged-cell span, stopping
  // at the "Grand Total" column (which, along with everything after it, is
  // excluded).
  const commodityByCol: string[] = [];
  let lastCommodity = "";
  let grandTotalCol = -1;
  for (let i = 0; i < headerRow1.length; i++) {
    const cell = normCell(headerRow1[i]);
    if (cell.toLowerCase() === "grand total") {
      grandTotalCol = i;
      break;
    }
    if (cell !== "" && cell.toLowerCase() !== "manifest" && cell.toLowerCase() !== "commodity") {
      lastCommodity = cell;
    }
    commodityByCol[i] = lastCommodity;
  }

  const colInfo = new Map<number, { commodity: string; size: string }>();
  for (let i = 0; i < headerRow1.length; i++) {
    if (grandTotalCol !== -1 && i >= grandTotalCol) continue;
    const commodity = commodityByCol[i] || "";
    const size = normCell(headerRow2[i]);
    if (!commodity || size === "") continue;
    const sizeLower = size.toLowerCase();
    if (sizeLower === "subtotal" || sizeLower === "size") continue;
    if (EXCLUDED_COMMODITIES.has(normalizeCommodityForMatch(commodity))) continue;
    colInfo.set(i, { commodity, size });
  }

  if (colInfo.size === 0) {
    return { items: [], error: "Could not find any commodity columns - check that both header rows were pasted." };
  }

  const manifestOrder = new Map<string, number>();
  const columnOrder = new Map<number, number>();
  Array.from(colInfo.keys()).forEach((col, idx) => columnOrder.set(col, idx));

  const items: ParsedColdInventoryItem[] = [];
  let currentManifest: string | null = null;

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];

    let labelCol = -1;
    let label = "";
    for (let i = 0; i < row.length; i++) {
      const cell = normCell(row[i]).toLowerCase();
      if (METRIC_LABELS.has(cell)) {
        labelCol = i;
        label = cell;
        break;
      }
    }
    if (labelCol === -1) continue;

    let manifestCell = "";
    for (let i = 0; i < labelCol; i++) {
      const cell = normCell(row[i]);
      if (cell !== "") {
        manifestCell = cell;
        break;
      }
    }
    if (manifestCell !== "") currentManifest = manifestCell;
    if (!currentManifest || currentManifest.toLowerCase() === "grand total") continue;
    if (label !== QTY_METRIC_LABEL) continue;

    if (!manifestOrder.has(currentManifest)) manifestOrder.set(currentManifest, manifestOrder.size);

    for (const [col, info] of colInfo) {
      const cell = normCell(row[col]);
      if (cell === "") continue;
      const qty = Number(cell.replace(/,/g, ""));
      if (!Number.isFinite(qty) || qty === 0) continue;
      items.push({
        manifest: currentManifest,
        commodity: info.commodity,
        size: info.size,
        qty,
        manifestOrder: manifestOrder.get(currentManifest)!,
        columnOrder: columnOrder.get(col)!,
      });
    }
  }

  if (items.length === 0) {
    return { items: [], error: "No 'Sum of On Hand Cases' rows with quantities were found in the pasted data." };
  }

  return { items, error: null };
}

// Bell Peppers get their own section per the warehouse's request - everything
// else falls into a second "Everything Else" section.
export function isBellPepper(commodity: string): boolean {
  return commodity.toLowerCase().includes("bell pepper");
}
