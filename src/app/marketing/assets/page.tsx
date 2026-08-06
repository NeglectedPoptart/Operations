import { createClient } from "@/lib/supabase/server";
import type { MarketingFile, MarketingTask } from "@/lib/types";
import MarketingClient from "./MarketingClient";

export const dynamic = "force-dynamic";

export default async function MarketingAssetsPage() {
  const supabase = await createClient();

  const [{ data: files, error: filesError }, { data: tasks, error: tasksError }, { data: notesRow, error: notesError }] =
    await Promise.all([
      supabase.from("marketing_files").select("*").order("created_at", { ascending: false }),
      supabase.from("marketing_tasks").select("*").order("position", { ascending: true }),
      supabase.from("marketing_notes").select("*").limit(1).maybeSingle(),
    ]);

  if (filesError) {
    return <p className="text-red-600">Failed to load files: {filesError.message}</p>;
  }
  if (tasksError) {
    return <p className="text-red-600">Failed to load tasks: {tasksError.message}</p>;
  }
  if (notesError) {
    return <p className="text-red-600">Failed to load notes: {notesError.message}</p>;
  }

  const fileUrls: Record<string, string> = {};
  for (const file of (files ?? []) as MarketingFile[]) {
    fileUrls[file.id] = supabase.storage.from("marketing-assets").getPublicUrl(file.storage_path).data.publicUrl;
  }

  return (
    <MarketingClient
      initialFiles={(files ?? []) as MarketingFile[]}
      fileUrls={fileUrls}
      initialTasks={(tasks ?? []) as MarketingTask[]}
      notesId={(notesRow as { id: string; notes: string } | null)?.id ?? null}
      initialNotes={(notesRow as { id: string; notes: string } | null)?.notes ?? ""}
    />
  );
}
