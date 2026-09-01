"use client";

import { useMemo, useState } from "react";
import HorizontalBarChart, { type BarDatum } from "@/components/HorizontalBarChart";
import { daysSince, formatDateSlash } from "@/lib/dates";
import { copyOrDownloadPng, renderPriceSheetPng, type CanvasBlock, type MonoRow } from "@/lib/fobPricing";
import { OVERDUE_DAYS } from "@/lib/invoicingParse";
import type { Broker, InvoiceStatement } from "@/lib/types";

function formatMoney(n: number | null) {
  return n === null ? "-" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ACCOUNTING_HEADERS = ["Invoice #", "Date", "Customer PO", "Amount", "Age"];

function accountingRowValues(item: InvoiceStatement): string[] {
  const age = daysSince(item.invoice_date);
  return [
    item.invoice_no,
    formatDateSlash(item.invoice_date) || "-",
    item.customer_po || "-",
    formatMoney(item.amount),
    age !== null ? String(age) : "-",
  ];
}

function buildAccountingBlock(
  title: string,
  headerColor: string,
  items: InvoiceStatement[],
  brokerNameById: Map<string, string>,
): CanvasBlock {
  const byBroker = new Map<string, InvoiceStatement[]>();
  for (const item of items) {
    const name = brokerNameById.get(item.broker_id) ?? "Unknown Carrier";
    if (!byBroker.has(name)) byBroker.set(name, []);
    byBroker.get(name)!.push(item);
  }

  const rows: MonoRow[] = [];
  for (const name of [...byBroker.keys()].sort((a, b) => a.localeCompare(b))) {
    rows.push({ group: name });
    const sorted = byBroker
      .get(name)!
      .sort((a, b) => (a.invoice_date ?? "").localeCompare(b.invoice_date ?? ""));
    for (const item of sorted) rows.push({ cells: accountingRowValues(item) });
    const carrierTotal = sorted.reduce((sum, item) => sum + (item.amount ?? 0), 0);
    rows.push({ cells: ["TOTAL", "", "", formatMoney(carrierTotal), ""] });
  }

  return {
    title: `${title} (${items.length})`,
    headerColor,
    columnHeaders: ACCOUNTING_HEADERS,
    rows: rows.length > 0 ? rows : [{ cells: ["Nothing in this bucket.", "", "", "", ""] }],
  };
}

export default function AccountingSummaryClient({
  brokers,
  statements,
}: {
  brokers: Broker[];
  statements: InvoiceStatement[];
}) {
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const brokerNameById = useMemo(() => new Map(brokers.map((b) => [b.id, b.name])), [brokers]);

  // "Posted" specifically means Statement Checker matched this invoice to a
  // Posted row on the carrier's own statement (see applyStatementCheck) -
  // that's what sets status to "done" here. flagged is only ever set true
  // in that same path, for a Posted invoice that still showed a balance -
  // i.e. exactly "posted in our system but not paid". A fully-paid Posted
  // invoice gets removed outright rather than left in this table, so
  // done+flagged is the complete set of what this report is for.
  const postedNotPaid = useMemo(() => statements.filter((s) => s.status === "done" && s.flagged), [statements]);

  const { overItems, underItems } = useMemo(() => {
    const overItems: InvoiceStatement[] = [];
    const underItems: InvoiceStatement[] = [];
    for (const item of postedNotPaid) {
      const age = daysSince(item.invoice_date);
      (age !== null && age >= OVERDUE_DAYS ? overItems : underItems).push(item);
    }
    return { overItems, underItems };
  }, [postedNotPaid]);

  // AP-style summary tiles + per-carrier breakdown, same shape as the
  // Accounts Payable page's own Summary card - across the full
  // posted-not-paid set, not just one age bucket.
  const summary = useMemo(() => {
    const carrierIds = new Set<string>();
    const totalsByCarrier = new Map<string, number>();
    let totalOutstanding = 0;
    for (const item of postedNotPaid) {
      carrierIds.add(item.broker_id);
      totalOutstanding += item.amount ?? 0;
      const name = brokerNameById.get(item.broker_id) ?? "Unknown Carrier";
      totalsByCarrier.set(name, (totalsByCarrier.get(name) ?? 0) + (item.amount ?? 0));
    }
    const carrierChartData: BarDatum[] = Array.from(totalsByCarrier.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    return { totalOutstanding, carrierCount: carrierIds.size, carrierChartData };
  }, [postedNotPaid, brokerNameById]);

  async function handleCopyImage() {
    try {
      const blocks = [
        buildAccountingBlock(`${OVERDUE_DAYS}+ Days`, "#EF5350", overItems, brokerNameById),
        buildAccountingBlock(`Under ${OVERDUE_DAYS} Days`, "#64B5F6", underItems, brokerNameById),
      ];
      const blob = await renderPriceSheetPng({
        title: "Freight Invoicing - Outstanding by Carrier",
        message: "",
        blocks,
      });
      const result = await copyOrDownloadPng(blob, "invoicing-accounting-summary.png");
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Accounting Summary</h2>
        <button
          onClick={handleCopyImage}
          className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
        >
          {imageStatus ?? "Copy as Image"}
        </button>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60">
        Every posted, not-yet-paid invoice across all carriers - copy as an image, split into {OVERDUE_DAYS}+ days
        and under {OVERDUE_DAYS} days, to paste straight into an email to accounting.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <h3 className="text-sm font-bold text-green-700 dark:text-green-400">Summary</h3>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-black/60 dark:text-white/60">Total Outstanding</p>
              <p className="text-xl font-bold">{formatMoney(summary.totalOutstanding)}</p>
            </div>
            <div>
              <p className="text-black/60 dark:text-white/60">Carriers</p>
              <p className="text-xl font-bold">{summary.carrierCount}</p>
            </div>
            <div>
              <p className="text-black/60 dark:text-white/60">Invoices</p>
              <p className="text-xl font-bold">{overItems.length + underItems.length}</p>
            </div>
            <div>
              <p className="text-black/60 dark:text-white/60">{OVERDUE_DAYS}+ Days</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">{overItems.length}</p>
            </div>
          </div>
        </div>
        <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <h3 className="text-sm font-bold text-green-700 dark:text-green-400">Outstanding by Carrier</h3>
          <HorizontalBarChart data={summary.carrierChartData} formatValue={(v) => `$${Math.round(v).toLocaleString()}`} />
        </div>
      </div>
    </div>
  );
}
