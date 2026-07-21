import { createClient } from "@/lib/supabase/server";
import type { Broker } from "@/lib/types";
import StatementCheckerClient from "./StatementCheckerClient";
import BrokerListClient from "./BrokerListClient";

export const dynamic = "force-dynamic";

export default async function InvoicingHomePage() {
  const supabase = await createClient();

  const [{ data: brokers, error: brokersError }, { data: statements, error: statementsError }] = await Promise.all([
    supabase.from("brokers").select("*").order("position", { ascending: true }).order("name", { ascending: true }),
    supabase.from("invoice_statements").select("broker_id, status"),
  ]);

  if (brokersError) {
    return <p className="text-red-600">Failed to load brokers: {brokersError.message}</p>;
  }
  if (statementsError) {
    return <p className="text-red-600">Failed to load invoices: {statementsError.message}</p>;
  }

  const rows = (statements ?? []) as { broker_id: string; status: string | null }[];
  const pendingCounts: Record<string, number> = {};
  for (const r of rows) {
    if (r.status === "done") continue;
    pendingCounts[r.broker_id] = (pendingCounts[r.broker_id] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Invoicing</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Pick a broker to see its invoice aging list.
      </p>

      <StatementCheckerClient brokers={(brokers ?? []) as Broker[]} />

      <BrokerListClient brokers={(brokers ?? []) as Broker[]} pendingCounts={pendingCounts} />
    </div>
  );
}
