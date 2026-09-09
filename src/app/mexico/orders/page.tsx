import { createClient } from "@/lib/supabase/server";
import type { MxOrder } from "@/lib/types";
import OrdersClient from "./OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("mx_orders")
    .select("*")
    .order("delivery_date", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true });

  if (error) {
    return <p className="text-red-600">Failed to load Orders: {error.message}</p>;
  }

  return <OrdersClient initialOrders={(orders ?? []) as MxOrder[]} />;
}
