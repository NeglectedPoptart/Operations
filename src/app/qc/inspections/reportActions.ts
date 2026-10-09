"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { graphConfigured, sendEmail } from "@/lib/agents/graph";
import { buildReportForInspection } from "@/lib/qcReportData";
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
      subject: `Inspection Report - ${inspection.plan_name}${inspection.lot_number ? ` - ${inspection.lot_number}` : ""} (${day})`,
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
  // Same-origin addresses of the photos, in order.
  photos: { id: string; url: string }[];
}

// The WhatsApp message for an inspection (in the team's usual format) and where
// to fetch its photos from.
export async function getWhatsappShare(id: string): Promise<WhatsappShareData | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("qc_lot_inspections").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: photoRows } = await supabase
    .from("qc_lot_photos")
    .select("id")
    .eq("inspection_id", id)
    .order("position", { ascending: true });
  return {
    text: buildWhatsappText(data as QcLotInspection),
    photos: (photoRows ?? []).map((p) => ({ id: p.id as string, url: `/qc/inspections/${id}/photo/${p.id}` })),
  };
}
