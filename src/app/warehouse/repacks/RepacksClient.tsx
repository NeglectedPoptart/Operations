"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { addDays, formatDateSlash, todayISO } from "@/lib/dates";
import { costPerCase, money, qtyText, type Repack } from "@/lib/repacks";
import type { RepackItem } from "@/lib/types";
import { deleteRepack, saveRepack } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black placeholder:text-black/40";
const btn = "rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";
const btnGreen = "rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50";

const num = (s: string): number | null => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

interface Form {
  id?: string;
  repack_date: string;
  product_in: string;
  qty_in: string;
  product_out: string;
  qty_out: string;
  cartons_used: string;
  carton_type: string;
  cost: string;
  notes: string;
  supplies: { itemId: string; qty: string }[];
}

const emptyForm = (): Form => ({
  repack_date: todayISO(),
  product_in: "",
  qty_in: "",
  product_out: "",
  qty_out: "",
  cartons_used: "",
  carton_type: "",
  cost: "",
  notes: "",
  supplies: [],
});

const fromRepack = (r: Repack): Form => ({
  id: r.id,
  repack_date: r.repack_date,
  product_in: r.product_in,
  qty_in: r.qty_in === null ? "" : String(r.qty_in),
  product_out: r.product_out,
  qty_out: r.qty_out === null ? "" : String(r.qty_out),
  cartons_used: r.cartons_used === null ? "" : String(r.cartons_used),
  carton_type: r.carton_type ?? "",
  cost: r.cost === null ? "" : String(r.cost),
  notes: r.notes ?? "",
  supplies: r.supplies.map((s) => ({ itemId: s.itemId, qty: String(s.qty) })),
});

