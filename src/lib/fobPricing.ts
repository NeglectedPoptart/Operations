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

// Builds one *bold title* + ```monospace table``` block for a commodity
// section (Western Veg / Hot House), ready to concatenate into a full
// WhatsApp message.
export function buildWhatsAppSection(
  sectionTitle: string,
  groups: FobItemGroup[],
  headers: string[],
  rowValues: (item: FobItem) => string[],
): string {
  const rows: MonoRow[] = [];
  for (const g of groups) {
    rows.push({ group: g.name });
    for (const item of g.rows) rows.push({ cells: rowValues(item) });
  }
  const table = buildMonospaceTable(headers, rows);
  return `*${sectionTitle}*\n\`\`\`\n${table}\n\`\`\``;
}
