import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";
import type { OrderLegendItem, OrderReportMeta, PendingOrder } from "@/lib/pendingOrders";
import OrdersClient from "./OrdersClient";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = await createClient();
  const [orders, legend, meta] = await Promise.all([
    supabase.from("pending_orders").select("*").order("ship_date", { ascending: true }).order("order_no", { ascending: true }),
    supabase.from("order_legend").select("*").order("position", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("order_report_meta").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (orders.error) return <p className="text-red-600">Failed to load Orders: {orders.error.message}</p>;
  // The legend and report info tables come from the same migration as orders; if only they fail, say so plainly.
  if (legend.error) return <p className="text-red-600">Failed to load the legend: {legend.error.message}</p>;

  const m = (meta.data as OrderReportMeta | null) ?? null;
  return (
    <OrdersClient
      key={m?.uploaded_at ?? "none"}
      initialOrders={(orders.data ?? []) as PendingOrder[]}
      initialLegend={(legend.data ?? []) as OrderLegendItem[]}
      meta={m}
      today={todayISO()}
    />
  );
}
