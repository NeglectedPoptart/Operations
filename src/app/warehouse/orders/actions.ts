"use server";

import { revalidatePath } from "next/cache";
import { getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { parseOrdersReport, type ParsedOrder, type PdfRow, type PendingOrder } from "@/lib/pendingOrders";

function revalidateAll() {
  revalidatePath("/warehouse/orders");
}

async function currentName(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Unknown";
  const { data: emp } = await supabase.from("employees").select("name").eq("linked_user_id", user.id).maybeSingle();
  return (emp?.name as string | undefined)?.trim() || (user.email ?? "Unknown").split("@")[0];
}

export interface OrdersReadResult {
  fileName: string;
  parameters: string;
  orders: ParsedOrder[];
  warnings: string[];
  added: number;
  updated: number;
  newlyShipped: string[];
  // On the page but not on this report: probably deleted (or filtered out).
  missing: { id: string; order_no: string; customer: string; ship_date: string | null }[];
}

// The report's own filters ("From: 10/6/2026; To: 10/9/2026; WHse : All") so an
// order outside them isn't mistaken for a deleted one.
function reportScope(parameters: string): { from: string | null; to: string | null; whse: string | null } {
  const iso = (m: RegExpMatchArray | null) => (m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null);
  const from = iso(parameters.match(/From\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i));
  const to = iso(parameters.match(/To\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i));
  const w = parameters.match(/WHse\s*:\s*([^;]+)/i)?.[1]?.trim() ?? "";
  return { from, to, whse: !w || /^all$/i.test(w) ? null : w };
}

// Reads the uploaded PDF and shows what loading it would change. Saves nothing.
export async function readOrdersPdf(formData: FormData): Promise<{ error: string } | OrdersReadResult> {
  const file = formData.get("file");
  if (!(file instanceof Blob)) return { error: "No file received." };

  let rows: PdfRow[] = [];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines: PdfRow[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = item.transform[5];
        let line = lines.find((l) => Math.abs(l.y - y) < 2);
        if (!line) {
          line = { y, cells: [] };
          lines.push(line);
        }
        line.cells.push({ x: item.transform[4], w: item.width, str: item.str });
      }
      lines.sort((a, b) => b.y - a.y);
      rows = rows.concat(lines);
    }
  } catch (err) {
    return { error: `Couldn't read that PDF: ${err instanceof Error ? err.message : String(err)}` };
  }

  const parsed = parseOrdersReport(rows);
  if (parsed.orders.length === 0) return { error: parsed.warnings[0] ?? "No orders found in that PDF." };

  const supabase = await createClient();
  const { data: existing, error } = await supabase.from("pending_orders").select("id, order_no, customer_code, customer_name, ship_date, warehouse, shipped");
  if (error) return { error: error.message };

  const have = new Map((existing ?? []).map((o) => [o.order_no as string, o]));
  const onReport = new Set(parsed.orders.map((o) => o.order_no));
  let added = 0;
  let updated = 0;
  const newlyShipped: string[] = [];
  for (const o of parsed.orders) {
    const was = have.get(o.order_no);
    if (!was) added++;
    else {
      updated++;
      if (Number(was.shipped) === 0 && o.shipped > 0) newlyShipped.push(o.order_no);
    }
    if (!was && o.shipped > 0) newlyShipped.push(o.order_no);
  }

  const scope = reportScope(parsed.parameters);
  const missing = (existing ?? [])
    .filter((o) => !onReport.has(o.order_no as string))
    .filter((o) => {
      const d = o.ship_date as string | null;
      if (scope.from && d && d < scope.from) return false;
      if (scope.to && d && d > scope.to) return false;
      if (scope.whse && o.warehouse && !(o.warehouse as string).toLowerCase().startsWith(scope.whse.toLowerCase())) return false;
      return true;
    })
    .map((o) => ({
      id: o.id as string,
      order_no: o.order_no as string,
      customer: ((o.customer_name as string | null) || (o.customer_code as string | null) || "").trim(),
      ship_date: o.ship_date as string | null,
    }));

  return {
    fileName: (file as File).name ?? "orders.pdf",
    parameters: parsed.parameters,
    orders: parsed.orders,
    warnings: parsed.warnings,
    added,
    updated,
    newlyShipped,
    missing,
  };
}

