import { createClient } from "@/lib/supabase/server";
import { canEditQcPlans } from "@/lib/roles";
import type { QcPlan } from "@/lib/qcPlans";
import PlansClient from "./PlansClient";

export const dynamic = "force-dynamic";

export default async function QcPlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };

  if (!canEditQcPlans((profile?.role as string | null) ?? null, user?.email ?? null)) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Inspection plans can only be changed by the Quality Control Manager.
      </p>
    );
  }

  const { data, error } = await supabase.from("qc_plans").select("*").order("position", { ascending: true }).order("name");
  if (error) {
    return (
      <p className="text-red-600">
        Failed to load Inspection Plans: {error.message}. If this is the first time, run migration 134 in Supabase.
      </p>
    );
  }
  // The shared Commodity pick-list (see migration 138/139); typed entry still works without it.
  const { data: commodityRows } = await supabase.from("qc_field_options").select("value").eq("field_key", "commodity").order("value", { ascending: true });
  return <PlansClient initialPlans={(data ?? []) as QcPlan[]} commodityOptions={(commodityRows ?? []).map((r) => r.value as string)} />;
}
