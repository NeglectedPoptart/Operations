"use client";

import { useMemo, useState } from "react";
import { daysSince, formatDateSlash } from "@/lib/dates";
import { copyOrDownloadPng, renderPriceSheetPng, type CanvasBlock, type MonoRow } from "@/lib/fobPricing";
import { OVERDUE_DAYS } from "@/lib/invoicingParse";
import type { Broker, InvoiceStatement } from "@/lib/types";

function formatMoney(n: number | null) {
  return n === null ? "-" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ACCOUNTING_HEADERS = ["Invoice #", "Date", "Customer PO", "Amount", "Age"];

// Every row here is posted-but-not-paid by construction (the caller already
// filtered out "done"), so the flag isn't distinguishing rows from each
// other - it's telling accounting, at a glance, what this whole list means.
function accountingRowValues(item: InvoiceStatement): string[] {
  const age = daysSince(item.invoice_date);
  return [
    `${item.invoice_no} \u{1F6A9}`,
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

  // "Posted" = it's on this list at all (entered from a carrier's
  // statement); "done" means accounting already paid it, so that's the one
  // status excluded here - everything left is posted and outstanding.
  const { overItems, underItems } = useMemo(() => {
    const outstanding = statements.filter((s) => s.status !== "done");
    const overItems: InvoiceStatement[] = [];
    const underItems: InvoiceStatement[] = [];
    for (const item of outstanding) {
      const age = daysSince(item.invoice_date);
      (age !== null && age >= OVERDUE_DAYS ? overItems : underItems).push(item);
    }
    return { overItems, underItems };
  }, [statements]);

  async function handleCopyImage() {
    try {
      const blocks = [
        buildAccountingBlock(`${OVERDUE_DAYS}+ Days`, "#EF5350", overItems, brokerNameById),
        buildAccountingBlock(`Under ${OVERDUE_DAYS} Days`, "#64B5F6", underItems, brokerNameById),
      ];
      const blob = await renderPriceSheetPng({
        title: "Freight Invoicing - Outstanding by Carrier",
        message: "\u{1F6A9} = posted, not yet paid",
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
    <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Accounting Summary</h2>
      <p className="text-sm text-black/60 dark:text-white/60">
        Every posted, not-yet-paid invoice across all carriers, split into {OVERDUE_DAYS}+ days and under{" "}
        {OVERDUE_DAYS} days - copy as an image to paste straight into an email to accounting.
      </p>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span>
          <strong className="text-red-600 dark:text-red-400">{overItems.length}</strong> over {OVERDUE_DAYS} days
        </span>
        <span>
          <strong>{underItems.length}</strong> under {OVERDUE_DAYS} days
        </span>
      </div>
      <button
        onClick={handleCopyImage}
        className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
      >
        {imageStatus ?? "Copy as Image"}
      </button>
    </div>
  );
}
