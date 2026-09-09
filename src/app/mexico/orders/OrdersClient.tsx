"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate } from "@/lib/dates";
import { MX_ORDER_CUSTOMERS, parseMxOrderText, type MxOrderCustomer, type ParsedMxOrderRow } from "@/lib/mxOrdersParse";
import { MX_ORDER_STATUSES, type MxOrder, type MxOrderStatus } from "@/lib/types";
import { addOrderRow, deleteOrderRow, importMxOrders, updateOrderRow } from "./actions";

const cellField = "w-full min-w-0 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-black";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

// One readable line per order for the list view - everything that's set,
// nothing that isn't, so a simple HEB row and a fuller Houston Fruitland row
// don't end up with the same amount of empty space.
function orderSummaryLine(o: MxOrder): string {
  return [
    o.size ? `${o.commodity} (${o.size})` : o.commodity,
    o.qty !== null ? `${o.qty}${o.qty_unit ? ` ${o.qty_unit}` : ""}` : null,
    o.loading_date ? `Loading ${formatDate(o.loading_date)}` : null,
    o.delivery_date ? `Delivery ${formatDate(o.delivery_date)}` : null,
    o.po_number ? `PO ${o.po_number}` : null,
    o.reference_number ? `Ref ${o.reference_number}` : null,
    o.coo ? `COO ${o.coo}` : null,
    o.grade,
    o.notes,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function OrdersClient({ initialOrders }: { initialOrders: MxOrder[] }) {
  const confirm = useConfirm();
  const [orders, setOrders] = useState(initialOrders);
  const [statusFilter, setStatusFilter] = useState<MxOrderStatus | "all">("pending");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteCustomer, setPasteCustomer] = useState<MxOrderCustomer>("heb");
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedMxOrderRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  // The one row currently showing the full editable fields - every other
  // row stays in plain list view. Null means nothing is being edited.
  const [editingId, setEditingId] = useState<string | null>(null);

  const visibleOrders = useMemo(
    () => (statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter],
  );

  // Grouped by customer so HEB's orders, Fiesta's orders, etc. each read as
  // their own list instead of one long mixed table - sorted by customer
  // name, then by delivery date (soonest first, undated last) within it.
  const groupedOrders = useMemo(() => {
    const groups = new Map<string, MxOrder[]>();
    for (const o of visibleOrders) {
      const key = o.customer.trim() || "(No customer set)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    }
    return Array.from(groups.entries())
      .map(([customer, list]) => ({
        customer,
        list: [...list].sort((a, b) => (a.delivery_date ?? "9999-99-99").localeCompare(b.delivery_date ?? "9999-99-99")),
      }))
      .sort((a, b) => a.customer.localeCompare(b.customer));
  }, [visibleOrders]);

  function handlePreview() {
    const result = parseMxOrderText(pasteCustomer, pasteText, todayIso());
    if (result.error) {
      setParseError(result.error);
      setPreviewRows(null);
      return;
    }
    setParseError(null);
    setPreviewRows(result.rows);
  }

  function handleCancelPreview() {
    setPreviewRows(null);
    setParseError(null);
  }

  async function handleConfirmImport() {
    if (!previewRows) return;
    setImporting(true);
    try {
      const inserted = (await importMxOrders(previewRows)) as MxOrder[];
      if (inserted.length > 0) setOrders((prev) => [...prev, ...inserted]);
      setPreviewRows(null);
      setPasteText("");
      setShowPaste(false);
    } finally {
      setImporting(false);
    }
  }

  // Starts blank (no customer guessed) and opens straight into edit mode -
  // there's nothing useful to show in list view for a row with nothing in
  // it yet.
  async function handleAddRow() {
    setAdding(true);
    try {
      const nextPosition = orders.length > 0 ? Math.max(...orders.map((o) => o.position)) + 1 : 1;
      const row = (await addOrderRow("", nextPosition)) as MxOrder;
      setOrders((prev) => [...prev, row]);
      setEditingId(row.id);
    } finally {
      setAdding(false);
    }
  }

  function updateLocal(id: string, patch: Partial<MxOrder>) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function handleFieldSave(id: string, patch: Partial<MxOrder>) {
    updateLocal(id, patch);
    updateOrderRow(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this order line?"))) return;
    setOrders((prev) => prev.filter((o) => o.id !== id));
    await deleteOrderRow(id).catch(() => {});
  }

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const canPasteThisCustomer = pasteCustomer !== "other";

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)] px-4 sm:px-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Orders</h1>
          <button
            onClick={() => setShowPaste((s) => !s)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {showPaste ? "Hide paste box" : "Paste an Order"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
          <span className="font-medium text-black/60 dark:text-white/60">
            {pendingCount} pending order{pendingCount === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex gap-1">
            {(["pending", "fulfilled", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                  statusFilter === s
                    ? "bg-green-600 text-white"
                    : "bg-black/10 text-black/60 hover:bg-black/20 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {showPaste && (
          <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium">Customer</label>
              <select
                value={pasteCustomer}
                onChange={(e) => {
                  setPasteCustomer(e.target.value as MxOrderCustomer);
                  setPreviewRows(null);
                  setParseError(null);
                }}
                className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
              >
                {MX_ORDER_CUSTOMERS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {pasteCustomer === "jetro" && (
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  Free text - splits by &quot;and&quot; and pulls a date where it can. Check every row before adding.
                </span>
              )}
              {!canPasteThisCustomer && (
                <span className="text-xs text-black/50 dark:text-white/50">
                  No parser for this customer yet - use + Add Row below instead.
                </span>
              )}
            </div>

            {canPasteThisCustomer && (
              <>
                <textarea
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value);
                    setPreviewRows(null);
                    setParseError(null);
                  }}
                  rows={6}
                  placeholder="Paste the order text here..."
                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
                />
                {parseError && <p className="text-sm text-red-600">{parseError}</p>}

                {!previewRows && (
                  <button
                    onClick={handlePreview}
                    disabled={pasteText.trim() === ""}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    Preview
                  </button>
                )}

                {previewRows && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Found {previewRows.length} row{previewRows.length === 1 ? "" : "s"}.
                    </p>
                    <div className="max-h-64 overflow-auto rounded border border-black/10 dark:border-white/10">
                      <table className="w-full text-xs">
                        <thead className="bg-black/5 text-left dark:bg-white/5">
                          <tr>
                            <th className="px-2 py-1">Commodity</th>
                            <th className="px-2 py-1">Qty</th>
                            <th className="px-2 py-1">Loading</th>
                            <th className="px-2 py-1">Delivery</th>
                            <th className="px-2 py-1">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((r, i) => (
                            <tr key={i} className="border-t border-black/10 dark:border-white/10">
                              <td className="px-2 py-1">{r.commodity}</td>
                              <td className="px-2 py-1">
                                {r.qty !== null ? `${r.qty}${r.qty_unit ? ` ${r.qty_unit}` : ""}` : ""}
                              </td>
                              <td className="px-2 py-1">{formatDate(r.loading_date)}</td>
                              <td className="px-2 py-1">{formatDate(r.delivery_date)}</td>
                              <td className="px-2 py-1">{r.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleConfirmImport}
                        disabled={importing}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        {importing ? "Adding..." : `Add ${previewRows.length} Row${previewRows.length === 1 ? "" : "s"}`}
                      </button>
                      <button
                        onClick={handleCancelPreview}
                        className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {groupedOrders.length > 0 ? (
          <div className="space-y-5">
            {groupedOrders.map((group) => (
              <section key={group.customer} className="space-y-2">
                <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
                  {group.customer} <span className="text-sm font-normal text-black/40">({group.list.length})</span>
                </h2>
                <div className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
                  {group.list.map((o) =>
                    editingId === o.id ? (
                      <div key={o.id} className="space-y-2 p-3">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <label className="text-xs font-medium">
                            Customer
                            <input
                              defaultValue={o.customer}
                              onBlur={(e) => handleFieldSave(o.id, { customer: e.target.value })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            Commodity
                            <input
                              defaultValue={o.commodity}
                              onBlur={(e) => handleFieldSave(o.id, { commodity: e.target.value })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            PLU
                            <input
                              defaultValue={o.plu ?? ""}
                              onBlur={(e) => handleFieldSave(o.id, { plu: e.target.value || null })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            Size
                            <input
                              defaultValue={o.size ?? ""}
                              onBlur={(e) => handleFieldSave(o.id, { size: e.target.value || null })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            COO
                            <input
                              defaultValue={o.coo ?? ""}
                              onBlur={(e) => handleFieldSave(o.id, { coo: e.target.value || null })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            Grade
                            <input
                              defaultValue={o.grade ?? ""}
                              onBlur={(e) => handleFieldSave(o.id, { grade: e.target.value || null })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            Qty
                            <input
                              defaultValue={o.qty ?? ""}
                              onBlur={(e) =>
                                handleFieldSave(o.id, { qty: e.target.value === "" ? null : Number(e.target.value) })
                              }
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            Unit
                            <input
                              defaultValue={o.qty_unit ?? ""}
                              onBlur={(e) => handleFieldSave(o.id, { qty_unit: e.target.value || null })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            PO #
                            <input
                              defaultValue={o.po_number ?? ""}
                              onBlur={(e) => handleFieldSave(o.id, { po_number: e.target.value || null })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            Ref #
                            <input
                              defaultValue={o.reference_number ?? ""}
                              onBlur={(e) => handleFieldSave(o.id, { reference_number: e.target.value || null })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            Loading
                            <input
                              type="date"
                              defaultValue={o.loading_date ?? ""}
                              onBlur={(e) => handleFieldSave(o.id, { loading_date: e.target.value || null })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            Delivery
                            <input
                              type="date"
                              defaultValue={o.delivery_date ?? ""}
                              onBlur={(e) => handleFieldSave(o.id, { delivery_date: e.target.value || null })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                          <label className="text-xs font-medium">
                            Status
                            <select
                              value={o.status}
                              onChange={(e) => handleFieldSave(o.id, { status: e.target.value as MxOrderStatus })}
                              className={`${cellField} mt-1`}
                            >
                              {MX_ORDER_STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs font-medium sm:col-span-2">
                            Notes
                            <input
                              defaultValue={o.notes ?? ""}
                              onBlur={(e) => handleFieldSave(o.id, { notes: e.target.value || null })}
                              className={`${cellField} mt-1`}
                            />
                          </label>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                          >
                            Done
                          </button>
                          <button onClick={() => handleDelete(o.id)} className="text-sm font-medium text-red-600 hover:underline">
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={o.id}
                        className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${
                          o.status === "fulfilled" ? "opacity-50" : ""
                        }`}
                      >
                        <button
                          onClick={() => handleFieldSave(o.id, { status: o.status === "pending" ? "fulfilled" : "pending" })}
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            o.status === "fulfilled"
                              ? "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          }`}
                        >
                          {MX_ORDER_STATUSES.find((s) => s.value === o.status)?.label}
                        </button>
                        <span className="flex-1">{orderSummaryLine(o)}</span>
                        <button
                          onClick={() => setEditingId(o.id)}
                          className="shrink-0 text-xs font-medium text-green-700 hover:underline dark:text-green-400"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(o.id)}
                          className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-black/10 p-4 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
            Nothing here.
          </p>
        )}

        <button
          onClick={handleAddRow}
          disabled={adding}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          + Add Row
        </button>
      </div>
    </div>
  );
}
