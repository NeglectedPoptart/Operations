import { createClient } from "@/lib/supabase/server";
import type { PasFile } from "@/lib/types";
import PasFilesClient from "./PasFilesClient";

export const dynamic = "force-dynamic";

export default async function PasFilesPage() {
  const supabase = await createClient();

  const [{ data, error }, { data: pendingData, error: pendingError }] = await Promise.all([
    supabase.from("pas_files").select("*").order("position", { ascending: true }),
    supabase.from("pending_to_invoice").select("order_no, po"),
  ]);

  if (error) {
    return <p className="text-red-600">Failed to load PAS Files: {error.message}</p>;
  }
  if (pendingError) {
    return <p className="text-red-600">Failed to load Pending to Invoice: {pendingError.message}</p>;
  }

  return (
    <PasFilesClient
      initialItems={(data ?? []) as PasFile[]}
      existingPendingKeys={(pendingData ?? []).map((r) => `${r.order_no.trim().toLowerCase()}|${(r.po ?? "").trim().toLowerCase()}`)}
    />
  );
}
