import { createClient } from "@/lib/supabase/server";
import { isSupremeUser } from "@/lib/roles";
import type { AuditLogRow } from "@/lib/auditTracked";
import ActivityLogClient from "./ActivityLogClient";

export const dynamic = "force-dynamic";

// Wall-clock read isolated here: the page is force-dynamic so it is evaluated
// per request, and calling Date.now() inline in the component trips the
// react-hooks purity rule.
function currentTimeMs(): number {
  return Date.now();
}

export default async function ActivityLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The log itself is also locked down by RLS (only the Supreme account can
  // read it) - this is just so anyone else lands on a clear message instead
  // of an empty page.
  if (!isSupremeUser(user?.email ?? null)) {
    return <p className="text-sm text-black/60 dark:text-white/60">You do not have access to the Activity Log.</p>;
  }

  const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(2000);
  if (error) {
    return <p className="text-red-600">Failed to load Activity Log: {error.message}</p>;
  }

  // Each person's own time zone (null where not detected yet, or if the
  // time zone columns haven't been added).
  const { data: tzRows } = await supabase.from("profiles").select("email, timezone");
  const timezoneByEmail: Record<string, string> = {};
  for (const p of tzRows ?? []) {
    if (p.email && p.timezone) timezoneByEmail[(p.email as string).toLowerCase()] = p.timezone as string;
  }

  return <ActivityLogClient rows={(data ?? []) as AuditLogRow[]} nowMs={currentTimeMs()} timezoneByEmail={timezoneByEmail} />;
}
