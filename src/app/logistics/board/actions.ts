"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyCarrierCharge, notifyCarrierNewLoad, notifyCarrierOrderAdded } from "@/lib/brokerPortal/notifyCarrier";
// Same unpdf-based extraction as the Price Sheets PDF import - see that
// file's comment for why unpdf specifically (serverless-safe, no separate
// worker file to resolve at runtime).
import { extractText, getDocumentProxy } from "unpdf";
import zipcodes from "zipcodes";
import { createClient } from "@/lib/supabase/server";
import { requestLoadUpdate, sendDeliveredNotice, serviceClient, triggerCustomerDelivered } from "@/lib/agents/run";
import { personName } from "@/lib/displayName";
import { todayISO } from "@/lib/dates";
import { destinationLabel, normalizeForMatch } from "@/lib/laneLabel";
import { splitDestinationLabel } from "@/lib/destination";
import type { LoadStatus } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// A delivery was just recorded: the Customer ETA agent (if on) emails the customer "delivered" with the POD.
// Never blocks or fails the action - the agent's own 15-minute run picks up anything this misses.
async function tellCustomerDelivered(loadId: string): Promise<void> {
  try {
    await triggerCustomerDelivered(serviceClient(), [loadId]);
  } catch {
    // the delivery is saved either way
  }
}

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

// "Buying from vendors" box: the Source City isn't counted as a pickup (migration 176). Kept out of the main
// insert/update so saving a load never depends on that column existing; turning it on before the migration is
// run says so, turning it off (the default) is silently skipped.
async function saveSourceIsPickup(supabase: SupabaseClient, id: string, formData: FormData): Promise<void> {
  const vendorBuy = formData.get("source_is_pickup") === "1";
  const { error } = await supabase.from("loads").update({ source_is_pickup: !vendorBuy }).eq("id", id);
  if (error && vendorBuy) throw new Error("The load was saved, but 'Buying from vendors' needs migration 176 run first.");
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
  revalidatePath("/logistics/charges");
  revalidatePath("/logistics/broker-pending");
  revalidatePath("/");
}

// Saves the drops from the edit form. A drop that was already on the load is updated in place (matched by order
// number, else customer, else its position) so its id - and with it the delivered mark, the delivered-email
// record and any POD tied to it - survives an edit. Only drops that were removed are deleted.
async function replaceStops(supabase: SupabaseClient, loadId: string, stops: StopInput[]) {
  const { data: existingRows, error: readError } = await supabase.from("load_stops").select("id, position, order_number, client_name").eq("load_id", loadId);
  if (readError) throw new Error(readError.message);
  const old = [...(existingRows ?? [])].sort((a, b) => (a.position as number) - (b.position as number));
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const keyOf = (order: unknown, client: unknown) => (norm(order) ? `o:${norm(order)}` : norm(client) ? `c:${norm(client)}` : "");
  const used = new Set<string>();
  const matchFor: (string | null)[] = stops.map((s) => {
    const k = keyOf(s.order_number, s.client_name);
    if (!k) return null;
    const hit = old.find((o) => !used.has(o.id as string) && keyOf(o.order_number, o.client_name) === k);
    if (hit) used.add(hit.id as string);
    return (hit?.id as string | undefined) ?? null;
  });
  stops.forEach((_, i) => {
    if (matchFor[i]) return;
    const hit = old.find((o) => !used.has(o.id as string) && (o.position as number) === i + 1);
    if (hit) {
      used.add(hit.id as string);
      matchFor[i] = hit.id as string;
    }
  });

  const gone = old.filter((o) => !used.has(o.id as string)).map((o) => o.id as string);
  if (gone.length > 0) {
    const { error: deleteError } = await supabase.from("load_stops").delete().in("id", gone);
    if (deleteError) throw new Error(deleteError.message);
  }
  for (let i = 0; i < stops.length; i++) {
    const id = matchFor[i];
    if (id) {
      const { error } = await supabase.from("load_stops").update({ position: i + 1, ...stops[i] }).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("load_stops").insert({ load_id: loadId, position: i + 1, ...stops[i] });
      if (error) throw new Error(error.message);
    }
  }
}

