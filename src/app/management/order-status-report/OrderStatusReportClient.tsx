"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import HorizontalBarChart, { type BarDatum } from "@/components/HorizontalBarChart";
import { parseSalesOrderText, type SalesOrderRow } from "@/lib/salesOrderParse";
import { extractPdfText } from "./actions";

interface SalesRepStats {
  salesperson: string;
  orderCount: number;
  casesSold: number;
  delivered: number;
  fob: number;
}

function summarizeSalesOrders(rows: SalesOrderRow[]): SalesRepStats[] {
  const byRep = new Map<string, SalesRepStats>();
  for (const r of rows) {
    const entry = byRep.get(r.salesperson) ?? {
      salesperson: r.salesperson,
      orderCount: 0,
      casesSold: 0,
      delivered: 0,
      fob: 0,
    };
    entry.orderCount += 1;
    entry.casesSold += r.shipped;
    if (r.terms === "Delivered") entry.delivered += 1;
    else entry.fob += 1;
    byRep.set(r.salesperson, entry);
  }
  return Array.from(byRep.values());
}

export default function OrderStatusReportClient() {
  const [pasteText, setPasteText] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SalesOrderRow[] | null>(null);
  // Which statuses are currently counted - reset to "everything found" each
  // time a new report is analyzed, so switching between Confirmed-only,
  // Shipped-only, Invoiced-only, or all of them is just toggling this set,
  // never re-uploading.
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());

  function handleAnalyze(text: string) {
    const result = parseSalesOrderText(text);
    if (result.error) {
      setError(result.error);
      setRows(null);
      return;
    }
    setError(null);
    setRows(result.rows);
    setSelectedStatuses(new Set(result.rows.map((r) => r.status)));
  }

  async function handlePdfUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPdf(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await extractPdfText(formData);
      if ("error" in result) {
        setError(`Couldn't read that PDF (${result.error}) - try pasting the text instead.`);
        return;
      }
      setPasteText(result.text);
      handleAnalyze(result.text);
    } finally {
      setUploadingPdf(false);
    }
  }

  const allStatuses = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.status))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  function toggleStatus(status: string) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const filteredRows = useMemo(
    () => (rows ?? []).filter((r) => selectedStatuses.has(r.status)),
    [rows, selectedStatuses],
  );
  const repStats = useMemo(() => summarizeSalesOrders(filteredRows), [filteredRows]);

  const orderCountChart: BarDatum[] = [...repStats]
    .sort((a, b) => b.orderCount - a.orderCount)
    .map((r) => ({ label: r.salesperson, value: r.orderCount }));
  const casesSoldChart: BarDatum[] = [...repStats]
    .sort((a, b) => b.casesSold - a.casesSold)
    .map((r) => ({ label: r.salesperson, value: r.casesSold }));

  const deliveredByRep = [...repStats].filter((r) => r.delivered > 0).sort((a, b) => b.delivered - a.delivered);
  const fobByRep = [...repStats].filter((r) => r.fob > 0).sort((a, b) => b.fob - a.fob);
  const totalDelivered = repStats.reduce((sum, r) => sum + r.delivered, 0);
  const totalFob = repStats.reduce((sum, r) => sum + r.fob, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Order Status Report</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Upload (or paste) the ERP&apos;s &quot;Orders Summary&quot; report to see orders, cases sold, and terms broken
        down by salesperson - filterable by order status (Confirmed, Shipped, Invoiced, or any combination).
      </p>

      <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={6}
          placeholder="Paste the Orders Summary report text here..."
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleAnalyze(pasteText)}
            disabled={pasteText.trim() === ""}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            Analyze
          </button>
          <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
            {uploadingPdf ? "Reading PDF..." : "Or upload a PDF"}
            <input type="file" accept="application/pdf" onChange={handlePdfUpload} disabled={uploadingPdf} className="hidden" />
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {rows && (
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Order Status</p>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setSelectedStatuses(new Set(allStatuses))}
                  className="font-medium text-green-700 hover:underline dark:text-green-400"
                >
                  All
                </button>
                <button
                  onClick={() => setSelectedStatuses(new Set())}
                  className="font-medium text-black/50 hover:underline dark:text-white/50"
                >
                  None
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {allStatuses.map((status) => {
                const active = selectedStatuses.has(status);
                return (
                  <button
                    key={status}
                    onClick={() => toggleStatus(status)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      active
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-black/20 text-black/60 hover:bg-black/5 dark:border-white/20 dark:text-white/60 dark:hover:bg-white/10"
                    }`}
                  >
                    {status}
                  </button>
                );
              })}
              {allStatuses.length === 0 && <p className="text-sm text-black/40 dark:text-white/40">No statuses found.</p>}
            </div>
          </div>

          <p className="text-sm text-black/60 dark:text-white/60">
            {filteredRows.length} order{filteredRows.length === 1 ? "" : "s"} across {repStats.length} salesperson
            {repStats.length === 1 ? "" : "s"} ({rows.length} total in report, {selectedStatuses.size} of{" "}
            {allStatuses.length} statuses selected).
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-md bg-black/5 p-3 dark:bg-white/5">
              <p className="text-sm font-medium">Total Orders by Salesperson</p>
              <HorizontalBarChart data={orderCountChart} />
            </div>
            <div className="space-y-2 rounded-md bg-black/5 p-3 dark:bg-white/5">
              <p className="text-sm font-medium">Cases Sold by Salesperson</p>
              <HorizontalBarChart data={casesSoldChart} formatValue={(v) => v.toLocaleString()} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-black/60 dark:text-white/60">
              Orders by Terms - {totalDelivered} Delivered, {totalFob} FOB
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-1.5">Delivered</th>
                      <th className="px-3 py-1.5 text-right">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveredByRep.map((r) => (
                      <tr key={r.salesperson} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-3 py-1.5">{r.salesperson}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.delivered}</td>
                      </tr>
                    ))}
                    {deliveredByRep.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-3 text-center text-black/40 dark:text-white/40">
                          No Delivered orders.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto rounded-md border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-1.5">FOB</th>
                      <th className="px-3 py-1.5 text-right">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fobByRep.map((r) => (
                      <tr key={r.salesperson} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-3 py-1.5">{r.salesperson}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.fob}</td>
                      </tr>
                    ))}
                    {fobByRep.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-3 text-center text-black/40 dark:text-white/40">
                          No FOB orders.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
