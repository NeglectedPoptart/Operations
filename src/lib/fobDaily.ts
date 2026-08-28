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

  // variety/size are coalesced to "" (never null) specifically so the
  // fob_items_unique_row index below - a plain column-list unique index,
  // since Postgres treats every NULL as distinct and would let a null
  // column duplicate itself right past it - can actually catch a repeat of
  // this call.
  const newRows = (priorItems ?? []).map((item) => ({
    entry_date: today,
    section: item.section,
    commodity_group: item.commodity_group,
    variety: item.variety ?? "",
    unit_per: item.unit_per,
    size: item.size ?? "",
    fob: null,
    position: item.position,
  }));

  // Two pages can both hit this function for the same brand-new day at
  // once (FOB Pharr and a Delivered lane, say) and both see zero existing
  // rows before either has inserted - upsert+ignoreDuplicates makes the
  // loser of that race a no-op instead of a second full copy of the
  // catalog (see fob_items_unique_row migration).
  const { error: insertError } = await supabase
    .from("fob_items")
    .upsert(newRows, {
      onConflict: "entry_date,section,commodity_group,variety,size",
      ignoreDuplicates: true,
    });
  if (insertError) throw new Error(insertError.message);

  const { data: inserted, error: reselectError } = await supabase
    .from("fob_items")
    .select("*")
    .eq("entry_date", today)
    .order("section", { ascending: true })
    .order("position", { ascending: true });
  if (reselectError) throw new Error(reselectError.message);
  return (inserted ?? []) as FobItem[];
}
