"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import HorizontalBarChart from "@/components/HorizontalBarChart";
import { AR_AGING_BUCKETS, arAgingBucket, type ArAgingBucket } from "@/lib/arAging";
import { parseArReportPaste, type ParsedArInvoice } from "@/lib/arReportParse";
import { formatDate } from "@/lib/dates";
import { copyOrDownloadPng, escapeHtml, renderPriceSheetPng, type CanvasBlock } from "@/lib/fobPricing";
import { AR_HIGHLIGHTS, type ArCustomer, type ArHighlight, type ArInvoice } from "@/lib/types";
import { deleteArInvoiceRow, importArReport, updateArInvoiceRow } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function formatMoney(n: number | null): string {
  return n === null ? "" : `$${n.toFixed(2)}`;
}

interface PayDiscrepancy {
  kind: "short" | "over";
  amount: number;
}

// A partial-credit invoice (the report's own "*" flag) usually landed at a
// lower balance than the original invoice - a short pay, money we're not
// collecting. A negative balance (regardless of the flag) means the
// opposite: a credit sitting on the account that we owe back or that can
// offset a future invoice - an over pay.
function payDiscrepancy(invoice: ArInvoice): PayDiscrepancy | null {
  if (invoice.balance < 0) return { kind: "over", amount: Math.abs(invoice.balance) };
  if (!invoice.has_partial_credit || invoice.doc_amount === null) return null;
  const diff = invoice.doc_amount - invoice.balance;
  if (diff === 0) return null;
  return diff > 0 ? { kind: "short", amount: diff } : { kind: "over", amount: Math.abs(diff) };
}

const DISCREPANCY_BADGE: Record<"short" | "over", string> = {
  short: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  over: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};

