import { createClient } from "@/lib/supabase/server";
import type { ArCustomer, ArInvoice } from "@/lib/types";
import ArTroublesClient from "./ArTroublesClient";

export const dynamic = "force-dynamic";

// Same ar_customers/ar_invoices data as the main AR page - filtering to
// trouble_status !== "none" happens client-side (see ArTroublesClient), the
// same way the main page filters the complementary slice, so both pages
// stay a clean partition of one shared dataset.
export default async function ArTroublesPage() {
  const supabase = await createClient();

  const [{ data: customers, error: customersError }, { data: invoices, error: invoicesError }] = await Promise.all([
    supabase.from("ar_customers").select("*").order("customer_name", { ascending: true }),
    supabase.from("ar_invoices").select("*"),
  ]);

  if (customersError) {
    return <p className="text-red-600">Failed to load AR customers: {customersError.message}</p>;
  }
  if (invoicesError) {
    return <p className="text-red-600">Failed to load AR invoices: {invoicesError.message}</p>;
  }

  return (
    <ArTroublesClient initialCustomers={(customers ?? []) as ArCustomer[]} initialInvoices={(invoices ?? []) as ArInvoice[]} />
  );
}
