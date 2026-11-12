import type { FobFreightRate, FobItem } from "./types";
import { groupFobItems, roundUpToNickel } from "./fobPricing";
import { buildCategoryBlocks, type PriceSheetOptions } from "./fobPriceSheetImage";

// What each Delivered price sheet says and how its prices are worked out - shared by the Delivered pages
// (Copy as Image / Email to customers) and the Delivered price sheet agent, so the picture a customer gets
// is the same whichever way it is sent.

export const DELIVERED_LANES = ["houston", "dallas", "east-coast"] as const;
export type DeliveredLane = (typeof DELIVERED_LANES)[number];

export const DELIVERED_DESTINATION: Record<string, string> = {
  houston: "HOUSTON",
  dallas: "DALLAS",
  "east-coast": "EAST COAST",
};

// The East Coast sheet quotes one column per lane rate (fob_freight_rates).
export const EAST_COAST_LANES = ["NC", "MD", "PA", "NJ"];

export const DEFAULT_DELIVERED_MESSAGE =
  "Please find our current price sheet attached for your review, If you have any questions or would like to discuss volume pricing or specific product needs please let us know!";

export const formatSheetMoney = (n: number | null) => (n === null ? "" : `$${n.toFixed(2)}`);

// Delivered price = FOB (per case) + freight cost per case, rounded up to the nearest nickel. LTL's rate is
// already $/pallet (fob_freight_rates.ltl); FTL's rate is a flat full-truck price, so it's divided by 24 pallets
// first. Either freight figure is then divided by unit_per (cases/pallet) to land in the same $/case unit as
// FOB before adding.
export function computeLtlFtl(item: FobItem, freight: FobFreightRate) {
  if (item.fob === null || item.unit_per === null || item.unit_per === 0) {
    return { ltl: null as number | null, ftl: null as number | null };
  }
  const ltl = freight.ltl !== null ? roundUpToNickel(item.fob + freight.ltl / item.unit_per) : null;
  const ftl = freight.ftl !== null ? roundUpToNickel(item.fob + freight.ftl / 24 / item.unit_per) : null;
  return { ltl, ftl };
}

// No LTL column on East Coast - these are flat long-haul lane rates (fob_freight_rates.ltl is null for
// NC/MD/PA/NJ), so only the FTL-per-pallet math applies.
export function computeEastCoast(item: FobItem, freight: FobFreightRate | undefined): number | null {
  if (!freight || freight.ftl === null || item.fob === null || item.unit_per === null || item.unit_per === 0) return null;
  return roundUpToNickel(item.fob + freight.ftl / 24 / item.unit_per);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Houston / Dallas: LTL and FTL columns.
export function houstonDallasSheet(lane: string, items: FobItem[], freight: FobFreightRate, message: string): PriceSheetOptions {
  const priceValues = (item: FobItem) => {
    const { ltl, ftl } = computeLtlFtl(item, freight);
    return [formatSheetMoney(ltl) || "CALL", formatSheetMoney(ftl) || "CALL"];
  };
  return {
    subheaderText: `${capitalize(lane)} Delivered`,
    priceColumns: ["LTL", "FTL"],
    subtitle: message,
    blocks: [...buildCategoryBlocks(groupFobItems(items, "western_veg"), priceValues), ...buildCategoryBlocks(groupFobItems(items, "hot_house"), priceValues)],
    showSoldOutSection: true,
  };
}

// East Coast: one FTL column per lane (NC, MD, PA, NJ), two sheet columns.
export function eastCoastSheet(items: FobItem[], freightByLane: Record<string, FobFreightRate>, message: string, lanes: string[] = EAST_COAST_LANES): PriceSheetOptions {
  const priceValues = (item: FobItem) =>
    lanes.map((lane) => {
      const price = computeEastCoast(item, freightByLane[lane]);
      return price === null ? "CALL" : formatSheetMoney(price);
    });
  return {
    subheaderText: "East Coast Delivered",
    priceColumns: lanes,
    subtitle: message,
    blocks: [...buildCategoryBlocks(groupFobItems(items, "western_veg"), priceValues), ...buildCategoryBlocks(groupFobItems(items, "hot_house"), priceValues)],
    columns: 2,
    showSoldOutSection: true,
  };
}
