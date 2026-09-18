import { createClient } from "@/lib/supabase/server";
import type { BroccoliLot, BroccoliOrder } from "@/lib/types";
import BroccoliInventoryClient from "./BroccoliInventoryClient";

export const dynamic = "force-dynamic";

export default async function BroccoliInventoryPage() {
  const supabase = await createClient();

  const [{ data: lots, error: lotsError }, { data: orders, error: ordersError }] = await Promise.all([
    supabase.from("broccoli_lots").select("*").order("position", { ascending: true }),
    supabase.from("broccoli_orders").select("*").order("position", { ascending: true }),
  ]);

  if (lotsError) {
    return <p className="text-red-600">Failed to load Broccoli Inventory: {lotsError.message}</p>;
  }
  if (ordersError) {
    return <p className="text-red-600">Failed to load Broccoli Inventory orders: {ordersError.message}</p>;
  }

  return <BroccoliInventoryClient initialLots={(lots ?? []) as BroccoliLot[]} initialOrders={(orders ?? []) as BroccoliOrder[]} />;
}
