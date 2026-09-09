"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate } from "@/lib/dates";
import { SR_SO_STATUSES, type SrCustomer, type SrItem, type SrSalesOrder, type SrSoLine, type SrSoStatus } from "@/lib/types";
import {
  addSoLine,
  createCustomer,
  createSalesOrder,
  deleteCustomer,
  deleteSalesOrder,
  deleteSoLine,
  updateCustomer,
  updateSalesOrder,
  updateSoLine,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

const STATUS_BADGE: Record<SrSoStatus, string> = {
  open: "bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60",
  shipped: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  invoiced: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
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

export default function OrderEntryClient({
  initialSalesOrders,
  initialLines,
  items,
  initialCustomers,
}: {
  initialSalesOrders: SrSalesOrder[];
  initialLines: SrSoLine[];
  items: SrItem[];
  initialCustomers: SrCustomer[];
}) {
  const confirm = useConfirm();
  const [salesOrders, setSalesOrders] = useState(initialSalesOrders);
  const [lines, setLines] = useState(initialLines);
  const [customers, setCustomers] = useState(initialCustomers);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newOrderNumber, setNewOrderNumber] = useState("");
  const [newOrderCustomerId, setNewOrderCustomerId] = useState("");
  const [addingOrder, setAddingOrder] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddOrder() {
    const orderNumber = newOrderNumber.trim();
    if (!orderNumber) return;
    setAddingOrder(true);
    try {
      const row = (await createSalesOrder(orderNumber, newOrderCustomerId || null)) as SrSalesOrder;
      setSalesOrders((prev) => [row, ...prev]);
      setNewOrderNumber("");
      setNewOrderCustomerId("");
      setExpandedIds((prev) => new Set(prev).add(row.id));
    } catch {
      alert(`Couldn't create order "${orderNumber}" - that number may already be in use.`);
    } finally {
      setAddingOrder(false);
    }
  }

  function handleOrderSave(id: string, patch: Partial<SrSalesOrder>) {
    setSalesOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    updateSalesOrder(id, patch).catch(() => {});
  }

  async function handleOrderDelete(id: string, orderNumber: string) {
    if (!(await confirm(`Delete order "${orderNumber}" and all its lines?`))) return;
    setSalesOrders((prev) => prev.filter((o) => o.id !== id));
    setLines((prev) => prev.filter((l) => l.so_id !== id));
    await deleteSalesOrder(id).catch(() => {});
  }

  async function handleAddLine(soId: string) {
    const soLines = lines.filter((l) => l.so_id === soId);
    const nextPosition = soLines.length > 0 ? Math.max(...soLines.map((l) => l.position)) + 1 : 1;
    const row = (await addSoLine(soId, nextPosition)) as SrSoLine;
    setLines((prev) => [...prev, row]);
  }

  function handleLineSave(id: string, patch: Partial<SrSoLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    updateSoLine(id, patch).catch(() => {});
  }

  async function handleLineDelete(id: string) {
    if (!(await confirm("Delete this line?"))) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
    await deleteSoLine(id).catch(() => {});
  }

  async function handleAddCustomer() {
    const name = newCustomerName.trim();
    if (!name) return;
    setAddingCustomer(true);
    try {
      const row = (await createCustomer(name)) as SrCustomer;
      setCustomers((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCustomerName("");
    } catch {
      alert(`Couldn't add "${name}" - a customer with that name may already exist.`);
    } finally {
      setAddingCustomer(false);
    }
  }

  function handleCustomerSave(id: string, patch: Partial<SrCustomer>) {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    updateCustomer(id, patch).catch(() => {});
  }

  async function handleCustomerDelete(id: string, name: string) {
    if (!(await confirm(`Delete customer "${name}"?`))) return;
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    await deleteCustomer(id).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Order Entry</h1>
        <p className="text-sm text-black/60 dark:text-white/60">Prototype ERP - Shipping/Receiving.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newOrderNumber}
          onChange={(e) => setNewOrderNumber(e.target.value)}
          placeholder="Order Number..."
          className={`${field} max-w-[10rem]`}
        />
        <select value={newOrderCustomerId} onChange={(e) => setNewOrderCustomerId(e.target.value)} className={`${field} max-w-xs`}>
          <option value="">-- Customer --</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleAddOrder}
          disabled={addingOrder || newOrderNumber.trim() === ""}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {addingOrder ? "Adding..." : "+ Add Order"}
        </button>
      </div>

      <div className="space-y-2">
        {salesOrders.map((so) => {
          const expanded = expandedIds.has(so.id);
          const soLines = lines.filter((l) => l.so_id === so.id).sort((a, b) => a.position - b.position);
          const customer = customers.find((c) => c.id === so.customer_id);
          return (
            <div key={so.id} className="rounded-lg border border-black/10 dark:border-white/10">
              <button
                onClick={() => toggle(so.id)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                <span className="flex items-center gap-2 font-medium">
                  <ChevronIcon expanded={expanded} />
                  {so.order_number}
                  {customer && <span className="font-normal text-black/50 dark:text-white/50">- {customer.name}</span>}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[so.status]}`}>
                  {SR_SO_STATUSES.find((s) => s.value === so.status)?.label}
                </span>
              </button>

              {expanded && (
                <div className="space-y-3 border-t border-black/10 p-4 dark:border-white/10">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <label className="text-xs font-medium">
                      Customer
                      <select
                        value={so.customer_id ?? ""}
                        onChange={(e) => handleOrderSave(so.id, { customer_id: e.target.value || null })}
                        className={`${field} mt-1`}
                      >
                        <option value="">--</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium">
                      Order Date
                      <input
                        type="date"
                        defaultValue={so.order_date ?? ""}
                        onBlur={(e) => handleOrderSave(so.id, { order_date: e.target.value || null })}
                        className={`${field} mt-1`}
                      />
                    </label>
                    <label className="text-xs font-medium">
                      Ship Date
                      <input
                        type="date"
                        defaultValue={so.ship_date ?? ""}
                        onBlur={(e) => handleOrderSave(so.id, { ship_date: e.target.value || null })}
                        className={`${field} mt-1`}
                      />
                    </label>
                    <label className="text-xs font-medium">
                      Notes
                      <input
                        defaultValue={so.notes ?? ""}
                        onBlur={(e) => handleOrderSave(so.id, { notes: e.target.value })}
                        className={`${field} mt-1`}
                      />
                    </label>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                    <table className="w-full text-sm">
                      <thead className="bg-black/5 text-left dark:bg-white/5">
                        <tr>
                          <th className="px-2 py-2">Item</th>
                          <th className="px-2 py-2">Qty Ordered</th>
                          <th className="px-2 py-2">Unit Price</th>
                          <th className="px-2 py-2">Qty Shipped</th>
                          <th className="w-16 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {soLines.map((line) => (
                          <tr key={line.id} className="border-t border-black/10 dark:border-white/10">
                            <td className="min-w-[9rem] px-1 py-1">
                              <select
                                value={line.item_id ?? ""}
                                onChange={(e) => handleLineSave(line.id, { item_id: e.target.value || null })}
                                className={field}
                              >
                                <option value="">--</option>
                                {items.map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="min-w-[6rem] px-1 py-1">
                              <input
                                type="number"
                                step="any"
                                defaultValue={line.qty_ordered ?? ""}
                                onBlur={(e) => handleLineSave(line.id, { qty_ordered: e.target.value === "" ? null : Number(e.target.value) })}
                                className={field}
                              />
                            </td>
                            <td className="min-w-[6rem] px-1 py-1">
                              <input
                                type="number"
                                step="any"
                                defaultValue={line.unit_price ?? ""}
                                onBlur={(e) => handleLineSave(line.id, { unit_price: e.target.value === "" ? null : Number(e.target.value) })}
                                className={field}
                              />
                            </td>
                            <td className="px-2 py-1.5">{line.qty_shipped}</td>
                            <td className="px-2 py-1.5">
                              <button onClick={() => handleLineDelete(line.id)} className="text-xs font-medium text-red-600 hover:underline">
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                        {soLines.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-3 text-center text-black/40 dark:text-white/40">
                              No lines yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleAddLine(so.id)}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      + Add Line
                    </button>
                    <button onClick={() => handleOrderDelete(so.id, so.order_number)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete Order
                    </button>
                  </div>
                  <p className="text-xs text-black/40 dark:text-white/40">Created {formatDate(so.order_date)}</p>
                </div>
              )}
            </div>
          );
        })}
        {salesOrders.length === 0 && (
          <p className="px-1 text-sm text-black/40 dark:text-white/40">No sales orders yet - add one above.</p>
        )}
      </div>

      {/* Customers ------------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">Customers</h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Contact</th>
                <th className="px-2 py-2">Phone</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Terms</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[8rem] px-1 py-1">
                    <input defaultValue={c.name} onBlur={(e) => handleCustomerSave(c.id, { name: e.target.value })} className={field} />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      defaultValue={c.contact_name ?? ""}
                      onBlur={(e) => handleCustomerSave(c.id, { contact_name: e.target.value })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input defaultValue={c.phone ?? ""} onBlur={(e) => handleCustomerSave(c.id, { phone: e.target.value })} className={field} />
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <input defaultValue={c.email ?? ""} onBlur={(e) => handleCustomerSave(c.id, { email: e.target.value })} className={field} />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input defaultValue={c.terms ?? ""} onBlur={(e) => handleCustomerSave(c.id, { terms: e.target.value })} className={field} />
                  </td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => handleCustomerDelete(c.id, c.name)} className="text-xs font-medium text-red-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    No customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newCustomerName}
            onChange={(e) => setNewCustomerName(e.target.value)}
            placeholder="Add a customer..."
            className={`${field} max-w-xs`}
          />
          <button
            onClick={handleAddCustomer}
            disabled={addingCustomer || newCustomerName.trim() === ""}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {addingCustomer ? "Adding..." : "+ Add Customer"}
          </button>
        </div>
      </section>
    </div>
  );
}
