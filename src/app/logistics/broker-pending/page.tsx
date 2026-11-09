import { loadPortalLoads } from "@/lib/brokerPortal/load";
import type { PortalLoad } from "@/lib/brokerPortal/types";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import BrokerPendingClient from "./BrokerPendingClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Broker Pending List: every load booked under a carrier's company, with what they can see and what
// they need to do. Carrier logins see their own company. Staff open the same page to preview what a
// carrier sees (pick the company), read-only.
export default async function BrokerPendingPage({ searchParams }: { searchParams: Promise<{ broker?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware already guarantees a signed-in user

  const { data: profile } = await supabase.from("profiles").select("role, broker_id").eq("id", user.id).maybeSingle();
  const isCarrier = profile?.role === "broker_carrier";
  const { broker: brokerParam } = await searchParams;

  const admin = adminClient();
  let brokerId: string | null = null;
  let brokers: { id: string; name: string }[] = [];
  if (isCarrier) {
    brokerId = (profile?.broker_id as string | null) ?? null;
  } else {
    // Staff: only companies that actually have loads on the list.
    const { data: withLoads } = await admin.from("loads").select("broker_id").not("broker_id", "is", null).neq("status", "complete");
    const ids = [...new Set((withLoads ?? []).map((l) => l.broker_id as string))];
    const { data: all } = ids.length > 0 ? await admin.from("brokers").select("id, name").in("id", ids).order("name") : { data: [] };
    brokers = (all ?? []) as { id: string; name: string }[];
    brokerId = brokerParam && brokers.some((b) => b.id === brokerParam) ? brokerParam : (brokers[0]?.id ?? null);
  }

  if (!brokerId) {
    return (
      <div className="mx-auto max-w-3xl space-y-2">
        <h1 className="text-2xl font-bold">Broker Pending List</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {isCarrier ? "Your login isn't linked to a carrier company yet - ask Harvest Best to finish setting it up." : "No carrier has a load on the list right now."}
        </p>
      </div>
    );
  }

  let loads: PortalLoad[] = [];
  let loadError: string | null = null;
  try {
    loads = await loadPortalLoads(admin, brokerId);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Couldn't load your loads.";
  }
  const { data: broker } = await admin.from("brokers").select("name").eq("id", brokerId).maybeSingle();

  return (
    <BrokerPendingClient
      loads={loads}
      loadError={loadError}
      companyName={(broker?.name as string | undefined) ?? "Carrier"}
      readOnly={!isCarrier}
      brokers={brokers}
      brokerId={brokerId}
    />
  );
}
