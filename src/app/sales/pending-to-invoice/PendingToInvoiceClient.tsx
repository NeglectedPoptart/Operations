"use client";

import { useState } from "react";
import { daysSince, formatDate } from "@/lib/dates";
import type { PendingToInvoiceItem } from "@/lib/types";
import { clearInvoicingItems, deletePendingToInvoiceItem } from "./actions";

function isInvoicing(item: PendingToInvoiceItem): boolean {
  return (item.status ?? "").trim().toLowerCase() === "invoicing";
}

function PendingTable({
  items,
  emptyMessage,
  onDelete,
}: {
  items: PendingToInvoiceItem[];
  emptyMessage: string;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-black/5 text-left dark:bg-white/5">
          <tr>
            <th className="px-2 py-2">Order No</th>
            <th className="px-2 py-2">Customer</th>
            <th className="px-2 py-2">PO</th>
            <th className="px-2 py-2">Slp</th>
            <th className="px-2 py-2">Date</th>
            <th className="px-2 py-2">Ship Date</th>
            <th className="px-2 py-2">Days</th>
            <th className="px-2 py-2">Ship Qty</th>
            <th className="px-2 py-2">FOB Amt</th>
            <th className="px-2 py-2">Whse</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Order Type</th>
            <th className="px-2 py-2">Sales Type</th>
            <th className="px-2 py-2">Update</th>
            <th className="px-2 py-2">Last Contact</th>
            <th className="w-16 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
              <td className="px-2 py-1.5">{item.order_no}</td>
              <td className="px-2 py-1.5">{item.customer}</td>
              <td className="px-2 py-1.5">{item.po}</td>
              <td className="px-2 py-1.5">{item.slp}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(item.order_date)}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(item.ship_date)}</td>
              <td className="px-2 py-1.5 text-center text-black/60 dark:text-white/60">
                {daysSince(item.ship_date) ?? "—"}
              </td>
              <td className="px-2 py-1.5">{item.ship_qty}</td>
              <td className="px-2 py-1.5">{item.fob_amt}</td>
              <td className="px-2 py-1.5">{item.whse}</td>
              <td className="px-2 py-1.5">{item.status}</td>
              <td className="px-2 py-1.5">{item.order_type}</td>
              <td className="px-2 py-1.5">{item.sales_type}</td>
              <td className="px-2 py-1.5">{item.update_notes}</td>
              <td className="px-2 py-1.5">{item.last_contact}</td>
              <td className="px-2 py-1.5">
                <button
                  onClick={() => onDelete(item.id)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={16} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function PendingToInvoiceClient({ initialItems }: { initialItems: PendingToInvoiceItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [clearing, setClearing] = useState(false);

  const pending = items.filter((i) => !isInvoicing(i));
  const invoicing = items.filter(isInvoicing);

  async function handleDelete(id: string) {
    if (!confirm("Delete this row? (Only do this once it's been invoiced.)")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deletePendingToInvoiceItem(id).catch(() => {});
  }

  async function handleClearInvoicing() {
    if (invoicing.length === 0) return;
    if (!confirm(`Clear all ${invoicing.length} row${invoicing.length === 1 ? "" : "s"} from the Invoicing list? This can't be undone.`)) {
      return;
    }
    setClearing(true);
    try {
      setItems((prev) => prev.filter((i) => !isInvoicing(i)));
      await clearInvoicingItems();
    } finally {
      setClearing(false);
    }
  }

  return (
    // Breaks out of the page's centered max-w container, same as PAS Files -
    // this is a wide list and needs the room before it has to scroll.
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="space-y-8">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Pending to Invoice</h1>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">
              Everything from the pending-to-invoice paste that isn&apos;t marked PAS lands here. Paste the
              full list from Compliance &gt; PAS Files - delete a row once it&apos;s been invoiced.
            </p>
          </div>
          <PendingTable
            items={pending}
            emptyMessage="Nothing pending invoice - paste the full list in from Compliance > PAS Files."
            onDelete={handleDelete}
          />
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">Invoicing</h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Rows marked Invoicing - already done on our end, waiting on accounting to process.
              </p>
            </div>
            <button
              onClick={handleClearInvoicing}
              disabled={clearing || invoicing.length === 0}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {clearing ? "Clearing..." : "Clear List"}
            </button>
          </div>
          <PendingTable items={invoicing} emptyMessage="Nothing marked Invoicing yet." onDelete={handleDelete} />
        </div>
      </div>
    </div>
  );
}
