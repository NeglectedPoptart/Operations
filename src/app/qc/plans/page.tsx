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
  return <PlansClient initialPlans={(data ?? []) as QcPlan[]} />;
}
