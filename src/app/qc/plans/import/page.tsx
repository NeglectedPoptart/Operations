import { createClient } from "@/lib/supabase/server";
import { canEditPlansNow } from "@/lib/pageAccess";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";
// Reading one big PDF can take a while.
export const maxDuration = 60;

export default async function ImportLotpathPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!(await canEditPlansNow(supabase, user))) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        Importing inspections can only be done by the Quality Control Manager.
      </p>
    );
  }
  return <ImportClient />;
}
