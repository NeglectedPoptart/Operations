import { createClient } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/dates";
import type { Broker, BrokerRateEntry, Lane, RateSubmission } from "@/lib/types";
import BrokerRateEntryClient from "./BrokerRateEntryClient";

export const dynamic = "force-dynamic";

export default async function BrokerRateEntryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already guarantees a signed-in user

  const { data: profile } = await supabase.from("profiles").select("role, broker_id").eq("id", user.id).single();
  const isBrokerCarrier = profile?.role === "broker_carrier";

  // Note on brokers: RLS (migration 049) already scopes this query on its
  // own - staff get every row back, a broker_carrier login gets only its
  // own single row - so no extra filtering is needed here for privacy, only
  // for picking a sensible default below.
  const [lanesRes, brokersRes] = await Promise.all([
    supabase.from("lanes").select("*").order("from_hub").order("destination"),
    supabase.from("brokers").select("*").order("name"),
  ]);

  const lanes = (lanesRes.data ?? []) as Lane[];
  const brokers = (brokersRes.data ?? []) as Broker[];
  const weekStart = currentWeekStart();

  const initialBrokerId = isBrokerCarrier ? (profile?.broker_id as string | null) : brokers[0]?.id ?? null;

  let initialEntries: BrokerRateEntry[] = [];
  let initialSubmission: RateSubmission | null = null;
  if (initialBrokerId) {
    const [entriesRes, submissionRes] = await Promise.all([
      supabase
        .from("broker_rate_entries")
        .select("*")
        .eq("broker_id", initialBrokerId)
        .eq("week_start_date", weekStart),
      supabase.from("rate_submissions").select("*").eq("week_start_date", weekStart).maybeSingle(),
    ]);
    initialEntries = (entriesRes.data ?? []) as BrokerRateEntry[];
    initialSubmission = (submissionRes.data as RateSubmission | null) ?? null;
  }

  return (
    <BrokerRateEntryClient
      lanes={lanes}
      brokers={brokers}
      isBrokerCarrier={isBrokerCarrier}
      initialBrokerId={initialBrokerId}
      initialEntries={initialEntries}
      initialSubmission={initialSubmission}
      weekStart={weekStart}
    />
  );
}
