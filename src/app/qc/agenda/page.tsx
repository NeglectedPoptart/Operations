import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { QcAgendaFloorAging, QcAgendaInbound, QcAgendaMeta, QcAgendaRepack } from "@/lib/types";
import QcAgendaClient from "./QcAgendaClient";

export const dynamic = "force-dynamic";

export default async function QcAgendaPage() {
  const supabase = await createClient();
  const today = todayISO();

  const [
    { data: meta, error: metaError },
    { data: inbounds, error: inboundsError },
    { data: floorAging, error: floorAgingError },
    { data: repack, error: repackError },
  ] = await Promise.all([
    supabase.from("qc_agenda_meta").select("*").eq("entry_date", today).maybeSingle(),
    supabase.from("qc_agenda_inbounds").select("*").eq("entry_date", today).order("position", { ascending: true }),
    supabase.from("qc_agenda_floor_aging").select("*").eq("entry_date", today).order("position", { ascending: true }),
    supabase.from("qc_agenda_repack").select("*").eq("entry_date", today).order("position", { ascending: true }),
  ]);

  if (metaError || inboundsError || floorAgingError || repackError) {
    return (
      <p className="text-red-600">
        Failed to load QC Agenda: {metaError?.message ?? inboundsError?.message ?? floorAgingError?.message ?? repackError?.message}
      </p>
    );
  }

  return (
    <QcAgendaClient
      initialDate={today}
      initialMeta={meta as QcAgendaMeta | null}
      initialInbounds={(inbounds ?? []) as QcAgendaInbound[]}
      initialFloorAging={(floorAging ?? []) as QcAgendaFloorAging[]}
      initialRepack={(repack ?? []) as QcAgendaRepack[]}
    />
  );
}
