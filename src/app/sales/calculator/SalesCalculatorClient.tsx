"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { calcPurchasePrices, calcSalesPrices, type ProductLine } from "@/lib/salesCalculator";

type Mode = "sales" | "buy";

interface ProductRow {
  id: number;
  label: string;
  priceInput: string; // purchase price in "sales" mode, sales price in "buy" mode
  palletCount: string;
  inOutPerPallet: string;
  totalCases: string;
}

let nextId = 1;
function makeRow(label = ""): ProductRow {
  return { id: nextId++, label, priceInput: "", palletCount: "", inOutPerPallet: "", totalCases: "" };
}

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function num(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export default function SalesCalculatorClient() {
  const confirm = useConfirm();
  const [mode, setMode] = useState<Mode>("sales");
  const [commissionRate, setCommissionRate] = useState("10");
  const [totalFreight, setTotalFreight] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([makeRow()]);

  const rate = Math.min(10, Math.max(1, num(commissionRate))) / 100;
  const freight = num(totalFreight);
  const lines: ProductLine[] = rows.map((r) => ({
    palletCount: num(r.palletCount),
    inOutPerPallet: num(r.inOutPerPallet),
    totalCases: num(r.totalCases),
  }));
  const priceInputs = rows.map((r) => num(r.priceInput));
  const results = mode === "sales" ? calcSalesPrices(priceInputs, rate, freight, lines) : calcPurchasePrices(priceInputs, rate, freight, lines);
  const totalPallets = lines.reduce((sum, l) => sum + l.palletCount, 0);

  function updateRow(id: number, patch: Partial<ProductRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, makeRow()]);
  }

  function deleteRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  async function clearAll() {
    if (!(await confirm("Clear every field on the calculator?"))) return;
    setCommissionRate("10");
    setTotalFreight("");
    setRows([makeRow()]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sales Calculator</h1>
        <button onClick={clearAll} className="text-sm font-medium text-red-600 hover:underline">
          Clear All
        </button>
      </div>

      <div className="inline-flex rounded-md border border-black/10 p-1 dark:border-white/10">
        <button
          onClick={() => setMode("sales")}
          className={`rounded px-3 py-1.5 text-sm font-medium transition ${
            mode === "sales" ? "bg-green-600 text-white" : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
          }`}
        >
          Find Sales Price
        </button>
        <button
          onClick={() => setMode("buy")}
          className={`rounded px-3 py-1.5 text-sm font-medium transition ${
            mode === "buy" ? "bg-green-600 text-white" : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
          }`}
        >
          Find Buy Price
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-6 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Commission Rate (%, 1-10)</span>
          <input
            type="number"
            min={1}
            max={10}
            step="0.5"
            value={commissionRate}
            onChange={(e) => setCommissionRate(e.target.value)}
            className={`${field} w-24`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Total Freight for the Truck ($)</span>
          <input
            type="number"
            step="any"
            value={totalFreight}
            onChange={(e) => setTotalFreight(e.target.value)}
            placeholder="100.00"
            className={`${field} w-40`}
          />
        </label>
        <p className="max-w-xs text-xs text-black/50 dark:text-white/50">
          One freight cost for the whole trailer - split below by each product&apos;s share of the total pallets, so
          adding more products lowers everyone&apos;s cost per case.
        </p>
        {totalPallets > 0 && (
          <div className="text-sm">
            <p className="text-black/60 dark:text-white/60">Total Pallets</p>
            <p className="text-lg font-semibold">{totalPallets}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">{mode === "sales" ? "Purchase Price" : "Sales Price"} ($/case)</th>
                <th className="px-2 py-2">Pallets</th>
                <th className="px-2 py-2">In/Out ($/pallet)</th>
                <th className="px-2 py-2">Total Cases</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[8rem] px-1 py-1">
                    <input
                      value={r.label}
                      onChange={(e) => updateRow(r.id, { label: e.target.value })}
                      placeholder="e.g. Lettuce"
                      className={field}
                    />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      value={r.priceInput}
                      onChange={(e) => updateRow(r.id, { priceInput: e.target.value })}
                      placeholder="0.00"
                      className={field}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      value={r.palletCount}
                      onChange={(e) => updateRow(r.id, { palletCount: e.target.value })}
                      placeholder="2"
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      value={r.inOutPerPallet}
                      onChange={(e) => updateRow(r.id, { inOutPerPallet: e.target.value })}
                      placeholder="16.50"
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      value={r.totalCases}
                      onChange={(e) => updateRow(r.id, { totalCases: e.target.value })}
                      placeholder="80"
                      className={field}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {rows.length > 1 && (
                      <button onClick={() => deleteRow(r.id)} className="text-xs font-medium text-red-600 hover:underline">
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
          + Add Product
        </button>
      </div>

      <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
        <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-2 py-1.5">Product</th>
                <th className="px-2 py-1.5 text-right">Freight Share</th>
                <th className="px-2 py-1.5 text-right">In/Out Total</th>
                <th className="px-2 py-1.5 text-right">Cost/Case</th>
                <th className="px-2 py-1.5 text-right">Commission</th>
                <th className="px-2 py-1.5 text-right">Purchase Price</th>
                <th className="px-2 py-1.5 text-right">Sales Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const res = results[i];
                const hasInputs = lines[i].totalCases > 0 && r.priceInput.trim() !== "";
                return (
                  <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-2 py-1.5 font-medium">{r.label || `Product ${i + 1}`}</td>
                    {!hasInputs ? (
                      <td colSpan={6} className="px-2 py-1.5 text-black/40 dark:text-white/40">
                        Enter {mode === "sales" ? "a purchase price" : "a sales price"} and total cases.
                      </td>
                    ) : (
                      <>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(res.freightShare)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(res.inOutTotal)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(res.costPerCase)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(res.commission)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(res.purchasePrice)}</td>
                        <td className="px-2 py-1.5 text-right text-base font-bold tabular-nums text-green-700 dark:text-green-400">
                          {formatMoney(res.salesPrice)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
