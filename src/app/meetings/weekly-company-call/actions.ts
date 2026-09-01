"use server";

// unpdf wraps pdf.js specifically for serverless/edge runtimes - see the
// same extraction in buyers/price-sheets/actions.ts for why (avoids a
// worker-file path Vercel's bundler can't resolve at runtime). Duplicated
// here rather than imported cross-page since every other page with a PDF
// upload (Price Sheets, Logistics Board) keeps its own copy in its own
// actions.ts.
import { extractText, getDocumentProxy } from "unpdf";

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
