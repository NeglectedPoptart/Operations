import { createClient } from "@/lib/supabase/server";
import type { QcInspection } from "@/lib/types";
import QcInspectionsClient from "./QcInspectionsClient";

export const dynamic = "force-dynamic";

export default async function QcInspectionsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("qc_inspections")
    .select("*")
    .order("entry_date", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load QC Inspections: {error.message}</p>;
  }

  return <QcInspectionsClient initialItems={(data ?? []) as QcInspection[]} />;
}
