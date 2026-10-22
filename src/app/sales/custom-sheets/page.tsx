import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import { ensureTodayFobItems } from "@/lib/fobDaily";
import type { SavedSheet } from "@/lib/customSheets";
import CustomSheetsClient from "./CustomSheetsClient";

export const dynamic = "force-dynamic";

export default async function CustomSheetsPage() {
  const supabase = await createClient();
  const today = todayISO();
  const items = await ensureTodayFobItems(supabase, today);

  // Saved sheets come from migration 154 - without it the builder still works, it just can't save.
  const { data: saved, error: savedError } = await supabase
    .from("custom_price_sheets")
    .select("id, name, title, summary, footer, selection, destinations, updated_at")
    .order("name", { ascending: true });

  return <CustomSheetsClient today={today} items={items} initialSheets={(saved ?? []) as SavedSheet[]} savingReady={!savedError} />;
}
