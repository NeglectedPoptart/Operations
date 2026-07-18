"use client";

import { useMemo, useState } from "react";

interface Row {
  id: number;
  pallets: string;
  qtyPerPallet: string;
}

let nextId = 1;
function makeRow(): Row {
  return { id: nextId++, pallets: "", qtyPerPallet: "" };
}

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function FreightCalculatorClient() {
  const [totalFreight, setTotalFreight] = useState("");
  const [rows, setRows] = useState<Row[]>([makeRow(), makeRow(), makeRow()]);

  const freight = parseFloat(totalFreight) || 0;
  const totalPallets = rows.reduce((sum, r) => sum + (parseFloat(r.pallets) || 0), 0);
  const freightPerPallet = totalPallets > 0 ? freight / totalPallets : 0;

  const priced = useMemo(
    () =>
      rows.map((r) => {
        const qty = parseFloat(r.qtyPerPallet);
        const hasQty = !isNaN(qty) && qty > 0;
        const pricePerCase = hasQty && totalPallets > 0 ? freightPerPallet / qty : null;
        return { ...r, pricePerCase };
      }),
    [rows, freightPerPallet, totalPallets],
  );

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, makeRow()]);
  }

  function deleteRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function clearAll() {
    if (!confirm("Clear the total freight and all rows?")) return;
    setTotalFreight("");
    setRows([makeRow(), makeRow(), makeRow()]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Freight Calculator</h1>
        <button
          onClick={clearAll}
          className="text-sm font-medium text-red-600 hover:underline"
        >
          Clear All
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Total Freight ($)</span>
          <input
            type="number"
            step="any"
            value={totalFreight}
            onChange={(e) => setTotalFreight(e.target.value)}
            placeholder="0.00"
            className={`${field} w-40`}
          />
        </label>
        <div className="text-sm">
          <p className="text-black/60 dark:text-white/60">Total Pallets</p>
          <p className="text-lg font-semibold">{totalPallets}</p>
        </div>
        <div className="text-sm">
          <p className="text-black/60 dark:text-white/60">Freight Per Pallet</p>
          <p className="text-lg font-semibold">{totalPallets > 0 ? formatMoney(freightPerPallet) : "-"}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-2 py-2">Pallets</th>
                <th className="px-2 py-2">Qty Per Pallet</th>
                <th className="px-2 py-2">Price Per Case</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {priced.map((r) => (
                <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      value={r.pallets}
                      onChange={(e) => updateRow(r.id, { pallets: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      value={r.qtyPerPallet}
                      onChange={(e) => updateRow(r.id, { qtyPerPallet: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[8rem] px-3 py-1">
                    <span className="text-xl font-bold text-green-700 dark:text-green-400">
                      {r.pricePerCase !== null ? r.pricePerCase.toFixed(4) : "-"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => deleteRow(r.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={addRow}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          + Add Row
        </button>
      </div>
    </div>
  );
}
