import type { SupabaseClient } from "@supabase/supabase-js";
import { buildInspectionPdf } from "./qcReportPdf";
import type { QcLotInspection, QcLotPhoto } from "./qcPlans";

// Loads an inspection with its photos and builds its report PDF. Shared by the
// view/download route and the email action so both always produce the same file.
export async function buildReportForInspection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  id: string,
): Promise<{ inspection: QcLotInspection; pdf: Uint8Array; fileName: string } | null> {
  const { data: inspection } = await supabase.from("qc_lot_inspections").select("*").eq("id", id).maybeSingle();
  if (!inspection) return null;
  const { data: photoRows } = await supabase
    .from("qc_lot_photos")
    .select("*")
    .eq("inspection_id", id)
    .order("position", { ascending: true });

  const photos: { bytes: Uint8Array }[] = [];
  for (const row of (photoRows ?? []) as QcLotPhoto[]) {
    const { data, error } = await supabase.storage.from("qc-photos").download(row.storage_path);
    if (error || !data) continue;
    photos.push({ bytes: new Uint8Array(await data.arrayBuffer()) });
  }

  const typed = inspection as QcLotInspection;
  const pdf = await buildInspectionPdf(typed, photos);
  const day = new Date(typed.inspection_time).toISOString().slice(0, 10);
  const fileName = `Inspection - ${typed.plan_name}${typed.lot_number ? ` - ${typed.lot_number}` : ""} - ${day}.pdf`.replace(/[\\/:*?"<>|]+/g, "-");
  return { inspection: typed, pdf, fileName };
}
