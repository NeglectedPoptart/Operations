"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useConfirm } from "@/components/ConfirmProvider";

interface Row {
  id: number;
  pallets: string;
  qtyPerPallet: string;
}

let nextId = 1;
function makeRow(): Row {
  return { id: nextId++, pallets: "", qtyPerPallet: "" };
}

// Digits and a single decimal point only - typing is the only way to
// change a cell's value now that arrow keys are reserved for navigation.
function sanitizeNumeric(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const cellField = "w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-right text-xs text-black";

type Col = "pallets" | "qtyPerPallet";

export default function FreightCalculatorClient() {
  const confirm = useConfirm();
  const [totalFreight, setTotalFreight] = useState("");
  const [rows, setRows] = useState<Row[]>([makeRow(), makeRow(), makeRow()]);
  const cellRefs = useRef<Map<string, HTMLInputElement>>(new Map());

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

  async function clearAll() {
    if (!(await confirm("Clear the total freight and all rows?"))) return;
    setTotalFreight("");
    setRows([makeRow(), makeRow(), makeRow()]);
  }

  function cellKey(rowIndex: number, col: Col) {
    return `${rowIndex}-${col}`;
  }

  function registerCell(rowIndex: number, col: Col) {
    return (el: HTMLInputElement | null) => {
      const key = cellKey(rowIndex, col);
      if (el) cellRefs.current.set(key, el);
      else cellRefs.current.delete(key);
    };
  }

  function focusCell(rowIndex: number, col: Col) {
    cellRefs.current.get(cellKey(rowIndex, col))?.focus();
  }

  // Arrow keys move between cells like a spreadsheet instead of nudging
  // the number - each cell selects its full value on focus (below), so
  // typing just replaces it rather than needing an in-place text cursor to
  // navigate around with the arrow keys.
  function handleCellKeyDown(e: KeyboardEvent<HTMLInputElement>, rowIndex: number, col: Col) {
    switch (e.key) {
      case "ArrowDown":
      case "Enter":
        e.preventDefault();
        focusCell(rowIndex + 1, col);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusCell(rowIndex - 1, col);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (col === "pallets") focusCell(rowIndex, "qtyPerPallet");
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (col === "qtyPerPallet") focusCell(rowIndex, "pallets");
        break;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Freight Calculator</h1>
        <button onClick={clearAll} className="text-sm font-medium text-red-600 hover:underline">
          Clear All
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-black/10 p-3 shadow-sm dark:border-white/10">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Total Freight ($)</span>
          <input
            type="text"
            inputMode="decimal"
            value={totalFreight}
            onChange={(e) => setTotalFreight(sanitizeNumeric(e.target.value))}
            onFocus={(e) => e.target.select()}
            placeholder="0.00"
            className="w-24 rounded border border-gray-300 bg-white px-1.5 py-1 text-sm text-black"
          />
        </label>
        <div className="text-xs">
          <p className="text-black/60 dark:text-white/60">Total Pallets</p>
          <p className="text-base font-semibold">{totalPallets}</p>
        </div>
        <div className="text-xs">
          <p className="text-black/60 dark:text-white/60">Freight Per Pallet</p>
          <p className="text-base font-semibold">{totalPallets > 0 ? formatMoney(freightPerPallet) : "-"}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="inline-block overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="text-xs">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-1.5 py-1">Pallets</th>
                <th className="px-1.5 py-1">Qty/Pallet</th>
                <th className="px-1.5 py-1">Price/Case</th>
                <th className="w-6 px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {priced.map((r, rowIndex) => (
                <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-1 py-0.5">
                    <input
                      ref={registerCell(rowIndex, "pallets")}
                      type="text"
                      inputMode="decimal"
                      value={r.pallets}
                      onChange={(e) => updateRow(r.id, { pallets: sanitizeNumeric(e.target.value) })}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "pallets")}
                      className={cellField}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <input
                      ref={registerCell(rowIndex, "qtyPerPallet")}
                      type="text"
                      inputMode="decimal"
                      value={r.qtyPerPallet}
                      onChange={(e) => updateRow(r.id, { qtyPerPallet: sanitizeNumeric(e.target.value) })}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "qtyPerPallet")}
                      className={cellField}
                    />
                  </td>
                  <td className="px-2 py-0.5">
                    <span className="text-sm font-bold text-green-700 dark:text-green-400">
                      {r.pricePerCase !== null ? r.pricePerCase.toFixed(4) : "-"}
                    </span>
                  </td>
                  <td className="px-1 py-0.5">
                    <button
                      onClick={() => deleteRow(r.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                      aria-label="Delete row"
                    >
                      ✕
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
