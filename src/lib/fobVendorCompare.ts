// Compares each FOB Pharr price against today's vendor average for the
// matching commodity (Buyers > Price Sheets), so a buyer can see at a
// glance whether our sell price is running above or below what we're
// currently being quoted to buy at.
import { BROCCOLI_CROWNS_CATEGORY, classify, classifyBroccoliGrade, normalizeCategory } from "./priceSheetParse";
import type { PriceSheetItem, Vendor } from "./types";

export interface VendorAverage {
  average: number;
  count: number;
}

// Broccoli / Crowns is graded #1/#2 (see classifyBroccoliGrade) - every
// other category is averaged as one blended bucket, same as before.
function gradeFor(category: string, text: string): "#1" | "#2" | null {
  return category === BROCCOLI_CROWNS_CATEGORY ? classifyBroccoliGrade(text) : null;
}

function averageKey(category: string, grade: "#1" | "#2" | null): string {
  const base = category.toLowerCase();
  return grade ? `${base}|${grade}` : base;
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

// null for every category except Broccoli / Crowns (Fu Choy Red is #1,
// Fu Choy Green/Generic are #2).
export function gradeForFobRow(commodityGroup: string, variety: string | null): "#1" | "#2" | null {
  const category = categoryForFobRow(commodityGroup, variety);
  return gradeFor(category, variety || commodityGroup);
}

// The lookup key into computeTodayVendorAverages()'s map for a given FOB
// row - folds in the #1/#2 grade for Broccoli / Crowns so each grade
// compares against its own vendor average instead of one blended across
// both.
export function vendorAverageKeyForFobRow(commodityGroup: string, variety: string | null): string {
  const category = categoryForFobRow(commodityGroup, variety);
  return averageKey(category, gradeFor(category, variety || commodityGroup));
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
  const byKey = new Map<string, number[]>();
  for (const item of items) {
    if (item.price === null || !currentVendorIds.has(item.vendor_id)) continue;
    const category = normalizeCategory(item.category);
    const grade = gradeFor(category, `${item.item_label} ${item.size ?? ""}`);
    const key = averageKey(category, grade);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item.price);
  }

  const result = new Map<string, VendorAverage>();
  for (const [key, prices] of byKey) {
    result.set(key, { average: prices.reduce((a, b) => a + b, 0) / prices.length, count: prices.length });
  }
  return result;
}
