import { OLD_AGE_NEXT_STEPS, type OldAgeItem, type OldAgeNextStep } from "@/lib/types";

export interface BarDatum {
  label: string;
  value: number;
}

// "Bell Pepper - Orange" / "Bell Pepper - Yellow" -> "Bell Pepper", so
// varieties of the same commodity roll up together.
export function commodityOf(description: string | null): string {
  if (!description) return "(unknown)";
  const [commodity] = description.split(" - ");
  return commodity.trim() || "(unknown)";
}

export function summarizeByNextStep(items: { next_step: OldAgeNextStep | null }[]): BarDatum[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.next_step ?? "not_set";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const labels = [...OLD_AGE_NEXT_STEPS, { value: "not_set", label: "Not Set" }];
  return labels
    .map((s) => ({ label: s.label, value: counts.get(s.value) ?? 0 }))
    .filter((d) => d.value > 0);
}

export function summarizeByCommodity(items: OldAgeItem[]): BarDatum[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = commodityOf(item.description);
    totals.set(key, (totals.get(key) ?? 0) + (item.qty ?? 0));
  }

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
