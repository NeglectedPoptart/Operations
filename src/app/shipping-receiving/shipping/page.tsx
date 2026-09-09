import { createClient } from "@/lib/supabase/server";
import type { SrCustomer, SrInventoryLot, SrItem, SrSalesOrder, SrSoLine } from "@/lib/types";
import ShippingClient from "./ShippingClient";

export const dynamic = "force-dynamic";

export default async function ShippingPage() {
  const supabase = await createClient();

  const [
    { data: salesOrders, error: soError },
    { data: lines, error: linesError },
    { data: items, error: itemsError },
    { data: customers, error: customersError },
    { data: lots, error: lotsError },
  ] = await Promise.all([
    supabase.from("sr_sales_orders").select("*").order("order_date", { ascending: true }),
    supabase.from("sr_so_lines").select("*").order("position", { ascending: true }),
    supabase.from("sr_items").select("*").order("name", { ascending: true }),
    supabase.from("sr_customers").select("*").order("name", { ascending: true }),
    supabase.from("sr_inventory_lots").select("*").eq("status", "available"),
  ]);

  const error = soError ?? linesError ?? itemsError ?? customersError ?? lotsError;
  if (error) {
    return <p className="text-red-600">Failed to load Shipping: {error.message}</p>;
  }

  return (
    <ShippingClient
      initialSalesOrders={(salesOrders ?? []) as SrSalesOrder[]}
      lines={(lines ?? []) as SrSoLine[]}
      items={(items ?? []) as SrItem[]}
      customers={(customers ?? []) as SrCustomer[]}
      availableLots={(lots ?? []) as SrInventoryLot[]}
    />
  );
}
