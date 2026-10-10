"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { graphConfigured, sendEmail } from "@/lib/agents/graph";
import { buildReportForInspection, buildReportsForInspections } from "@/lib/qcReportData";
import { groupReportSubject, reportSubject } from "@/lib/qcEmailSubject";
import { buildWhatsappText } from "@/lib/qcWhatsapp";
import { defectTotals, percentText, type QcLotInspection, type QcLotPhoto } from "@/lib/qcPlans";

export interface InspectionDetail {
  planName: string;
  inspectorName: string | null;
  result: string | null;
  sampleSize: number | null;
  serious: string;
  nonSerious: string;
  total: string;
  notes1: string | null;
  notes2: string | null;
  photos: { id: string; url: string }[];
}

// What the history row's drop-down shows: a short summary and the photos.
export async function getInspectionDetail(id: string): Promise<InspectionDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("qc_lot_inspections").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const inspection = data as QcLotInspection;

  const { data: photoRows } = await supabase
    .from("qc_lot_photos")
    .select("*")
    .eq("inspection_id", id)
    .order("position", { ascending: true });
  const photos: InspectionDetail["photos"] = [];
  for (const row of (photoRows ?? []) as QcLotPhoto[]) {
    const { data: signed } = await supabase.storage.from("qc-photos").createSignedUrl(row.storage_path, 3600);
    if (signed?.signedUrl) photos.push({ id: row.id, url: signed.signedUrl });
  }

  const totals = defectTotals(inspection.defects);
  const size = inspection.sample_size;
  const line = (n: number) => (size ? `${n} (${percentText(n, size)})` : String(n));
  return {
    planName: inspection.plan_name,
    inspectorName: inspection.inspector_name,
    result: inspection.result,
    sampleSize: size,
    serious: line(totals.serious),
    nonSerious: line(totals.nonSerious),
    total: line(totals.total),
    notes1: inspection.notes_1,
    notes2: inspection.notes_2,
    photos,
  };
}

