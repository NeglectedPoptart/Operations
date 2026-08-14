import type { createClient } from "./supabase/server";
import type { FobItem } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// FOB Pharr's fob_items is date-scoped (one full set of rows per calendar
// day, like qc_agenda_inbounds) so every prior day's pricing stays around
// to look back on, but the catalog structure (which commodities exist,
// their unit_per/size) shouldn't need re-entry every morning - only the
// fob price should. This lazily creates `today`'s rows the first time
// anyone opens FOB Pharr or a Delivered pricing page that day, copying the
// most recent prior day's structure forward with fob cleared to null.
// Called from every page that reads fob_items (FOB Pharr + the 3 Delivered
// pricing pages), since any of them could be the first page opened on a
// new day.
export async function ensureTodayFobItems(supabase: SupabaseServerClient, today: string): Promise<FobItem[]> {
  const { data: existing, error } = await supabase
    .from("fob_items")
    .select("*")
    .eq("entry_date", today)
    .order("section", { ascending: true })
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  if (existing && existing.length > 0) return existing as FobItem[];

  const { data: priorDateRow, error: priorDateError } = await supabase
    .from("fob_items")
    .select("entry_date")
    .lt("entry_date", today)
    .order("entry_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priorDateError) throw new Error(priorDateError.message);
  if (!priorDateRow) return []; // no history at all yet (shouldn't happen after the initial seed)

  const { data: priorItems, error: priorItemsError } = await supabase
    .from("fob_items")
    .select("*")
    .eq("entry_date", priorDateRow.entry_date);
  if (priorItemsError) throw new Error(priorItemsError.message);

  const newRows = (priorItems ?? []).map((item) => ({
    entry_date: today,
    section: item.section,
    commodity_group: item.commodity_group,
    variety: item.variety,
    unit_per: item.unit_per,
    size: item.size,
    fob: null,
    position: item.position,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("fob_items")
    .insert(newRows)
    .select()
    .order("section", { ascending: true })
    .order("position", { ascending: true });
  if (insertError) throw new Error(insertError.message);
  return (inserted ?? []) as FobItem[];
}
