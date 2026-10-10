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

// Several inspections' reports (a PO with more than one commodity): each report
// on its own, and all of them joined into one PDF, in the order given.
export async function buildReportsForInspections(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  ids: string[],
): Promise<{ reports: { inspection: QcLotInspection; pdf: Uint8Array; fileName: string }[]; merged: Uint8Array; mergedName: string } | null> {
  const reports: { inspection: QcLotInspection; pdf: Uint8Array; fileName: string }[] = [];
  for (const id of ids) {
    const report = await buildReportForInspection(supabase, id);
    if (report) reports.push(report);
  }
  if (reports.length === 0) return null;

  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  for (const r of reports) {
    const doc = await PDFDocument.load(r.pdf);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  const first = reports[0].inspection;
  const day = new Date(first.inspection_time).toISOString().slice(0, 10);
  const mergedName = `Inspection Reports - ${first.lot_number ?? first.plan_name} - ${reports.length} commodities - ${day}.pdf`.replace(/[\/:*?"<>|]+/g, "-");
  return { reports, merged: await out.save(), mergedName };
}
