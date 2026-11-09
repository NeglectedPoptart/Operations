"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { serviceClient, triggerCustomerEta } from "@/lib/agents/run";
import { loadRef, ownedLoad, requireBroker } from "@/lib/brokerPortal/scope";
import { notifyStaff } from "@/lib/brokerPortal/notify";
import { signRateConPdf } from "@/lib/brokerPortal/signPdf";
import { PORTAL_CHARGE_KINDS } from "@/lib/brokerPortal/types";
import { adminClient } from "@/lib/supabase/admin";

// Every action here is for a carrier login only, and only ever touches loads booked under that
// carrier's own company (requireBroker + ownedLoad). Nothing here lets a carrier change the load's
// own data, mark it delivered or approve its own charges.

type Result = { ok: true; message?: string } | { error: string };

const BUCKET = "load-documents";

function refresh() {
  revalidatePath("/logistics/broker-pending");
  revalidatePath("/logistics/board");
}

function safeExt(name: string): string {
  const m = name.toLowerCase().match(/\.[a-z0-9]{1,5}$/);
  return m ? m[0] : "";
}

// ---- E-sign the rate confirmation ----------------------------------------------------------------

export async function signRateCon(input: { loadId: string; name: string; title: string; signature: string; agreed: boolean }): Promise<Result> {
  const who = await requireBroker();
  if ("error" in who) return who;
  const { broker } = who;
  const admin = adminClient();

  const load = await ownedLoad(admin, broker.brokerId, input.loadId);
  if (!load) return { error: "That load isn't on your list." };
  if (!load.rate_con_sent) return { error: "The rate confirmation hasn't been sent for this load yet." };
  if (load.ratecon_signed_at) return { error: "This rate confirmation is already signed." };

  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3) return { error: "Type your full name." };
  if (!input.agreed) return { error: "Tick the box to agree to the rate confirmation." };
  const match = input.signature.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[1].length < 200) return { error: "Draw your signature in the box." };
  if (match[1].length > 600_000) return { error: "That signature is too large - clear it and sign again." };
  const signaturePng = new Uint8Array(Buffer.from(match[1], "base64"));

  const { data: docs } = await admin.from("load_documents").select("*").eq("load_id", load.id).eq("kind", "ratecon").order("created_at", { ascending: true });
  const pdfs = (docs ?? []).filter((d) => /\.pdf$/i.test(d.file_name as string) || d.content_type === "application/pdf");
  if (pdfs.length === 0) return { error: "The rate confirmation file isn't on this load yet - ask Harvest Best to attach it." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip");
  const userAgent = h.get("user-agent");
  const signedAt = new Date();
  const title = input.title.trim();
  const rateText = load.rate === null ? "as stated on the confirmation" : `$${Number(load.rate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const sigPath = `signatures/${load.id}/${crypto.randomUUID()}.png`;
  const { error: sigUploadError } = await admin.storage.from(BUCKET).upload(sigPath, Buffer.from(signaturePng), { contentType: "image/png" });
  if (sigUploadError) return { error: `Couldn't save your signature: ${sigUploadError.message}` };

  const signedDocs: Record<string, unknown>[] = [];
  for (const d of pdfs) {
    const { data: blob, error: dlError } = await admin.storage.from(BUCKET).download(d.storage_path as string);
    if (dlError || !blob) return { error: `Couldn't open ${d.file_name}: ${dlError?.message ?? "file missing"}` };
    let signed: Uint8Array;
    try {
      ({ pdf: signed } = await signRateConPdf({
        pdf: new Uint8Array(await blob.arrayBuffer()),
        signaturePng,
        signerName: name,
        signerTitle: title,
        signerEmail: broker.email,
        company: broker.brokerName,
        loadRef: loadRef(load),
        rateText,
        ip,
        userAgent,
        signedAt,
      }));
    } catch (e) {
      return { error: `Couldn't sign ${d.file_name}: ${e instanceof Error ? e.message : "unreadable PDF"}` };
    }
    const path = `signed/${load.id}/${crypto.randomUUID()}.pdf`;
    const { error: upError } = await admin.storage.from(BUCKET).upload(path, Buffer.from(signed), { contentType: "application/pdf" });
    if (upError) return { error: `Couldn't save the signed copy: ${upError.message}` };
    signedDocs.push({
      load_id: load.id,
      kind: "ratecon_signed",
      file_name: `SIGNED - ${d.file_name}`,
      storage_path: path,
      content_type: "application/pdf",
      size_bytes: signed.length,
      source: "carrier",
      parent_id: d.id,
      uploaded_by: name,
    });
  }

  const { error: sigError } = await admin.from("load_signatures").insert({
    load_id: load.id,
    broker_id: broker.brokerId,
    signer_name: name,
    signer_title: title || null,
    signer_email: broker.email,
    signer_user_id: broker.userId,
    signature_path: sigPath,
    rate_at_signing: load.rate,
    ip,
    user_agent: userAgent,
    signed_at: signedAt.toISOString(),
  });
  if (sigError) return { error: sigError.message };
  const { error: docError } = await admin.from("load_documents").insert(signedDocs);
  if (docError) return { error: docError.message };
  const { error: loadError } = await admin
    .from("loads")
    .update({ ratecon_signed_at: signedAt.toISOString(), ratecon_signed_by: title ? `${name}, ${title}` : name })
    .eq("id", load.id);
  if (loadError) return { error: loadError.message };

  refresh();
  return { ok: true, message: "Signed. A copy with your signature is saved on the load." };
}

