"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isoDateOf } from "@/lib/dates";
import { extractLotpathRows } from "@/lib/lotpathExtract";
import { centralToIso, configFromParsed, extendConfig, mapToPlan } from "@/lib/lotpathImport";
import { norm, normalizeResult, parseLotpathRows, type ParsedLotpath } from "@/lib/lotpathParse";
import { splitPoLot } from "@/lib/qcLot";
import { canEditQcPlans } from "@/lib/roles";
import { defectTotals, initialsFor, percentText, productText, type PlanConfig, type QcPlan } from "@/lib/qcPlans";

// Bulk-importing LotPath PDFs creates and extends plans, so it's limited to the
// same people who can edit plans (Quality Control Manager, Supreme). The
// browser uploads each PDF straight to storage (they're 1-5 MB with photos, more
// than a server action will take) and these actions read it from there.

const TEMP_FOLDER = "import-temp/";

async function managerContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!canEditQcPlans((profile?.role as string | null) ?? null, user.email ?? null)) {
    throw new Error("Only the Quality Control Manager can import inspections.");
  }
  return { supabase, user };
}

async function readParsed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
): Promise<ParsedLotpath | { error: string }> {
  if (!path.startsWith(TEMP_FOLDER)) return { error: "Unexpected file location." };
  const { data, error } = await supabase.storage.from("qc-photos").download(path);
  if (error || !data) return { error: `Couldn't read the uploaded file: ${error?.message ?? "not found"}` };
  try {
    const rows = await extractLotpathRows(new Uint8Array(await data.arrayBuffer()));
    return parseLotpathRows(rows);
  } catch (e) {
    return { error: `Couldn't read that PDF (${e instanceof Error ? e.message : String(e)}).` };
  }
}

async function findPlan(supabase: Awaited<ReturnType<typeof createClient>>, name: string): Promise<QcPlan | null> {
  const { data } = await supabase.from("qc_plans").select("*");
  return ((data ?? []) as QcPlan[]).find((p) => norm(p.name) === norm(name)) ?? null;
}

export interface LotpathPreview {
  ok: true;
  planName: string;
  planExists: boolean;
  planAdds: string[];
  lot: string;
  inspectedAt: string | null;
  inspector: string;
  result: string;
  sampleSize: number | null;
  totalDefects: number;
  totalPercent: string;
  samples: number;
  duplicate: boolean;
  warnings: string[];
}

async function isDuplicate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planName: string,
  iso: string | null,
  lot: string | null,
): Promise<boolean> {
  if (!iso) return false;
  let query = supabase.from("qc_lot_inspections").select("id").eq("plan_name", planName).eq("inspection_time", iso).limit(1);
  query = lot ? query.eq("lot_number", lot) : query.is("lot_number", null);
  const { data } = await query;
  return (data ?? []).length > 0;
}

// Reads one uploaded PDF and says what importing it would do - writes nothing.
export async function previewLotpath(path: string): Promise<LotpathPreview | { ok: false; error: string }> {
  const { supabase } = await managerContext();
  const parsed = await readParsed(supabase, path);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const plan = await findPlan(supabase, parsed.planName);
  const { config, added } = plan ? extendConfig(plan.config, parsed) : { config: configFromParsed(parsed), added: [] as string[] };
  const mapped = mapToPlan(config, parsed);
  const iso = centralToIso(parsed.inspection);
  const totals = defectTotals(mapped.defects);

  return {
    ok: true,
    planName: plan?.name ?? parsed.planName,
    planExists: !!plan,
    planAdds: added,
    lot: mapped.lot_number ?? "",
    inspectedAt: iso,
    inspector: parsed.inspectedBy,
    result: normalizeResult(parsed.result),
    sampleSize: parsed.sampleSize,
    totalDefects: totals.total,
    totalPercent: percentText(totals.total, parsed.sampleSize),
    samples: parsed.samples.length,
    duplicate: await isDuplicate(supabase, plan?.name ?? parsed.planName, iso, mapped.lot_number),
    warnings: parsed.warnings,
  };
}

export type LotpathImportResult =
  | { status: "imported"; planCreated: boolean }
  | { status: "duplicate" }
  | { status: "error"; error: string };