export default function RepacksClient({ initialRepacks, supplyItems }: { initialRepacks: Repack[]; supplyItems: RepackItem[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(() => addDays(todayISO(), -30));
  const [to, setTo] = useState(() => todayISO());
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const shown = initialRepacks.filter(
    (r) =>
      r.repack_date >= from &&
      r.repack_date <= to &&
      (!q || `${r.product_in} ${r.product_out} ${r.notes ?? ""} ${r.carton_type ?? ""} ${r.supplies.map((s) => s.name).join(" ")}`.toLowerCase().includes(q)),
  );
  const totalCost = shown.reduce((s, r) => s + (r.cost ?? 0), 0);
  const totalOut = shown.reduce((s, r) => s + (r.qty_out ?? 0), 0);
  const totalCartons = shown.reduce((s, r) => s + (r.cartons_used ?? 0), 0);

  // Product names used before, offered as you type.
  const productNames = [...new Set(initialRepacks.flatMap((r) => [r.product_in, r.product_out]).filter(Boolean))].sort();

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    const result = await saveRepack({
      id: form.id,
      repack_date: form.repack_date,
      product_in: form.product_in,
      qty_in: num(form.qty_in),
      product_out: form.product_out,
      qty_out: num(form.qty_out),
      cartons_used: num(form.cartons_used),
      carton_type: form.carton_type,
      cost: num(form.cost),
      notes: form.notes,
      supplies: form.supplies.map((s) => ({ itemId: s.itemId, qty: Number(s.qty) })),
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setForm(null);
    router.refresh();
  }

  async function remove(r: Repack) {
    const extra = r.supplies.length > 0 ? " The supplies it used go back into Repack Inventory." : "";
    if (!(await confirm(`Delete the ${formatDateSlash(r.repack_date)} repack (${r.product_in || "?"} -> ${r.product_out || "?"})?${extra}`))) return;
    const result = await deleteRepack(r.id);
    if ("error" in result) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8 lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Repacks</h1>
            <p className="text-sm text-black/60 dark:text-white/60">Every repack we do: what went in, what came out, the cartons used and the cost. Supplies used come off Repack Inventory.</p>
          </div>
          <button onClick={() => { setForm(emptyForm()); setError(null); }} className={btnGreen}>
            + Log a repack
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
          <label className="text-xs font-medium text-black/60 dark:text-white/60">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-0.5 block w-40`} />
          </label>
          <label className="text-xs font-medium text-black/60 dark:text-white/60">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} mt-0.5 block w-40`} />
          </label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, notes, supplies..." className={`${field} w-64`} />
          <div className="ml-auto flex flex-wrap gap-4 text-sm">
            <span>
              <b>{shown.length}</b> repack{shown.length === 1 ? "" : "s"}
            </span>
            <span>
              <b>{qtyText(totalOut)}</b> cases out
            </span>
            <span>
              <b>{qtyText(totalCartons)}</b> cartons used
            </span>
            <span>
              <b>{money(totalCost)}</b> total cost
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left text-xs dark:bg-white/10">
              <tr>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Product in</th>
                <th className="px-2 py-2">Product out</th>
                <th className="px-2 py-2">Cartons used</th>
                <th className="px-2 py-2">Supplies from Repack Inventory</th>
                <th className="px-2 py-2 text-right">Cost</th>
                <th className="px-2 py-2 text-right">Cost / case out</th>
                <th className="px-2 py-2">Notes</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const per = costPerCase(r);
                return (
                  <tr key={r.id} className="border-t border-black/10 align-top dark:border-white/10">
                    <td className="whitespace-nowrap px-2 py-1.5">{formatDateSlash(r.repack_date)}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-medium">{r.product_in}</span>
                      {r.qty_in !== null && <span className="block text-xs opacity-60">{qtyText(r.qty_in)} cases</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="font-medium">{r.product_out}</span>
                      {r.qty_out !== null && <span className="block text-xs opacity-60">{qtyText(r.qty_out)} cases</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.cartons_used !== null ? qtyText(r.cartons_used) : ""}
                      {r.carton_type && <span className="block text-xs opacity-60">{r.carton_type}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      {r.supplies.map((s) => (
                        <div key={s.itemId}>
                          {s.name} x {qtyText(s.qty)}
                        </div>
                      ))}
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium">{r.cost !== null ? money(r.cost) : ""}</td>
                    <td className="px-2 py-1.5 text-right text-xs">{per !== null ? money(per) : ""}</td>
                    <td className="max-w-xs px-2 py-1.5 text-xs">
                      {r.notes}
                      {r.created_by && <span className="block opacity-50">by {r.created_by}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs">
                      <button onClick={() => { setForm(fromRepack(r)); setError(null); }} className="mr-2 font-medium text-green-700 hover:underline dark:text-green-400">
                        Edit
                      </button>
                      <button onClick={() => void remove(r)} className="font-medium text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-black/50 dark:text-white/50">
                    {initialRepacks.length === 0 ? "No repacks logged yet - press + Log a repack." : "No repacks in this date range."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10" onClick={() => !saving && setForm(null)}>
          <div className="w-full max-w-2xl space-y-3 rounded-xl bg-white p-5 text-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">{form.id ? "Edit repack" : "Log a repack"}</h2>
            <datalist id="repack-products">
              {productNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            <label className="block text-xs font-medium">
              Date
              <input type="date" value={form.repack_date} onChange={(e) => set("repack_date", e.target.value)} className={`${field} mt-0.5 w-44`} />
            </label>

            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <label className="text-xs font-medium">
                Product in
                <input list="repack-products" value={form.product_in} onChange={(e) => set("product_in", e.target.value)} placeholder="e.g. Iceberg Lettuce 24 Cello" className={`${field} mt-0.5`} />
              </label>
              <label className="text-xs font-medium">
                Cases in
                <input type="number" min={0} step="any" value={form.qty_in} onChange={(e) => set("qty_in", e.target.value)} className={`${field} mt-0.5`} />
              </label>
              <label className="text-xs font-medium">
                Product out
                <input list="repack-products" value={form.product_out} onChange={(e) => set("product_out", e.target.value)} placeholder="e.g. Iceberg Lettuce 24 Liner" className={`${field} mt-0.5`} />
              </label>
              <label className="text-xs font-medium">
                Cases out
                <input type="number" min={0} step="any" value={form.qty_out} onChange={(e) => set("qty_out", e.target.value)} className={`${field} mt-0.5`} />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs font-medium">
                Cartons used
                <input type="number" min={0} step="any" value={form.cartons_used} onChange={(e) => set("cartons_used", e.target.value)} className={`${field} mt-0.5`} />
              </label>
              <label className="text-xs font-medium">
                Carton type
                <input value={form.carton_type} onChange={(e) => set("carton_type", e.target.value)} placeholder="e.g. Liner 24" className={`${field} mt-0.5`} />
              </label>
              <label className="text-xs font-medium">
                Cost $ (whole job)
                <input type="number" min={0} step="0.01" value={form.cost} onChange={(e) => set("cost", e.target.value)} className={`${field} mt-0.5`} />
              </label>
            </div>

            <div className="space-y-1.5 rounded-lg border border-black/15 p-2.5">
              <p className="text-xs font-bold text-green-700">Supplies used from Repack Inventory (optional)</p>
              <p className="text-[11px] text-black/60">Whatever you list here comes off the Repack Inventory count, and goes back if you delete this repack.</p>
              {form.supplies.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={s.itemId}
                    onChange={(e) => set("supplies", form.supplies.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}
                    className={`${field} flex-1`}
                  >
                    {supplyItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({qtyText(item.current_stock)} on hand)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={s.qty}
                    onChange={(e) => set("supplies", form.supplies.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                    placeholder="Qty used"
                    className={`${field} w-28`}
                  />
                  <button onClick={() => set("supplies", form.supplies.filter((_, j) => j !== i))} className="text-xs font-medium text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              ))}
              {supplyItems.length > 0 ? (
                <button onClick={() => set("supplies", [...form.supplies, { itemId: supplyItems[0].id, qty: "" }])} className={btn}>
                  + Add a supply
                </button>
              ) : (
                <p className="text-xs text-black/50">No items in Repack Inventory yet.</p>
              )}
            </div>

            <label className="block text-xs font-medium">
              Notes
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={`${field} mt-0.5`} />
            </label>

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setForm(null)} disabled={saving} className={btn}>
                Cancel
              </button>
              <button onClick={() => void save()} disabled={saving} className={btnGreen}>
                {saving ? "Saving..." : "Save repack"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
