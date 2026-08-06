"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MarketingFile, MarketingTask } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/marketing/assets");
}

// Uploads straight to the public "marketing-assets" bucket (migration 046) -
// these are brand/packaging previews, not sensitive, so a stable public URL
// is simpler than juggling signed URLs for every render.
export async function uploadMarketingFile(formData: FormData, label: string | null): Promise<MarketingFile> {
  const file = formData.get("file");
  if (!(file instanceof Blob)) throw new Error("No file received.");
  const fileName = file instanceof File ? file.name : "upload";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
  const storagePath = `${crypto.randomUUID()}${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("marketing-assets")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { data: row, error: insertError } = await supabase
    .from("marketing_files")
    .insert({
      file_name: fileName,
      storage_path: storagePath,
      content_type: file.type || null,
      size_bytes: file.size,
      label: label?.trim() || null,
      uploaded_by: user?.id ?? null,
    })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);

  revalidateAll();
  return row as MarketingFile;
}

export async function deleteMarketingFile(id: string, storagePath: string) {
  const supabase = await createClient();
  await supabase.storage.from("marketing-assets").remove([storagePath]);
  const { error } = await supabase.from("marketing_files").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateMarketingFileLabel(id: string, label: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketing_files")
    .update({ label: label.trim() || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function addMarketingTask(name: string): Promise<MarketingTask> {
  const supabase = await createClient();
  const { data: maxRow } = await supabase
    .from("marketing_tasks")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow as { position: number } | null)?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("marketing_tasks")
    .insert({ name: name.trim(), position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidateAll();
  return data as MarketingTask;
}

export async function updateMarketingTask(
  id: string,
  patch: Partial<Pick<MarketingTask, "name" | "status" | "notes">>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("marketing_tasks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function deleteMarketingTask(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("marketing_tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function updateMarketingNotes(id: string, notes: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("marketing_notes").update({ notes }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}
