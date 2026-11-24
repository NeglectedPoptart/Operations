"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractLotpathRows } from "@/lib/lotpathExtract";
import { centralToIso, configFromParsed, extendConfig, mapToPlan } from "@/lib/lotpathImport";
import { normalizeResult, parseLotpathRows, type ParsedLotpath } from "@/lib/lotpathParse";
import { findPlan, isDuplicate, saveLotpathParsed, type LotpathImportResult } from "@/lib/lotpathSave";
import { canEditPlansNow } from "@/lib/pageAccess";
import { defectTotals, percentText } from "@/lib/qcPlans";

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
  if (!(await canEditPlansNow(supabase, user))) {
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

async function previewFromParsed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsed: ParsedLotpath,
): Promise<LotpathPreview> {
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

// Reads one uploaded PDF and says what importing it would do - writes nothing.
export async function previewLotpath(path: string): Promise<LotpathPreview | { ok: false; error: string }> {
  const { supabase } = await managerContext();
  const parsed = await readParsed(supabase, path);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  return previewFromParsed(supabase, parsed);
}

// Imports one uploaded PDF: finds (or builds) its plan, saves the inspection
// with no photos, and logs it on the Inspection History sheet.
export async function importLotpath(path: string): Promise<LotpathImportResult> {
  try {
    const { supabase } = await managerContext();
    const parsed = await readParsed(supabase, path);
    if ("error" in parsed) return { status: "error", error: parsed.error };
    return await saveLotpathParsed(supabase, parsed);
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
