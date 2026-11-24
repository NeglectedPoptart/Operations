import type { SupabaseClient } from "@supabase/supabase-js";
import { isoDateOf } from "@/lib/dates";
import { centralToIso, configFromParsed, extendConfig, mapToPlan } from "@/lib/lotpathImport";
import { norm, normalizeResult, type ParsedLotpath } from "@/lib/lotpathParse";
import { splitPoLot } from "@/lib/qcLot";
import { initialsFor, productText, type PlanConfig, type QcPlan } from "@/lib/qcPlans";

// Saving a parsed LotPath report as a Lot Inspection (plan found or built from the report, the inspection, and its
// row on the Inspection History sheet). Shared by Import LotPath on the Plans page and by forwarded LotPath emails.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export async function findPlan(supabase: Db, name: string): Promise<QcPlan | null> {
  const { data } = await supabase.from("qc_plans").select("*");
  return ((data ?? []) as QcPlan[]).find((p) => norm(p.name) === norm(name)) ?? null;
}

export async function isDuplicate(supabase: Db, planName: string, iso: string | null, lot: string | null): Promise<boolean> {
  if (!iso) return false;
  let query = supabase.from("qc_lot_inspections").select("id").eq("plan_name", planName).eq("inspection_time", iso).limit(1);
  query = lot ? query.eq("lot_number", lot) : query.is("lot_number", null);
  const { data } = await query;
  return (data ?? []).length > 0;
}

export type LotpathImportResult =
  | { status: "imported"; planCreated: boolean; inspectionId: string; photos: number; commodity: string; lot: string }
  | { status: "duplicate" }
  | { status: "error"; error: string };

export async function saveLotpathParsed(
  supabase: Db,
  parsed: ParsedLotpath,
  opts: { photos?: Buffer[]; status?: string } = {},
): Promise<LotpathImportResult> {
  try {
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

    // The photos, when the PDF's were read: stored the same way as photos taken in HOPS.
    let photoCount = 0;
    const photos = opts.photos ?? [];
    if (photos.length > 0) {
      const folder = `inspections/${crypto.randomUUID()}`;
      const rows: { inspection_id: string; storage_path: string; position: number }[] = [];
      // Ten at a time - a report can hold over a hundred.
      for (let start = 0; start < photos.length; start += 10) {
        const batch = photos.slice(start, start + 10);
        const results = await Promise.all(
          batch.map(async (data, k) => {
            const path = `${folder}/${String(start + k + 1).padStart(3, "0")}.jpg`;
            const { error } = await supabase.storage.from("qc-photos").upload(path, data, { contentType: "image/jpeg" });
            return error ? null : path;
          }),
        );
        for (const path of results) if (path) rows.push({ inspection_id: inserted.id as string, storage_path: path, position: rows.length });
      }
      if (rows.length > 0) {
        const { error } = await supabase.from("qc_lot_photos").insert(rows);
        if (!error) photoCount = rows.length;
      }
    }

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
      status: opts.status ?? "Imported from LotPath",
      result: result || null,
      notes: parsed.notes2 || parsed.notes1 || null,
      lot_inspection_id: inserted.id,
    });
    if (logError) return { status: "error", error: `Saved, but couldn't add it to the history: ${logError.message}` };

    return { status: "imported", planCreated, inspectionId: inserted.id as string, photos: photoCount, commodity: parsed.commodity || plan.commodity, lot: mapped.lot_number ?? "" };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
