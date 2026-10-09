import { createClient } from "@/lib/supabase/server";
import { canEditQcPlans } from "@/lib/roles";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";
// Reading one big PDF can take a while.
export const maxDuration = 60;

export default async function ImportLotpathPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };

  if (!canEditQcPlans((profile?.role as string | null) ?? null, user?.email ?? null)) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Importing inspections can only be done by the Quality Control Manager.
      </p>
    );
  }
  return <ImportClient />;
}
