import { createClient } from "@/lib/supabase/server";
import type { SrCustomer, SrItem, SrSalesOrder, SrSoLine } from "@/lib/types";
import OrderEntryClient from "./OrderEntryClient";

export const dynamic = "force-dynamic";

export default async function OrderEntryPage() {
  const supabase = await createClient();

  const [
    { data: salesOrders, error: soError },
    { data: lines, error: linesError },
    { data: items, error: itemsError },
    { data: customers, error: customersError },
  ] = await Promise.all([
    supabase.from("sr_sales_orders").select("*").order("created_at", { ascending: false }),
    supabase.from("sr_so_lines").select("*").order("position", { ascending: true }),
    supabase.from("sr_items").select("*").order("name", { ascending: true }),
    supabase.from("sr_customers").select("*").order("name", { ascending: true }),
  ]);

  const error = soError ?? linesError ?? itemsError ?? customersError;
  if (error) {
    return <p className="text-red-600">Failed to load Order Entry: {error.message}</p>;
  }

  return (
    <OrderEntryClient
      initialSalesOrders={(salesOrders ?? []) as SrSalesOrder[]}
      initialLines={(lines ?? []) as SrSoLine[]}
      items={(items ?? []) as SrItem[]}
      initialCustomers={(customers ?? []) as SrCustomer[]}
    />
  );
}
