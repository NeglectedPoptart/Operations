import { roundUpToNickel } from "./fobPricing";
import type { FobItem } from "./types";

// Custom Price Sheets (Sales): a sheet built by hand from today's FOB catalog -
// which commodities/sizes to quote, a title and summary, and optionally one or
// more delivered locations priced from a freight figure.

// Pallets on a full truck - the same 24 the Delivered pages use.
export const PALLETS_PER_TRUCK = 24;

export type FreightMode = "truck" | "pallet";

export interface Destination {
  id: string;
  location: string;
  // "truck": amount is the whole truck's price (divided by 24 pallets).
  // "pallet": amount is already the freight per pallet.
  mode: FreightMode;
  amount: number | null;
}

export interface SavedSheet {
  id: string;
  name: string;
  title: string;
  summary: string;
  footer: string;
  selection: string[];
  destinations: Destination[];
  updated_at: string;
}

// fob_items rows are re-created every day (new ids), so a saved sheet remembers
// WHAT it quotes by this key and finds the same rows again, with fresh prices.
export function itemKey(item: Pick<FobItem, "section" | "commodity_group" | "variety" | "size" | "unit_per">): string {
  return [item.section, item.commodity_group, item.variety ?? "", item.size ?? "", item.unit_per ?? ""].join("|");
}

export function freightPerPallet(d: Pick<Destination, "mode" | "amount">): number | null {
  if (d.amount === null || !(d.amount >= 0)) return null;
  return d.mode === "truck" ? d.amount / PALLETS_PER_TRUCK : d.amount;
}

// Delivered price per case = FOB + freight per pallet spread over the cases on a
// pallet, rounded UP to the nickel (same rule as the Delivered pages).
export function deliveredPrice(item: Pick<FobItem, "fob" | "unit_per">, perPallet: number | null): number | null {
  if (item.fob === null || perPallet === null || item.unit_per === null || item.unit_per === 0) return null;
  return roundUpToNickel(item.fob + perPallet / item.unit_per);
}

export const DEFAULT_FOOTER_FOB =
  "***All prices are F.O.B. ***Prices and availability subject to change without notice. ***Good delivery standards apply, excluding bruising and/or discoloration following bruising and/or freeze damage.";
export const DEFAULT_FOOTER_DELIVERED =
  "***Prices are delivered to the locations shown. ***Prices and availability subject to change without notice. ***Good delivery standards apply, excluding bruising and/or discoloration following bruising and/or freeze damage.";
