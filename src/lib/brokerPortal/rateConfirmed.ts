import type { PortalLoad } from "./types";

// A rate counts as "confirmed" only while the load's rate is still the one the carrier confirmed -
// if the rate is changed afterwards they are asked to confirm the new one.
export function rateIsConfirmed(l: Pick<PortalLoad, "rate" | "rateConfirmedAt" | "rateConfirmedAmount">): boolean {
  return Boolean(l.rateConfirmedAt) && l.rate !== null && l.rateConfirmedAmount !== null && Math.abs(l.rateConfirmedAmount - l.rate) < 0.005;
}
