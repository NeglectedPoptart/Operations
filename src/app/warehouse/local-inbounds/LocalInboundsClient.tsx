"use client";

import { useState } from "react";
import type { LocalInbound } from "@/lib/types";
import { addLocalInboundRow, deleteLocalInboundRow, updateLocalInboundRow } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function ProgressSummary({
  total,
  pending,
  loadingDirect,
  arrived,
}: {
  total: number;
  pending: number;
  loadingDirect: number;
  arrived: number;
}) {
  const pct = total > 0 ? Math.round((arrived / total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <div className="h-6 flex-1 min-w-[12rem] overflow-hidden rounded-full bg-red-500">
        <div
          className="h-full rounded-full bg-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-sm">
        <p>
          Total Inbounds: <span className="font-semibold">{total}</span>
        </p>
        <p>
          Total Pending: <span className="font-semibold">{pending}</span>
        </p>
        <p>
          Total Loading Direct: <span className="font-semibold">{loadingDirect}</span>
        </p>
        <p>
          Total Arrived: <span className="font-semibold">{arrived}</span>
        </p>
      </div>
    </div>
  );
}

function InboundSection({
  title,
  items,
  showAddRow,
  showMarkArrived,
  adding,
  onAddRow,
  onFieldSave,
  onMarkArrived,
  onDelete,
}: {
  title: string;
  items: LocalInbound[];
  showAddRow: boolean;
  showMarkArrived: boolean;
  adding: boolean;
  onAddRow: () => void;
  onFieldSave: (id: string, patch: Partial<LocalInbound>) => void;
  onMarkArrived: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const extraCols = (showMarkArrived ? 1 : 0) + 1;
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">
        {title} <span className="text-sm font-normal text-black/40">({items.length})</span>
      </h2>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">PO</th>
              <th className="px-2 py-2">PU</th>
              <th className="px-2 py-2">Vendor</th>
              <th className="px-2 py-2">Loading Warehouse</th>
              <th className="px-2 py-2">ETA</th>
              <th className="px-2 py-2">Notes</th>
              {showMarkArrived && <th className="w-32 px-2 py-2" />}
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                <td className="min-w-[6rem] px-1 py-1">
                  <input
                    defaultValue={item.po ?? ""}
                    onBlur={(e) => onFieldSave(item.id, { po: e.target.value })}
                    className={field}
                  />
                </td>
                <td className="min-w-[8rem] px-1 py-1">
                  <input
                    defaultValue={item.pu_info ?? ""}
                    onBlur={(e) => onFieldSave(item.id, { pu_info: e.target.value })}
                    className={field}
                  />
                </td>
                <td className="min-w-[8rem] px-1 py-1">
                  <input
                    defaultValue={item.vendor ?? ""}
                    onBlur={(e) => onFieldSave(item.id, { vendor: e.target.value })}
                    className={field}
                  />
                </td>
                <td className="min-w-[8rem] px-1 py-1">
                  <input
                    defaultValue={item.loading_warehouse ?? ""}
                    onBlur={(e) => onFieldSave(item.id, { loading_warehouse: e.target.value })}
                    className={field}
                  />
                </td>
                <td className="min-w-[6rem] px-1 py-1">
                  <input
                    defaultValue={item.eta ?? ""}
                    onBlur={(e) => onFieldSave(item.id, { eta: e.target.value })}
                    className={field}
                  />
                </td>
                <td className="min-w-[12rem] px-1 py-1">
                  <input
                    defaultValue={item.notes ?? ""}
                    onBlur={(e) => onFieldSave(item.id, { notes: e.target.value })}
                    className={field}
                  />
                </td>
                {showMarkArrived && (
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => onMarkArrived(item.id)}
                      className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
                    >
                      Mark Arrived
                    </button>
                  </td>
                )}
                <td className="px-2 py-1.5">
                  <button onClick={() => onDelete(item.id)} className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6 + extraCols} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  Nothing here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {showAddRow && (
        <button
          onClick={onAddRow}
          disabled={adding}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {adding ? "Adding..." : "+ Add Row"}
        </button>
      )}
    </div>
  );
}

export default function LocalInboundsClient({
  initialItems,
  entryDate,
}: {
  initialItems: LocalInbound[];
  entryDate: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [addingPending, setAddingPending] = useState(false);
  const [addingLoadingDirect, setAddingLoadingDirect] = useState(false);

  const pending = items.filter((i) => i.status === "pending");
  const loadingDirect = items.filter((i) => i.status === "loading_direct");
  const arrived = items.filter((i) => i.status === "arrived");

  function updateLocal(id: string, patch: Partial<LocalInbound>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function handleFieldSave(id: string, patch: Partial<LocalInbound>) {
    updateLocal(id, patch);
    updateLocalInboundRow(id, patch).catch(() => {});
  }

  function handleMarkArrived(id: string) {
    handleFieldSave(id, { status: "arrived" });
  }

  async function handleAddRow(status: LocalInbound["status"], setBusy: (b: boolean) => void) {
    setBusy(true);
    try {
      const nextPosition = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 1;
      const row = await addLocalInboundRow(entryDate, nextPosition, status);
      setItems((prev) => [...prev, row as LocalInbound]);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this row?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteLocalInboundRow(id).catch(() => {});
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Local Inbounds</h1>

        <ProgressSummary
          total={items.length}
          pending={pending.length}
          loadingDirect={loadingDirect.length}
          arrived={arrived.length}
        />

        <InboundSection
          title="Pending"
          items={pending}
          showAddRow
          showMarkArrived
          adding={addingPending}
          onAddRow={() => handleAddRow("pending", setAddingPending)}
          onFieldSave={handleFieldSave}
          onMarkArrived={handleMarkArrived}
          onDelete={handleDelete}
        />

        <InboundSection
          title="Loading Direct"
          items={loadingDirect}
          showAddRow
          showMarkArrived
          adding={addingLoadingDirect}
          onAddRow={() => handleAddRow("loading_direct", setAddingLoadingDirect)}
          onFieldSave={handleFieldSave}
          onMarkArrived={handleMarkArrived}
          onDelete={handleDelete}
        />

        <InboundSection
          title="Arrived"
          items={arrived}
          showAddRow={false}
          showMarkArrived={false}
          adding={false}
          onAddRow={() => {}}
          onFieldSave={handleFieldSave}
          onMarkArrived={handleMarkArrived}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