function DiscrepancyBadge({ discrepancy }: { discrepancy: PayDiscrepancy | null }) {
  if (!discrepancy) return null;
  return (
    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${DISCREPANCY_BADGE[discrepancy.kind]}`}>
      {discrepancy.kind === "short" ? "Short" : "Over"} ${discrepancy.amount.toFixed(2)}
    </span>
  );
}

const BUCKET_BADGE: Record<ArAgingBucket, string> = {
  current: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "1-20": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "21-40": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "41-60": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "61+": "bg-red-200 text-red-900 dark:bg-red-950/60 dark:text-red-200",
};

const HIGHLIGHT_ROW_CLASS: Record<ArHighlight, string> = {
  none: "",
  yellow: "bg-yellow-50 dark:bg-yellow-950/20",
  red: "bg-red-50 dark:bg-red-950/20",
};

const AR_HEADERS = [
  "Customer",
  "Invoice #",
  "PO",
  "Invoice Date",
  "Due Date",
  "Doc Amount",
  "Balance",
  "Short/Over Pay",
  "Aging",
  "Last Contact",
  "Notes",
];

function arRowValues(invoice: ArInvoice, customerName: string): string[] {
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
    AR_AGING_BUCKETS.find((b) => b.key === bucket)?.label ?? "",
    invoice.last_contact ? formatDate(invoice.last_contact) : "",
    invoice.notes ?? "",
  ];
}

interface CustomerGroup {
  customer: ArCustomer;
  invoices: ArInvoice[];
  totalBalance: number;
  shortTotal: number;
  overTotal: number;
}

function compareByDueDate(a: ArInvoice, b: ArInvoice): number {
  if (a.due_date === b.due_date) return a.position - b.position;
  if (a.due_date === null) return 1;
  if (b.due_date === null) return -1;
  return a.due_date < b.due_date ? -1 : 1;
}

function buildGroups(customers: ArCustomer[], invoices: ArInvoice[]): CustomerGroup[] {
  const byCustomer = new Map<string, ArInvoice[]>();
  for (const inv of invoices) {
    if (!byCustomer.has(inv.customer_id)) byCustomer.set(inv.customer_id, []);
    byCustomer.get(inv.customer_id)!.push(inv);
  }
  return customers
    .map((customer) => {
      const invs = [...(byCustomer.get(customer.id) ?? [])].sort(compareByDueDate);
      let shortTotal = 0;
      let overTotal = 0;
      for (const inv of invs) {
        const d = payDiscrepancy(inv);
        if (!d) continue;
        if (d.kind === "short") shortTotal += d.amount;
        else overTotal += d.amount;
      }
      return { customer, invoices: invs, totalBalance: invs.reduce((sum, i) => sum + i.balance, 0), shortTotal, overTotal };
    })
    .filter((g) => g.invoices.length > 0)
    .sort((a, b) => b.totalBalance - a.totalBalance);
}

function buildTableHtml(title: string, headers: string[], rows: string[][]): string {
  const cell = "padding:3px 6px;border:1px solid #000;background:#ffffff;color:#000000;";
  const headCell = `${cell}font-weight:bold;background:#dddddd;`;
  const bodyRows =
    rows.length > 0
      ? rows.map((r) => `<tr>${r.map((c) => `<td style="${cell}">${escapeHtml(c)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${headers.length}" style="${cell}text-align:center;color:#666666;">Nothing here.</td></tr>`;
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #000;font-family:Calibri,Arial,sans-serif;font-size:12.5px;">
    <tr><td colspan="${headers.length}" style="background:#8DC63F;color:#000;font-weight:bold;text-align:center;padding:6px;border:1px solid #000;">${escapeHtml(title)}</td></tr>
    <tr>${headers.map((h) => `<td style="${headCell}">${escapeHtml(h)}</td>`).join("")}</tr>
    ${bodyRows}
  </table>`;
}

function buildPlainTextTable(title: string, headers: string[], rows: string[][]): string {
  const lines = [title, headers.join("\t")];
  if (rows.length === 0) lines.push("Nothing here.");
  for (const r of rows) lines.push(r.join("\t"));
  return lines.join("\n");
}

export default function ArClient({
  initialCustomers,
  initialInvoices,
}: {
  initialCustomers: ArCustomer[];
  initialInvoices: ArInvoice[];
}) {
  const confirm = useConfirm();
  const [customers, setCustomers] = useState(initialCustomers);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [showPaste, setShowPaste] = useState(initialInvoices.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [previewInvoices, setPreviewInvoices] = useState<ParsedArInvoice[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRed, setFilterRed] = useState(false);
  const [filterYellow, setFilterYellow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);

  const totals = useMemo(() => {
    const byBucket = new Map<ArAgingBucket, number>(AR_AGING_BUCKETS.map((b) => [b.key, 0]));
    let total = 0;
    let escalated = 0;
    let needsContact = 0;
    let trouble = 0;
    let shortTotal = 0;
    let overTotal = 0;
    for (const inv of invoices) {
      total += inv.balance;
      byBucket.set(arAgingBucket(inv.due_date), (byBucket.get(arAgingBucket(inv.due_date)) ?? 0) + inv.balance);
      if (inv.highlight === "red") escalated++;
      if (inv.highlight === "yellow") needsContact++;
      if (inv.trouble_status !== "none") trouble++;
      const d = payDiscrepancy(inv);
      if (d) {
        if (d.kind === "short") shortTotal += d.amount;
        else overTotal += d.amount;
      }
    }
    return { total, byBucket, escalated, needsContact, trouble, shortTotal, overTotal };
  }, [invoices]);

  const filterActive = filterRed || filterYellow;
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = buildGroups(customers, invoices);
    return all
      .map((g) => {
        let invs = g.invoices;
        if (filterActive) invs = invs.filter((i) => (filterRed && i.highlight === "red") || (filterYellow && i.highlight === "yellow"));
        if (q) {
          const nameMatches = g.customer.customer_name.toLowerCase().includes(q) || g.customer.customer_code.toLowerCase().includes(q);
          if (!nameMatches) {
            invs = invs.filter((i) => i.invoice_no.toLowerCase().includes(q) || (i.po ?? "").toLowerCase().includes(q));
          }
        }
        return { ...g, invoices: invs };
      })
      .filter((g) => g.invoices.length > 0);
  }, [customers, invoices, search, filterActive, filterRed, filterYellow]);

  function handlePreview() {
    const result = parseArReportPaste(pasteText);
    if (result.error) {
      setParseError(result.error);
      setPreviewInvoices(null);
      return;
    }
    setParseError(null);
    setPreviewInvoices(result.invoices);
  }

  const existingInvoiceNos = useMemo(() => new Set(invoices.map((i) => i.invoice_no)), [invoices]);
  const previewSummary = useMemo(() => {
    if (!previewInvoices) return null;
    const parsedNos = new Set(previewInvoices.map((r) => r.invoiceNo));
    const added = previewInvoices.filter((r) => !existingInvoiceNos.has(r.invoiceNo)).length;
    const updated = previewInvoices.length - added;
    const removed = invoices.filter((i) => !parsedNos.has(i.invoice_no)).length;
    return { added, updated, removed };
  }, [previewInvoices, existingInvoiceNos, invoices]);

  async function handleConfirmImport() {
    if (!previewInvoices) return;
    setImporting(true);
    try {
      const { customers: newCustomers, invoices: newInvoices } = await importArReport(previewInvoices);
      setCustomers(newCustomers);
      setInvoices(newInvoices);
      setPreviewInvoices(null);
      setPasteText("");
      setShowPaste(false);
    } finally {
      setImporting(false);
    }
  }

  function handleCancelPreview() {
    setPreviewInvoices(null);
    setParseError(null);
  }

  function updateLocal(id: string, patch: Partial<ArInvoice>) {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function handleFieldSave(id: string, patch: Partial<Pick<ArInvoice, "last_contact" | "notes" | "highlight">>) {
    updateLocal(id, patch);
    updateArInvoiceRow(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Remove this invoice? (It'll come back on the next import if it's still open in the ERP.)"))) return;
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    await deleteArInvoiceRow(id).catch(() => {});
  }

  const flatRows = useMemo(() => groups.flatMap((g) => g.invoices.map((inv) => arRowValues(inv, g.customer.customer_name))), [groups]);

  async function handleCopyEmail() {
    const html = buildTableHtml("Accounts Receivable", AR_HEADERS, flatRows);
    const text = buildPlainTextTable("Accounts Receivable", AR_HEADERS, flatRows);
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
          title: "Accounts Receivable",
          headerColor: "#8DC63F",
          columnHeaders: AR_HEADERS,
          rows: flatRows.length > 0 ? flatRows.map((cells) => ({ cells })) : [{ cells: ["Nothing here.", ...Array(AR_HEADERS.length - 1).fill("")] }],
        },
      ];
      const blob = await renderPriceSheetPng({
        title: "Accounts Receivable",
        message: `Total Outstanding: $${totals.total.toFixed(2)}   Escalated: ${totals.escalated}`,
        blocks,
      });
      const result = await copyOrDownloadPng(blob, "accounts-receivable.png");
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  const bucketChartData = AR_AGING_BUCKETS.map((b) => ({ label: b.label, value: totals.byBucket.get(b.key) ?? 0 }));

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Accounts Receivable</h1>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleCopyEmail} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
              {copied ? "Copied!" : "Copy for Email"}
            </button>
            <button onClick={handleCopyImage} className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800">
              {imageStatus ?? "Copy as Image"}
            </button>
            <button
              onClick={() => setShowPaste((s) => !s)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              {showPaste ? "Hide paste box" : "Paste AR Aging Report"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Summary</h2>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-black/60 dark:text-white/60">Total Outstanding</p>
                <p className="text-xl font-bold">${totals.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-black/60 dark:text-white/60">Customers</p>
                <p className="text-xl font-bold">{groups.length}</p>
              </div>
              <div>
                <p className="text-black/60 dark:text-white/60">Escalated</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{totals.escalated}</p>
              </div>
              <div>
                <p className="text-black/60 dark:text-white/60">Trouble Claims</p>
                <p className="text-xl font-bold">{totals.trouble}</p>
              </div>
              <div>
                <p className="text-black/60 dark:text-white/60">Short Pay Total</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">${totals.shortTotal.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-black/60 dark:text-white/60">Over Pay Total</p>
                <p className="text-xl font-bold text-purple-600 dark:text-purple-400">${totals.overTotal.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Outstanding by Aging Bucket</h2>
            <HorizontalBarChart data={bucketChartData} formatValue={(v) => `$${Math.round(v).toLocaleString()}`} />
          </div>
        </div>

        {showPaste && (
          <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
            <p className="text-sm text-black/60 dark:text-white/60">
              Paste the whole &quot;AR Aging Detail by Customer&quot; export here (select all in Excel, copy, paste below) - this
              syncs the list: balances/dates refresh, invoices no longer in the export are removed (paid off), and any
              Last Contact/Notes/Highlight you&apos;ve already logged on a still-open invoice is kept.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setPreviewInvoices(null);
                setParseError(null);
              }}
              rows={6}
              placeholder="Paste the AR Aging report here..."
              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
            />
            {parseError && <p className="text-sm text-red-600">{parseError}</p>}
            {!previewInvoices && (
              <button
                onClick={handlePreview}
                disabled={pasteText.trim() === ""}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                Preview
              </button>
            )}
            {previewInvoices && previewSummary && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Found {previewInvoices.length} invoice{previewInvoices.length === 1 ? "" : "s"}: {previewSummary.added} new,{" "}
                  {previewSummary.updated} updated, {previewSummary.removed} will be removed (no longer open).
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmImport}
                    disabled={importing}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    {importing ? "Syncing..." : "Confirm & Sync"}
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
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, invoice #, or PO..."
            className="w-64 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
          />
          <span className="font-medium text-black/60 dark:text-white/60">Filter:</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={filterRed} onChange={(e) => setFilterRed(e.target.checked)} />
            Escalated
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={filterYellow} onChange={(e) => setFilterYellow(e.target.checked)} />
            Needs Contact
          </label>
        </div>

        <div className="space-y-4">
          {groups.length === 0 && (
            <p className="rounded-lg border border-black/10 p-4 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
              {invoices.length === 0 ? "No open invoices yet - paste in the AR Aging report above." : "Nothing matches the current search/filter."}
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
                      const troubleText = inv.trouble_status !== "none" ? `Trouble claim ${inv.trouble_status}` : null;
                      return (
                        <tr key={inv.id} className={`border-t border-black/10 dark:border-white/10 ${HIGHLIGHT_ROW_CLASS[inv.highlight]}`}>
                          <td className="px-2 py-1.5" title={troubleText || undefined}>
                            {inv.invoice_no}
                            {troubleText && <span className="ml-1 text-red-600 dark:text-red-400">⚠</span>}
                          </td>
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