// Adds more orders (drops) to a truck that's already on the list - used when a new rate confirmation comes in
// for freight riding an existing load. The new drops go on the end; delivered marks and PODs on the existing
// drops are untouched. If the carrier had already signed, the signature is cleared so they sign the updated
// rate confirmation, and they're emailed.
export async function addStopsToLoad(loadId: string, stops: StopInput[]): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: load, error: loadError } = await supabase.from("loads").select("id, status, broker_id, ratecon_signed_at").eq("id", loadId).maybeSingle();
  if (loadError || !load) return { error: loadError?.message ?? "Load not found." };
  if (load.status === "complete") return { error: "That load is already Delivered." };
  if (stops.length === 0) return { error: "Nothing to add." };

  const { data: existing } = await supabase.from("load_stops").select("position").eq("load_id", loadId);
  let next = Math.max(0, ...((existing ?? []).map((s) => s.position as number))) + 1;
  const rows = stops.map((s) => ({ load_id: loadId, position: next++, ...s }));
  const { error } = await supabase.from("load_stops").insert(rows);
  if (error) return { error: error.message };

  if (load.ratecon_signed_at) await supabase.from("loads").update({ ratecon_signed_at: null, ratecon_signed_by: null }).eq("id", loadId);
  if (load.broker_id) after(() => notifyCarrierOrderAdded(loadId, rows as unknown as Record<string, unknown>[]));
  revalidateAll();
  return { ok: true };
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
  // Booked under a carrier: tell them (after the response, so saving isn't slowed by the email).
  if (fields.broker_id) after(() => notifyCarrierNewLoad(data.id));
  revalidateAll();
  if (formData.get("source_is_pickup") === "1") await saveSourceIsPickup(supabase, data.id, formData);
  return data.id;
}

export async function updateLoad(id: string, formData: FormData) {
  const supabase = await createClient();
  const fields = loadFieldsFromForm(formData);
  const stops = stopsFromForm(formData);
  const pickups = pickupsFromForm(formData);

  const { data: before } = await supabase.from("loads").select("broker_id").eq("id", id).maybeSingle();

  const { error } = await supabase
    .from("loads")
    .update(fields.status === "on_the_road" ? fields : { ...fields, pod_pending: false })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await replaceStops(supabase, id, stops);
  await replacePickups(supabase, id, pickups);
  await ensureLane(supabase, fields.source, stops);
  // Newly assigned to a carrier (not just edited while already theirs): tell them.
  if (fields.broker_id && fields.broker_id !== (before?.broker_id ?? null)) after(() => notifyCarrierNewLoad(id));
  revalidateAll();
  await saveSourceIsPickup(supabase, id, formData);
}

