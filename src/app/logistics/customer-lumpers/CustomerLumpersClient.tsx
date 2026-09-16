"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import type { CustomerLumper } from "@/lib/types";
import { addCustomerLumperRow, deleteCustomerLumperRow, updateCustomerLumperRow } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

export default function CustomerLumpersClient({ initialRows }: { initialRows: CustomerLumper[] }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<CustomerLumper[]>(initialRows);
  const [adding, setAdding] = useState(false);

  function updateLocal(id: string, patch: Partial<CustomerLumper>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleAddRow() {
    setAdding(true);
    try {
      const nextPosition = rows.length > 0 ? Math.max(...rows.map((r) => r.position)) + 1 : 1;
      const row = await addCustomerLumperRow(nextPosition);
      setRows((prev) => [...prev, row]);
    } finally {
      setAdding(false);
    }
  }

  function handleFieldSave(
    id: string,
    patch: Partial<Pick<CustomerLumper, "customer" | "description" | "price" | "notes">>,
  ) {
    updateLocal(id, patch);
    updateCustomerLumperRow(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this row?"))) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    await deleteCustomerLumperRow(id).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Customer Lumpers</h1>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Customer</th>
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2">Price</th>
              <th className="px-2 py-2">Notes</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-1 py-1">
                  <input
                    defaultValue={row.customer ?? ""}
                    onBlur={(e) => handleFieldSave(row.id, { customer: e.target.value || null })}
                    className={field}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    defaultValue={row.description ?? ""}
                    onBlur={(e) => handleFieldSave(row.id, { description: e.target.value || null })}
                    className={field}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={row.price ?? ""}
                    onBlur={(e) =>
                      handleFieldSave(row.id, {
                        price: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className={field}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    defaultValue={row.notes ?? ""}
                    onBlur={(e) => handleFieldSave(row.id, { notes: e.target.value || null })}
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
                <td colSpan={5} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No customer lumper fees added yet.
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
