"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { AR_AGING_BUCKETS, arAgingBucket } from "@/lib/arAging";
import {
  BUCKET_BADGE,
  DiscrepancyBadge,
  DISCREPANCY_BADGE,
  HIGHLIGHT_ROW_CLASS,
  buildGroups,
  buildPlainTextTable,
  buildTableHtml,
  formatMoney,
  payDiscrepancy,
} from "@/lib/arShared";
import { formatDate } from "@/lib/dates";
import { copyOrDownloadPng, renderPriceSheetPng, type CanvasBlock } from "@/lib/fobPricing";
import { AR_HIGHLIGHTS, type ArCustomer, type ArHighlight, type ArInvoice, type ArTroubleStatus } from "@/lib/types";
import { deleteArInvoiceRow, updateArInvoiceRow } from "../ar/actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

const TROUBLE_STATUS_LABEL: Record<ArTroubleStatus, string> = {
  none: "",
  pending: "Pending",
  posted: "Posted",
};

const TROUBLE_STATUS_BADGE: Record<ArTroubleStatus, string> = {
  none: "",
  pending: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  posted: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const AR_TROUBLES_HEADERS = [
  "Customer",
  "Invoice #",
  "PO",
  "Invoice Date",
  "Due Date",
  "Doc Amount",
  "Balance",
  "Short/Over Pay",
  "Trouble Status",
  "Aging",
  "Last Contact",
  "Notes",
];

function arTroublesRowValues(invoice: ArInvoice, customerName: string): string[] {
  const bucket = arAgingBucket(invoice.due_date);
  const discrepancy = payDiscrepancy(invoice);
  return [
    customerName,
    invoice.invoice_no,
    invoice.po ?? "",
    formatDate(invoice.invoice_date),
    formatDate(invoice.due_date),
    formatMoney(invoice.doc_amount),
    formatMoney(invoice.balance),
    discrepancy ? `${discrepancy.kind === "short" ? "Short" : "Over"} $${discrepancy.amount.toFixed(2)}` : "",
    TROUBLE_STATUS_LABEL[invoice.trouble_status],
    AR_AGING_BUCKETS.find((b) => b.key === bucket)?.label ?? "",
    invoice.last_contact ? formatDate(invoice.last_contact) : "",
    invoice.notes ?? "",
  ];
}

export default function ArTroublesClient({
  initialCustomers,
  initialInvoices,
}: {
  initialCustomers: ArCustomer[];
  initialInvoices: ArInvoice[];
}) {
  const confirm = useConfirm();
  const [customers] = useState(initialCustomers);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [search, setSearch] = useState("");
  const [filterPending, setFilterPending] = useState(false);
  const [filterPosted, setFilterPosted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);

  // The complementary slice of the main AR page's data - anything with a
  // trouble flag lives here instead, regardless of short/over-pay status.
  const troubleInvoices = useMemo(() => invoices.filter((i) => i.trouble_status !== "none"), [invoices]);

  const totals = useMemo(() => {
    let total = 0;
    let pending = 0;
    let posted = 0;
    for (const inv of troubleInvoices) {
      total += inv.balance;
      if (inv.trouble_status === "pending") pending++;
      if (inv.trouble_status === "posted") posted++;
    }
    return { total, pending, posted };
  }, [troubleInvoices]);

  const statusFilterActive = filterPending || filterPosted;
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = buildGroups(customers, troubleInvoices);
    return all
      .map((g) => {
        let invs = g.invoices;
        if (statusFilterActive) {
          invs = invs.filter(
            (i) => (filterPending && i.trouble_status === "pending") || (filterPosted && i.trouble_status === "posted"),
          );
        }
        if (q) {
          const nameMatches = g.customer.customer_name.toLowerCase().includes(q) || g.customer.customer_code.toLowerCase().includes(q);
          if (!nameMatches) {
            invs = invs.filter((i) => i.invoice_no.toLowerCase().includes(q) || (i.po ?? "").toLowerCase().includes(q));
          }
        }
        return { ...g, invoices: invs };
      })
      .filter((g) => g.invoices.length > 0);
  }, [customers, troubleInvoices, search, statusFilterActive, filterPending, filterPosted]);

  function updateLocal(id: string, patch: Partial<ArInvoice>) {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function handleFieldSave(id: string, patch: Partial<Pick<ArInvoice, "last_contact" | "notes" | "highlight">>) {
    updateLocal(id, patch);
    updateArInvoiceRow(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Remove this invoice? (It'll come back on the next AR import if it's still open in the ERP.)"))) return;
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    await deleteArInvoiceRow(id).catch(() => {});
  }

  const flatRows = useMemo(
    () => groups.flatMap((g) => g.invoices.map((inv) => arTroublesRowValues(inv, g.customer.customer_name))),
    [groups],
  );

  async function handleCopyEmail() {
    const html = buildTableHtml("AR Troubles", AR_TROUBLES_HEADERS, flatRows);
    const text = buildPlainTextTable("AR Troubles", AR_TROUBLES_HEADERS, flatRows);
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Could not copy to clipboard - your browser may not support it.");
    }
  }

  async function handleCopyImage() {
    try {
      const blocks: CanvasBlock[] = [
        {
          title: "AR Troubles",
          headerColor: "#8DC63F",
          columnHeaders: AR_TROUBLES_HEADERS,
          rows:
            flatRows.length > 0
              ? flatRows.map((cells) => ({ cells }))
              : [{ cells: ["Nothing here.", ...Array(AR_TROUBLES_HEADERS.length - 1).fill("")] }],
        },
      ];
      const blob = await renderPriceSheetPng({
        title: "AR Troubles",
        message: `Total Outstanding: $${totals.total.toFixed(2)}   Pending: ${totals.pending}   Posted: ${totals.posted}`,
        blocks,
      });
      const result = await copyOrDownloadPng(blob, "ar-troubles.png");
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">AR Troubles</h1>
            <Link href="/accounting/ar" className="text-sm text-green-700 hover:underline dark:text-green-400">
              ← Back to Accounts Receivable
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleCopyEmail} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
              {copied ? "Copied!" : "Copy for Email"}
            </button>
            <button onClick={handleCopyImage} className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800">
              {imageStatus ?? "Copy as Image"}
            </button>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Summary</h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-black/60 dark:text-white/60">Total Outstanding</p>
              <p className="text-xl font-bold">${totals.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div>
              <p className="text-black/60 dark:text-white/60">Customers</p>
              <p className="text-xl font-bold">{groups.length}</p>
            </div>
            <div>
              <p className="text-black/60 dark:text-white/60">Pending</p>
              <p className={`inline-block rounded px-1.5 text-xl font-bold ${TROUBLE_STATUS_BADGE.pending}`}>{totals.pending}</p>
            </div>
            <div>
              <p className="text-black/60 dark:text-white/60">Posted</p>
              <p className={`inline-block rounded px-1.5 text-xl font-bold ${TROUBLE_STATUS_BADGE.posted}`}>{totals.posted}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, invoice #, or PO..."
            className="w-64 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
          />
          <span className="font-medium text-black/60 dark:text-white/60">Filter:</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={filterPending} onChange={(e) => setFilterPending(e.target.checked)} />
            Pending
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={filterPosted} onChange={(e) => setFilterPosted(e.target.checked)} />
            Posted
          </label>
        </div>

        <div className="space-y-4">
          {groups.length === 0 && (
            <p className="rounded-lg border border-black/10 p-4 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
              {troubleInvoices.length === 0 ? "No trouble claims right now." : "Nothing matches the current search/filter."}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.customer.id} className="space-y-2 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{g.customer.customer_name}</h2>
                  <p className="text-xs text-black/40 dark:text-white/40">
                    {g.customer.customer_code}
                    {g.customer.credit_limit !== null && ` · Credit Limit ${formatMoney(g.customer.credit_limit)}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-lg font-bold">{formatMoney(g.totalBalance)}</p>
                  <div className="flex gap-1">
                    {g.shortTotal > 0 && (
                      <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${DISCREPANCY_BADGE.short}`}>
                        Short ${g.shortTotal.toFixed(2)}
                      </span>
                    )}
                    {g.overTotal > 0 && (
                      <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${DISCREPANCY_BADGE.over}`}>
                        Over ${g.overTotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-2 py-2">Invoice #</th>
                      <th className="px-2 py-2">PO</th>
                      <th className="px-2 py-2">Invoice Date</th>
                      <th className="px-2 py-2">Due Date</th>
                      <th className="px-2 py-2 text-right">Doc Amount</th>
                      <th className="px-2 py-2 text-right">Balance</th>
                      <th className="px-2 py-2">Trouble Status</th>
                      <th className="px-2 py-2">Aging</th>
                      <th className="px-2 py-2">Last Contact</th>
                      <th className="px-2 py-2">Notes</th>
                      <th className="px-2 py-2">Highlight</th>
                      <th className="w-16 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {g.invoices.map((inv) => {
                      const bucket = arAgingBucket(inv.due_date);
                      const discrepancy = payDiscrepancy(inv);
                      return (
                        <tr key={inv.id} className={`border-t border-black/10 dark:border-white/10 ${HIGHLIGHT_ROW_CLASS[inv.highlight]}`}>
                          <td className="px-2 py-1.5">{inv.invoice_no}</td>
                          <td className="px-2 py-1.5">{inv.po ?? ""}</td>
                          <td className="px-2 py-1.5">{formatDate(inv.invoice_date)}</td>
                          <td className="px-2 py-1.5">{formatDate(inv.due_date)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(inv.doc_amount)}</td>
                          <td className="px-2 py-1.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-semibold tabular-nums">{formatMoney(inv.balance)}</span>
                              <DiscrepancyBadge discrepancy={discrepancy} />
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TROUBLE_STATUS_BADGE[inv.trouble_status]}`}>
                              {TROUBLE_STATUS_LABEL[inv.trouble_status]}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${BUCKET_BADGE[bucket]}`}>
                              {AR_AGING_BUCKETS.find((b) => b.key === bucket)?.label}
                            </span>
                          </td>
                          <td className="min-w-[7rem] px-1 py-1">
                            <input
                              type="date"
                              defaultValue={inv.last_contact ?? ""}
                              onBlur={(e) => handleFieldSave(inv.id, { last_contact: e.target.value || null })}
                              className={field}
                            />
                          </td>
                          <td className="min-w-[10rem] px-1 py-1">
                            <input
                              defaultValue={inv.notes ?? ""}
                              onBlur={(e) => handleFieldSave(inv.id, { notes: e.target.value })}
                              className={field}
                            />
                          </td>
                          <td className="min-w-[8rem] px-1 py-1">
                            <select
                              value={inv.highlight}
                              onChange={(e) => handleFieldSave(inv.id, { highlight: e.target.value as ArHighlight })}
                              className={field}
                            >
                              {AR_HIGHLIGHTS.map((h) => (
                                <option key={h.value} value={h.value}>
                                  {h.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <button onClick={() => handleDelete(inv.id)} className="text-xs font-medium text-red-600 hover:underline">
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
