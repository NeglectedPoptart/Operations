"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import type { RepackCost } from "@/lib/types";
import { addRepackCostRow, deleteRepackCostRow, updateRepackCostRow } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function RepackCostsSection({ initialRows }: { initialRows: RepackCost[] }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<RepackCost[]>(initialRows);
  const [adding, setAdding] = useState(false);

  function updateLocal(id: string, patch: Partial<RepackCost>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleAddRow() {
    setAdding(true);
    try {
      const nextPosition = rows.length > 0 ? Math.max(...rows.map((r) => r.position)) + 1 : 1;
      const row = await addRepackCostRow(nextPosition);
      setRows((prev) => [...prev, row]);
    } finally {
      setAdding(false);
    }
  }

  function handleFieldSave(id: string, patch: Partial<Pick<RepackCost, "action" | "cost" | "unit">>) {
    updateLocal(id, patch);
    updateRepackCostRow(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this row?"))) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    await deleteRepackCostRow(id).catch(() => {});
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Repack Costs</h2>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Movement</th>
              <th className="px-2 py-2">Price</th>
              <th className="px-2 py-2">Unit</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-1 py-1">
                  <input
                    defaultValue={row.action ?? ""}
                    onBlur={(e) => handleFieldSave(row.id, { action: e.target.value || null })}
                    className={field}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={row.cost ?? ""}
                    onBlur={(e) =>
                      handleFieldSave(row.id, {
                        cost: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className={field}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    defaultValue={row.unit ?? ""}
                    onBlur={(e) => handleFieldSave(row.id, { unit: e.target.value || null })}
                    className={field}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => handleDelete(row.id)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No repack costs added yet.
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
  );
}

export default function CostsClient({ initialRepackRows }: { initialRepackRows: RepackCost[] }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Costs</h1>
      <RepackCostsSection initialRows={initialRepackRows} />
    </div>
  );
}
