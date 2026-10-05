"use server";

import { revalidatePath } from "next/cache";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { isPasRow, type ParsedPasFileRow } from "@/lib/pasFilesParse";
import type { PasFile } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function revalidateAll() {
  revalidatePath("/compliance/pas-files");
  revalidatePath("/accounting/pending-to-invoice");
}

export async function extractPdfText(formData: FormData): Promise<{ text: string } | { error: string }> {
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

function matchKey(orderNo: string, po: string): string {
  return `${orderNo.trim().toLowerCase()}|${po.trim().toLowerCase()}`;
}

type PasTable = "pas_files" | "pending_to_invoice";

// The fields that come straight from the ERP report. Refreshed on a row that
// is already here; the hand-entered ones (update_notes, last_contact,
// highlight) and position are never touched.
function erpFields(row: ParsedPasFileRow) {
  return {
    po: row.po,
    customer: row.customer,
    slp: row.slp,
    order_date: row.order_date,
    ship_date: row.ship_date,
    ship_qty: row.ship_qty,
    fob_amt: row.fob_amt,
    whse: row.whse,
    status: row.status,
    order_type: row.order_type,
    sales_type: row.sales_type,
  };
}

// Syncs one of the two running lists (pas_files / pending_to_invoice) with
// the report. A report row is matched to an existing row by order number
// (and PO when an order number appears more than once); a match is refreshed
// from the report, anything unmatched is inserted. Matching on order number
// first matters because an order's PO can change between reports - keying on
// order number + PO alone treated that as a brand new row and left a stale
// duplicate behind.
async function syncRows(supabase: SupabaseClient, table: PasTable, rows: ParsedPasFileRow[]) {
  if (rows.length === 0) return { inserted: [], updated: [] };

  const { data: existing, error: existingError } = await supabase.from(table).select("id, order_no, po, position");
  if (existingError) throw new Error(existingError.message);

  const existingRows = existing ?? [];
  const existingByKey = new Map(existingRows.map((r) => [matchKey(r.order_no, r.po ?? ""), r]));
  const existingByOrder = new Map<string, typeof existingRows>();
  for (const r of existingRows) {
    const k = r.order_no.trim().toLowerCase();
    existingByOrder.set(k, [...(existingByOrder.get(k) ?? []), r]);
  }
  const incomingOrderCounts = new Map<string, number>();
  for (const row of rows) {
    const k = row.order_no.trim().toLowerCase();
    incomingOrderCounts.set(k, (incomingOrderCounts.get(k) ?? 0) + 1);
  }

  let nextPosition = existingRows.reduce((max, r) => Math.max(max, r.position), 0) + 1;
  const seenInBatch = new Set<string>();
  const toInsert: (ParsedPasFileRow & { position: number })[] = [];
  const toUpdate: { id: string; fields: ReturnType<typeof erpFields> }[] = [];
  const updatedIds = new Set<string>();

  for (const row of rows) {
    const key = matchKey(row.order_no, row.po);
    if (seenInBatch.has(key)) continue;
    seenInBatch.add(key);

    const orderKey = row.order_no.trim().toLowerCase();
    const sameOrder = existingByOrder.get(orderKey) ?? [];
    const match =
      existingByKey.get(key) ?? (incomingOrderCounts.get(orderKey) === 1 && sameOrder.length === 1 ? sameOrder[0] : undefined);

    if (match) {
      if (!updatedIds.has(match.id)) {
        updatedIds.add(match.id);
        toUpdate.push({ id: match.id, fields: erpFields(row) });
      }
    } else {
      toInsert.push({ ...row, position: nextPosition++ });
    }
  }

  const updated = [];
  for (const u of toUpdate) {
    const { data, error } = await supabase.from(table).update(u.fields).eq("id", u.id).select().single();
    if (error) throw new Error(error.message);
    updated.push(data);
  }

  let inserted: typeof updated = [];
  if (toInsert.length > 0) {
    const { data, error } = await supabase.from(table).insert(toInsert).select();
    if (error) throw new Error(error.message);
    inserted = data ?? [];
  }
  return { inserted, updated };
}

// Splits the full pending-to-invoice export in two: rows marked PAS
// (on PO or Order Type) go to PAS Files, everything else goes to Sales ->
// Pending to Invoice. Each destination syncs independently.
export async function importPendingList(rows: ParsedPasFileRow[]) {
  const supabase = await createClient();
  const pasRows = rows.filter(isPasRow);
  const invoiceRows = rows.filter((r) => !isPasRow(r));

  const [pas, invoice] = await Promise.all([
    syncRows(supabase, "pas_files", pasRows),
    syncRows(supabase, "pending_to_invoice", invoiceRows),
  ]);

  revalidateAll();
  return {
    pasFiles: pas.inserted,
    pasUpdated: pas.updated,
    pendingToInvoice: invoice.inserted,
    pendingUpdated: invoice.updated,
  };
}

export async function addPasFileRow(nextPosition: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pas_files")
    .insert({ position: nextPosition, order_no: "" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data;
}

export async function updatePasFileRow(id: string, patch: Partial<Omit<PasFile, "id" | "created_at" | "updated_at">>) {
  const supabase = await createClient();
  const { error } = await supabase.from("pas_files").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deletePasFileRow(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pas_files").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
