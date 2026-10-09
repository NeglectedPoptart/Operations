"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isoDateOf } from "@/lib/dates";
import { splitPoLot } from "@/lib/qcLot";
import {
  initialsFor,
  productText,
  type DefectCount,
  type PlanConfig,
  type QcPlan,
} from "@/lib/qcPlans";

export interface SubmitInspectionInput {
  planId: string;
  inspectionTime: string; // ISO
  header: Record<string, string>;
  sampleSize: number | null;
  defectCounts: Record<string, number>;
  samples: Record<string, string | number | null>[];
  notes1: string;
  notes2: string;
  result: string;
  // Why the result is what it is, e.g. "mixed weights and low packed ice" - the
  // "CAUTION DUE TO ..." in the WhatsApp message. Kept with the header values.
  reason?: string;
  // Photos the browser already uploaded to the qc-photos bucket, in order.
  photoPaths: string[];
}

export async function submitInspection(input: SubmitInspectionInput): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: plan, error: planError } = await supabase.from("qc_plans").select("*").eq("id", input.planId).single();
  if (planError || !plan) throw new Error("That inspection plan wasn't found - reload and try again.");
  const config = (plan as QcPlan).config as PlanConfig;

  // Required header fields.
  for (const f of config.headerFields) {
    if (f.required && !(input.header[f.key] ?? "").trim()) throw new Error(`${f.label} is required.`);
  }

  // Who did it: their employee record's name when their login is linked to one,
  // otherwise the login's email name.
  const { data: employee } = await supabase.from("employees").select("name").eq("linked_user_id", user.id).maybeSingle();
  const inspectorName = (employee?.name as string | undefined) ?? (user.email ?? "").split("@")[0];
  const initials = initialsFor(employee?.name ?? null, user.email ?? null);

  const header: Record<string, string> = {};
  for (const f of config.headerFields) header[f.key] = (input.header[f.key] ?? "").trim();
  if (input.reason?.trim()) header.reason = input.reason.trim();

  const defects: DefectCount[] = config.defects.map((d) => ({
    key: d.key,
    name: d.name,
    severity: d.severity,
    count: Math.max(0, Math.round(Number(input.defectCounts[d.key]) || 0)),
  }));

  const samples = input.samples.slice(0, config.sampleCount).map((s) => {
    const clean: Record<string, string | number | null> = {};
    for (const f of config.sampleFields) {
      const raw = s[f.key];
      if (raw === null || raw === undefined || raw === "") clean[f.key] = null;
      else if (f.type === "number") clean[f.key] = Number.isFinite(Number(raw)) ? Number(raw) : null;
      else clean[f.key] = String(raw);
    }
    return clean;
  });

  const inspectionTime = new Date(input.inspectionTime);
  if (Number.isNaN(inspectionTime.getTime())) throw new Error("Enter a valid inspection time.");

  const result = input.result.trim();
  const lotNumber = header.lot_number ?? "";
  const productLabel = header.product_label ?? header.product_pack_style ?? "";

  const { data: inserted, error } = await supabase
    .from("qc_lot_inspections")
    .insert({
      plan_id: plan.id,
      plan_snapshot: { name: plan.name, commodity: plan.commodity, control_point: plan.control_point, config },
      plan_name: plan.name,
      commodity: plan.commodity,
      control_point: plan.control_point,
      inspector_id: user.id,
      inspector_name: inspectorName,
      inspector_initials: initials,
      inspection_time: inspectionTime.toISOString(),
      sample_time: inspectionTime.toISOString(),
      grower: header.grower || null,
      facility: header.facility || null,
      product_label: productLabel || null,
      lot_number: lotNumber || null,
      header,
      sample_size: input.sampleSize && input.sampleSize > 0 ? Math.round(input.sampleSize) : null,
      defects,
      samples,
      notes_1: input.notes1.trim() || null,
      notes_2: input.notes2.trim() || null,
      result: result || null,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "Couldn't save the inspection.");

  if (input.photoPaths.length > 0) {
    const { error: photoError } = await supabase
      .from("qc_lot_photos")
      .insert(input.photoPaths.map((storage_path, position) => ({ inspection_id: inserted.id, storage_path, position })));
    if (photoError) throw new Error(`Inspection saved, but its photos couldn't be linked: ${photoError.message}`);
  }

  // The history sheet row, so it shows up in the log (and in the initials totals).
  const { data: last } = await supabase.from("qc_inspections").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const { po, lot } = splitPoLot(lotNumber);
  const { error: logError } = await supabase.from("qc_inspections").insert({
    position: ((last?.position as number | undefined) ?? 0) + 1,
    entry_date: isoDateOf(inspectionTime.toISOString()),
    po,
    lot,
    product: productText(plan.commodity as string, productLabel),
    qc: initials,
    report: true,
    result: result || null,
    notes: (input.notes2.trim() || input.notes1.trim()) || null,
    lot_inspection_id: inserted.id,
  });
  if (logError) throw new Error(`Inspection saved, but it couldn't be added to the history: ${logError.message}`);

  revalidatePath("/qc/inspections");
  return { id: inserted.id as string };
}

// Adds a missing entry to a pick-list on the New Inspection form (shared by
// every plan). If the same entry already exists (any capitalization), that one
// is returned instead of adding a duplicate.
export async function addFieldOption(fieldKey: string, value: string): Promise<{ value: string } | { error: string }> {
  const supabase = await createClient();
  const text = value.trim().replace(/\s+/g, " ");
  if (!fieldKey || !text) return { error: "Type the entry to add." };
  const { data: existing } = await supabase.from("qc_field_options").select("value").eq("field_key", fieldKey);
  const same = (existing ?? []).find((o) => (o.value as string).toLowerCase() === text.toLowerCase());
  if (same) return { value: same.value as string };
  const { error } = await supabase.from("qc_field_options").insert({ field_key: fieldKey, value: text });
  if (error) return { error: error.message };
  return { value: text };
}
