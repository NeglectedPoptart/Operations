// Extra freight charges on a load (see migration 155). The kinds are just labels -
// pick the closest one, or Other with a note.
export const CHARGE_KINDS = [
  "Detention",
  "Layover",
  "Lumper",
  "TONU (truck ordered not used)",
  "Extra stop",
  "Reconsignment / redelivery",
  "Late fee",
  "Fuel / reefer",
  "Credit / deduction",
  "Other",
] as const;

// Who should bear a charge (migration 164).
export type ChargePayer = "harvest_best" | "warehouse" | "carrier" | "customer" | "other";

export const CHARGE_PAYERS: { value: ChargePayer; label: string; short: string; hint: string; tone: string }[] = [
  { value: "harvest_best", label: "Harvest Best", short: "Us", hint: "We absorb it - expected, or our own mistake", tone: "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100" },
  { value: "warehouse", label: "Warehouse", short: "Warehouse", hint: "The warehouse made the error", tone: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100" },
  { value: "carrier", label: "Carrier", short: "Carrier", hint: "Deduct it from the carrier - their error", tone: "border-red-500 bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-100" },
  { value: "customer", label: "Customer", short: "Customer", hint: "The customer / receiver should pay", tone: "border-purple-500 bg-purple-50 text-purple-900 dark:bg-purple-900/30 dark:text-purple-100" },
  { value: "other", label: "Other", short: "Other", hint: "Someone else - say who in the details", tone: "border-gray-500 bg-gray-100 text-gray-900 dark:bg-gray-700/40 dark:text-gray-100" },
];

export const payerLabel = (p: string | null | undefined) => CHARGE_PAYERS.find((x) => x.value === p)?.label ?? "Not assigned";
export const payerTone = (p: string | null | undefined) => CHARGE_PAYERS.find((x) => x.value === p)?.tone ?? "border-black/30 bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70";

// Why Harvest Best is bearing it.
export const CHARGE_CAUSES: { value: "expected" | "our_error"; label: string }[] = [
  { value: "expected", label: "Expected cost" },
  { value: "our_error", label: "Our error" },
];

// Getting the money back from whoever should pay (not used when Harvest Best absorbs it).
export type RecoveryStatus = "open" | "billed" | "recovered" | "written_off";

export const RECOVERY_STATUSES: { value: RecoveryStatus; label: string }[] = [
  { value: "open", label: "To recover" },
  { value: "billed", label: "Billed / deducted - waiting" },
  { value: "recovered", label: "Recovered" },
  { value: "written_off", label: "Written off" },
];

export const recoveryLabel = (s: string) => RECOVERY_STATUSES.find((x) => x.value === s)?.label ?? s;

// A charge nobody has to pay back (we absorb it) has nothing to recover.
export const needsRecovery = (payer: string | null | undefined) => payer !== null && payer !== undefined && payer !== "harvest_best";

export interface LoadCharge {
  id: string;
  load_id: string;
  kind: string;
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  // Migration 164 - absent / null on charges added before it.
  payer?: ChargePayer | null;
  payer_name?: string | null;
  cause?: "expected" | "our_error" | null;
  recovery_status?: RecoveryStatus;
  recovered_amount?: number | null;
  recovered_at?: string | null;
  reference?: string | null;
  details?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
}

// "Warehouse - Pharr" / "Harvest Best - our error" / "Carrier - ABC Trucking".
export function payerSummary(c: Pick<LoadCharge, "payer" | "payer_name" | "cause">, carrierName?: string | null): string {
  if (!c.payer) return "Not assigned";
  const base = payerLabel(c.payer);
  if (c.payer === "harvest_best") return c.cause ? `${base} - ${c.cause === "our_error" ? "our error" : "expected"}` : base;
  if (c.payer === "carrier") return `${base}${carrierName ? ` - ${carrierName}` : ""}`;
  return c.payer_name ? `${base} - ${c.payer_name}` : base;
}
