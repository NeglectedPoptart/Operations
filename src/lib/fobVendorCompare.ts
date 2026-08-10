// Compares each FOB Pharr price against today's vendor average for the
// matching commodity (Buyers > Price Sheets), so a buyer can see at a
// glance whether our sell price is running above or below what we're
// currently being quoted to buy at.
import { classify, normalizeCategory } from "./priceSheetParse";
import type { PriceSheetItem, Vendor } from "./types";

export interface VendorAverage {
  average: number;
  count: number;
}

// FOB's commodity_group is a display grouping, not always the specific
// commodity - a few groups (e.g. "Bell Pepper 25lb") hold Jalapeno/Serrano/
// Poblano/Tomatillo rows alongside actual bell peppers. variety usually
// names the specific thing ("Jalapeno LG", "Serrano") when commodity_group
// doesn't, so it's classified first and commodity_group is only the
// fallback for rows where variety is just a grade/size ("Red - LGE").
export function categoryForFobRow(commodityGroup: string, variety: string | null): string {
  const fromVariety = variety ? classify(variety) : "Other";
  if (fromVariety !== "Other") return fromVariety;
  return classify(commodityGroup);
}

// Only counts vendors whose sheet is dated today - "once we start
// uploading price sheets for that day" - so a stale, days-old sheet doesn't
// silently skew what's supposed to be a same-day comparison. Deliberately
// does NOT alias "Peppers" (an umbrella Excel-import category covering
// jalapeño/poblano/serrano/bell-pepper together) into "Bell Pepper" -
// same reasoning already documented in priceComparisonParse.ts: they're not
// the same commodity, so blending them would misrepresent the average.
export function computeTodayVendorAverages(
  items: PriceSheetItem[],
  vendors: Vendor[],
  today: string,
): Map<string, VendorAverage> {
  const currentVendorIds = new Set(vendors.filter((v) => v.sheet_date === today).map((v) => v.id));
  const byCategory = new Map<string, number[]>();
  for (const item of items) {
    if (item.price === null || !currentVendorIds.has(item.vendor_id)) continue;
    const category = normalizeCategory(item.category).toLowerCase();
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(item.price);
  }

  const result = new Map<string, VendorAverage>();
  for (const [category, prices] of byCategory) {
    result.set(category, { average: prices.reduce((a, b) => a + b, 0) / prices.length, count: prices.length });
  }
  return result;
}
