"use server";

import { revalidatePath } from "next/cache";
// Same unpdf-based extraction as the Price Sheets PDF import - see that
// file's comment for why unpdf specifically (serverless-safe, no separate
// worker file to resolve at runtime).
import { extractText, getDocumentProxy } from "unpdf";
import zipcodes from "zipcodes";
import { createClient } from "@/lib/supabase/server";
import { destinationLabel, normalizeForMatch } from "@/lib/laneLabel";
import { splitDestinationLabel } from "@/lib/destination";
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
  appointment: string | null;
}

interface PickupInput {
  pu_number: string | null;
  vendor: string | null;
  location: string | null;
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
    rate: num(formData, "rate"),
    broker_id: str(formData, "broker_id"),
    notes: str(formData, "notes"),
    eta_note: str(formData, "eta_note"),
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
    appointment: cleanStr(s?.appointment),
  }));
}

function pickupsFromForm(formData: FormData): PickupInput[] {
  const raw = formData.get("pickups_json");
  if (typeof raw !== "string" || !raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((p) => ({
    pu_number: cleanStr(p?.pu_number),
    vendor: cleanStr(p?.vendor),
    location: cleanStr(p?.location),
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

async function replacePickups(supabase: SupabaseClient, loadId: string, pickups: PickupInput[]) {
  const { error: deleteError } = await supabase.from("load_pickups").delete().eq("load_id", loadId);
  if (deleteError) throw new Error(deleteError.message);
  if (pickups.length === 0) return;

  const rows = pickups.map((p, i) => ({ load_id: loadId, position: i + 1, ...p }));
  const { error } = await supabase.from("load_pickups").insert(rows);
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

export async function createLoad(formData: FormData): Promise<string> {
  const supabase = await createClient();
  const fields = loadFieldsFromForm(formData);
  const stops = stopsFromForm(formData);
  const pickups = pickupsFromForm(formData);

  const { data, error } = await supabase.from("loads").insert(fields).select().single();
  if (error) throw new Error(error.message);

  await replaceStops(supabase, data.id, stops);
  await replacePickups(supabase, data.id, pickups);
  await ensureLane(supabase, fields.source, stops);
  revalidateAll();
  return data.id;
}

export async function updateLoad(id: string, formData: FormData) {
  const supabase = await createClient();
  const fields = loadFieldsFromForm(formData);
  const stops = stopsFromForm(formData);
  const pickups = pickupsFromForm(formData);

  const { error } = await supabase.from("loads").update(fields).eq("id", id);
  if (error) throw new Error(error.message);

  await replaceStops(supabase, id, stops);
  await replacePickups(supabase, id, pickups);
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

export async function updateLoadRateConSent(id: string, rateConSent: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("loads").update({ rate_con_sent: rateConSent }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateEtaNote(id: string, etaNote: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("loads")
    .update({ eta_note: etaNote.trim() === "" ? null : etaNote.trim() })
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

// Adds a new option to the locked Source City list. Fire-and-forget from the
// UI's "+ Add" combobox action - duplicate names (23505) are ignored since
// the load form field itself doesn't depend on this succeeding.
export async function createHub(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const supabase = await createClient();
  const { error } = await supabase.from("hubs").insert({ name: trimmed });
  if (error && error.code !== "23505") throw new Error(error.message);
  revalidateAll();
}

// Same idea as createHub, for the locked Destination list.
export async function createDestinationCity(label: string) {
  const { city, state } = splitDestinationLabel(label);
  if (!city || !state) return;
  const supabase = await createClient();
  const { error } = await supabase.from("destination_cities").insert({ city, state });
  if (error && error.code !== "23505") throw new Error(error.message);
  revalidateAll();
}

// Pulls the plain text layer out of an uploaded rate confirmation PDF so it
// can run through parseRateConfirmationText() + an editable preview, same
// discriminated-result shape as Price Sheets' extractPdfText (a thrown Error
// message gets redacted by Next.js in production, so a real failure needs a
// value the client can actually show).
export async function extractRateConfirmationText(formData: FormData): Promise<{ text: string } | { error: string }> {
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

// Offline zip -> city/state lookup (the "zipcodes" package ships all US
// zips, no external API call) so the destination combobox can be pre-filled
// even though the Ship To address on the PDF often only has a zip, not a
// spelled-out city name. Kept server-only since the package's data file is a
// few MB - no reason to ship that to the client bundle.
export async function lookupZipCityState(zip: string): Promise<{ city: string; state: string } | null> {
  const info = zipcodes.lookup(zip);
  if (!info) return null;
  return { city: info.city, state: info.state };
}
