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
