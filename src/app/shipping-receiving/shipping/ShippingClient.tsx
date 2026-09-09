"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate } from "@/lib/dates";
import type { SrCustomer, SrInventoryLot, SrItem, SrSalesOrder, SrSoLine } from "@/lib/types";
import { shipSalesOrder } from "./actions";

export default function ShippingClient({
  initialSalesOrders,
  lines,
  items,
  customers,
  availableLots,
}: {
  initialSalesOrders: SrSalesOrder[];
  lines: SrSoLine[];
  items: SrItem[];
  customers: SrCustomer[];
  availableLots: SrInventoryLot[];
}) {
  const confirm = useConfirm();
  const [salesOrders, setSalesOrders] = useState(initialSalesOrders);
  const [shippingId, setShippingId] = useState<string | null>(null);

  const availableByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const lot of availableLots) {
      if (!lot.item_id) continue;
      map.set(lot.item_id, (map.get(lot.item_id) ?? 0) + (lot.qty_on_hand ?? 0));
    }
    return map;
  }, [availableLots]);

  async function handleShip(so: SrSalesOrder) {
    if (!(await confirm(`Ship order "${so.order_number}"? This deducts from inventory (oldest lots first) and marks it Shipped.`))) return;
    setShippingId(so.id);
    try {
      await shipSalesOrder(so.id);
      setSalesOrders((prev) => prev.map((o) => (o.id === so.id ? { ...o, status: "shipped" } : o)));
    } finally {
      setShippingId(null);
    }
  }

  const openOrders = salesOrders.filter((o) => o.status === "open").sort((a, b) => (a.order_date ?? "").localeCompare(b.order_date ?? ""));
  const shippedOrders = salesOrders.filter((o) => o.status === "shipped");

  function renderOrder(so: SrSalesOrder, shippable: boolean) {
    const soLines = lines.filter((l) => l.so_id === so.id).sort((a, b) => a.position - b.position);
    const customer = customers.find((c) => c.id === so.customer_id);
    return (
      <div key={so.id} className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">
              {so.order_number}
              {customer && <span className="ml-2 font-normal text-black/50 dark:text-white/50">{customer.name}</span>}
            </p>
            <p className="text-xs text-black/40 dark:text-white/40">
              Ordered {formatDate(so.order_date)}
              {so.ship_date && ` - Shipped ${formatDate(so.ship_date)}`}
            </p>
          </div>
          {shippable && (
            <button
              onClick={() => handleShip(so)}
              disabled={shippingId === so.id}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {shippingId === so.id ? "Shipping..." : "Ship Order"}
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-2 py-1.5">Item</th>
                <th className="px-2 py-1.5">Qty Ordered</th>
                <th className="px-2 py-1.5">Qty Shipped</th>
                {shippable && <th className="px-2 py-1.5">Available</th>}
              </tr>
            </thead>
            <tbody>
              {soLines.map((line) => {
                const item = items.find((i) => i.id === line.item_id);
                const remaining = (line.qty_ordered ?? 0) - line.qty_shipped;
                const available = line.item_id ? availableByItem.get(line.item_id) ?? 0 : 0;
                const short = shippable && remaining > 0 && available < remaining;
                return (
                  <tr key={line.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-2 py-1.5">{item?.name ?? "--"}</td>
                    <td className="px-2 py-1.5">{line.qty_ordered ?? 0}</td>
                    <td className="px-2 py-1.5">{line.qty_shipped}</td>
                    {shippable && (
                      <td className={`px-2 py-1.5 ${short ? "font-semibold text-red-600 dark:text-red-400" : ""}`}>
                        {available}
                        {short && " (short)"}
                      </td>
                    )}
                  </tr>
                );
              })}
              {soLines.length === 0 && (
                <tr>
                  <td colSpan={shippable ? 4 : 3} className="px-3 py-3 text-center text-black/40 dark:text-white/40">
                    No lines on this order.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shipping</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Prototype ERP - Shipping/Receiving. Shipping an order deducts from the oldest available inventory lots for
          each item (FIFO) and marks the order Shipped.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
          Ready to Ship ({openOrders.length})
        </h2>
        <div className="space-y-3">
          {openOrders.map((so) => renderOrder(so, true))}
          {openOrders.length === 0 && (
            <p className="rounded-lg border border-dashed border-black/10 p-4 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
              Nothing open to ship - create orders on Order Entry.
            </p>
          )}
        </div>
      </section>

      {shippedOrders.length > 0 && (
        <section className="space-y-2">
          <h2 className="border-b-2 border-black/20 pb-1 text-lg font-bold text-black/60 dark:border-white/20 dark:text-white/60">
            Recently Shipped ({shippedOrders.length})
          </h2>
          <div className="space-y-3">{shippedOrders.map((so) => renderOrder(so, false))}</div>
        </section>
      )}
    </div>
  );
}
