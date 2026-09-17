"use server";

import { createClient } from "@/lib/supabase/server";
import type { CompanyDocument, DocumentCategory } from "@/lib/types";

// No revalidatePath in this file - see employee-files/actions.ts for why
// (granular updates while someone's mid-edit shouldn't force a remount).
// The page is force-dynamic, so a later visit fetches fresh data anyway.

export async function createDocumentCategory(name: string, nextPosition: number): Promise<DocumentCategory> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_categories")
    .insert({ name: name.trim(), position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as DocumentCategory;
}

// The file's bytes are already in Storage by the time this runs (uploaded
// straight from the browser, same reasoning as Employee Files/Marketing
// Assets - a Server Action's request body is capped at ~4.5MB on Vercel
// regardless of Next.js config). This only records the metadata.
export async function recordCompanyDocument(input: {
  categoryId: string;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number;
  nextPosition: number;
}): Promise<CompanyDocument> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_documents")
    .insert({
      category_id: input.categoryId,
      file_name: input.fileName,
      storage_path: input.storagePath,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      position: input.nextPosition,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CompanyDocument;
}

export async function renameDocumentCategory(id: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("document_categories").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function renameCompanyDocument(id: string, fileName: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("company_documents").update({ file_name: fileName }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCompanyDocument(id: string, storagePath: string) {
  const supabase = await createClient();
  await supabase.storage.from("company-documents").remove([storagePath]);
  const { error } = await supabase.from("company_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
