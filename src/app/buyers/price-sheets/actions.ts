"use server";

import { revalidatePath } from "next/cache";
// The legacy Node build talks straight to the text layer - no browser DOM,
// no worker thread, and (unlike the "pdf-parse" wrapper package) no hard
// dependency on a native canvas binary, which is what broke PDF upload in
// the deployed app: that binary got dropped during Vercel's serverless
// bundling even though local `next dev` had no trouble finding it.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createClient } from "@/lib/supabase/server";
import type { ParsedPriceSheetItem } from "@/lib/priceSheetParse";
import type { PriceSheetItem, Vendor } from "@/lib/types";

// Pulls the plain text layer out of an uploaded PDF so it can run through
// the exact same parsePriceSheetPaste() + editable preview as a WhatsApp
// paste. Only works as well as the PDF's underlying text stream: a
// word-processor-style sheet extracts in clean reading order, but a
// graphic/flyer layout with absolutely-positioned table cells (common for
// vendor "quote sheet" flyers) extracts scrambled - there's no reliable way
// to detect that ahead of time, so this always returns whatever text comes
// out and lets the same editable preview be the catch for a bad result.
//
// Returns a discriminated result instead of throwing: Next.js redacts a
// thrown Error's message from a Server Action in production by default, so
// a real failure would otherwise show up client-side as an opaque,
// undiagnosable message.
export async function extractPdfText(formData: FormData): Promise<{ text: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof Blob)) return { error: "No file received." };

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
    }
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function revalidateAll() {
  revalidatePath("/buyers/price-sheets");
  revalidatePath("/buyers/vendor-catalog");
}

export async function createVendor(name: string): Promise<Vendor> {
  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("vendors")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow as { position: number } | null)?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("vendors")
    .insert({ name, position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidateAll();
  return data as Vendor;
}

// Full-replaces this vendor's current sheet (old rows deleted, new ones
// inserted), bumps their sheet_date, and permanently records every category
// seen on this paste in vendor_commodities - that table is never trimmed
// here, so a vendor stays listed as a seller of a commodity in the Vendor
// Catalog even after a later sheet drops it.
export async function importPriceSheet(
  vendorId: string,
  items: ParsedPriceSheetItem[],
  sheetDate: string,
): Promise<PriceSheetItem[]> {
  const supabase = await createClient();

  const { error: deleteError } = await supabase.from("price_sheet_items").delete().eq("vendor_id", vendorId);
  if (deleteError) throw new Error(deleteError.message);

  if (items.length > 0) {
    const { error: insertError } = await supabase.from("price_sheet_items").insert(
      items.map((item, i) => ({
        vendor_id: vendorId,
        category: item.category,
        item_label: item.itemLabel,
        size: item.size || null,
        price: item.price,
        position: i,
      })),
    );
    if (insertError) throw new Error(insertError.message);

    const categories = Array.from(new Set(items.map((i) => i.category)));
    const { error: commodityError } = await supabase
      .from("vendor_commodities")
      .upsert(
        categories.map((category) => ({ vendor_id: vendorId, category })),
        { onConflict: "vendor_id,category", ignoreDuplicates: true },
      );
    if (commodityError) throw new Error(commodityError.message);
  }

  const { error: vendorError } = await supabase.from("vendors").update({ sheet_date: sheetDate }).eq("id", vendorId);
  if (vendorError) throw new Error(vendorError.message);

  const { data: finalItems, error: finalError } = await supabase
    .from("price_sheet_items")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("position", { ascending: true });
  if (finalError) throw new Error(finalError.message);

  revalidateAll();
  return (finalItems ?? []) as PriceSheetItem[];
}

export async function updatePriceSheetItem(
  id: string,
  patch: Partial<Pick<PriceSheetItem, "category" | "item_label" | "size" | "price">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("price_sheet_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deletePriceSheetItem(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("price_sheet_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// The is_unknown=false guard means a stray Delete Vendor click on the
// seeded Unknown/TBD vendor (which the UI hides the button for anyway)
// quietly deletes zero rows instead of erroring.
export async function deleteVendor(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("vendors").delete().eq("id", id).eq("is_unknown", false);
  if (error) throw new Error(error.message);
  revalidateAll();
}
