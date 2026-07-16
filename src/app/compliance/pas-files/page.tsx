import { createClient } from "@/lib/supabase/server";
import type { PasFile } from "@/lib/types";
import PasFilesClient from "./PasFilesClient";

export const dynamic = "force-dynamic";

export default async function PasFilesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.from("pas_files").select("*").order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load PAS Files: {error.message}</p>;
  }

  return <PasFilesClient initialItems={(data ?? []) as PasFile[]} />;
}
