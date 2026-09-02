"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import HorizontalBarChart from "@/components/HorizontalBarChart";
import { AR_AGING_BUCKETS, arAgingBucket, type ArAgingBucket } from "@/lib/arAging";
import {
  BUCKET_BADGE,
  DiscrepancyBadge,
  DISCREPANCY_BADGE,
  HIGHLIGHT_ROW_CLASS,
  buildGroups,
  buildPlainTextTable,
  buildTableHtml,
  computeArSummaryTotals,
  formatMoney,
  payDiscrepancy,
  type ArSummaryTotals,
} from "@/lib/arShared";
import { parseArReportPaste, type ParsedArInvoice } from "@/lib/arReportParse";
import { formatDate, formatElapsed, formatTimestamp } from "@/lib/dates";
import { copyOrDownloadPng, renderPriceSheetPng, type CanvasBlock } from "@/lib/fobPricing";
import { AR_HIGHLIGHTS, type ArCustomer, type ArHighlight, type ArInvoice, type ArSummarySnapshot } from "@/lib/types";
import { deleteArInvoiceRow, importArReport, saveArBaseline, updateArInvoiceRow } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

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

interface ChangeMetric {
  key: keyof ArSummaryTotals;
  label: string;
  kind: "money" | "count";
  // Which direction of change is an improvement - null when a change is
  // neither good nor bad (e.g. more customers isn't inherently either).
  good: "up" | "down" | null;
}

const CHANGE_METRICS: ChangeMetric[] = [
  { key: "total", label: "Total Outstanding", kind: "money", good: "down" },
  { key: "customers", label: "Customers", kind: "count", good: null },
  { key: "escalated", label: "Escalated", kind: "count", good: "down" },
  { key: "needsContact", label: "Needs Contact", kind: "count", good: "down" },
  { key: "troubleClaims", label: "Trouble Claims", kind: "count", good: "down" },
  { key: "shortTotal", label: "Short Pay Total", kind: "money", good: "down" },
  { key: "overTotal", label: "Over Pay Total", kind: "money", good: null },
];

function formatMetricValue(n: number, kind: "money" | "count"): string {
  return kind === "money" ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : n.toLocaleString();
}

function formatDelta(diff: number, kind: "money" | "count"): string {
  if (diff === 0) return "no change";
  const sign = diff > 0 ? "+" : "-";
  return `${sign}${formatMetricValue(Math.abs(diff), kind)}`;
}

