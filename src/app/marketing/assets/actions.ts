"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MarketingFile, MarketingTask } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/marketing/assets");
}

// The actual file bytes never come through this action - Vercel's
// serverless functions cap a request body at ~4.5MB regardless of Next.js's
// own serverActions.bodySizeLimit config, which only governs Next's own
// parsing and can't override the platform ceiling underneath it. A 14.6MB
// PDF (a real one a user hit) blew straight through that and came back as
// an opaque "unexpected response" rather than a clean error. Fixed by
// uploading directly from the browser to Supabase Storage (client.ts, same
// anon key + RLS as everywhere else) and only sending this action the
// resulting metadata to record.
export async function recordMarketingFile(input: {
  fileName: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number;
  label: string | null;
  category: string | null;
}): Promise<MarketingFile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row, error } = await supabase
    .from("marketing_files")
    .insert({
      file_name: input.fileName,
      storage_path: input.storagePath,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      label: input.label?.trim() || null,
      category: input.category?.trim() || null,
      uploaded_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

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

export async function updateMarketingFileCategory(id: string, category: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("marketing_files")
    .update({ category: category.trim() || null })
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
  patch: Partial<Pick<MarketingTask, "name" | "status" | "notes" | "assigned_to">>,
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
