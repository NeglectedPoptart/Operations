import { createClient } from "@/lib/supabase/server";
import type { Broker, InvoiceStatement } from "@/lib/types";
import InvoicingClient from "./InvoicingClient";

export const dynamic = "force-dynamic";

export default async function BrokerInvoicingPage({ params }: { params: Promise<{ brokerId: string }> }) {
  const { brokerId } = await params;
  const supabase = await createClient();

  const [{ data: broker, error: brokerError }, { data: statements, error: statementsError }] = await Promise.all([
    supabase.from("brokers").select("*").eq("id", brokerId).maybeSingle(),
    supabase
      .from("invoice_statements")
      .select("*")
      .eq("broker_id", brokerId)
      .order("invoice_date", { ascending: true, nullsFirst: false }),
  ]);

  if (brokerError) {
    return <p className="text-red-600">Failed to load broker: {brokerError.message}</p>;
  }
  if (statementsError) {
    return <p className="text-red-600">Failed to load invoices: {statementsError.message}</p>;
  }
  if (!broker) {
    return <p className="text-black/60 dark:text-white/60">Broker not found.</p>;
  }

  return (
    <InvoicingClient
      broker={broker as Broker}
      initialItems={(statements ?? []) as InvoiceStatement[]}
    />
  );
}