// Compares a manually-set checkpoint (baseline, persisted in
// ar_summary_snapshot - see saveArBaseline) against the current live
// totals, computed fresh every render. Deliberately NOT tied to "the last
// sync" - a sync alone used to silently replace the comparison point,
// which meant the diff you'd just looked at was gone the moment you
// reloaded the page. Now the baseline only moves when someone explicitly
// resets it, so this panel stays meaningful (and available) across visits.
function ChangesPanel({
  baseline,
  current,
  onClose,
}: {
  baseline: ArSummarySnapshot;
  current: ArSummaryTotals;
  onClose: () => void;
}) {
  const now = new Date().toISOString();
  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Changes Since Baseline</h2>
        <button onClick={onClose} className="text-xs font-medium text-black/50 hover:underline dark:text-white/50">
          Hide
        </button>
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">
        Baseline set {formatTimestamp(baseline.captured_at)} ({formatElapsed(baseline.captured_at, now)} ago)
      </p>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {CHANGE_METRICS.map((m) => {
          const beforeVal = baseline[SNAPSHOT_KEY[m.key]] as number;
          const afterVal = current[m.key];
          const diff = afterVal - beforeVal;
          const colorClass =
            diff === 0
              ? "text-black/50 dark:text-white/50"
              : m.good === null
                ? "text-blue-600 dark:text-blue-400"
                : (diff > 0) === (m.good === "up")
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400";
          return (
            <div key={m.key}>
              <p className="text-black/60 dark:text-white/60">{m.label}</p>
              <p className="text-lg font-bold">{formatMetricValue(afterVal, m.kind)}</p>
              <p className={`text-xs font-semibold ${colorClass}`}>{formatDelta(diff, m.kind)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ArSummaryTotals (camelCase, computed client/shared) vs ArSummarySnapshot
// (snake_case, the stored row) name a couple of fields differently -
// mapped here rather than renaming one side to match the other's
// convention (each already matches its own domain: JS object vs DB row).
const SNAPSHOT_KEY: Record<keyof ArSummaryTotals, keyof ArSummarySnapshot> = {
  total: "total",
  customers: "customers",
  escalated: "escalated",
  needsContact: "needs_contact",
  troubleClaims: "trouble_claims",
  shortTotal: "short_total",
  overTotal: "over_total",
};

export default function ArClient({
  initialCustomers,
  initialInvoices,
  initialBaseline,
}: {
  initialCustomers: ArCustomer[];
  initialInvoices: ArInvoice[];
  initialBaseline: ArSummarySnapshot | null;
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
  const [filterShort, setFilterShort] = useState(false);
  const [filterOver, setFilterOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(initialBaseline);
  const [showChanges, setShowChanges] = useState(false);
  const [savingBaseline, setSavingBaseline] = useState(false);
  // Collapsed by default - a customer's invoice table only renders once
  // its name is clicked, so scrolling the full customer list (or jumping
  // straight to the one you searched for) doesn't mean paging past every
  // other customer's open table first.
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<string>>(new Set());

  function toggleCustomer(id: string) {
    setExpandedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // AR Troubles (a separate page) owns anything with trouble_status !==
  // "none" - this page is the complementary slice of the same
  // ar_invoices/ar_customers data, so trouble-flagged rows are excluded
  // here entirely rather than just visually de-emphasized.
  const nonTroubleInvoices = useMemo(() => invoices.filter((i) => i.trouble_status === "none"), [invoices]);
  // Matches AR Troubles' own count exactly - "posted" is settled and
  // excluded there, so this tile (which links straight to that page)
  // would be misleading if it counted posted+pending together.
  const troubleCount = useMemo(() => invoices.filter((i) => i.trouble_status === "pending").length, [invoices]);

  const totals = useMemo(() => {
    const byBucket = new Map<ArAgingBucket, number>(AR_AGING_BUCKETS.map((b) => [b.key, 0]));
    let total = 0;
    let escalated = 0;
    let needsContact = 0;
    let shortTotal = 0;
    let overTotal = 0;
    for (const inv of nonTroubleInvoices) {
      total += inv.balance;
      byBucket.set(arAgingBucket(inv.due_date), (byBucket.get(arAgingBucket(inv.due_date)) ?? 0) + inv.balance);
      if (inv.highlight === "red") escalated++;
      if (inv.highlight === "yellow") needsContact++;
      const d = payDiscrepancy(inv);
      if (d) {
        if (d.kind === "short") shortTotal += d.amount;
        else overTotal += d.amount;
      }
    }
    return { total, byBucket, escalated, needsContact, shortTotal, overTotal };
  }, [nonTroubleInvoices]);

  // Same math as `totals` above but in the shared ArSummaryTotals shape,
  // for comparing against the persisted baseline in ChangesPanel.
  const currentSummaryTotals = useMemo(() => computeArSummaryTotals(invoices), [invoices]);

  const highlightFilterActive = filterRed || filterYellow;
  const discrepancyFilterActive = filterShort || filterOver;
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = buildGroups(customers, nonTroubleInvoices);
    return all
      .map((g) => {
        let invs = g.invoices;
        if (highlightFilterActive) {
          invs = invs.filter((i) => (filterRed && i.highlight === "red") || (filterYellow && i.highlight === "yellow"));
        }
        if (discrepancyFilterActive) {
          invs = invs.filter((i) => {
            const d = payDiscrepancy(i);
            return (filterShort && d?.kind === "short") || (filterOver && d?.kind === "over");
          });
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
  }, [customers, nonTroubleInvoices, search, highlightFilterActive, filterRed, filterYellow, discrepancyFilterActive, filterShort, filterOver]);

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
    } catch (err) {
      alert(err instanceof Error ? `Couldn't sync: ${err.message}` : "Couldn't sync - try again.");
    } finally {
      setImporting(false);
    }
  }

  async function handleSaveBaseline() {
    if (
      baseline &&
      !(await confirm(
        `Reset the comparison baseline to today's numbers? You won't be able to see changes vs the ${formatTimestamp(baseline.captured_at)} baseline anymore.`,
      ))
    ) {
      return;
    }
    setSavingBaseline(true);
    try {
      const row = await saveArBaseline();
      setBaseline(row);
      setShowChanges(true);
    } finally {
      setSavingBaseline(false);
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
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)] px-4 sm:px-8">
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
              onClick={() => setShowChanges((s) => !s)}
              disabled={!baseline}
              title={baseline ? undefined : "Save a baseline first"}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/20 dark:hover:bg-white/10"
            >
              {showChanges ? "Hide Changes" : "Show Changes"}
            </button>
            <button
              onClick={handleSaveBaseline}
              disabled={savingBaseline}
              title={baseline ? "Reset the comparison point to today's numbers" : "Start tracking changes from today's numbers"}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-60 dark:border-white/20 dark:hover:bg-white/10"
            >
              {savingBaseline ? "Saving..." : baseline ? "Reset Baseline" : "Set Baseline"}
            </button>
            <button
              onClick={() => setShowPaste((s) => !s)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              {showPaste ? "Hide paste box" : "Paste AR Aging Report"}
            </button>
          </div>
        </div>

        {showChanges && baseline && (
          <ChangesPanel baseline={baseline} current={currentSummaryTotals} onClose={() => setShowChanges(false)} />
        )}

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
                <Link
                  href="/accounting/ar-troubles"
                  className="text-xl font-bold text-green-700 hover:underline dark:text-green-400"
                >
                  {troubleCount} →
                </Link>
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
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={filterShort} onChange={(e) => setFilterShort(e.target.checked)} />
            Short Pay
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={filterOver} onChange={(e) => setFilterOver(e.target.checked)} />
            Over Pay
          </label>
        </div>

        <div className="space-y-4">
          {groups.length === 0 && (
            <p className="rounded-lg border border-black/10 p-4 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
              {invoices.length === 0 ? "No open invoices yet - paste in the AR Aging report above." : "Nothing matches the current search/filter."}
            </p>
          )}
          {groups.map((g) => {
            const expanded = expandedCustomerIds.has(g.customer.id);
            return (
            <div key={g.customer.id} className="space-y-2 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
              <button
                onClick={() => toggleCustomer(g.customer.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className={`h-4 w-4 shrink-0 text-black/40 transition-transform dark:text-white/40 ${expanded ? "rotate-90" : ""}`}
                  >
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div>
                    <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{g.customer.customer_name}</h2>
                    <p className="text-xs text-black/40 dark:text-white/40">
                      {g.customer.customer_code}
                      {g.customer.credit_limit !== null && ` · Credit Limit ${formatMoney(g.customer.credit_limit)}`}
                      {` · ${g.invoices.length} invoice${g.invoices.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
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
              </button>
              {expanded && (
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
              )}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
