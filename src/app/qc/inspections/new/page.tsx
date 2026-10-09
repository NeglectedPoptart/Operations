import { createClient } from "@/lib/supabase/server";
import type { QcPlan } from "@/lib/qcPlans";
import NewInspectionClient from "./NewInspectionClient";

export const dynamic = "force-dynamic";

export default async function NewInspectionPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qc_plans")
    .select("*")
    .eq("active", true)
    .order("commodity")
    .order("name");

  if (error) {
    return (
      <p className="text-red-600">
        Failed to load inspection plans: {error.message}. If this is the first time, run migrations 134 and 135 in Supabase.
      </p>
    );
  }
  // The pick-lists for the header fields. If the table isn't there yet the
  // form still works with typed entries.
  const { data: optionRows } = await supabase.from("qc_field_options").select("field_key, value").order("value", { ascending: true });
  const fieldOptions: Record<string, string[]> = {};
  for (const o of optionRows ?? []) {
    const key = o.field_key as string;
    (fieldOptions[key] ??= []).push(o.value as string);
  }
  return <NewInspectionClient plans={(data ?? []) as QcPlan[]} fieldOptions={fieldOptions} listsReady={optionRows !== null} />;
}
