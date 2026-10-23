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

export interface LoadCharge {
  id: string;
  load_id: string;
  kind: string;
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}
