"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { calcPurchasePrice, calcSalesPrice } from "@/lib/salesCalculator";

type Mode = "sales" | "buy";

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
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salesPrice, setSalesPrice] = useState("");
  const [commissionRate, setCommissionRate] = useState("10");
  const [totalFreight, setTotalFreight] = useState("");
  const [palletCount, setPalletCount] = useState("");
  const [inOutPerPallet, setInOutPerPallet] = useState("");
  const [totalCases, setTotalCases] = useState("");

  const inputs = {
    totalFreight: num(totalFreight),
    palletCount: num(palletCount),
    inOutPerPallet: num(inOutPerPallet),
    totalCases: num(totalCases),
  };
  const rate = Math.min(10, Math.max(1, num(commissionRate))) / 100;

  const result =
    mode === "sales" ? calcSalesPrice(num(purchasePrice), rate, inputs) : calcPurchasePrice(num(salesPrice), rate, inputs);

  const canCompute = inputs.totalCases > 0 && (mode === "sales" ? purchasePrice.trim() !== "" : salesPrice.trim() !== "");

  async function clearAll() {
    if (!(await confirm("Clear every field on the calculator?"))) return;
    setPurchasePrice("");
    setSalesPrice("");
    setCommissionRate("10");
    setTotalFreight("");
    setPalletCount("");
    setInOutPerPallet("");
    setTotalCases("");
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Inputs</h2>

          {mode === "sales" ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Purchase Price ($/case)</span>
              <input
                type="number"
                step="any"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
                className={field}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Sales Price ($/case)</span>
              <input
                type="number"
                step="any"
                value={salesPrice}
                onChange={(e) => setSalesPrice(e.target.value)}
                placeholder="0.00"
                className={field}
              />
            </label>
          )}

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

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Total Freight ($)</span>
              <input
                type="number"
                step="any"
                value={totalFreight}
                onChange={(e) => setTotalFreight(e.target.value)}
                placeholder="100.00"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Pallet Count</span>
              <input
                type="number"
                step="any"
                value={palletCount}
                onChange={(e) => setPalletCount(e.target.value)}
                placeholder="2"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">In/Out ($/pallet)</span>
              <input
                type="number"
                step="any"
                value={inOutPerPallet}
                onChange={(e) => setInOutPerPallet(e.target.value)}
                placeholder="16.50"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Total Cases</span>
              <input
                type="number"
                step="any"
                value={totalCases}
                onChange={(e) => setTotalCases(e.target.value)}
                placeholder="80"
                className={field}
              />
            </label>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Breakdown</h2>
          {!canCompute ? (
            <p className="text-sm text-black/40 dark:text-white/40">
              Enter {mode === "sales" ? "a purchase price" : "a sales price"} and the total cases to see the breakdown.
            </p>
          ) : (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-black/60 dark:text-white/60">In/Out Total ({inputs.palletCount} pallets)</span>
                <span className="tabular-nums">{formatMoney(result.inOutTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-black/60 dark:text-white/60">Warehouse Cost (freight + in/out)</span>
                <span className="tabular-nums">{formatMoney(result.warehouseCost)}</span>
              </div>
              <div className="flex justify-between border-b border-black/10 pb-1.5 dark:border-white/10">
                <span className="text-black/60 dark:text-white/60">Cost Per Case</span>
                <span className="tabular-nums">{formatMoney(result.costPerCase)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-black/60 dark:text-white/60">Commission ({(rate * 100).toFixed(1)}% of purchase)</span>
                <span className="tabular-nums">{formatMoney(result.commission)}</span>
              </div>
              <div className="flex justify-between border-b border-black/10 pb-1.5 dark:border-white/10">
                <span className="text-black/60 dark:text-white/60">Cost Addition (commission + cost/case)</span>
                <span className="tabular-nums">{formatMoney(result.costAddition)}</span>
              </div>

              <div className="flex justify-between pt-1">
                <span className="text-black/60 dark:text-white/60">Purchase Price</span>
                <span className="tabular-nums">{formatMoney(result.purchasePrice)}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-base font-bold">Sales Price</span>
                <span className="text-2xl font-bold text-green-700 dark:text-green-400">{formatMoney(result.salesPrice)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
