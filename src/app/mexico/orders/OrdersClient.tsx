"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate } from "@/lib/dates";
import { MX_ORDER_CUSTOMERS, parseMxOrderText, type MxOrderCustomer, type ParsedMxOrderRow } from "@/lib/mxOrdersParse";
import { MX_ORDER_STATUSES, type MxOrder, type MxOrderStatus } from "@/lib/types";
import { addOrderRow, deleteOrderRow, importMxOrders, updateOrderRow } from "./actions";

const cellField = "w-full min-w-0 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-black";
const cellFieldSm = `${cellField} w-16`;

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
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

  const visibleOrders = useMemo(
    () => (statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter],
  );

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

  async function handleAddRow() {
    setAdding(true);
    try {
      const customerLabel = MX_ORDER_CUSTOMERS.find((c) => c.value === pasteCustomer)?.label ?? "";
      const nextPosition = orders.length > 0 ? Math.max(...orders.map((o) => o.position)) + 1 : 1;
      const row = await addOrderRow(customerLabel, nextPosition);
      setOrders((prev) => [...prev, row as MxOrder]);
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

        {visibleOrders.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-black/5 text-left dark:bg-white/5">
                <tr>
                  <th className="px-1.5 py-1 font-medium">Customer</th>
                  <th className="px-1.5 py-1 font-medium">Commodity</th>
                  <th className="px-1.5 py-1 font-medium">PLU</th>
                  <th className="px-1.5 py-1 font-medium">Size</th>
                  <th className="px-1.5 py-1 font-medium">COO</th>
                  <th className="px-1.5 py-1 font-medium">Grade</th>
                  <th className="px-1.5 py-1 font-medium">Qty</th>
                  <th className="px-1.5 py-1 font-medium">Unit</th>
                  <th className="px-1.5 py-1 font-medium">PO #</th>
                  <th className="px-1.5 py-1 font-medium">Ref #</th>
                  <th className="px-1.5 py-1 font-medium">Loading</th>
                  <th className="px-1.5 py-1 font-medium">Delivery</th>
                  <th className="px-1.5 py-1 font-medium">Status</th>
                  <th className="px-1.5 py-1 font-medium">Notes</th>
                  <th className="px-1.5 py-1" />
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((o) => (
                  <tr
                    key={o.id}
                    className={`border-t border-black/10 align-top dark:border-white/10 ${
                      o.status === "fulfilled" ? "opacity-50" : ""
                    }`}
                  >
                    <td className="min-w-[8rem] px-1.5 py-1">
                      <input
                        defaultValue={o.customer}
                        onBlur={(e) => handleFieldSave(o.id, { customer: e.target.value })}
                        className={cellField}
                      />
                    </td>
                    <td className="min-w-[9rem] px-1.5 py-1">
                      <input
                        defaultValue={o.commodity}
                        onBlur={(e) => handleFieldSave(o.id, { commodity: e.target.value })}
                        className={cellField}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        defaultValue={o.plu ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { plu: e.target.value || null })}
                        className={cellFieldSm}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        defaultValue={o.size ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { size: e.target.value || null })}
                        className={cellFieldSm}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        defaultValue={o.coo ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { coo: e.target.value || null })}
                        className={cellFieldSm}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        defaultValue={o.grade ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { grade: e.target.value || null })}
                        className={cellFieldSm}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        defaultValue={o.qty ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { qty: e.target.value === "" ? null : Number(e.target.value) })}
                        className={cellFieldSm}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        defaultValue={o.qty_unit ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { qty_unit: e.target.value || null })}
                        className={cellFieldSm}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        defaultValue={o.po_number ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { po_number: e.target.value || null })}
                        className={cellField}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        defaultValue={o.reference_number ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { reference_number: e.target.value || null })}
                        className={cellField}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        type="date"
                        defaultValue={o.loading_date ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { loading_date: e.target.value || null })}
                        className={cellField}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        type="date"
                        defaultValue={o.delivery_date ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { delivery_date: e.target.value || null })}
                        className={cellField}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <select
                        value={o.status}
                        onChange={(e) => handleFieldSave(o.id, { status: e.target.value as MxOrderStatus })}
                        className={cellField}
                      >
                        {MX_ORDER_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="min-w-[8rem] px-1.5 py-1">
                      <input
                        defaultValue={o.notes ?? ""}
                        onBlur={(e) => handleFieldSave(o.id, { notes: e.target.value || null })}
                        className={cellField}
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <button onClick={() => handleDelete(o.id)} className="text-[11px] font-medium text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
