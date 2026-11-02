"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";

interface Row {
  id: number;
  pallets: string;
  commodity: string;
  qtyPerPallet: string;
  weightPerCase: string;
}

let nextId = 1;
function makeRow(): Row {
  return { id: nextId++, pallets: "", commodity: "", qtyPerPallet: "", weightPerCase: "" };
}

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function formatLbs(n: number) {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} lbs`;
}

function DropSection({
  title,
  rows,
  setRows,
  palletWeight,
}: {
  title: string;
  rows: Row[];
  setRows: (rows: Row[]) => void;
  palletWeight: number;
}) {
  const priced = useMemo(
    () =>
      rows.map((r) => {
        const pallets = parseFloat(r.pallets);
        const qty = parseFloat(r.qtyPerPallet);
        const weightCs = parseFloat(r.weightPerCase);
        const hasAll = !isNaN(pallets) && !isNaN(qty) && !isNaN(weightCs);
        const totalWeight = hasAll ? pallets * qty * weightCs + pallets * palletWeight : null;
        return { ...r, totalWeight };
      }),
    [rows, palletWeight],
  );

  const totalGross = priced.reduce((sum, r) => sum + (r.totalWeight ?? 0), 0);

  function updateRow(id: number, patch: Partial<Row>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows([...rows, makeRow()]);
  }

  function deleteRow(id: number) {
    setRows(rows.filter((r) => r.id !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{title}</h2>
        <p className="text-sm">
          Total Gross: <span className="font-semibold">{formatLbs(totalGross)}</span>
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Pallets</th>
              <th className="px-2 py-2">Commodity</th>
              <th className="px-2 py-2">Qty Per Pallet</th>
              <th className="px-2 py-2">Weight Per Case</th>
              <th className="px-2 py-2">Total Weight</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {priced.map((r) => (
              <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                <td className="min-w-[5rem] px-1 py-1">
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
                    value={r.commodity}
                    onChange={(e) => updateRow(r.id, { commodity: e.target.value })}
                    className={field}
                  />
                </td>
                <td className="min-w-[7rem] px-1 py-1">
                  <input
                    type="number"
                    step="any"
                    value={r.qtyPerPallet}
                    onChange={(e) => updateRow(r.id, { qtyPerPallet: e.target.value })}
                    className={field}
                  />
                </td>
                <td className="min-w-[7rem] px-1 py-1">
                  <input
                    type="number"
                    step="any"
                    value={r.weightPerCase}
                    onChange={(e) => updateRow(r.id, { weightPerCase: e.target.value })}
                    className={field}
                  />
                </td>
                <td className="min-w-[8rem] px-3 py-1">
                  <span className="text-lg font-bold text-green-700 dark:text-green-400">
                    {r.totalWeight !== null ? formatLbs(r.totalWeight) : "-"}
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
  );
}

// The lines stay between visits (kept in this browser): Commodity, Qty Per Pallet and Weight Per
// Case. Pallets are per load, so they start empty each time. A line goes only when it is deleted.
const STORAGE_KEY = "hops-weight-calculator-lines";
type SavedLine = Pick<Row, "commodity" | "qtyPerPallet" | "weightPerCase">;

function readSaved(): { d1: SavedLine[]; d2: SavedLine[] } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || !Array.isArray(parsed.d1) || !Array.isArray(parsed.d2)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function fromSaved(lines: SavedLine[]): Row[] {
  return lines.map((l) => ({ ...makeRow(), commodity: l.commodity ?? "", qtyPerPallet: l.qtyPerPallet ?? "", weightPerCase: l.weightPerCase ?? "" }));
}

function toSaved(rows: Row[]): SavedLine[] {
  return rows.map(({ commodity, qtyPerPallet, weightPerCase }) => ({ commodity, qtyPerPallet, weightPerCase }));
}

export default function WeightCalculatorClient() {
  const confirm = useConfirm();
  const [palletWeight, setPalletWeight] = useState("40");
  const [rows1, setRows1] = useState<Row[]>([makeRow(), makeRow(), makeRow()]);
  const [rows2, setRows2] = useState<Row[]>([makeRow(), makeRow(), makeRow()]);
  const [loaded, setLoaded] = useState(false);

  // Saving waits for the load below, so the empty starting rows never overwrite what was saved.
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ d1: toSaved(rows1), d2: toSaved(rows2) }));
    } catch {
      // storage blocked - the calculator still works, the lines just are not kept
    }
  }, [loaded, rows1, rows2]);

  useEffect(() => {
    const saved = readSaved();
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows1(fromSaved(saved.d1));
      setRows2(fromSaved(saved.d2));
    }
    setLoaded(true);
  }, []);

  const pw = parseFloat(palletWeight) || 0;

  function computeGross(rows: Row[]) {
    return rows.reduce((sum, r) => {
      const pallets = parseFloat(r.pallets);
      const qty = parseFloat(r.qtyPerPallet);
      const weightCs = parseFloat(r.weightPerCase);
      if (isNaN(pallets) || isNaN(qty) || isNaN(weightCs)) return sum;
      return sum + pallets * qty * weightCs + pallets * pw;
    }, 0);
  }

  const grandTotal = computeGross(rows1) + computeGross(rows2);

  // New load: empties the pallet counts but keeps the lines.
  function clearPallets() {
    setRows1(rows1.map((r) => ({ ...r, pallets: "" })));
    setRows2(rows2.map((r) => ({ ...r, pallets: "" })));
  }

  async function deleteAllLines() {
    if (!(await confirm("Delete every saved line in both drop sections?"))) return;
    setRows1([makeRow(), makeRow(), makeRow()]);
    setRows2([makeRow(), makeRow(), makeRow()]);
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)] px-4 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Weight Calculator</h1>
          <div className="flex items-center gap-4">
            <button onClick={clearPallets} className="text-sm font-medium text-green-700 hover:underline dark:text-green-400" title="Empty the pallet counts for a new load - the lines stay">
              Clear Pallets
            </button>
            <button onClick={() => void deleteAllLines()} className="text-sm font-medium text-red-600 hover:underline">
              Delete All Lines
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Pallet Weight (lbs)</span>
            <input
              type="number"
              step="any"
              value={palletWeight}
              onChange={(e) => setPalletWeight(e.target.value)}
              className={`${field} w-28`}
            />
          </label>
          <div className="text-sm">
            <p className="text-black/60 dark:text-white/60">Grand Total (Both Drops)</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatLbs(grandTotal)}</p>
          </div>
        </div>

        <DropSection title="Drop 1" rows={rows1} setRows={setRows1} palletWeight={pw} />
        <DropSection title="Drop 2" rows={rows2} setRows={setRows2} palletWeight={pw} />
      </div>
    </div>
  );
}
