import { createClient } from "@/lib/supabase/server";
import { canEditLayouts } from "@/lib/roles";
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

  // The column widths an Admin saved, and whether this person can change them.
  // Neither may ever stop the page from loading (the table comes from migration 141).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
  const canEditLayout = canEditLayouts((profile?.role as string | null) ?? null, user?.email ?? null);
  const { data: layout } = await supabase.from("ui_layouts").select("value").eq("key", "qc-inspections-columns").maybeSingle();

  return (
    <QcInspectionsClient
      initialItems={(data ?? []) as QcInspection[]}
      savedWidths={(layout?.value as Record<string, number> | null) ?? null}
      canEditLayout={canEditLayout}
    />
  );
}
