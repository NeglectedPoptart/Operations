"use client";

import { useState } from "react";
import { daysSince, formatDate } from "@/lib/dates";
import { parsePastedInvoices, type ParsedInvoiceRow } from "@/lib/invoicingParse";
import type { Broker, InvoiceStatement, InvoiceStatus } from "@/lib/types";
import { deleteInvoiceStatement, importInvoices, updateInvoiceStatement } from "./actions";

const OVERDUE_DAYS = 21;

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function formatMoney(n: number | null) {
  return n === null ? "-" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function matchKey(invoiceNo: string): string {
  return invoiceNo.trim().toLowerCase();
}

interface PreviewRow extends ParsedInvoiceRow {
  alreadyImported: boolean;
}

function PastePreview({
  rows,
  onConfirm,
  onCancel,
  adding,
}: {
  rows: PreviewRow[];
  onConfirm: () => void;
  onCancel: () => void;
  adding: boolean;
}) {
  const newCount = rows.filter((r) => !r.alreadyImported).length;
  const skipCount = rows.length - newCount;

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <p className="text-sm">
        Found {rows.length} row{rows.length === 1 ? "" : "s"}: {newCount} new, {skipCount} already imported (will be
        skipped).
      </p>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Invoice #</th>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Customer PO</th>
              <th className="px-2 py-2">Amount</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-black/10 dark:border-white/10">
                <td className="px-2 py-1">{r.invoice_no}</td>
                <td className="px-2 py-1">{formatDate(r.invoice_date) || "-"}</td>
                <td className="px-2 py-1">{r.customer_po || "-"}</td>
                <td className="px-2 py-1">{formatMoney(r.amount)}</td>
                <td className="px-2 py-1">
                  {r.alreadyImported ? (
                    <span className="text-black/40 dark:text-white/40">already imported</span>
                  ) : (
                    <span className="font-medium text-green-700 dark:text-green-400">new</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={adding || newCount === 0}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {adding ? "Adding..." : `Add ${newCount} New Row${newCount === 1 ? "" : "s"}`}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function rowClass(status: InvoiceStatus | null, age: number | null) {
  if (status === "done") return "bg-green-100 dark:bg-green-900/30";
  if (age !== null && age > OVERDUE_DAYS) return "bg-red-100 dark:bg-red-900/30";
  if (status === "pending") return "bg-yellow-100 dark:bg-yellow-900/30";
  return "";
}

export default function InvoicingClient({
  broker,
  initialItems,
}: {
  broker: Broker;
  initialItems: InvoiceStatement[];
}) {
  const [items, setItems] = useState(initialItems);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function updateLocal(id: string, patch: Partial<InvoiceStatement>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function handleFieldSave(id: string, patch: Partial<Pick<InvoiceStatement, "status" | "notes">>) {
    updateLocal(id, patch);
    updateInvoiceStatement(id, broker.id, patch).catch(() => {});
  }

  function handleTogglePending(item: InvoiceStatement) {
    handleFieldSave(item.id, { status: item.status === "pending" ? null : "pending" });
  }

  function handleToggleDone(item: InvoiceStatement) {
    handleFieldSave(item.id, { status: item.status === "done" ? null : "done" });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this invoice row?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteInvoiceStatement(id, broker.id).catch(() => {});
  }

  function handlePreview() {
    setPreviewError(null);
    const result = parsePastedInvoices(pasteText);
    if (result.error) {
      setPreviewError(result.error);
      setPreviewRows(null);
      return;
    }
    const existingKeys = new Set(items.map((i) => matchKey(i.invoice_no)));
    setPreviewRows(result.rows.map((r) => ({ ...r, alreadyImported: existingKeys.has(matchKey(r.invoice_no)) })));
  }

  async function handleConfirmImport() {
    if (!previewRows) return;
    setAdding(true);
    try {
      const newRows: ParsedInvoiceRow[] = previewRows
        .filter((r) => !r.alreadyImported)
        .map(({ invoice_no, invoice_date, customer_po, amount }) => ({ invoice_no, invoice_date, customer_po, amount }));
      const inserted = await importInvoices(broker.id, newRows);
      setItems((prev) => [...prev, ...(inserted as InvoiceStatement[])]);
      setPreviewRows(null);
      setPasteText("");
      setShowPaste(false);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{broker.name} - Invoicing</h1>
        <button
          onClick={() => setShowPaste((v) => !v)}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          {showPaste ? "Hide paste box" : "Paste Statement"}
        </button>
      </div>

      {showPaste && (
        <div className="space-y-3">
          <p className="text-sm text-black/60 dark:text-white/60">
            Paste the statement including its header row - every carrier formats theirs a little differently, but we
            just need columns for Invoice #, Date, Customer PO, and Amount somewhere in there. Rows already on this
            list (matched on Invoice #) are skipped automatically.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder="Paste tab-separated rows from Excel here..."
            className={field}
          />
          {previewError && <p className="text-sm text-red-600">{previewError}</p>}
          <button
            onClick={handlePreview}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Preview
          </button>
          {previewRows && (
            <PastePreview
              rows={previewRows}
              onConfirm={handleConfirmImport}
              onCancel={() => setPreviewRows(null)}
              adding={adding}
            />
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Invoice #</th>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Customer PO</th>
              <th className="px-2 py-2">Amount</th>
              <th className="px-2 py-2">Age</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Notes</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const age = daysSince(item.invoice_date);
              return (
                <tr key={item.id} className={`border-t border-black/10 dark:border-white/10 ${rowClass(item.status, age)}`}>
                  <td className="px-2 py-1.5 font-medium">{item.invoice_no}</td>
                  <td className="px-2 py-1.5">{formatDate(item.invoice_date) || "-"}</td>
                  <td className="px-2 py-1.5">{item.customer_po || "-"}</td>
                  <td className="px-2 py-1.5">{formatMoney(item.amount)}</td>
                  <td className="px-2 py-1.5 font-semibold">{age ?? "-"}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleTogglePending(item)}
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          item.status === "pending"
                            ? "bg-yellow-400 text-yellow-900"
                            : "bg-black/5 text-black/60 hover:bg-yellow-100 dark:bg-white/10 dark:text-white/60"
                        }`}
                      >
                        Pending
                      </button>
                      <button
                        onClick={() => handleToggleDone(item)}
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          item.status === "done"
                            ? "bg-green-600 text-white"
                            : "bg-black/5 text-black/60 hover:bg-green-100 dark:bg-white/10 dark:text-white/60"
                        }`}
                      >
                        Done
                      </button>
                    </div>
                  </td>
                  <td className="min-w-[10rem] px-2 py-1">
                    <input
                      defaultValue={item.notes ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { notes: e.target.value || null })}
                      className={field}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No invoices yet - paste a statement above to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
