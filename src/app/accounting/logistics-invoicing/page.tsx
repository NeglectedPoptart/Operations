import { createClient } from "@/lib/supabase/server";
import { daysSince } from "@/lib/dates";
import { OVERDUE_DAYS } from "@/lib/invoicingParse";
import type { Broker, InvoiceStatement } from "@/lib/types";
import StatementCheckerClient from "./StatementCheckerClient";
import MasterBillsImportClient from "./MasterBillsImportClient";
import BrokerListClient from "./BrokerListClient";
import AccountingSummaryClient from "./AccountingSummaryClient";

export const dynamic = "force-dynamic";

export default async function InvoicingHomePage() {
  const supabase = await createClient();

  const [{ data: brokers, error: brokersError }, { data: statements, error: statementsError }] = await Promise.all([
    supabase.from("brokers").select("*").order("position", { ascending: true }).order("name", { ascending: true }),
    supabase.from("invoice_statements").select("*"),
  ]);

  if (brokersError) {
    return <p className="text-red-600">Failed to load brokers: {brokersError.message}</p>;
  }
  if (statementsError) {
    return <p className="text-red-600">Failed to load invoices: {statementsError.message}</p>;
  }

  const rows = (statements ?? []) as InvoiceStatement[];
  const pendingCounts: Record<string, number> = {};
  const doneCounts: Record<string, number> = {};
  const flaggedCounts: Record<string, number> = {};
  const overdueCounts: Record<string, number> = {};
  for (const r of rows) {
    if (r.status === "done") {
      doneCounts[r.broker_id] = (doneCounts[r.broker_id] ?? 0) + 1;
    } else {
      pendingCounts[r.broker_id] = (pendingCounts[r.broker_id] ?? 0) + 1;
    }
    if (r.flagged) flaggedCounts[r.broker_id] = (flaggedCounts[r.broker_id] ?? 0) + 1;

    // Only counts a row as overdue while it still represents money owed -
    // not yet Done, or Done but flagged (Statement Checker found it still
    // carrying a balance despite being marked Done). A Done, unflagged row
    // is fully paid, so its age no longer matters.
    const stillOwed = r.status !== "done" || r.flagged;
    if (stillOwed) {
      const age = daysSince(r.invoice_date);
      if (age !== null && age > OVERDUE_DAYS) overdueCounts[r.broker_id] = (overdueCounts[r.broker_id] ?? 0) + 1;
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Logistics Invoicing</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Pick a broker to see its invoice aging list.
      </p>

      <AccountingSummaryClient brokers={(brokers ?? []) as Broker[]} statements={rows} />

      <MasterBillsImportClient brokers={(brokers ?? []) as Broker[]} initialStatements={rows} />

      <StatementCheckerClient brokers={(brokers ?? []) as Broker[]} />

      <BrokerListClient
        brokers={(brokers ?? []) as Broker[]}
        pendingCounts={pendingCounts}
        doneCounts={doneCounts}
        flaggedCounts={flaggedCounts}
        overdueCounts={overdueCounts}
      />
    </div>
  );
}
