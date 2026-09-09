"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import type { SrInventoryLot, SrItem, SrLotStatus, SrVendor } from "@/lib/types";
import {
  addLot,
  createItem,
  createVendor,
  deleteItem,
  deleteLot,
  deleteVendor,
  updateItem,
  updateLot,
  updateVendor,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

const LOT_STATUSES: { value: SrLotStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "committed", label: "Committed" },
  { value: "shipped", label: "Shipped" },
  { value: "adjusted", label: "Adjusted" },
];

function itemLabel(item: SrItem): string {
  return [item.name, item.pack_style, item.size].filter(Boolean).join(" - ");
}

export default function InventoryClient({
  initialItems,
  initialVendors,
  initialLots,
}: {
  initialItems: SrItem[];
  initialVendors: SrVendor[];
  initialLots: SrInventoryLot[];
}) {
  const confirm = useConfirm();
  const [items, setItems] = useState(initialItems);
  const [vendors, setVendors] = useState(initialVendors);
  const [lots, setLots] = useState(initialLots);
  const [addingItem, setAddingItem] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [addingLot, setAddingLot] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newVendorName, setNewVendorName] = useState("");

  async function handleAddItem() {
    const name = newItemName.trim();
    if (!name) return;
    setAddingItem(true);
    try {
      const row = (await createItem(name)) as SrItem;
      setItems((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      setNewItemName("");
    } catch {
      alert(`Couldn't add "${name}" - an item with that name may already exist.`);
    } finally {
      setAddingItem(false);
    }
  }

  function handleItemSave(id: string, patch: Partial<SrItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    updateItem(id, patch).catch(() => {});
  }

  async function handleItemDelete(id: string, name: string) {
    if (!(await confirm(`Delete item "${name}"? Any inventory lots or order lines referencing it will show no item.`))) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteItem(id).catch(() => {});
  }

  async function handleAddVendor() {
    const name = newVendorName.trim();
    if (!name) return;
    setAddingVendor(true);
    try {
      const row = (await createVendor(name)) as SrVendor;
      setVendors((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      setNewVendorName("");
    } catch {
      alert(`Couldn't add "${name}" - a vendor with that name may already exist.`);
    } finally {
      setAddingVendor(false);
    }
  }

  function handleVendorSave(id: string, patch: Partial<SrVendor>) {
    setVendors((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    updateVendor(id, patch).catch(() => {});
  }

  async function handleVendorDelete(id: string, name: string) {
    if (!(await confirm(`Delete vendor "${name}"?`))) return;
    setVendors((prev) => prev.filter((v) => v.id !== id));
    await deleteVendor(id).catch(() => {});
  }

  async function handleAddLot() {
    setAddingLot(true);
    try {
      const row = (await addLot()) as SrInventoryLot;
      setLots((prev) => [row, ...prev]);
    } finally {
      setAddingLot(false);
    }
  }

  function handleLotSave(id: string, patch: Partial<SrInventoryLot>) {
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    updateLot(id, patch).catch(() => {});
  }

  async function handleLotDelete(id: string) {
    if (!(await confirm("Delete this inventory lot?"))) return;
    setLots((prev) => prev.filter((l) => l.id !== id));
    await deleteLot(id).catch(() => {});
  }

  const summary = useMemo(() => {
    const totalOnHand = lots.reduce((s, l) => s + (l.qty_on_hand ?? 0), 0);
    const available = lots.filter((l) => l.status === "available").length;
    return { totalLots: lots.length, totalOnHand, available };
  }, [lots]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Prototype ERP - Shipping/Receiving. One row per received lot (pallet-tag style), not per item, so aging and
          rotation stay visible per lot.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
          {summary.totalLots} lot{summary.totalLots === 1 ? "" : "s"}
        </span>
        <span className="rounded-full bg-black/5 px-3 py-1 text-sm dark:bg-white/10">
          {summary.available} available
        </span>
        <span className="rounded-full bg-black/5 px-3 py-1 text-sm dark:bg-white/10">
          {summary.totalOnHand.toLocaleString()} total qty on hand
        </span>
      </div>

      {/* Inventory Lots ------------------------------------------------------ */}
      <section className="space-y-2">
        <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
          Inventory Lots
        </h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">Lot #</th>
                <th className="px-2 py-2">Vendor</th>
                <th className="px-2 py-2">Received</th>
                <th className="px-2 py-2">Qty Rec.</th>
                <th className="px-2 py-2">Qty On Hand</th>
                <th className="px-2 py-2">Unit Cost</th>
                <th className="px-2 py-2">Warehouse</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Notes</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[9rem] px-1 py-1">
                    <select
                      value={lot.item_id ?? ""}
                      onChange={(e) => handleLotSave(lot.id, { item_id: e.target.value || null })}
                      className={field}
                    >
                      <option value="">--</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {itemLabel(i)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={lot.lot_number ?? ""}
                      onBlur={(e) => handleLotSave(lot.id, { lot_number: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <select
                      value={lot.vendor_id ?? ""}
                      onChange={(e) => handleLotSave(lot.id, { vendor_id: e.target.value || null })}
                      className={field}
                    >
                      <option value="">--</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="date"
                      defaultValue={lot.received_date ?? ""}
                      onBlur={(e) => handleLotSave(lot.id, { received_date: e.target.value || null })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      defaultValue={lot.qty_received ?? ""}
                      onBlur={(e) => handleLotSave(lot.id, { qty_received: e.target.value === "" ? null : Number(e.target.value) })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      defaultValue={lot.qty_on_hand ?? ""}
                      onBlur={(e) => handleLotSave(lot.id, { qty_on_hand: e.target.value === "" ? null : Number(e.target.value) })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      defaultValue={lot.unit_cost ?? ""}
                      onBlur={(e) => handleLotSave(lot.id, { unit_cost: e.target.value === "" ? null : Number(e.target.value) })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={lot.warehouse ?? ""}
                      onBlur={(e) => handleLotSave(lot.id, { warehouse: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <select
                      value={lot.status}
                      onChange={(e) => handleLotSave(lot.id, { status: e.target.value as SrLotStatus })}
                      className={field}
                    >
                      {LOT_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <input
                      defaultValue={lot.notes ?? ""}
                      onBlur={(e) => handleLotSave(lot.id, { notes: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => handleLotDelete(lot.id)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {lots.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    No inventory lots yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button
          onClick={handleAddLot}
          disabled={addingLot}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {addingLot ? "Adding..." : "+ Add Lot"}
        </button>
      </section>

      {/* Items ------------------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">Items</h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Pack Style</th>
                <th className="px-2 py-2">Size</th>
                <th className="px-2 py-2">Unit</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2">Active</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[8rem] px-1 py-1">
                    <input defaultValue={item.name} onBlur={(e) => handleItemSave(item.id, { name: e.target.value })} className={field} />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={item.pack_style ?? ""}
                      onBlur={(e) => handleItemSave(item.id, { pack_style: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input defaultValue={item.size ?? ""} onBlur={(e) => handleItemSave(item.id, { size: e.target.value })} className={field} />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input defaultValue={item.unit ?? ""} onBlur={(e) => handleItemSave(item.id, { unit: e.target.value })} className={field} />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      defaultValue={item.category ?? ""}
                      onBlur={(e) => handleItemSave(item.id, { category: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={item.active}
                      onChange={(e) => handleItemSave(item.id, { active: e.target.checked })}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => handleItemDelete(item.id, item.name)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    No items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Add an item..."
            className={`${field} max-w-xs`}
          />
          <button
            onClick={handleAddItem}
            disabled={addingItem || newItemName.trim() === ""}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {addingItem ? "Adding..." : "+ Add Item"}
          </button>
        </div>
      </section>

      {/* Vendors ------------------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">Vendors</h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Contact</th>
                <th className="px-2 py-2">Phone</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Notes</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[8rem] px-1 py-1">
                    <input defaultValue={v.name} onBlur={(e) => handleVendorSave(v.id, { name: e.target.value })} className={field} />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      defaultValue={v.contact_name ?? ""}
                      onBlur={(e) => handleVendorSave(v.id, { contact_name: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input defaultValue={v.phone ?? ""} onBlur={(e) => handleVendorSave(v.id, { phone: e.target.value })} className={field} />
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <input defaultValue={v.email ?? ""} onBlur={(e) => handleVendorSave(v.id, { email: e.target.value })} className={field} />
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <input defaultValue={v.notes ?? ""} onBlur={(e) => handleVendorSave(v.id, { notes: e.target.value })} className={field} />
                  </td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => handleVendorDelete(v.id, v.name)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {vendors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    No vendors yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newVendorName}
            onChange={(e) => setNewVendorName(e.target.value)}
            placeholder="Add a vendor..."
            className={`${field} max-w-xs`}
          />
          <button
            onClick={handleAddVendor}
            disabled={addingVendor || newVendorName.trim() === ""}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {addingVendor ? "Adding..." : "+ Add Vendor"}
          </button>
        </div>
      </section>
    </div>
  );
}
