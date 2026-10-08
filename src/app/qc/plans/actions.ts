"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canEditQcPlans } from "@/lib/roles";
import {
  DEFAULT_RESULT_OPTIONS,
  emptyPlanConfig,
  keyFromLabel,
  type PlanConfig,
  type QcPlan,
} from "@/lib/qcPlans";

// Plans can only be changed by the Quality Control Manager role and the
// Supreme account. The database enforces the same rule (migration 134) - this
// check just gives a clear message instead of a silent no-op.
async function managerClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!canEditQcPlans((profile?.role as string | null) ?? null, user.email ?? null)) {
    throw new Error("Only the Quality Control Manager can change inspection plans.");
  }
  return supabase;
}

function refresh() {
  revalidatePath("/qc/plans");
  revalidatePath("/qc/inspections/new");
}

// Tidies whatever the editor sends: trims names, drops blank rows, gives every
// item a stable key, and makes sure there is always a Lot number to log by.
function cleanConfig(input: PlanConfig): PlanConfig {
  const base = emptyPlanConfig();

  const headerKeys = new Set<string>();
  const headerFields = (input.headerFields ?? [])
    .filter((f) => (f.label ?? "").trim() !== "")
    .map((f) => {
      const label = f.label.trim();
      const key = f.key && !headerKeys.has(f.key) ? f.key : keyFromLabel(label, headerKeys);
      headerKeys.add(key);
      const options = f.type === "select" ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined;
      return { key, label, type: f.type, ...(options ? { options } : {}), required: !!f.required };
    });

  const defectKeys = new Set<string>();
  const defects = (input.defects ?? [])
    .filter((d) => (d.name ?? "").trim() !== "")
    .map((d) => {
      const name = d.name.trim();
      const key = d.key && !defectKeys.has(d.key) ? d.key : keyFromLabel(name, defectKeys);
      defectKeys.add(key);
      return { key, name, severity: d.severity === "serious" ? ("serious" as const) : ("non_serious" as const) };
    });

  const sampleKeys = new Set<string>();
  const sampleFields = (input.sampleFields ?? [])
    .filter((f) => (f.label ?? "").trim() !== "")
    .map((f) => {
      const label = f.label.trim();
      const key = f.key && !sampleKeys.has(f.key) ? f.key : keyFromLabel(label, sampleKeys);
      sampleKeys.add(key);
      const options = f.type === "select" ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined;
      return {
        key,
        label,
        type: f.type,
        ...(f.unit?.trim() ? { unit: f.unit.trim() } : {}),
        ...(options ? { options } : {}),
      };
    });

  const resultOptions = (input.resultOptions ?? []).map((r) => r.trim()).filter(Boolean);
  const sampleSize = Number(input.defaultSampleSize);

  return {
    headerFields: headerFields.length > 0 ? headerFields : base.headerFields,
    defaultSampleSize: Number.isFinite(sampleSize) && sampleSize > 0 ? Math.round(sampleSize) : null,
    defects,
    sampleCount: Math.max(0, Math.min(50, Math.round(Number(input.sampleCount) || 0))),
    sampleFields,
    resultOptions: resultOptions.length > 0 ? resultOptions : DEFAULT_RESULT_OPTIONS,
  };
}

export async function savePlan(
  id: string | null,
  input: { name: string; commodity: string; control_point: string; active: boolean; config: PlanConfig },
): Promise<QcPlan> {
  const supabase = await managerClient();
  const name = input.name.trim();
  const commodity = input.commodity.trim();
  if (!name) throw new Error("Give the plan a name.");
  if (!commodity) throw new Error("Enter the commodity this plan is for.");
  const row = {
    name,
    commodity,
    control_point: input.control_point.trim(),
    active: input.active,
    config: cleanConfig(input.config),
  };

  if (id) {
    const { data, error } = await supabase.from("qc_plans").update(row).eq("id", id).select().single();
    if (error) throw new Error(error.message.includes("duplicate") ? "There is already a plan with that name." : error.message);
    refresh();
    return data as QcPlan;
  }
  const { data: last } = await supabase.from("qc_plans").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("qc_plans")
    .insert({ ...row, position: ((last?.position as number | undefined) ?? -1) + 1 })
    .select()
    .single();
  if (error) throw new Error(error.message.includes("duplicate") ? "There is already a plan with that name." : error.message);
  refresh();
  return data as QcPlan;
}

export async function duplicatePlan(id: string): Promise<QcPlan> {
  const supabase = await managerClient();
  const { data: source, error } = await supabase.from("qc_plans").select("*").eq("id", id).single();
  if (error || !source) throw new Error(error?.message ?? "Plan not found.");

  const { data: all } = await supabase.from("qc_plans").select("name, position");
  const names = new Set((all ?? []).map((p) => p.name as string));
  let name = `${source.name} (copy)`;
  for (let n = 2; names.has(name); n++) name = `${source.name} (copy ${n})`;
  const position = Math.max(-1, ...(all ?? []).map((p) => p.position as number)) + 1;

  const { data, error: insertError } = await supabase
    .from("qc_plans")
    .insert({
      name,
      commodity: source.commodity,
      control_point: source.control_point,
      active: source.active,
      config: source.config,
      position,
    })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);
  refresh();
  return data as QcPlan;
}

// Old inspections keep their own copy of the plan, so deleting a plan never
// changes a report that was already made.
export async function deletePlan(id: string) {
  const supabase = await managerClient();
  const { error } = await supabase.from("qc_plans").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refresh();
}
