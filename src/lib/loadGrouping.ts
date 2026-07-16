import type { Load } from "@/lib/types";

// Groups loads into per-loading-date buckets, in the order dates are first
// encountered. Loads with no loading date set yet land in a trailing
// { date: null } bucket. Callers should pass loads already ordered by
// loading_date ascending (nulls last) so each bucket's loads stay in order too.
export function groupByLoadingDate(loads: Load[]): { date: string | null; loads: Load[] }[] {
  const groups: { date: string | null; loads: Load[] }[] = [];
  const byDate = new Map<string | null, Load[]>();
  for (const load of loads) {
    const key = load.loading_date;
    let bucket = byDate.get(key);
    if (!bucket) {
      bucket = [];
      byDate.set(key, bucket);
      groups.push({ date: key, loads: bucket });
    }
    bucket.push(load);
  }
  return groups;
}
