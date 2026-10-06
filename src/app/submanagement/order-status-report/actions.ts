"use server";

// unpdf wraps pdf.js specifically for serverless/edge runtimes (avoids a
// worker-file path Vercel's bundler can't resolve at runtime) - duplicated
// per-page rather than shared, matching every other page with a PDF upload
// (Price Sheets, Logistics Board, Weekly Company Call, Old Age).
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
