"use client";

import { useMemo } from "react";
import type { ArReportMeta, ParsedArInvoice } from "@/lib/arReportParse";
import { formatTimestamp } from "@/lib/dates";
import { formatReportAt, type LastReport } from "./uploadCheck";

export interface PreviewSummary {
  added: number;
  updated: number;
  removed: number;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// What an AR report file contains, laid out so a wrong file stands out: the date the report
// was generated (highlighted), who ran it, how many customers/invoices, and what loading it
// would change. Shown in the upload box and again in the confirmation pop-ups.
export default function ArUploadPreview({
  fileName,
  meta,
  invoices,
  summary,
  existingCount,
  lastReport,
  highlightWarning,
}: {
  fileName: string | null;
  meta: ArReportMeta;
  invoices: ParsedArInvoice[];
  summary: PreviewSummary;
  existingCount: number;
  lastReport: LastReport | null;
  // Colours the report date red/amber instead of yellow when it needs a closer look.
  highlightWarning?: boolean;
}) {
  const customers = useMemo(() => {
    const map = new Map<string, { name: string; count: number; balance: number }>();
    for (const inv of invoices) {
      const key = inv.customerCode;
      const row = map.get(key) ?? { name: inv.customerName || inv.customerCode, count: 0, balance: 0 };
      row.count += 1;
      row.balance += inv.balance;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.balance - a.balance);
  }, [invoices]);
  const total = invoices.reduce((s, i) => s + i.balance, 0);
  // Taking away a big share of what's on the page is the sign of a partial/wrong report.
  const bigRemoval = summary.removed > 0 && (summary.removed >= 10 || summary.removed >= existingCount * 0.25);

  return (
    <div className="space-y-3 text-sm">
      <div className={`rounded-lg border-2 px-4 py-3 ${highlightWarning ? "border-red-500 bg-red-50 text-black" : "border-yellow-400 bg-yellow-100 text-black"}`}>
        <p className="text-xs font-bold uppercase tracking-wide text-black/60">Report date - when this report was generated</p>
        <p className="text-xl font-extrabold">{meta.reportAt ? formatReportAt(meta.reportAt) : "Not found in this PDF"}</p>
        <p className="text-xs text-black/60">
          {meta.runBy ? `Run by ${meta.runBy}` : ""}
          {meta.runBy && meta.asOf ? " · " : ""}
          {meta.asOf ? `Aging as of ${meta.asOf}` : ""}
          {fileName ? ` · ${fileName}` : ""}
        </p>
        <p className="mt-1 text-xs font-medium text-black/70">
          {lastReport
            ? `Last report loaded: ${lastReport.report_at ? formatReportAt(lastReport.report_at) : "date not recorded"} (uploaded ${formatTimestamp(lastReport.uploaded_at)}${lastReport.uploaded_by ? ` by ${lastReport.uploaded_by}` : ""})`
            : "No earlier report on record."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Customers in this file" value={String(customers.length)} />
        <Stat label="Invoices in this file" value={String(invoices.length)} />
        <Stat label="Total balance" value={money(total)} />
        <Stat label="On the page now" value={`${existingCount} invoices`} />
      </div>

      <p className="font-medium">
        {summary.added} new · {summary.updated} updated ·{" "}
        <span className={summary.removed > 0 ? "font-bold text-red-600" : ""}>{summary.removed} will be removed</span> (no longer on the report)
      </p>
      {bigRemoval && (
        <p className="rounded border border-red-400 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          ⚠ This would REMOVE {summary.removed} invoice{summary.removed === 1 ? "" : "s"} - and the notes, last-contact dates and highlights on them. If that isn&apos;t what you expect, this may be the wrong or a partial report.
        </p>
      )}

      <div className="max-h-52 overflow-y-auto rounded border border-black/15">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-100 text-left text-black">
            <tr>
              <th className="px-2 py-1">Customer</th>
              <th className="px-2 py-1 text-right">Invoices</th>
              <th className="px-2 py-1 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.name} className="border-t border-black/10">
                <td className="px-2 py-1">{c.name}</td>
                <td className="px-2 py-1 text-right">{c.count}</td>
                <td className="px-2 py-1 text-right">{money(c.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-black/15 px-2 py-1.5">
      <p className="text-[11px] text-black/60">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}
