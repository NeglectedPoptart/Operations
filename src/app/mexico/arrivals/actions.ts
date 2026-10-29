"use server";

import { revalidatePath } from "next/cache";
import { sendNotification } from "@/app/supreme/notifications/actions";
import { addDays } from "@/lib/dates";
import { personName } from "@/lib/displayName";
import { createClient } from "@/lib/supabase/server";
import type { ParsedMxArrivalRow } from "@/lib/mxArrivalsParse";
import type { Role } from "@/lib/roles";
import { MX_ARRIVAL_DAYS } from "@/lib/types";
import type { MxArrivalDay, MxArrivalSection, MxTruckPosition } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const DAY_INDEX = new Map(MX_ARRIVAL_DAYS.map((d, i) => [d.value, i]));

const COMMODITY_QTY_SLOTS = [
  { idKey: "commodity_1_id", qtyKey: "commodity_1_qty", slot: 1 },
  { idKey: "commodity_2_id", qtyKey: "commodity_2_qty", slot: 2 },
  { idKey: "commodity_3_id", qtyKey: "commodity_3_qty", slot: 3 },
  { idKey: "commodity_4_id", qtyKey: "commodity_4_qty", slot: 4 },
] as const;

// Carton Inventory Phase 2: whenever an arrival row's carton/commodity/qty
// (or grower/day, which change where and when the deduction should land)
// change, this re-derives the correct auto-deduction from scratch for each
// of the row's 4 commodity slots - always a full delete-then-recreate per
// slot (keyed on source_arrival_id + source_arrival_slot) rather than a
// diff, since that's simplest to keep correct and this runs on every save.
// The carton type is one pick for the whole row (chosen from the grower's
// own inventory); every slot's qty deducts from it. A row with no carton
// picked, or a slot with no product or no positive qty, just ends up with
// nothing to insert - clearing whatever was there before.
async function syncCartonDeductionsForArrival(supabase: SupabaseClient, arrivalId: string) {
  const { data: arrival, error: arrivalError } = await supabase.from("mx_arrivals").select("*").eq("id", arrivalId).maybeSingle();
  if (arrivalError || !arrival) return;

  await supabase.from("carton_transactions").delete().eq("source_arrival_id", arrivalId);

  const growerId = arrival.grower_id as string | null;
  if (!growerId) return;
  const { data: location } = await supabase.from("carton_locations").select("id").eq("grower_id", growerId).maybeSingle();
  const locationId = location?.id as string | undefined;
  if (!locationId) return;

  const cartonTypeId = arrival.carton_type_id as string | null;
  if (!cartonTypeId) return;

  const dayIndex = arrival.arrival_day ? DAY_INDEX.get(arrival.arrival_day as MxArrivalDay) : undefined;
  const entryDate = dayIndex !== undefined ? addDays(arrival.week_start_date as string, dayIndex) : (arrival.week_start_date as string);

  const rows = COMMODITY_QTY_SLOTS.map((s) => {
    const commodityId = arrival[s.idKey] as string | null;
    const qty = arrival[s.qtyKey] as number | null;
    if (!commodityId || !qty || qty <= 0) return null;
    return {
      carton_type_id: cartonTypeId,
      location_id: locationId,
      qty: -qty,
      entry_date: entryDate,
      source: "arrival" as const,
      source_arrival_id: arrivalId,
      source_arrival_slot: s.slot,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    await supabase.from("carton_transactions").insert(rows);
  }
}

// Every role that actually has the "mexico" tab (see ROLE_TABS in
// roles.ts) - "everyone" for this notification means everyone who can
// reach the page it links to, not literally every account in the company.
const ARRIVALS_NOTIFY_ROLES: Role[] = ["admin", "operations", "warehouse_qc", "qc_manager", "executive", "mx"];

// Fired from the "Mark as Up to Date" button on Arrivals (see
// UpdateStatusButton's onMarked) - fans out one in-app + push notification
// per Mexico-access role, reusing the existing Notifications infrastructure
// instead of requiring an Admin to manually hit "Notify" every time. The
// button itself already stamps page_status/page_status_log with the click's
// timestamp via markPageUpToDate, and stays clickable for the rest of the
// day so it can be re-run if the sheet changes again.
export async function notifyArrivalsUpdated() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let updatedByEmail: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
    updatedByEmail = (profile?.email as string | null) ?? user.email ?? null;
  }

  const now = new Date().toISOString();
  for (const role of ARRIVALS_NOTIFY_ROLES) {
    await sendNotification({
      tabLabel: "Mexico",
      subtabLabel: "Arrivals",
      pagePath: "/mexico/arrivals",
      message: "The Mexico Arrivals sheet has been updated.",
      updatedBy: updatedByEmail,
      lastEditedAt: now,
      targetType: "role",
      targetUserId: null,
      targetRole: role,
    }).catch(() => {});
  }
}

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
    carton_type_id?: string | null;
    commodity_1_id?: string | null;
    commodity_2_id?: string | null;
    commodity_3_id?: string | null;
    commodity_4_id?: string | null;
    commodity_1_qty?: number | null;
    commodity_2_qty?: number | null;
    commodity_3_qty?: number | null;
    commodity_4_qty?: number | null;
    boxes_approx?: string | null;
    price_to_grower?: string | null;
    grade?: string | null;
    manifesto?: string | null;
    arrival_day?: MxArrivalDay | null;
    // Moving a row to another week (e.g. a Sunday arrival to Monday of the next week).
    week_start_date?: string;
    notes?: string | null;
    truck_group?: string | null;
    truck_position?: MxTruckPosition | null;
    linked_load_id?: string | null;
    arrived?: boolean;
  },
) {
  const supabase = await createClient();
  // Ticking Arrived also records when (the AP Summary counts days from it). If that column is not
  // there yet (migration 156 not run) the tick is still saved without it.
  let { error } = await supabase
    .from("mx_arrivals")
    .update("arrived" in patch ? { ...patch, arrived_at: patch.arrived ? new Date().toISOString() : null } : patch)
    .eq("id", id);
  if (error && /arrived_at/.test(error.message)) {
    ({ error } = await supabase.from("mx_arrivals").update(patch).eq("id", id));
  }
  if (error) throw new Error(error.message);
  if ("grower_id" in patch || "carton_type_id" in patch || "arrival_day" in patch || "week_start_date" in patch || COMMODITY_QTY_SLOTS.some((s) => s.idKey in patch || s.qtyKey in patch)) {
    await syncCartonDeductionsForArrival(supabase, id).catch(() => {});
  }
  revalidateAll();
  revalidatePath("/mexico/carton-inventory");
  revalidatePath("/mexico/ap-summary");
}

