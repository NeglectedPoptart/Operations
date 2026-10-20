// Aging bucket is computed live from the invoice date vs. today, never stored - a
// bucket baked in at import time would silently go stale (an invoice that
// was "1-20 days" the day it was pulled reads exactly the same weeks later
// once it's actually "61+"). Both the boundaries and the basis match the source
// "AR Aging Detail by Customer" report (Current / 1-20 / 21-40 / 41-60 / 61+ days
// since the INVOICE date - an invoice dated 35 days ago sits in 21-40 even though
// its due date is only 14 days past; checked against a real report). The due
// date is only a fallback for an invoice with no invoice date.
import { daysSince } from "./dates";

export type ArAgingBucket = "current" | "1-20" | "21-40" | "41-60" | "61+";

export const AR_AGING_BUCKETS: { key: ArAgingBucket; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "1-20", label: "1-20" },
  { key: "21-40", label: "21-40" },
  { key: "41-60", label: "41-60" },
  { key: "61+", label: "61+" },
];

// Days an invoice has aged, the way the report counts it.
export function arAgeDays(inv: { invoice_date: string | null; due_date: string | null }): number | null {
  return daysSince(inv.invoice_date ?? inv.due_date);
}

export function arAgingBucket(inv: { invoice_date: string | null; due_date: string | null }): ArAgingBucket {
  const days = arAgeDays(inv);
  if (days === null || days <= 0) return "current";
  if (days <= 20) return "1-20";
  if (days <= 40) return "21-40";
  if (days <= 60) return "41-60";
  return "61+";
}

// AR Troubles tracks how long a claim has sat open, not a payment-due
// clock, so it gets its own coarser 0-30/31-45/45+ scheme instead of the
// AR Aging report's 5-bucket one above - a different question ("is this
// trouble getting old") deserves its own boundaries, not a reused set that
// happens to be built for something else.
export type TroubleAgingBucket = "0-30" | "31-45" | "45+";

export const TROUBLE_AGING_BUCKETS: { key: TroubleAgingBucket; label: string }[] = [
  { key: "0-30", label: "0-30" },
  { key: "31-45", label: "31-45" },
  { key: "45+", label: "45+" },
];

export function troubleAgingBucket(dueDate: string | null): TroubleAgingBucket {
  const days = daysSince(dueDate);
  if (days === null || days <= 30) return "0-30";
  if (days <= 45) return "31-45";
  return "45+";
}
