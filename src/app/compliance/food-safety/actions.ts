"use server";

import { revalidatePath } from "next/cache";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { todayISO, formatDate } from "@/lib/dates";
import { daysUntil } from "@/lib/foodSafety";
import { sendNotification } from "@/app/supreme/notifications/actions";
import type { FoodSafetyDocument, FoodSafetyReportType } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/compliance/food-safety");
  revalidatePath("/supreme/notifications");
}

export async function extractPdfText(formData: FormData): Promise<{ text: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof Blob)) return { error: "No file received." };
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: true });
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// Report types ------------------------------------------------------------------

export async function addReportType(name: string): Promise<FoodSafetyReportType> {
  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("food_safety_report_types")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow as { position: number } | null)?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("food_safety_report_types")
    .insert({ name: name.trim(), position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data as FoodSafetyReportType;
}

export async function updateReportType(id: string, patch: { name?: string; required?: boolean }) {
  const supabase = await createClient();
  const { error } = await supabase.from("food_safety_report_types").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteReportType(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("food_safety_report_types").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Documents -----------------------------------------------------------------------

// The file's bytes are already in Storage by the time this runs (uploaded
// straight from the browser, same reasoning as Marketing Assets - a
// Server Action's request body is capped at ~4.5MB on Vercel regardless of
// Next.js config). This only records the metadata.
export async function recordFoodSafetyDocument(input: {
  growerId: string;
  reportTypeId: string | null;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number;
  expirationDate: string | null;
  autoDetected: boolean;
}): Promise<FoodSafetyDocument> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("food_safety_documents")
    .insert({
      grower_id: input.growerId,
      report_type_id: input.reportTypeId,
      file_name: input.fileName,
      storage_path: input.storagePath,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      expiration_date: input.expirationDate,
      auto_detected: input.autoDetected,
      uploaded_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data as FoodSafetyDocument;
}

export async function updateFoodSafetyDocument(
  id: string,
  patch: { expiration_date?: string | null; notes?: string | null; report_type_id?: string | null },
) {
  const supabase = await createClient();
  // Editing the date by hand means whatever was auto-detected (if anything)
  // no longer applies - the badge should stop claiming it was auto-read.
  const fullPatch = "expiration_date" in patch ? { ...patch, auto_detected: false } : patch;
  const { error } = await supabase.from("food_safety_documents").update(fullPatch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteFoodSafetyDocument(id: string, storagePath: string) {
  const supabase = await createClient();
  await supabase.storage.from("food-safety-docs").remove([storagePath]);
  const { error } = await supabase.from("food_safety_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Alert recipients (managed from Supreme > Notifications) -----------------------

export async function getFoodSafetyAlertRecipientIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("food_safety_alert_recipients").select("user_id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.user_id as string);
}

export async function setFoodSafetyAlertRecipient(userId: string, enabled: boolean) {
  const supabase = await createClient();
  if (enabled) {
    const { error } = await supabase.from("food_safety_alert_recipients").upsert({ user_id: userId }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("food_safety_alert_recipients").delete().eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
  revalidateAll();
}

// Alerting --------------------------------------------------------------------------

// Checked on every Food Safety page load (same "check when someone opens
// the page" shape as the Logistics board's overdue-loads popup) rather than
// a real daily cron, which this app has no infrastructure for yet - good
// enough as long as someone opens the page occasionally as a date closes
// in. Each document remembers the tightest threshold it's already been
// alerted at (last_alert_threshold_sent) so re-visiting the page doesn't
// re-notify for the same crossing, only for a newly-crossed tighter one.
const ALERT_THRESHOLDS_DAYS = [30, 14, 7, 0];

export async function checkAndSendFoodSafetyAlerts() {
  const supabase = await createClient();
  const today = todayISO();

  const { data: docs, error: docsError } = await supabase
    .from("food_safety_documents")
    .select("id, grower_id, report_type_id, expiration_date, last_alert_threshold_sent")
    .not("expiration_date", "is", null);
  if (docsError || !docs || docs.length === 0) return;

  const recipientIds = await getFoodSafetyAlertRecipientIds();
  if (recipientIds.length === 0) return;

  const growerIds = [...new Set(docs.map((d) => d.grower_id as string))];
  const typeIds = [...new Set(docs.map((d) => d.report_type_id as string | null).filter((id): id is string => id !== null))];
  const [{ data: growers }, typesRes] = await Promise.all([
    supabase.from("mx_growers").select("id, name").in("id", growerIds),
    typeIds.length > 0
      ? supabase.from("food_safety_report_types").select("id, name").in("id", typeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const growerNameById = new Map((growers ?? []).map((g) => [g.id as string, g.name as string]));
  const typeNameById = new Map((typesRes.data ?? []).map((t) => [t.id as string, t.name as string]));

  for (const doc of docs) {
    const expirationDate = doc.expiration_date as string;
    const days = daysUntil(expirationDate, today);
    const satisfying = ALERT_THRESHOLDS_DAYS.filter((t) => days <= t);
    if (satisfying.length === 0) continue;
    const crossedThreshold = Math.min(...satisfying);

    const already = doc.last_alert_threshold_sent as number | null;
    if (already !== null && already <= crossedThreshold) continue;

    const growerName = growerNameById.get(doc.grower_id as string) ?? "Unknown grower";
    const typeName = doc.report_type_id ? (typeNameById.get(doc.report_type_id as string) ?? "Document") : "Document";
    const message =
      days < 0
        ? `${typeName} for ${growerName} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago (${formatDate(expirationDate)}).`
        : `${typeName} for ${growerName} expires in ${days} day${days === 1 ? "" : "s"} (${formatDate(expirationDate)}).`;

    for (const userId of recipientIds) {
      await sendNotification({
        tabLabel: "Compliance",
        subtabLabel: "Food Safety",
        pagePath: "/compliance/food-safety",
        message,
        updatedBy: null,
        lastEditedAt: expirationDate,
        targetType: "user",
        targetUserId: userId,
        targetRole: null,
      }).catch(() => {});
    }

    await supabase.from("food_safety_documents").update({ last_alert_threshold_sent: crossedThreshold }).eq("id", doc.id);
  }
}