// Loads the report: new orders are added, existing ones refreshed (notes, colour,
// greyed and moved-to are kept), orders that just shipped are greyed out, and
// the ones the user ticked as deleted are removed.
export async function importOrdersReport(input: {
  orders: ParsedOrder[];
  removeIds: string[];
  fileName: string;
  parameters: string;
}): Promise<{ error: string } | { added: number; updated: number; removed: number }> {
  const supabase = await createClient();
  const { orders, removeIds } = input;
  if (orders.length === 0) return { error: "Nothing to import." };

  const { data: existing, error: readError } = await supabase.from("pending_orders").select("order_no, shipped, greyed");
  if (readError) return { error: readError.message };
  const have = new Map((existing ?? []).map((o) => [o.order_no as string, o]));

  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  const payload = orders.map((o) => {
    const was = have.get(o.order_no);
    if (was) updated++;
    else added++;
    // A shipped quantity appearing greys the order out (it can be switched back by hand).
    const greyed = (was?.greyed as boolean | undefined) || ((!was || Number(was.shipped) === 0) && o.shipped > 0);
    return {
      order_no: o.order_no,
      warehouse: o.warehouse,
      ship_date: o.ship_date,
      status: o.status,
      customer_code: o.customer_code,
      customer_name: o.customer_name,
      salesperson: o.salesperson,
      terms: o.terms,
      truck: o.truck,
      freight: o.freight,
      ordered: o.ordered,
      shipped: o.shipped,
      greyed,
      last_seen_at: now,
      updated_at: now,
    };
  });

  const { error: upsertError } = await supabase.from("pending_orders").upsert(payload, { onConflict: "order_no" });
  if (upsertError) return { error: upsertError.message };

  let removed = 0;
  if (removeIds.length > 0) {
    const { error: deleteError } = await supabase.from("pending_orders").delete().in("id", removeIds);
    if (deleteError) return { error: deleteError.message };
    removed = removeIds.length;
  }

  await supabase.from("order_report_meta").upsert({
    id: 1,
    uploaded_at: now,
    uploaded_by: await currentName(),
    source_file: input.fileName,
    report_parameters: input.parameters,
    order_count: orders.length,
  });

  revalidateAll();
  return { added, updated, removed };
}

export async function updateOrder(
  id: string,
  patch: { notes?: string; legend_id?: string | null; greyed?: boolean; moved_to?: string | null },
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pending_orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function deleteOrder(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const { error } = await supabase.from("pending_orders").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function saveLegendItem(input: {
  id?: string;
  name: string;
  color: string;
  opacity: number;
  position?: number;
}): Promise<{ error: string } | { id: string }> {
  const supabase = await createClient();
  const color = /^#[0-9a-f]{6}$/i.test(input.color) ? input.color.toLowerCase() : "#facc15";
  const opacity = Math.min(1, Math.max(0.05, Number.isFinite(input.opacity) ? input.opacity : 0.45));
  const row = { name: input.name.trim() || "Untitled", color, opacity };
  if (input.id) {
    const { error } = await supabase.from("order_legend").update(row).eq("id", input.id);
    if (error) return { error: error.message };
    revalidateAll();
    return { id: input.id };
  }
  const { data, error } = await supabase
    .from("order_legend")
    .insert({ ...row, position: input.position ?? 0 })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Couldn't add the colour." };
  revalidateAll();
  return { id: data.id as string };
}

export async function deleteLegendItem(id: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const { error } = await supabase.from("order_legend").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateAll();
  return { ok: true };
}

// Re-reads the orders (the page refreshes this after the report is loaded).
export async function listOrders(): Promise<PendingOrder[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("pending_orders").select("*").order("ship_date", { ascending: true }).order("order_no", { ascending: true });
  return (data ?? []) as PendingOrder[];
}