function parseRecipients(text: string): string[] {
  return text
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

// Emails the report (PDF attached) from the shared HOP@ mailbox - the same
// Outlook connection the HOPS Agents use.
export async function emailInspectionReport(
  id: string,
  toText: string,
  message: string,
): Promise<{ ok: true; sentTo: string[] } | { error: string }> {
  const to = parseRecipients(toText);
  if (to.length === 0) return { error: "Enter at least one email address." };
  if (!graphConfigured()) return { error: "Outlook isn't set up for HOPS yet (see SubManagement > Agents)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  const report = await buildReportForInspection(supabase, id);
  if (!report) return { error: "That inspection wasn't found." };
  const { inspection } = report;

  const day = new Date(inspection.inspection_time).toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  const body = [
    message.trim() || "Please find the quality inspection report attached.",
    "",
    `${inspection.plan_name}${inspection.lot_number ? ` - ${inspection.lot_number}` : ""}`,
    `Inspected ${day}${inspection.inspector_name ? ` by ${inspection.inspector_name}` : ""}${inspection.result ? ` - result: ${inspection.result}` : ""}`,
    "",
    "Harvest Best Quality Control",
  ].join("\n");

  try {
    await sendEmail({
      to,
      subject: reportSubject(inspection),
      body,
      // Replies go to the person who sent it, not the unattended HOP@ mailbox.
      replyTo: user.email ? [user.email] : undefined,
      attachments: [{ name: report.fileName, contentType: "application/pdf", data: report.pdf }],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send the email." };
  }

  // The history sheet's "mail" box: report has been emailed.
  await supabase.from("qc_inspections").update({ mail: true }).eq("lot_inspection_id", id);
  revalidatePath("/qc/inspections");
  return { ok: true, sentTo: to };
}

export interface WhatsappShareData {
  text: string;
  // Each photo: a same-origin address (always works) and a direct signed
  // address (much faster - tried first).
  photos: { id: string; url: string; signedUrl: string | null }[];
}

// The WhatsApp message for an inspection (in the team's usual format) and where
// to fetch its photos from.
export async function getWhatsappShare(id: string): Promise<WhatsappShareData | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("qc_lot_inspections").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: photoRows } = await supabase
    .from("qc_lot_photos")
    .select("id, storage_path")
    .eq("inspection_id", id)
    .order("position", { ascending: true });
  const rows = (photoRows ?? []) as { id: string; storage_path: string }[];
  const { data: signed } = rows.length > 0 ? await supabase.storage.from("qc-photos").createSignedUrls(rows.map((r) => r.storage_path), 3600) : { data: [] };
  const signedByPath = new Map((signed ?? []).map((s) => [s.path as string, (s.signedUrl as string | null) ?? null]));
  return {
    text: buildWhatsappText(data as QcLotInspection),
    photos: rows.map((p) => ({ id: p.id, url: `/qc/inspections/${id}/photo/${p.id}`, signedUrl: signedByPath.get(p.storage_path) ?? null })),
  };
}

// Adds photos (already uploaded to the qc-photos bucket by the browser) to a saved inspection.
export async function addInspectionPhotos(id: string, paths: string[]): Promise<{ error: string } | { ok: true }> {
  if (paths.length === 0) return { ok: true };
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("qc_lot_photos")
    .select("position")
    .eq("inspection_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = ((last?.position as number | undefined) ?? -1) + 1;
  const { error } = await supabase
    .from("qc_lot_photos")
    .insert(paths.map((storage_path, i) => ({ inspection_id: id, storage_path, position: start + i })));
  if (error) return { error: error.message };
  revalidatePath("/qc/inspections");
  return { ok: true };
}

// Takes one photo off an inspection (and out of storage).
export async function removeInspectionPhoto(id: string, photoId: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("qc_lot_photos").select("storage_path").eq("id", photoId).eq("inspection_id", id).maybeSingle();
  if (!row) return { ok: true };
  const { error } = await supabase.from("qc_lot_photos").delete().eq("id", photoId);
  if (error) return { error: error.message };
  await supabase.storage.from("qc-photos").remove([row.storage_path as string]);
  revalidatePath("/qc/inspections");
  return { ok: true };
}

// One email with every report of a PO / lot attached (a separate PDF per
// commodity), from the shared HOP@ mailbox.
export async function emailGroupReports(
  ids: string[],
  toText: string,
  message: string,
): Promise<{ ok: true; sentTo: string[] } | { error: string }> {
  const to = parseRecipients(toText);
  if (to.length === 0) return { error: "Enter at least one email address." };
  if (ids.length === 0) return { error: "There are no reports to send." };
  if (!graphConfigured()) return { error: "Outlook isn't set up for HOPS yet (see SubManagement > Agents)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  const built = await buildReportsForInspections(supabase, ids);
  if (!built) return { error: "Those inspections weren't found." };
  const { reports } = built;

  const day = new Date(reports[0].inspection.inspection_time).toLocaleDateString("en-US", { timeZone: "America/Chicago" });
  const inspectors = [...new Set(reports.map((r) => r.inspection.inspector_name).filter(Boolean))];
  const body = [
    message.trim() || `Please find the quality inspection reports attached (${reports.length} commodities).`,
    "",
    ...reports.map((r) => `- ${r.inspection.commodity}${r.inspection.product_label ? ` ${r.inspection.product_label}` : ""}${r.inspection.result ? ` - ${r.inspection.result}` : ""}`),
    "",
    `Inspected ${day}${inspectors.length > 0 ? ` by ${inspectors.join(", ")}` : ""}`,
    "",
    "Harvest Best Quality Control",
  ].join("\n");

  try {
    await sendEmail({
      to,
      subject: groupReportSubject(reports.map((r) => r.inspection)),
      body,
      replyTo: user.email ? [user.email] : undefined,
      attachments: reports.map((r) => ({ name: r.fileName, contentType: "application/pdf", data: r.pdf })),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send the email." };
  }

  await supabase.from("qc_inspections").update({ mail: true }).in("lot_inspection_id", ids);
  revalidatePath("/qc/inspections");
  return { ok: true, sentTo: to };
}