export async function updateLoadStatus(id: string, status: LoadStatus) {
  const supabase = await createClient();
  // Pending POD only means something while the load is still On the Road.
  const { error } = await supabase
    .from("loads")
    .update(status === "on_the_road" ? { status } : { status, pod_pending: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (status === "complete") await tellCustomerDelivered(id);
  revalidateAll();
}

export async function setPodPending(id: string, podPending: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("loads").update({ pod_pending: podPending }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// A POD file the browser already put in the load-documents bucket (done
// client-side, same as the other document uploads, since a server action's
// body is capped well below a scan's size). Receiving it completes the load.
export async function recordLoadPod(input: {
  loadId: string;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("load_documents").insert({
    load_id: input.loadId,
    kind: "pod",
    file_name: input.fileName,
    storage_path: input.storagePath,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    source: "manual",
  });
  if (error) throw new Error(error.message);
  const { error: loadError } = await supabase
    .from("loads")
    .update({ status: "complete", pod_pending: false, pod_submitted_at: null, pod_rejected_note: null })
    .eq("id", input.loadId);
  if (loadError) throw new Error(loadError.message);
  await tellCustomerDelivered(input.loadId);
  revalidateAll();
}

// ---- Per-drop delivery / POD on a multi-drop load (migration 172) ---------------------------------

// Once every drop on a multi-drop load has been marked delivered, the load itself goes Complete - same as
// attaching a whole-load POD does today. A single-drop load is unaffected; it still only ever completes
// through the whole-load actions above. Never reverts a load that's already Complete.
async function syncLoadCompletion(supabase: SupabaseClient, loadId: string): Promise<void> {
  const { data: stops } = await supabase.from("load_stops").select("delivered_at").eq("load_id", loadId);
  if (!stops || stops.length < 2 || !stops.every((s) => s.delivered_at)) return;
  await supabase.from("loads").update({ status: "complete", pod_pending: false }).eq("id", loadId);
}

// Marks (or un-marks) one drop delivered, without a POD - for a drop you know is done but aren't attaching
// paperwork for right now.
export async function markStopDelivered(stopId: string, delivered: boolean): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: stop, error: stopError } = await supabase.from("load_stops").select("load_id").eq("id", stopId).single();
  if (stopError || !stop) {
    return { error: /delivered_at|column/i.test(stopError?.message ?? "") ? "Per-drop delivery isn't set up yet - run migration 172." : (stopError?.message ?? "Drop not found.") };
  }
  const { error } = await supabase
    .from("load_stops")
    .update({ delivered_at: delivered ? new Date().toISOString() : null, delivered_by: delivered ? (user?.email ?? null) : null })
    .eq("id", stopId);
  if (error) return { error: error.message };
  if (delivered) {
    await syncLoadCompletion(supabase, stop.load_id as string);
    await tellCustomerDelivered(stop.load_id as string);
  }
  revalidateAll();
  return { ok: true };
}

// A POD file the browser already put in the load-documents bucket, tied to one drop. Marks that drop
// delivered, and completes the whole load once every drop on it has a delivery marked.
export async function recordStopPod(input: {
  stopId: string;
  loadId: string;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number;
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("load_documents").insert({
    load_id: input.loadId,
    stop_id: input.stopId,
    kind: "pod",
    file_name: input.fileName,
    storage_path: input.storagePath,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    source: "manual",
  });
  if (error) {
    return { error: /stop_id|column/i.test(error.message) ? "Per-drop POD isn't set up yet - run migration 172." : error.message };
  }
  const { error: stopError } = await supabase
    .from("load_stops")
    .update({ delivered_at: new Date().toISOString(), delivered_by: user?.email ?? null })
    .eq("id", input.stopId);
  if (stopError) return { error: stopError.message };
  await syncLoadCompletion(supabase, input.loadId);
  await tellCustomerDelivered(input.loadId);
  revalidateAll();
  return { ok: true };
}

// Ties an already-attached POD to one drop of a multi-drop load (or back to "whole load" with null). Tying it
// marks that drop delivered, completes the load once every drop is, and lets the delivered email go out to
// the right customer with the right POD.
export async function assignPodToStop(docId: string, stopId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: doc, error: docError } = await supabase.from("load_documents").select("load_id").eq("id", docId).single();
  if (docError || !doc) return { error: docError?.message ?? "Document not found." };
  const { error } = await supabase.from("load_documents").update({ stop_id: stopId }).eq("id", docId);
  if (error) return { error: /stop_id|column/i.test(error.message) ? "Per-drop POD isn't set up yet - run migration 172." : error.message };
  if (stopId) {
    await supabase
      .from("load_stops")
      .update({ delivered_at: new Date().toISOString(), delivered_by: user?.email ?? null })
      .eq("id", stopId)
      .is("delivered_at", null);
    await syncLoadCompletion(supabase, doc.load_id as string);
  }
  await tellCustomerDelivered(doc.load_id as string);
  revalidateAll();
  return { ok: true };
}

export interface LoadDocumentLink {
  id: string;
  file_name: string;
  source: string;
  kind: string;
  review_status: string | null;
  url: string | null;
  // Which drop this belongs to on a multi-drop load - null for a whole-load document.
  stop_id: string | null;
}

export async function getLoadDocuments(loadId: string): Promise<LoadDocumentLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("load_documents")
    .select("*")
    .eq("load_id", loadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return Promise.all(
    (data ?? []).map(async (d) => {
      const { data: signed } = await supabase.storage.from("load-documents").createSignedUrl(d.storage_path as string, 3600);
      return {
        id: d.id as string,
        file_name: d.file_name as string,
        source: d.source as string,
        kind: (d.kind as string | undefined) ?? "pod",
        review_status: (d.review_status as string | null | undefined) ?? null,
        url: signed?.signedUrl ?? null,
        stop_id: (d.stop_id as string | null | undefined) ?? null,
      };
    }),
  );
}

// Emails the carrier asking for a location / ETA (and the POD if delivered) on one On the Road
// load - the same email the Load ETA agent sends, sent now. Returns what happened for the button.
export async function requestCarrierUpdate(loadId: string): Promise<{ sent: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  try {
    const result = await requestLoadUpdate(supabase, loadId);
    if ("error" in result) return result;
    revalidateAll();
    return { sent: `Asked ${result.carrier} (${result.sentTo.join(", ")}) for an update.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send the email." };
  }
}

// Emails the customer(s) on a Delivered load the delivered notice with the POD attached, now.
export async function sendCustomerDeliveredNotice(loadId: string): Promise<{ sent: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  try {
    const result = await sendDeliveredNotice(supabase, loadId);
    if ("error" in result) return result;
    revalidateAll();
    return { sent: `Delivered notice sent to ${result.sentTo.join(", ")}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send the email." };
  }
}

// Marks the Pending Orders Check popup seen for today - same one-per-day-
// per-account pattern as the Warehouse/QC daily reminder, just for this
// page's own field.
export async function markPendingOrdersSeen() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles").update({ last_pending_orders_seen_date: todayISO() }).eq("id", user.id);
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

// ---- Pending Orders Check: quick edits, claims and extra charges -------------------

export async function updateLoadQuick(
  id: string,
  patch: { loading_date?: string | null; rate?: number | null; notes?: string | null; eta_note?: string | null },
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const clean: Record<string, unknown> = {};
  if ("loading_date" in patch) clean.loading_date = patch.loading_date || null;
  if ("rate" in patch) clean.rate = patch.rate === null || patch.rate === undefined || !Number.isFinite(patch.rate) ? null : patch.rate;
  if ("notes" in patch) clean.notes = patch.notes?.trim() ? patch.notes.trim() : null;
  if ("eta_note" in patch) clean.eta_note = patch.eta_note?.trim() ? patch.eta_note.trim() : null;
  const { error } = await supabase.from("loads").update(clean).eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

// Flags a truck as a Claim (or clears it). The note says what happened; clearing keeps it.
export async function setLoadClaim(id: string, flag: boolean, note: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const patch = flag
    ? {
        claim_flag: true,
        claim_note: note.trim() || null,
        claim_flagged_at: new Date().toISOString(),
        claim_flagged_by: user ? await personName(supabase, user) : null,
      }
    : { claim_flag: false };
  const { error } = await supabase.from("loads").update(patch).eq("id", id);
  if (error) return { error: /claim_/.test(error.message) ? "Claims aren't set up yet - ask the admin to run migration 155." : error.message };
  revalidateAll();
  return { ok: true };
}

const CHARGE_PAYER_VALUES = ["harvest_best", "warehouse", "carrier", "customer", "other"];
const CHARGE_RECOVERY_VALUES = ["open", "billed", "recovered", "written_off"];

const PAYER_MIGRATION_MESSAGE = "Charge responsibility isn't set up yet - run migration 164.";

export async function addLoadCharge(input: {
  loadId: string;
  kind: string;
  amount: number;
  note: string;
  payer: string;
  payerName?: string;
  cause?: string;
}): Promise<{ ok: true } | { error: string }> {
  if (!Number.isFinite(input.amount) || input.amount === 0) return { error: "Enter the charge amount (use a minus sign for a credit)." };
  if (!CHARGE_PAYER_VALUES.includes(input.payer)) return { error: "Pick who should pay this charge." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const chargeKind = input.kind.trim() || "Other";
  const chargeAmount = Math.round(input.amount * 100) / 100;
  const chargeNote = input.note.trim() || null;
  const { error } = await supabase.from("load_charges").insert({
    load_id: input.loadId,
    kind: chargeKind,
    amount: chargeAmount,
    note: chargeNote,
    payer: input.payer,
    payer_name: input.payer === "warehouse" || input.payer === "customer" ? input.payerName?.trim() || null : null,
    cause: input.payer === "harvest_best" && (input.cause === "expected" || input.cause === "our_error") ? input.cause : null,
    // Nothing to get back when we absorb it.
    recovery_status: "open",
    created_by: user ? await personName(supabase, user) : null,
  });
  if (error) {
    if (/payer|cause|recovery_status/.test(error.message)) return { error: PAYER_MIGRATION_MESSAGE };
    return { error: /load_charges/.test(error.message) ? "Charges aren't set up yet - ask the admin to run migration 155." : error.message };
  }
  // The load's carrier (if it has one) is told about the charge.
  after(() => notifyCarrierCharge(input.loadId, { kind: chargeKind, amount: chargeAmount, note: chargeNote }));
  revalidateAll();
  return { ok: true };
}

// Everything on a charge that can be corrected or added to later, from the Load Charges page.
export async function updateLoadCharge(
  id: string,
  patch: {
    kind: string;
    amount: number;
    note: string;
    payer: string;
    payerName: string;
    cause: string;
    recoveryStatus: string;
    recoveredAmount: number | null;
    recoveredAt: string;
    reference: string;
    details: string;
  },
): Promise<{ ok: true } | { error: string }> {
  if (!Number.isFinite(patch.amount) || patch.amount === 0) return { error: "Enter the charge amount." };
  if (!CHARGE_PAYER_VALUES.includes(patch.payer)) return { error: "Pick who should pay this charge." };
  if (!CHARGE_RECOVERY_VALUES.includes(patch.recoveryStatus)) return { error: "Pick a status." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const absorbed = patch.payer === "harvest_best";
  const recovered = patch.recoveredAmount !== null && Number.isFinite(patch.recoveredAmount) ? Math.round(patch.recoveredAmount * 100) / 100 : null;
  const { error } = await supabase
    .from("load_charges")
    .update({
      kind: patch.kind.trim() || "Other",
      amount: Math.round(patch.amount * 100) / 100,
      note: patch.note.trim() || null,
      payer: patch.payer,
      payer_name: patch.payer === "warehouse" || patch.payer === "customer" || patch.payer === "other" ? patch.payerName.trim() || null : null,
      cause: absorbed && (patch.cause === "expected" || patch.cause === "our_error") ? patch.cause : null,
      recovery_status: absorbed ? "open" : patch.recoveryStatus,
      recovered_amount: absorbed ? null : recovered,
      recovered_at: absorbed ? null : patch.recoveredAt || null,
      reference: patch.reference.trim() || null,
      details: patch.details.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: user ? await personName(supabase, user) : null,
    })
    .eq("id", id);
  if (error) return { error: /payer|cause|recover|reference|details/.test(error.message) ? PAYER_MIGRATION_MESSAGE : error.message };
  revalidateAll();
  return { ok: true };
}

export async function deleteLoadCharge(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("load_charges").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

// ---- Broker Pending List: what staff do with what a carrier sends (migration 163) -----------------

// A rate confirmation PDF the browser already put in the load-documents bucket - kept on the load so
// the carrier can read and e-sign it on their Broker Pending List.
export async function recordLoadRateCon(input: {
  loadId: string;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number;
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("load_documents").insert({
    load_id: input.loadId,
    kind: "ratecon",
    file_name: input.fileName,
    storage_path: input.storagePath,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    source: "manual",
  });
  if (error) {
    return { error: /kind|check|constraint/i.test(error.message) ? "The Broker Pending List isn't set up yet - run migration 163." : error.message };
  }
  // On the carrier's Broker Pending List the moment it is attached.
  await supabase.from("loads").update({ rate_con_sent: true }).eq("id", input.loadId);
  revalidateAll();
  return { ok: true };
}

// A Delivery BOL the browser already put in the load-documents bucket - optional paperwork for the delivery.
// The carrier downloads it from their Broker Pending List tile to give to the driver.
export async function recordLoadDeliveryBol(input: {
  loadId: string;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number;
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("load_documents").insert({
    load_id: input.loadId,
    kind: "delivery_bol",
    file_name: input.fileName,
    storage_path: input.storagePath,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    source: "manual",
  });
  if (error) {
    return { error: /kind|check|constraint/i.test(error.message) ? "Delivery BOL isn't set up yet - run migration 171." : error.message };
  }
  revalidateAll();
  return { ok: true };
}

// Removes a rate confirmation / Delivery BOL from a load (the file itself stays in storage).
export async function removeLoadDocument(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("load_documents").delete().eq("id", id).in("kind", ["ratecon", "ratecon_signed", "delivery_bol"]);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

// Lets the carrier sign again (for example after the rate or details changed). The signed copy and
// certificate already made stay on the load.
export async function resetRateConSignature(loadId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("loads").update({ ratecon_signed_at: null, ratecon_signed_by: null }).eq("id", loadId);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

// The carrier's POD looks right: it is kept, and the load is Delivered (Complete).
export async function approvePod(loadId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error: docError } = await supabase
    .from("load_documents")
    .update({ review_status: "approved" })
    .eq("load_id", loadId)
    .eq("kind", "pod")
    .eq("review_status", "pending");
  if (docError) return { error: docError.message };
  const { error } = await supabase
    .from("loads")
    .update({ status: "complete", pod_pending: false, pod_submitted_at: null, pod_rejected_note: null })
    .eq("id", loadId);
  if (error) return { error: error.message };
  await tellCustomerDelivered(loadId);
  revalidateAll();
  return { ok: true };
}

// The POD is unreadable / wrong: the carrier sees why and uploads a new one. The load stays as it is.
export async function rejectPod(loadId: string, reason: string): Promise<{ ok: true } | { error: string }> {
  const note = reason.trim();
  if (!note) return { error: "Say what's wrong with it so the carrier can fix it." };
  const supabase = await createClient();
  const { error: docError } = await supabase
    .from("load_documents")
    .update({ review_status: "rejected", review_note: note })
    .eq("load_id", loadId)
    .eq("kind", "pod")
    .eq("review_status", "pending");
  if (docError) return { error: docError.message };
  const { error } = await supabase.from("loads").update({ pod_submitted_at: null, pod_rejected_note: note }).eq("id", loadId);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

// Approving adds the charge to the load's extra charges (what the list and invoicing already read);
// the amount can be lowered/changed first. Rejecting keeps it on the carrier's list with the reason.
export async function reviewChargeRequest(input: {
  id: string;
  decision: "approve" | "reject";
  note: string;
  amount?: number;
  // Who ends up bearing an approved charge (default: Harvest Best).
  payer?: string;
  payerName?: string;
  cause?: string;
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const reviewer = await personName(supabase, user);
  const { data: req, error: readError } = await supabase.from("broker_charge_requests").select("*").eq("id", input.id).maybeSingle();
  if (readError || !req) return { error: readError?.message ?? "That charge wasn't found." };
  if (req.status !== "pending") return { error: "That charge was already reviewed." };
  const note = input.note.trim();

  let loadChargeId: string | null = null;
  if (input.decision === "approve") {
    const amount = Math.round((input.amount ?? Number(req.amount)) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the approved amount." };
    const text = [`Carrier request: ${req.note ?? ""}`.trim(), note ? `Approved: ${note}` : ""].filter(Boolean).join(" | ");
    const payer = input.payer && CHARGE_PAYER_VALUES.includes(input.payer) ? input.payer : "harvest_best";
    const base = { load_id: req.load_id, kind: req.kind, amount, note: text || null, created_by: reviewer };
    const withPayer = {
      ...base,
      payer,
      payer_name: payer === "warehouse" || payer === "customer" ? input.payerName?.trim() || null : null,
      cause: payer === "harvest_best" && (input.cause === "expected" || input.cause === "our_error") ? input.cause : null,
    };
    let { data: charge, error: chargeError } = await supabase.from("load_charges").insert(withPayer).select("id").single();
    // Migration 164 not run yet: still add the charge, just without who pays it.
    if (chargeError && /payer|cause/.test(chargeError.message)) {
      ({ data: charge, error: chargeError } = await supabase.from("load_charges").insert(base).select("id").single());
    }
    if (chargeError || !charge) return { error: chargeError?.message ?? "Couldn't add the charge." };
    loadChargeId = charge.id as string;
    if (amount !== Number(req.amount)) {
      await supabase.from("broker_charge_requests").update({ amount }).eq("id", req.id);
    }
  } else if (!note) {
    return { error: "Say why it isn't approved so the carrier knows." };
  }

  const { error } = await supabase
    .from("broker_charge_requests")
    .update({
      status: input.decision === "approve" ? "approved" : "rejected",
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
      review_note: note || null,
      load_charge_id: loadChargeId,
    })
    .eq("id", req.id);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}
