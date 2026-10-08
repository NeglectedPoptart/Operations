import { createClient } from "@/lib/supabase/server";
import type { QcPlan } from "@/lib/qcPlans";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function QcDashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("qc_plans").select("*").order("commodity").order("name");
  if (error) {
    return (
      <p className="text-red-600">
        Failed to load the Quality Dashboard: {error.message}. If this is the first time, run migrations 134 and 135 in Supabase.
      </p>
    );
  }
  return <DashboardClient plans={(data ?? []) as QcPlan[]} />;
}
