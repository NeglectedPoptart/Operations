import { createClient } from "@/lib/supabase/server";
import type { ArCustomer, ArInvoice, ArSummarySnapshot } from "@/lib/types";
import ArClient from "./ArClient";
import type { LastReport } from "./uploadCheck";

export const dynamic = "force-dynamic";

export default async function AccountsReceivablePage() {
  const supabase = await createClient();

  const [
    { data: customers, error: customersError },
    { data: invoices, error: invoicesError },
    { data: baseline, error: baselineError },
  ] = await Promise.all([
    supabase.from("ar_customers").select("*").order("customer_name", { ascending: true }),
    supabase.from("ar_invoices").select("*"),
    supabase.from("ar_summary_snapshot").select("*").limit(1).maybeSingle(),
  ]);

  // The last AR report loaded (when it says it was generated). Tolerant: the table comes from migration 153.
  const { data: lastReport } = await supabase
    .from("report_uploads")
    .select("report_at, uploaded_by, uploaded_at, file_name")
    .eq("kind", "ar")
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (customersError) {
    return <p className="text-red-600">Failed to load AR customers: {customersError.message}</p>;
  }
  if (invoicesError) {
    return <p className="text-red-600">Failed to load AR invoices: {invoicesError.message}</p>;
  }
  if (baselineError) {
    return <p className="text-red-600">Failed to load AR baseline: {baselineError.message}</p>;
  }

  return (
    <ArClient
      initialCustomers={(customers ?? []) as ArCustomer[]}
      initialInvoices={(invoices ?? []) as ArInvoice[]}
      initialBaseline={(baseline ?? null) as ArSummarySnapshot | null}
      initialLastReport={(lastReport ?? null) as LastReport | null}
    />
  );
}
