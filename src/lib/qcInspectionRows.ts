import type { SupabaseClient } from "@supabase/supabase-js";
import type { QcInspection } from "@/lib/types";

// Every QC Inspection History row, oldest first. A single request stops at 1,000 rows and the
// sheet is read oldest first, so once the log passed 1,000 lines the NEWEST inspections were the
// ones left off the page - read in pages so none are.
export async function loadAllQcInspections(supabase: SupabaseClient): Promise<{ data: QcInspection[]; error: string | null }> {
  const rows: QcInspection[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("qc_inspections")
      .select("*")
      .order("entry_date", { ascending: true })
      .order("position", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) return { data: rows, error: error.message };
    rows.push(...((data ?? []) as QcInspection[]));
    if (!data || data.length < 1000) break;
  }
  return { data: rows, error: null };
}
