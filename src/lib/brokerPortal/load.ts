import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalCharge, PortalDoc, PortalLoad, PortalPod } from "./types";

interface DocRow {
  id: string;
  load_id: string;
  kind: string;
  file_name: string;
  storage_path: string;
  review_status: "pending" | "approved" | "rejected" | null;
  review_note: string | null;
  charge_request_id: string | null;
  created_at: string;
}

// One carrier company's loads for the Broker Pending List: everything not yet complete, plus what
// completed in the last 30 days (so a POD that was just approved, or a late charge, is still there).
// Reads through the service-role client, always filtered to this company.
export async function loadPortalLoads(admin: SupabaseClient, brokerId: string): Promise<PortalLoad[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: loads, error } = await admin
    .from("loads")
    .select("*, load_stops(*), load_pickups(*)")
    .eq("broker_id", brokerId)
    .or(`status.neq.complete,updated_at.gte.${since}`)
    .order("loading_date", { ascending: true })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = (loads ?? []) as Record<string, unknown>[];
  const ids = rows.map((l) => l.id as string);
  if (ids.length === 0) return [];

  // Each of these comes from the portal migration - a missing table just means nothing to show yet.
  const [docsRes, chargesRes] = await Promise.all([
    admin.from("load_documents").select("*").in("load_id", ids).order("created_at", { ascending: true }),
    admin.from("broker_charge_requests").select("*").in("load_id", ids).order("submitted_at", { ascending: true }),
  ]);
  const docs = (docsRes.error ? [] : docsRes.data ?? []) as DocRow[];
  const charges = (chargesRes.error ? [] : chargesRes.data ?? []) as Record<string, unknown>[];

  // Rate confirmations, their signed copies, PODs and charge receipts, each with a short-lived link.
  const visible = docs.filter((d) => ["ratecon", "ratecon_signed", "pod", "charge_support"].includes(d.kind));
  const urlByPath = new Map<string, string>();
  if (visible.length > 0) {
    const { data: signed } = await admin.storage.from("load-documents").createSignedUrls(
      visible.map((d) => d.storage_path),
      3600,
    );
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }
  const asDoc = (d: DocRow): PortalDoc => ({ id: d.id, name: d.file_name, url: urlByPath.get(d.storage_path) ?? null, createdAt: d.created_at });

  return rows.map((l) => {
    const id = l.id as string;
    const mine = docs.filter((d) => d.load_id === id);
    const stops = [...((l.load_stops as Record<string, unknown>[]) ?? [])].sort((a, b) => (a.position as number) - (b.position as number));
    const pickups = [...((l.load_pickups as Record<string, unknown>[]) ?? [])].sort((a, b) => (a.position as number) - (b.position as number));
    const chargeRows: PortalCharge[] = charges
      .filter((c) => c.load_id === id)
      .map((c) => ({
        id: c.id as string,
        kind: c.kind as string,
        amount: Number(c.amount),
        note: (c.note as string | null) ?? null,
        status: c.status as PortalCharge["status"],
        submittedAt: c.submitted_at as string,
        reviewNote: (c.review_note as string | null) ?? null,
        files: mine.filter((d) => d.kind === "charge_support" && d.charge_request_id === c.id).map(asDoc),
      }));
    return {
      id,
      status: l.status as PortalLoad["status"],
      loadingDate: (l.loading_date as string | null) ?? null,
      source: (l.source as string | null) ?? null,
      ready: Boolean(l.ready_to_load),
      rate: l.rate === null || l.rate === undefined ? null : Number(l.rate),
      rateConSent: Boolean(l.rate_con_sent),
      pickups: pickups.map((p) => ({ puNumber: (p.pu_number as string | null) ?? null, vendor: (p.vendor as string | null) ?? null, location: (p.location as string | null) ?? null })),
      stops: stops.map((s) => ({
        orderNumber: (s.order_number as string | null) ?? null,
        poNumber: (s.po_number as string | null) ?? null,
        client: (s.client_name as string | null) ?? null,
        destination: [s.destination_city, s.destination_state].filter(Boolean).join(", "),
        deliveryDate: (s.delivery_date as string | null) ?? null,
        deliveryTime: (s.delivery_time as string | null) ?? null,
        appointment: (s.appointment as string | null) ?? null,
      })),
      etaNote: (l.eta_note as string | null) ?? null,
      etaUpdatedAt: (l.eta_updated_at as string | null) ?? null,
      etaUpdatedBy: (l.eta_updated_by as string | null) ?? null,
      signedAt: (l.ratecon_signed_at as string | null) ?? null,
      signedBy: (l.ratecon_signed_by as string | null) ?? null,
      rateConfirmedAt: (l.rate_confirmed_at as string | null) ?? null,
      rateConfirmedBy: (l.rate_confirmed_by as string | null) ?? null,
      rateConfirmedAmount: l.rate_confirmed_amount === null || l.rate_confirmed_amount === undefined ? null : Number(l.rate_confirmed_amount),
      podSubmittedAt: (l.pod_submitted_at as string | null) ?? null,
      podRejectedNote: (l.pod_rejected_note as string | null) ?? null,
      // The original rate con, except ones that already have a signed copy shown below it.
      rateCons: mine.filter((d) => d.kind === "ratecon").map(asDoc),
      signedCopies: mine.filter((d) => d.kind === "ratecon_signed").map(asDoc),
      pods: mine
        .filter((d) => d.kind === "pod")
        .map((d): PortalPod => ({ ...asDoc(d), status: d.review_status, note: d.review_note })),
      charges: chargeRows,
    };
  });
}
