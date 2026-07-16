"use client";

import { useState } from "react";
import type { QcInspection } from "@/lib/types";
import { addQcInspectionRow, deleteQcInspectionRow, updateQcInspectionRow } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

export default function QcInspectionsClient({ initialItems }: { initialItems: QcInspection[] }) {
  const [items, setItems] = useState(initialItems);
  const [adding, setAdding] = useState(false);

  async function handleAddRow() {
    setAdding(true);
    try {
      const nextPosition = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 1;
      const row = await addQcInspectionRow(nextPosition);
      setItems((prev) => [...prev, row as QcInspection]);
    } finally {
      setAdding(false);
    }
  }

  function handleFieldSave(id: string, patch: Partial<QcInspection>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    updateQcInspectionRow(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this row?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteQcInspectionRow(id).catch(() => {});
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">QC Inspections</h1>

        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">PO</th>
                <th className="px-2 py-2">Lot</th>
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">QC</th>
                <th className="px-2 py-2 text-center">Chat</th>
                <th className="px-2 py-2 text-center">Report</th>
                <th className="px-2 py-2 text-center">Mail</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Result</th>
                <th className="px-2 py-2">Notes</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[8rem] px-1 py-1">
                    <input
                      type="date"
                      defaultValue={item.entry_date ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { entry_date: e.target.value || null })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      defaultValue={item.po ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { po: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      defaultValue={item.lot ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { lot: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[10rem] px-1 py-1">
                    <input
                      defaultValue={item.product ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { product: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={item.qc ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { qc: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={item.chat}
                      onChange={(e) => handleFieldSave(item.id, { chat: e.target.checked })}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={item.report}
                      onChange={(e) => handleFieldSave(item.id, { report: e.target.checked })}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={item.mail}
                      onChange={(e) => handleFieldSave(item.id, { mail: e.target.checked })}
                    />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      defaultValue={item.status ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { status: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      defaultValue={item.result ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { result: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[16rem] px-1 py-1">
                    <input
                      defaultValue={item.notes ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { notes: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    No inspections yet - click &quot;+ Add Row&quot; below to log one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <button
          onClick={handleAddRow}
          disabled={adding}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {adding ? "Adding..." : "+ Add Row"}
        </button>
      </div>
    </div>
  );
}
