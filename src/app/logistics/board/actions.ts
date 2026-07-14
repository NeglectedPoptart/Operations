"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { destinationLabel, normalizeForMatch } from "@/lib/laneLabel";
import type { LoadStatus } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

interface StopInput {
  order_number: string | null;
  po_number: string | null;
  client_name: string | null;
  destination_city: string | null;
  destination_state: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
}

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function num(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function loadFieldsFromForm(formData: FormData) {
  return {
    loading_date: str(formData, "loading_date"),
    source: str(formData, "source"),
    status: (str(formData, "status") ?? "pending_to_load") as LoadStatus,
    status_note: str(formData, "status_note"),
    rate: num(formData, "rate"),
    broker_id: str(formData, "broker_id"),
    notes: str(formData, "notes"),
  };
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
}

function stopsFromForm(formData: FormData): StopInput[] {
  const raw = formData.get("stops_json");
  if (typeof raw !== "string" || !raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((s) => ({
    order_number: cleanStr(s?.order_number),
    po_number: cleanStr(s?.po_number),
    client_name: cleanStr(s?.client_name),
    destination_city: cleanStr(s?.destination_city),
    destination_state: cleanStr(s?.destination_state),
    delivery_date: cleanStr(s?.delivery_date),
    delivery_time: cleanStr(s?.delivery_time),
  }));
}

function revalidateAll() {
  revalidatePath("/logistics/board");
  revalidatePath("/logistics");
  revalidatePath("/logistics/rates");
  revalidatePath("/");
}

async function replaceStops(supabase: SupabaseClient, loadId: string, stops: StopInput[]) {
  const { error: deleteError } = await supabase.from("load_stops").delete().eq("load_id", loadId);
  if (deleteError) throw new Error(deleteError.message);
  if (stops.length === 0) return;

  const rows = stops.map((s, i) => ({ load_id: loadId, position: i + 1, ...s }));
  const { error } = await supabase.from("load_stops").insert(rows);
  if (error) throw new Error(error.message);
}

// Auto-creates the lane a load corresponds to (from_hub + stops' destination
// label) if it doesn't already exist, so the Broker Tracker's lane list
// grows from what's actually being booked. See src/lib/laneLabel.ts.
async function ensureLane(supabase: SupabaseClient, source: string | null, stops: StopInput[]) {
  if (!source) return;
  const label = destinationLabel(stops.map((s, i) => ({ ...s, position: i + 1 })));
  if (!label) return;

  const { data: existingLanes, error } = await supabase.from("lanes").select("id, from_hub, destination");
  if (error) return;

  const alreadyExists = (existingLanes ?? []).some(
    (l) =>
      normalizeForMatch(l.from_hub) === normalizeForMatch(source) &&
      normalizeForMatch(l.destination) === normalizeForMatch(label),
  );
  if (alreadyExists) return;

  await supabase.from("lanes").insert({ from_hub: source, destination: label });
}

export async function createLoad(formData: FormData) {
  const supabase = await createClient();
  const fields = loadFieldsFromForm(formData);
  const stops = stopsFromForm(formData);

  const { data, error } = await supabase.from("loads").insert(fields).select().single();
  if (error) throw new Error(error.message);

  await replaceStops(supabase, data.id, stops);
  await ensureLane(supabase, fields.source, stops);
  revalidateAll();
}

export async function updateLoad(id: string, formData: FormData) {
  const supabase = await createClient();
  const fields = loadFieldsFromForm(formData);
  const stops = stopsFromForm(formData);

  const { error } = await supabase.from("loads").update(fields).eq("id", id);
  if (error) throw new Error(error.message);

  await replaceStops(supabase, id, stops);
  await ensureLane(supabase, fields.source, stops);
  revalidateAll();
}

export async function updateLoadStatus(id: string, status: LoadStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from("loads").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateLoadReady(id: string, readyToLoad: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("loads").update({ ready_to_load: readyToLoad }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateStatusNote(id: string, statusNote: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("loads")
    .update({ status_note: statusNote.trim() === "" ? null : statusNote.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteLoad(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("loads").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function createBroker(name: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brokers")
    .insert({ name })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}
