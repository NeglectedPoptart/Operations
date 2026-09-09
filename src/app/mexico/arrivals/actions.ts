"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedMxArrivalRow } from "@/lib/mxArrivalsParse";
import type { MxArrivalDay, MxArrivalSection, MxTruckPosition } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function revalidateAll() {
  revalidatePath("/mexico/arrivals");
  revalidatePath("/mexico/growers");
  revalidatePath("/logistics/board");
}

// Finds each distinct name in an existing lookup table (case-insensitive),
// creates whatever's missing, and returns a name -> id map covering all of
// them. Shared by growers/labels/commodities below - they're otherwise
// identical "find or create by name" tables.
async function resolveByName(
  supabase: SupabaseClient,
  table: "mx_growers" | "mx_grower_labels" | "mx_commodities",
  names: string[],
  extraFieldsFor?: (name: string) => Record<string, string | null>,
): Promise<Map<string, string>> {
  const distinct = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (distinct.length === 0) return new Map();

  const { data: existing, error: existingError } = await supabase.from(table).select("id, name");
  if (existingError) throw new Error(existingError.message);

  const idByName = new Map((existing ?? []).map((r) => [(r.name as string).trim().toLowerCase(), r.id as string]));
  const missing = distinct.filter((n) => !idByName.has(n.toLowerCase()));
  if (missing.length === 0) return idByName;

  const { data: created, error: createError } = await supabase
    .from(table)
    .insert(missing.map((name) => ({ name, ...(extraFieldsFor ? extraFieldsFor(name) : {}) })))
    .select("id, name");
  if (createError) throw new Error(createError.message);

  for (const r of created ?? []) idByName.set((r.name as string).trim().toLowerCase(), r.id as string);
  return idByName;
}

// Imports a pasted week's Arrivals report: matches each row's grower, label,
// and commodity name(s) against existing master data (creating whatever
// doesn't exist yet - a brand new grower picks up its origin/best_contact
// from the first row that mentions it), then wholesale-replaces that week's
// arrivals with the freshly parsed set - the user re-pastes the full current
// report each time, so we don't try to diff/merge against what's already
// there (same convention as Old Age's PDF/paste import).
export async function importMxArrivals(weekStartDate: string, rows: ParsedMxArrivalRow[]) {
  const supabase = await createClient();

  const growerIdByName = await resolveByName(
    supabase,
    "mx_growers",
    rows.map((r) => r.growerName),
    (name) => {
      const source = rows.find((r) => r.growerName.trim().toLowerCase() === name.toLowerCase());
      return { origin: source?.state || null, best_contact: source?.contact || null };
    },
  );
  const labelIdByName = await resolveByName(
    supabase,
    "mx_grower_labels",
    rows.map((r) => r.labelName),
  );
  const commodityIdByName = await resolveByName(
    supabase,
    "mx_commodities",
    rows.flatMap((r) => r.commodityNames),
  );

  const { error: deleteError } = await supabase.from("mx_arrivals").delete().eq("week_start_date", weekStartDate);
  if (deleteError) throw new Error(deleteError.message);

  if (rows.length === 0) {
    revalidateAll();
    return [];
  }

  const positionBySection = new Map<string, number>();
  const toInsert = rows.map((r) => {
    const position = (positionBySection.get(r.section) ?? 0) + 1;
    positionBySection.set(r.section, position);
    const commodityIds = r.commodityNames.map((c) => commodityIdByName.get(c.trim().toLowerCase()) ?? null);
    return {
      week_start_date: weekStartDate,
      section: r.section,
      position,
      grower_id: growerIdByName.get(r.growerName.trim().toLowerCase()) ?? null,
      label_id: r.labelName ? (labelIdByName.get(r.labelName.trim().toLowerCase()) ?? null) : null,
      commodity_1_id: commodityIds[0] ?? null,
      commodity_2_id: commodityIds[1] ?? null,
      commodity_3_id: commodityIds[2] ?? null,
      commodity_4_id: commodityIds[3] ?? null,
      boxes_approx: r.boxesApprox || null,
      price_to_grower: r.priceToGrower || null,
      manifesto: r.manifesto || null,
      arrival_day: r.arrivalDay,
      notes: r.notes || null,
    };
  });

  const { data, error } = await supabase.from("mx_arrivals").insert(toInsert).select();
  if (error) throw new Error(error.message);

  revalidateAll();
  return data;
}

// "Clear List" button - wipes every row for the given week without
// replacing them with anything, for starting a week over from scratch.
export async function clearMxArrivals(weekStartDate: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_arrivals").delete().eq("week_start_date", weekStartDate);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addArrivalRow(weekStartDate: string, section: MxArrivalSection, nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mx_arrivals")
    .insert({ week_start_date: weekStartDate, section, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updateArrivalRow(
  id: string,
  patch: {
    grower_id?: string | null;
    label_id?: string | null;
    commodity_1_id?: string | null;
    commodity_2_id?: string | null;
    commodity_3_id?: string | null;
    commodity_4_id?: string | null;
    boxes_approx?: string | null;
    price_to_grower?: string | null;
    manifesto?: string | null;
    arrival_day?: MxArrivalDay | null;
    notes?: string | null;
    truck_group?: string | null;
    truck_position?: MxTruckPosition | null;
    linked_load_id?: string | null;
  },
) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_arrivals").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteArrivalRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mx_arrivals").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
