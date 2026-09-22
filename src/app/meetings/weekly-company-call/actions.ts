"use server";

// unpdf wraps pdf.js specifically for serverless/edge runtimes - see the
// same extraction in buyers/price-sheets/actions.ts for why (avoids a
// worker-file path Vercel's bundler can't resolve at runtime). Duplicated
// here rather than imported cross-page since every other page with a PDF
// upload (Price Sheets, Logistics Board) keeps its own copy in its own
// actions.ts.
import { extractText, getDocumentProxy } from "unpdf";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

export interface WeeklySalesOrdersReportInfo {
  rawText: string | null;
  updatedByEmail: string | null;
  updatedAt: string | null;
}

// Persists whatever the Operations Coordinator just ran Analyze on as the
// one current snapshot (always the same report_key), so everyone else
// opening this page sees the same already-analyzed report instead of a
// blank paste box - see migration_112_weekly_sales_orders_report.sql.
export async function saveWeeklySalesOrdersReport(rawText: string): Promise<WeeklySalesOrdersReportInfo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("weekly_sales_orders_report")
    .upsert({ report_key: "current", raw_text: rawText, updated_by: user?.id ?? null, updated_at: now }, { onConflict: "report_key" });
  if (error) throw new Error(error.message);

  let updatedByEmail: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
    updatedByEmail = (profile?.email as string | null) ?? user.email ?? null;
  }

  revalidatePath("/meetings/weekly-company-call");
  return { rawText, updatedByEmail, updatedAt: now };
}