// ---- Confirm the rate ----------------------------------------------------------------------------

export async function confirmRate(loadId: string): Promise<Result> {
  const who = await requireBroker();
  if ("error" in who) return who;
  const admin = adminClient();
  const load = await ownedLoad(admin, who.broker.brokerId, loadId);
  if (!load) return { error: "That load isn't on your list." };
  if (load.rate === null) return { error: "There's no rate on this load yet." };
  const { error } = await admin
    .from("loads")
    .update({
      rate_confirmed_at: new Date().toISOString(),
      rate_confirmed_by: who.broker.email.split("@")[0],
      rate_confirmed_amount: load.rate,
    })
    .eq("id", load.id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

// ---- ETA ------------------------------------------------------------------------------------------

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function etaText(date: string, time: string, note: string): string | null {
  const parts: string[] = [];
  if (date) {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    let when = `${DAYS[d.getUTCDay()]} ${Number(m[2])}/${Number(m[3])}`;
    const t = time.match(/^(\d{1,2}):(\d{2})$/);
    if (t) {
      const h = Number(t[1]);
      when += ` ${h % 12 === 0 ? 12 : h % 12}:${t[2]} ${h < 12 ? "AM" : "PM"}`;
    }
    parts.push(`ETA ${when}`);
  }
  if (note.trim()) parts.push(note.trim());
  return parts.length > 0 ? parts.join(" - ") : null;
}

export async function saveEta(input: { loadId: string; date: string; time: string; note: string }): Promise<Result> {
  const who = await requireBroker();
  if ("error" in who) return who;
  const admin = adminClient();
  const load = await ownedLoad(admin, who.broker.brokerId, input.loadId);
  if (!load) return { error: "That load isn't on your list." };
  if (load.status === "complete") return { error: "This load is already complete." };
  const text = etaText(input.date, input.time, input.note.slice(0, 300));
  if (!text) return { error: "Pick the date and time of the ETA, or type where the truck is." };
  const { error } = await admin
    .from("loads")
    .update({ eta_note: `${text} (carrier portal)`, eta_updated_at: new Date().toISOString(), eta_updated_by: who.broker.email.split("@")[0] })
    .eq("id", load.id);
  if (error) return { error: error.message };
  // Same as an ETA answered by email: the customer hears about it (if that agent is on).
  try {
    await triggerCustomerEta(serviceClient(), [load.id]);
  } catch {
    // the ETA is saved either way
  }
  refresh();
  return { ok: true };
}

// ---- Uploads (POD, charge receipts) ---------------------------------------------------------------

// Files go from the carrier's browser straight to storage (a server action's body is far too small
// for a set of photos), through one-time links created here for this load only.
export async function prepareUploads(input: { loadId: string; purpose: "pod" | "charge"; files: { name: string }[] }): Promise<{ uploads: { path: string; token: string }[] } | { error: string }> {
  const who = await requireBroker();
  if ("error" in who) return who;
  const admin = adminClient();
  const load = await ownedLoad(admin, who.broker.brokerId, input.loadId);
  if (!load) return { error: "That load isn't on your list." };
  if (input.purpose === "pod" && load.status === "complete") return { error: "This load is already complete." };
  if (input.files.length === 0 || input.files.length > 10) return { error: "Pick between 1 and 10 files." };
  const uploads: { path: string; token: string }[] = [];
  for (const f of input.files) {
    const path = `portal/${load.id}/${input.purpose}/${crypto.randomUUID()}${safeExt(f.name)}`;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: error?.message ?? "Couldn't start the upload." };
    uploads.push({ path, token: data.token });
  }
  return { uploads };
}

interface UploadedFile {
  path: string;
  name: string;
  type: string;
  size: number;
}

async function checkUploads(admin: ReturnType<typeof adminClient>, loadId: string, purpose: "pod" | "charge", files: UploadedFile[]): Promise<string | null> {
  if (files.length > 10) return "Too many files.";
  for (const f of files) {
    if (!f.path.startsWith(`portal/${loadId}/${purpose}/`)) return "That upload doesn't belong to this load.";
    const { error } = await admin.storage.from(BUCKET).createSignedUrl(f.path, 60);
    if (error) return `${f.name} didn't finish uploading - try again.`;
  }
  return null;
}

export async function submitPod(input: { loadId: string; files: UploadedFile[] }): Promise<Result> {
  const who = await requireBroker();
  if ("error" in who) return who;
  const { broker } = who;
  const admin = adminClient();
  const load = await ownedLoad(admin, broker.brokerId, input.loadId);
  if (!load) return { error: "That load isn't on your list." };
  if (load.status === "complete") return { error: "This load is already complete." };
  if (input.files.length === 0) return { error: "Attach the proof of delivery." };
  const bad = await checkUploads(admin, load.id, "pod", input.files);
  if (bad) return { error: bad };

  const { error: docError } = await admin.from("load_documents").insert(
    input.files.map((f) => ({
      load_id: load.id,
      kind: "pod",
      file_name: f.name.slice(0, 200),
      storage_path: f.path,
      content_type: f.type || null,
      size_bytes: f.size,
      source: "carrier",
      review_status: "pending",
      uploaded_by: broker.brokerName,
    })),
  );
  if (docError) return { error: docError.message };
  const { error } = await admin.from("loads").update({ pod_submitted_at: new Date().toISOString(), pod_rejected_note: null }).eq("id", load.id);
  if (error) return { error: error.message };

  await notifyStaff("POD uploaded by a carrier", `${broker.brokerName} uploaded a POD for ${loadRef(load)}. Review it and mark the load Delivered.`);
  refresh();
  return { ok: true, message: "POD sent. Harvest Best will review it and mark the load delivered." };
}

// ---- Charges ----------------------------------------------------------------------------------

export async function requestCharge(input: { loadId: string; kind: string; amount: number; note: string; files: UploadedFile[] }): Promise<Result> {
  const who = await requireBroker();
  if ("error" in who) return who;
  const { broker } = who;
  const admin = adminClient();
  const load = await ownedLoad(admin, broker.brokerId, input.loadId);
  if (!load) return { error: "That load isn't on your list." };
  if (!(PORTAL_CHARGE_KINDS as readonly string[]).includes(input.kind)) return { error: "Pick what the charge is for." };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) return { error: "Enter the amount of the charge." };
  const note = input.note.trim();
  if (note.length < 3) return { error: "Add a short explanation (what happened, where, how long)." };
  const bad = await checkUploads(admin, load.id, "charge", input.files);
  if (bad) return { error: bad };

  const { data: request, error } = await admin
    .from("broker_charge_requests")
    .insert({ load_id: load.id, broker_id: broker.brokerId, kind: input.kind, amount, note: note.slice(0, 1000), submitted_by: broker.email.split("@")[0] })
    .select("id")
    .single();
  if (error || !request) return { error: error?.message ?? "Couldn't save the charge." };
  if (input.files.length > 0) {
    await admin.from("load_documents").insert(
      input.files.map((f) => ({
        load_id: load.id,
        kind: "charge_support",
        file_name: f.name.slice(0, 200),
        storage_path: f.path,
        content_type: f.type || null,
        size_bytes: f.size,
        source: "carrier",
        charge_request_id: request.id,
        uploaded_by: broker.brokerName,
      })),
    );
  }

  await notifyStaff("Carrier charge to approve", `${broker.brokerName} asked for ${input.kind} $${amount.toFixed(2)} on ${loadRef(load)}: ${note.slice(0, 160)}`);
  refresh();
  return { ok: true, message: "Sent for approval." };
}

// A charge the carrier asked for can be taken back while it is still waiting.
export async function withdrawCharge(id: string): Promise<Result> {
  const who = await requireBroker();
  if ("error" in who) return who;
  const admin = adminClient();
  const { data: req } = await admin.from("broker_charge_requests").select("id, status, broker_id").eq("id", id).maybeSingle();
  if (!req || req.broker_id !== who.broker.brokerId) return { error: "That charge isn't on your list." };
  if (req.status !== "pending") return { error: "That charge has already been reviewed." };
  const { error } = await admin.from("broker_charge_requests").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}
