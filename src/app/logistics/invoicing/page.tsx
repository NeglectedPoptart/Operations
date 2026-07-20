import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Broker } from "@/lib/types";
import StatementCheckerClient from "./StatementCheckerClient";

export const dynamic = "force-dynamic";

export default async function InvoicingHomePage() {
  const supabase = await createClient();

  const [{ data: brokers, error: brokersError }, { data: statements, error: statementsError }] = await Promise.all([
    supabase.from("brokers").select("*").order("name", { ascending: true }),
    supabase.from("invoice_statements").select("broker_id, status"),
  ]);

  if (brokersError) {
    return <p className="text-red-600">Failed to load brokers: {brokersError.message}</p>;
  }
  if (statementsError) {
    return <p className="text-red-600">Failed to load invoices: {statementsError.message}</p>;
  }

  const rows = (statements ?? []) as { broker_id: string; status: string | null }[];
  const pendingCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "done") continue;
    pendingCounts.set(r.broker_id, (pendingCounts.get(r.broker_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Invoicing</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Pick a broker to see its invoice aging list.
      </p>

      <StatementCheckerClient brokers={(brokers ?? []) as Broker[]} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {((brokers ?? []) as Broker[]).map((b) => {
          const pending = pendingCounts.get(b.id) ?? 0;
          return (
            <Link
              key={b.id}
              href={`/logistics/invoicing/${b.id}`}
              className="rounded-lg border border-black/10 p-4 shadow-sm transition hover:border-green-600 dark:border-white/10"
            >
              <p className="font-medium">{b.name}</p>
              <p className="text-sm text-black/60 dark:text-white/60">
                {pending} pending invoice{pending === 1 ? "" : "s"}
              </p>
            </Link>
          );
        })}
        {(brokers ?? []).length === 0 && (
          <p className="text-sm text-black/40 dark:text-white/40">
            No brokers yet - add one from a Load form on the Board first.
          </p>
        )}
      </div>
    </div>
  );
}
