import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Who is using the Broker Pending List. The portal reads and writes through the service-role client
// (carrier logins have no direct database access to loads), so every call must start here: it names
// the carrier company the signed-in login belongs to, and everything after is limited to that company.

export interface PortalBroker {
  userId: string;
  email: string;
  brokerId: string;
  brokerName: string;
}

export async function requireBroker(): Promise<{ broker: PortalBroker } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: profile } = await supabase.from("profiles").select("role, broker_id").eq("id", user.id).maybeSingle();
  if (profile?.role !== "broker_carrier") return { error: "Only a carrier login can do this." };
  const brokerId = profile.broker_id as string | null;
  if (!brokerId) return { error: "Your login isn't linked to a carrier company yet - ask Harvest Best to finish setting it up." };
  const { data: broker } = await adminClient().from("brokers").select("name").eq("id", brokerId).maybeSingle();
  return { broker: { userId: user.id, email: user.email ?? "", brokerId, brokerName: (broker?.name as string | undefined) ?? "Carrier" } };
}

// The load, only if it belongs to this carrier company.
export async function ownedLoad(
  admin: SupabaseClient,
  brokerId: string,
  loadId: string,
): Promise<{ id: string; status: string; rate: number | null; rate_con_sent: boolean; ratecon_signed_at: string | null; load_stops: { order_number: string | null; po_number: string | null }[] } | null> {
  const { data } = await admin
    .from("loads")
    .select("id, status, rate, rate_con_sent, ratecon_signed_at, broker_id, load_stops(order_number, po_number)")
    .eq("id", loadId)
    .eq("broker_id", brokerId)
    .maybeSingle();
  return (data as never) ?? null;
}

export function loadRef(load: { load_stops: { order_number: string | null; po_number: string | null }[] }): string {
  const orders = load.load_stops.map((s) => (s.order_number ? `#${s.order_number}` : null)).filter(Boolean);
  const pos = load.load_stops.map((s) => s.po_number).filter(Boolean);
  return `${orders.join(", ") || "load"}${pos.length ? ` (PO ${pos.join(", ")})` : ""}`;
}
