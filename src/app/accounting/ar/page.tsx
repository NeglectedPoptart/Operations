import { createClient } from "@/lib/supabase/server";
import type { ArCustomer, ArInvoice } from "@/lib/types";
import ArClient from "./ArClient";

export const dynamic = "force-dynamic";

export default async function AccountsReceivablePage() {
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

  return <ArClient initialCustomers={(customers ?? []) as ArCustomer[]} initialInvoices={(invoices ?? []) as ArInvoice[]} />;
}