// Imports one uploaded PDF: finds (or builds) its plan, saves the inspection
// with no photos, and logs it on the Inspection History sheet.
export async function importLotpath(path: string): Promise<LotpathImportResult> {
  try {
    const { supabase } = await managerContext();
    const parsed = await readParsed(supabase, path);
    if ("error" in parsed) return { status: "error", error: parsed.error };

    const iso = centralToIso(parsed.inspection);
    if (!iso) return { status: "error", error: "Couldn't read the inspection time." };

    // ---- the plan: reuse it (growing it if the report has something new) or build it from the report
    let plan = await findPlan(supabase, parsed.planName);
    let planCreated = false;
    let config: PlanConfig;
    if (plan) {
      const extended = extendConfig(plan.config, parsed);
      config = extended.config;
      if (extended.added.length > 0) {
        const { error } = await supabase.from("qc_plans").update({ config }).eq("id", plan.id);
        if (error) return { status: "error", error: `Couldn't update the plan: ${error.message}` };
      }
    } else {
      config = configFromParsed(parsed);
      const { data: last } = await supabase.from("qc_plans").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
      const { data: created, error } = await supabase
        .from("qc_plans")
        .insert({
          name: parsed.planName,
          commodity: parsed.commodity || parsed.planName,
          control_point: parsed.controlPoint,
          position: ((last?.position as number | undefined) ?? -1) + 1,
          config,
        })
        .select()
        .single();
      if (error || !created) return { status: "error", error: `Couldn't create the plan "${parsed.planName}": ${error?.message ?? "unknown error"}` };
      plan = created as QcPlan;
      planCreated = true;
    }

    const mapped = mapToPlan(config, parsed);
    if (await isDuplicate(supabase, plan.name, iso, mapped.lot_number)) return { status: "duplicate" };

    // Who: their HOPS login when the name matches an employee linked to one.
    const { data: employee } = await supabase.from("employees").select("name, linked_user_id").ilike("name", parsed.inspectedBy).maybeSingle();
    const inspectorName = parsed.inspectedBy || null;
    const initials = initialsFor(inspectorName, null);
    const result = normalizeResult(parsed.result);
    const sampleIso = centralToIso(parsed.sampleTime) ?? iso;

    const { data: inserted, error: insertError } = await supabase
      .from("qc_lot_inspections")
      .insert({
        plan_id: plan.id,
        plan_snapshot: { name: plan.name, commodity: plan.commodity, control_point: plan.control_point, config },
        plan_name: plan.name,
        commodity: parsed.commodity || plan.commodity,
        control_point: parsed.controlPoint || plan.control_point,
        inspector_id: (employee?.linked_user_id as string | null) ?? null,
        inspector_name: inspectorName,
        inspector_initials: initials,
        inspection_time: iso,
        sample_time: sampleIso,
        grower: mapped.grower,
        facility: mapped.facility,
        product_label: mapped.product_label,
        lot_number: mapped.lot_number,
        header: mapped.header,
        sample_size: parsed.sampleSize,
        defects: mapped.defects,
        samples: mapped.samples,
        notes_1: parsed.notes1 || null,
        notes_2: parsed.notes2 || null,
        result: result || null,
      })
      .select("id")
      .single();
    if (insertError || !inserted) return { status: "error", error: insertError?.message ?? "Couldn't save the inspection." };

    // The history sheet row.
    const { data: lastRow } = await supabase.from("qc_inspections").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
    const { po, lot } = splitPoLot(mapped.lot_number ?? "");
    const { error: logError } = await supabase.from("qc_inspections").insert({
      position: ((lastRow?.position as number | undefined) ?? 0) + 1,
      entry_date: isoDateOf(iso),
      po,
      lot,
      product: productText(parsed.commodity || plan.commodity, mapped.product_label),
      qc: initials,
      report: true,
      status: "Imported from LotPath",
      result: result || null,
      notes: parsed.notes2 || parsed.notes1 || null,
      lot_inspection_id: inserted.id,
    });
    if (logError) return { status: "error", error: `Saved, but couldn't add it to the history: ${logError.message}` };

    return { status: "imported", planCreated };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

// The uploaded PDFs are only needed while importing.
export async function removeImportFiles(paths: string[]) {
  const { supabase } = await managerContext();
  const safe = paths.filter((p) => p.startsWith(TEMP_FOLDER));
  if (safe.length > 0) await supabase.storage.from("qc-photos").remove(safe);
  revalidatePath("/qc/inspections");
  revalidatePath("/qc/plans");
}
