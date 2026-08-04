import { isoDateOf, todayISO } from "./dates";
import type { createClient } from "./supabase/server";

export interface DailyReminderCheck {
  oldAgeUpdatedToday: boolean;
  qcAgendaUpdatedToday: boolean;
  coldInventoryTotalCount: number;
  coldInventoryNotGreenCount: number;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Feeds the Warehouse/QC daily reminder modal shown from the root layout.
// Each check uses whatever signal that feature's own schema actually
// supports reliably, rather than one uniform rule:
//  - Old Age is wholesale delete-then-reinsert on every paste (and manual
//    edits bump updated_at too), so the single latest updated_at tells you
//    everything: any edit today means the whole table was touched today.
//  - QC Agenda's four tables all carry a real entry_date - a much more
//    meaningful "was today's agenda touched" signal than updated_at, since
//    none of those tables have an update-trigger keeping it fresh.
//  - Cold Inventory is a persistent list merged across days (unlike the
//    other two), so "checked" is deliberately read as current state, not
//    "changed today" - an unresolved issue from days ago still matters.
export async function getDailyReminderCheck(supabase: SupabaseServerClient): Promise<DailyReminderCheck> {
  const today = todayISO();

  const [oldAgeRes, qcMetaRes, qcInboundsRes, qcFloorRes, qcRepackRes, coldInvRes] = await Promise.all([
    supabase.from("old_age_items").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("qc_agenda_meta").select("id", { count: "exact", head: true }).eq("entry_date", today),
    supabase.from("qc_agenda_inbounds").select("id", { count: "exact", head: true }).eq("entry_date", today),
    supabase.from("qc_agenda_floor_aging").select("id", { count: "exact", head: true }).eq("entry_date", today),
    supabase.from("qc_agenda_repack").select("id", { count: "exact", head: true }).eq("entry_date", today),
    supabase.from("cold_inventory_items").select("status"),
  ]);

  const latestOldAgeUpdate = (oldAgeRes.data as { updated_at: string } | null)?.updated_at ?? null;
  const oldAgeUpdatedToday = latestOldAgeUpdate !== null && isoDateOf(latestOldAgeUpdate) === today;

  const qcAgendaUpdatedToday =
    (qcMetaRes.count ?? 0) > 0 ||
    (qcInboundsRes.count ?? 0) > 0 ||
    (qcFloorRes.count ?? 0) > 0 ||
    (qcRepackRes.count ?? 0) > 0;

  const coldItems = (coldInvRes.data ?? []) as { status: string | null }[];
  const coldInventoryTotalCount = coldItems.length;
  const coldInventoryNotGreenCount = coldItems.filter((i) => i.status !== "good").length;

  return { oldAgeUpdatedToday, qcAgendaUpdatedToday, coldInventoryTotalCount, coldInventoryNotGreenCount };
}
