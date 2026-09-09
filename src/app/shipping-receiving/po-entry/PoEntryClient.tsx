"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate } from "@/lib/dates";
import { SR_PO_STATUSES, type SrItem, type SrPoLine, type SrPoStatus, type SrPurchaseOrder, type SrVendor } from "@/lib/types";
import {
  addPoLine,
  createPurchaseOrder,
  deletePoLine,
  deletePurchaseOrder,
  receivePoLine,
  updatePoLine,
  updatePurchaseOrder,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

const STATUS_BADGE: Record<SrPoStatus, string> = {
  open: "bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60",
  partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  received: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  closed: "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50",
};

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReceiveForm({
  disabled,
  onReceive,
}: {
  disabled: boolean;
  onReceive: (qty: number, lotNumber: string, warehouse: string) => Promise<void>;
}) {
  const [qty, setQty] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [receiving, setReceiving] = useState(false);

  async function handleReceive() {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return;
    setReceiving(true);
    try {
      await onReceive(n, lotNumber, warehouse);
      setQty("");
      setLotNumber("");
      setWarehouse("");
    } finally {
      setReceiving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md bg-black/5 p-2 dark:bg-white/5">
      <label className="text-xs">
        Receive Qty
        <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={`${field} mt-1 w-24`} />
      </label>
      <label className="text-xs">
        Lot #
        <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} className={`${field} mt-1 w-28`} />
      </label>
      <label className="text-xs">
        Warehouse
        <input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className={`${field} mt-1 w-28`} />
      </label>
      <button
        onClick={handleReceive}
        disabled={disabled || receiving || qty.trim() === ""}
        className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {receiving ? "Receiving..." : "Receive"}
      </button>
    </div>
  );
}

export default function PoEntryClient({
  initialPurchaseOrders,
  initialLines,
  items,
  vendors,
}: {
  initialPurchaseOrders: SrPurchaseOrder[];
  initialLines: SrPoLine[];
  items: SrItem[];
  vendors: SrVendor[];
}) {
  const confirm = useConfirm();
  const [purchaseOrders, setPurchaseOrders] = useState(initialPurchaseOrders);
  const [lines, setLines] = useState(initialLines);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newPoNumber, setNewPoNumber] = useState("");
  const [newPoVendorId, setNewPoVendorId] = useState("");
  const [addingPo, setAddingPo] = useState(false);

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddPo() {
    const poNumber = newPoNumber.trim();
    if (!poNumber) return;
    setAddingPo(true);
    try {
      const row = (await createPurchaseOrder(poNumber, newPoVendorId || null)) as SrPurchaseOrder;
      setPurchaseOrders((prev) => [row, ...prev]);
      setNewPoNumber("");
      setNewPoVendorId("");
      setExpandedIds((prev) => new Set(prev).add(row.id));
    } catch {
      alert(`Couldn't create PO "${poNumber}" - that number may already be in use.`);
    } finally {
      setAddingPo(false);
    }
  }

  function handlePoSave(id: string, patch: Partial<SrPurchaseOrder>) {
    setPurchaseOrders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    updatePurchaseOrder(id, patch).catch(() => {});
  }

  async function handlePoDelete(id: string, poNumber: string) {
    if (!(await confirm(`Delete PO "${poNumber}" and all its lines? Inventory lots already received from it are kept.`))) return;
    setPurchaseOrders((prev) => prev.filter((p) => p.id !== id));
    setLines((prev) => prev.filter((l) => l.po_id !== id));
    await deletePurchaseOrder(id).catch(() => {});
  }

  async function handleAddLine(poId: string) {
    const poLines = lines.filter((l) => l.po_id === poId);
    const nextPosition = poLines.length > 0 ? Math.max(...poLines.map((l) => l.position)) + 1 : 1;
    const row = (await addPoLine(poId, nextPosition)) as SrPoLine;
    setLines((prev) => [...prev, row]);
  }

  function handleLineSave(id: string, patch: Partial<SrPoLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    updatePoLine(id, patch).catch(() => {});
  }

  async function handleLineDelete(id: string) {
    if (!(await confirm("Delete this line?"))) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
    await deletePoLine(id).catch(() => {});
  }

  async function handleReceive(po: SrPurchaseOrder, line: SrPoLine, qty: number, lotNumber: string, warehouse: string) {
    const result = await receivePoLine(line.id, po.id, line.item_id, po.vendor_id, qty, line.unit_cost, lotNumber, warehouse);
    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, qty_received: result.newQtyReceived } : l)));
    setPurchaseOrders((prev) => prev.map((p) => (p.id === po.id ? { ...p, status: result.status } : p)));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">PO Entry</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Prototype ERP - Shipping/Receiving. Receiving a line creates a real inventory lot and updates the PO&apos;s
          status automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newPoNumber}
          onChange={(e) => setNewPoNumber(e.target.value)}
          placeholder="PO Number..."
          className={`${field} max-w-[10rem]`}
        />
        <select value={newPoVendorId} onChange={(e) => setNewPoVendorId(e.target.value)} className={`${field} max-w-xs`}>
          <option value="">-- Vendor --</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleAddPo}
          disabled={addingPo || newPoNumber.trim() === ""}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {addingPo ? "Adding..." : "+ Add PO"}
        </button>
      </div>

      <div className="space-y-2">
        {purchaseOrders.map((po) => {
          const expanded = expandedIds.has(po.id);
          const poLines = lines.filter((l) => l.po_id === po.id).sort((a, b) => a.position - b.position);
          const vendor = vendors.find((v) => v.id === po.vendor_id);
          return (
            <div key={po.id} className="rounded-lg border border-black/10 dark:border-white/10">
              <button
                onClick={() => toggle(po.id)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                <span className="flex items-center gap-2 font-medium">
                  <ChevronIcon expanded={expanded} />
                  {po.po_number}
                  {vendor && <span className="font-normal text-black/50 dark:text-white/50">- {vendor.name}</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[po.status]}`}>
                  {SR_PO_STATUSES.find((s) => s.value === po.status)?.label}
                </span>
              </button>

              {expanded && (
                <div className="space-y-3 border-t border-black/10 p-4 dark:border-white/10">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="text-xs font-medium">
                      Vendor
                      <select
                        value={po.vendor_id ?? ""}
                        onChange={(e) => handlePoSave(po.id, { vendor_id: e.target.value || null })}
                        className={`${field} mt-1`}
                      >
                        <option value="">--</option>
                        {vendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium">
                      Order Date
                      <input
                        type="date"
                        defaultValue={po.order_date ?? ""}
                        onBlur={(e) => handlePoSave(po.id, { order_date: e.target.value || null })}
                        className={`${field} mt-1`}
                      />
                    </label>
                    <label className="text-xs font-medium">
                      Notes
                      <input
                        defaultValue={po.notes ?? ""}
                        onBlur={(e) => handlePoSave(po.id, { notes: e.target.value })}
                        className={`${field} mt-1`}
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    {poLines.map((line) => {
                      const item = items.find((i) => i.id === line.item_id);
                      const fullyReceived = (line.qty_ordered ?? 0) > 0 && line.qty_received >= (line.qty_ordered ?? 0);
                      return (
                        <div key={line.id} className="space-y-2 rounded-md border border-black/10 p-3 dark:border-white/10">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                            <label className="text-xs font-medium">
                              Item
                              <select
                                value={line.item_id ?? ""}
                                onChange={(e) => handleLineSave(line.id, { item_id: e.target.value || null })}
                                className={`${field} mt-1`}
                              >
                                <option value="">--</option>
                                {items.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-xs font-medium">
                              Qty Ordered
                              <input
                                type="number"
                                step="any"
                                defaultValue={line.qty_ordered ?? ""}
                                onBlur={(e) => handleLineSave(line.id, { qty_ordered: e.target.value === "" ? null : Number(e.target.value) })}
                                className={`${field} mt-1`}
                              />
                            </label>
                            <label className="text-xs font-medium">
                              Unit Cost
                              <input
                                type="number"
                                step="any"
                                defaultValue={line.unit_cost ?? ""}
                                onBlur={(e) => handleLineSave(line.id, { unit_cost: e.target.value === "" ? null : Number(e.target.value) })}
                                className={`${field} mt-1`}
                              />
                            </label>
                            <div className="text-xs font-medium">
                              Qty Received
                              <p className="mt-1 rounded border border-transparent px-2 py-1 text-sm font-semibold">
                                {line.qty_received} {item ? `of ${line.qty_ordered ?? "?"}` : ""}
                              </p>
                            </div>
                          </div>
                          <ReceiveForm disabled={fullyReceived} onReceive={(qty, lotNumber, warehouse) => handleReceive(po, line, qty, lotNumber, warehouse)} />
                          <div className="text-right">
                            <button onClick={() => handleLineDelete(line.id)} className="text-xs font-medium text-red-600 hover:underline">
                              Delete Line
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {poLines.length === 0 && <p className="text-sm text-black/40 dark:text-white/40">No lines yet.</p>}
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleAddLine(po.id)}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      + Add Line
                    </button>
                    <button onClick={() => handlePoDelete(po.id, po.po_number)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete PO
                    </button>
                  </div>
                  <p className="text-xs text-black/40 dark:text-white/40">Created {formatDate(po.order_date)}</p>
                </div>
              )}
            </div>
          );
        })}
        {purchaseOrders.length === 0 && (
          <p className="px-1 text-sm text-black/40 dark:text-white/40">No purchase orders yet - add one above.</p>
        )}
      </div>
    </div>
  );
}