export async function deleteArrivalRow(id: string) {
  const supabase = await createClient();
  // Delete any auto-deduction this row generated first (the delete trigger
  // reverses its balance effect) - otherwise the FK's on-delete-set-null
  // would just orphan it, permanently leaving the deduction in place.
  await supabase.from("carton_transactions").delete().eq("source_arrival_id", id);
  // Its attached documents: the rows go with the arrival (cascade), the files are removed here.
  const { data: docs } = await supabase.from("mx_arrival_documents").select("storage_path").eq("arrival_id", id);
  if (docs && docs.length > 0) await supabase.storage.from("load-documents").remove(docs.map((d) => d.storage_path as string));
  const { error } = await supabase.from("mx_arrivals").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/mexico/carton-inventory");
  revalidateAll();
}

// --- Documents attached to an arrival (e.g. the purchase order sent to the grower) ---

export interface ArrivalDocument {
  id: string;
  kind: "purchase_order" | "other";
  file_name: string;
  size_bytes: number | null;
  created_by: string | null;
  created_at: string;
  url: string | null;
}

// A file the browser already put in the load-documents bucket (done client-side, since a
// server action's body is capped far below a scan's size), recorded against the arrival.
export async function recordArrivalDocument(input: {
  arrivalId: string;
  kind: "purchase_order" | "other";
  fileName: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("mx_arrival_documents").insert({
    arrival_id: input.arrivalId,
    kind: input.kind,
    file_name: input.fileName,
    storage_path: input.storagePath,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    created_by: user ? await personName(supabase, user) : null,
  });
  if (error) throw new Error(error.message);
}

export async function getArrivalDocuments(arrivalId: string): Promise<ArrivalDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mx_arrival_documents")
    .select("id, kind, file_name, storage_path, size_bytes, created_by, created_at")
    .eq("arrival_id", arrivalId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return Promise.all(
    (data ?? []).map(async (d) => {
      const { data: signed } = await supabase.storage.from("load-documents").createSignedUrl(d.storage_path as string, 3600);
      return {
        id: d.id as string,
        kind: d.kind as "purchase_order" | "other",
        file_name: d.file_name as string,
        size_bytes: (d.size_bytes as number | null) ?? null,
        created_by: (d.created_by as string | null) ?? null,
        created_at: d.created_at as string,
        url: signed?.signedUrl ?? null,
      };
    }),
  );
}

export async function deleteArrivalDocument(id: string) {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("mx_arrival_documents").select("storage_path").eq("id", id).maybeSingle();
  const { error } = await supabase.from("mx_arrival_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (doc) await supabase.storage.from("load-documents").remove([doc.storage_path as string]);
}
