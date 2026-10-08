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
  return <NewInspectionClient plans={(data ?? []) as QcPlan[]} />;
}
