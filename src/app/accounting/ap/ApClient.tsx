"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import HorizontalBarChart from "@/components/HorizontalBarChart";
import { parseApReportPaste, type ParsedApPayable } from "@/lib/apReportParse";
import { formatDate } from "@/lib/dates";
import { copyOrDownloadPng, escapeHtml, renderPriceSheetPng, type CanvasBlock } from "@/lib/fobPricing";
import { AP_HIGHLIGHTS, type ApHighlight, type ApPayable, type ApVendor, type Profile } from "@/lib/types";
import { createPayList } from "../pay-lists/actions";
import { deleteApPayableRow, importApReport, updateApPayableRow } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

const HIGHLIGHT_ROW_CLASS: Record<ApHighlight, string> = {
  none: "",
  yellow: "bg-yellow-50 dark:bg-yellow-950/20",
  red: "bg-red-50 dark:bg-red-950/20",
};

const GL_BADGE_CLASS = "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";

const AP_HEADERS = ["Vendor", "GL Account", "Document", "Date", "Type", "Concept", "Balance", "Last Contact", "Notes"];

function apRowValues(p: ApPayable, vendorName: string): string[] {
  return [
    vendorName,
    p.gl_account_label || p.gl_account_code,
    p.document,
    p.doc_date ? formatDate(p.doc_date) : "",
    p.type ?? "",
    p.concept ?? "",
    formatMoney(p.balance),
    p.last_contact ? formatDate(p.last_contact) : "",
    p.notes ?? "",
  ];
}

interface VendorGroup {
  vendor: ApVendor;
  payables: ApPayable[];
  totalBalance: number;
}

function compareByDate(a: ApPayable, b: ApPayable): number {
  if (a.doc_date === b.doc_date) return a.position - b.position;
  if (a.doc_date === null) return 1;
  if (b.doc_date === null) return -1;
  return a.doc_date < b.doc_date ? -1 : 1;
}

function buildGroups(vendors: ApVendor[], payables: ApPayable[]): VendorGroup[] {
  const byVendor = new Map<string, ApPayable[]>();
  for (const p of payables) {
    if (!byVendor.has(p.vendor_id)) byVendor.set(p.vendor_id, []);
    byVendor.get(p.vendor_id)!.push(p);
  }
  return vendors
    .map((vendor) => {
      const ps = [...(byVendor.get(vendor.id) ?? [])].sort(compareByDate);
      return { vendor, payables: ps, totalBalance: ps.reduce((sum, p) => sum + p.balance, 0) };
    })
    .filter((g) => g.payables.length > 0)
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

export default function ApClient({
  initialVendors,
  initialPayables,
  profiles,
}: {
  initialVendors: ApVendor[];
  initialPayables: ApPayable[];
  profiles: Profile[];
}) {
  const confirm = useConfirm();
  const [vendors, setVendors] = useState(initialVendors);
  const [payables, setPayables] = useState(initialPayables);
  const [showPaste, setShowPaste] = useState(initialPayables.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedApPayable[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRed, setFilterRed] = useState(false);
  const [filterYellow, setFilterYellow] = useState(false);
  const [conceptFilter, setConceptFilter] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);

  // Pay List workspace - purely local until submitted (see handleSubmitPayList).
  const [payListSelection, setPayListSelection] = useState<Set<string>>(new Set());
  const [payListTitle, setPayListTitle] = useState("");
  const [payListRecipients, setPayListRecipients] = useState<Set<string>>(new Set());
  const [submittingPayList, setSubmittingPayList] = useState(false);
  const [payListError, setPayListError] = useState<string | null>(null);
  const [justSubmittedTitle, setJustSubmittedTitle] = useState<string | null>(null);

  const concepts = useMemo(() => {
    const set = new Set<string>();
    for (const p of payables) set.add(p.concept || "(none)");
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [payables]);

  const totals = useMemo(() => {
    let total = 0;
    let escalated = 0;
    const byConcept = new Map<string, number>();
    for (const p of payables) {
      total += p.balance;
      if (p.highlight === "red") escalated++;
      const concept = p.concept || "(none)";
      byConcept.set(concept, (byConcept.get(concept) ?? 0) + p.balance);
    }
    return { total, escalated, byConcept };
  }, [payables]);

  const highlightFilterActive = filterRed || filterYellow;
  const conceptFilterActive = conceptFilter.size > 0;
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = buildGroups(vendors, payables);
    return all
      .map((g) => {
        let ps = g.payables;
        if (highlightFilterActive) {
          ps = ps.filter((p) => (filterRed && p.highlight === "red") || (filterYellow && p.highlight === "yellow"));
        }
        if (conceptFilterActive) {
          ps = ps.filter((p) => conceptFilter.has(p.concept || "(none)"));
        }
        if (q) {
          const nameMatches = g.vendor.vendor_name.toLowerCase().includes(q) || g.vendor.vendor_code.toLowerCase().includes(q);
          if (!nameMatches) {
            ps = ps.filter((p) => p.document.toLowerCase().includes(q));
          }
        }
        return { ...g, payables: ps };
      })
      .filter((g) => g.payables.length > 0);
  }, [vendors, payables, search, highlightFilterActive, filterRed, filterYellow, conceptFilterActive, conceptFilter]);

  function toggleConceptFilter(concept: string) {
    setConceptFilter((prev) => {
      const next = new Set(prev);
      if (next.has(concept)) next.delete(concept);
      else next.add(concept);
      return next;
    });
  }

  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);

  function togglePayListSelection(id: string) {
    setPayListSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRecipient(userId: string) {
    setPayListRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const payListItems = useMemo(
    () => payables.filter((p) => payListSelection.has(p.id)),
    [payables, payListSelection],
  );
  const payListTotal = payListItems.reduce((sum, p) => sum + p.balance, 0);

  async function handleSubmitPayList() {
    setPayListError(null);
    if (!payListTitle.trim()) {
      setPayListError("Enter a title for the pay list.");
      return;
    }
    setSubmittingPayList(true);
    try {
      await createPayList(payListTitle, Array.from(payListSelection), Array.from(payListRecipients));
      setJustSubmittedTitle(payListTitle.trim());
      setPayListSelection(new Set());
      setPayListTitle("");
      setPayListRecipients(new Set());
      setTimeout(() => setJustSubmittedTitle(null), 6000);
    } catch (err) {
      setPayListError(err instanceof Error ? err.message : "Couldn't submit the pay list - try again.");
    } finally {
      setSubmittingPayList(false);
    }
  }

  function handlePreview() {
    const result = parseApReportPaste(pasteText);
    if (result.error) {
      setParseError(result.error);
      setPreviewRows(null);
      return;
    }
    setParseError(null);
    setPreviewRows(result.payables);
  }

  // A document number alone isn't unique - one document can carry
  // multiple lines (e.g. "Customs" and "Freight" both filed under the
  // same doc #), so the match key has to include concept too, same as
  // the server-side sync logic.
  const rowKey = (vendorId: string | undefined, document: string, concept: string | null) =>
    `${vendorId}:${document}:${concept ?? ""}`;
  const existingKeys = useMemo(
    () => new Set(payables.map((p) => rowKey(p.vendor_id, p.document, p.concept))),
    [payables],
  );
  const vendorIdByCode = useMemo(() => new Map(vendors.map((v) => [v.vendor_code, v.id])), [vendors]);
  const previewSummary = useMemo(() => {
    if (!previewRows) return null;
    const parsedKeys = new Set(
      previewRows.map((r) => rowKey(vendorIdByCode.get(r.vendorCode), r.document, r.concept || null)),
    );
    const added = previewRows.filter(
      (r) => !existingKeys.has(rowKey(vendorIdByCode.get(r.vendorCode), r.document, r.concept || null)),
    ).length;
    const updated = previewRows.length - added;
    const removed = payables.filter((p) => !parsedKeys.has(rowKey(p.vendor_id, p.document, p.concept))).length;
    const total = previewRows.reduce((sum, r) => sum + r.balance, 0);
    return { added, updated, removed, total };
  }, [previewRows, existingKeys, vendorIdByCode, payables]);

  async function handleConfirmImport() {
    if (!previewRows) return;
    setImporting(true);
    try {
      const { vendors: newVendors, payables: newPayables } = await importApReport(previewRows);
      setVendors(newVendors);
      setPayables(newPayables);
      setPreviewRows(null);
      setPasteText("");
      setShowPaste(false);
    } catch (err) {
      alert(err instanceof Error ? `Couldn't sync: ${err.message}` : "Couldn't sync - try again.");
    } finally {
      setImporting(false);
    }
  }

  function handleCancelPreview() {
    setPreviewRows(null);
    setParseError(null);
  }

  function updateLocal(id: string, patch: Partial<ApPayable>) {
    setPayables((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function handleFieldSave(id: string, patch: Partial<Pick<ApPayable, "last_contact" | "notes" | "highlight">>) {
    updateLocal(id, patch);
    updateApPayableRow(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Remove this payable? (It'll come back on the next import if it's still open in the ERP.)"))) return;
    setPayables((prev) => prev.filter((p) => p.id !== id));
    await deleteApPayableRow(id).catch(() => {});
  }

  const flatRows = useMemo(
    () => groups.flatMap((g) => g.payables.map((p) => apRowValues(p, g.vendor.vendor_name))),
    [groups],
  );

  async function handleCopyEmail() {
    const html = buildTableHtml("Accounts Payable", AP_HEADERS, flatRows);
    const text = buildPlainTextTable("Accounts Payable", AP_HEADERS, flatRows);
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
          title: "Accounts Payable",
          headerColor: "#8DC63F",
          columnHeaders: AP_HEADERS,
          rows: flatRows.length > 0 ? flatRows.map((cells) => ({ cells })) : [{ cells: ["Nothing here.", ...Array(AP_HEADERS.length - 1).fill("")] }],
        },
      ];
      const blob = await renderPriceSheetPng({
        title: "Accounts Payable",
        message: `Total Outstanding: $${totals.total.toFixed(2)}   Escalated: ${totals.escalated}`,
        blocks,
      });
      const result = await copyOrDownloadPng(blob, "accounts-payable.png");
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  const conceptChartData = Array.from(totals.byConcept.entries()).map(([label, value]) => ({ label, value }));

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Accounts Payable</h1>
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
              {showPaste ? "Hide paste box" : "Paste Accrued Payables Report"}
            </button>
            <Link
              href="/accounting/pay-lists"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              View Pay Lists →
            </Link>
          </div>
        </div>

        {justSubmittedTitle && (
          <p className="rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
            Pay list &quot;{justSubmittedTitle}&quot; submitted!{" "}
            <Link href="/accounting/pay-lists" className="underline">
              View Pay Lists →
            </Link>
          </p>
        )}

        {payListSelection.size > 0 && (
          <div className="space-y-3 rounded-lg border-2 border-green-600 p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-green-700 dark:text-green-400">
                Pay List Preview - {payListItems.length} item{payListItems.length === 1 ? "" : "s"}, {formatMoney(payListTotal)}
              </h2>
              <button
                onClick={() => setPayListSelection(new Set())}
                className="text-xs font-medium text-black/50 hover:underline dark:text-white/50"
              >
                Clear all
              </button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {payListItems.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded bg-black/5 px-2 py-1 text-sm dark:bg-white/5"
                >
                  <span className="truncate">
                    {vendorById.get(p.vendor_id)?.vendor_name ?? "Unknown vendor"} - {p.document} -{" "}
                    {formatMoney(p.balance)}
                  </span>
                  <button
                    onClick={() => togglePayListSelection(p.id)}
                    className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <label className="block text-sm">
              Title
              <input
                value={payListTitle}
                onChange={(e) => setPayListTitle(e.target.value)}
                placeholder="e.g. Week of Aug 18 - Freight"
                className={`${field} mt-1`}
              />
            </label>

            <div className="text-sm">
              <span className="font-medium">Notify:</span>
              <div className="mt-1 flex flex-wrap gap-3">
                {profiles.map((pr) => (
                  <label key={pr.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={payListRecipients.has(pr.id)}
                      onChange={() => toggleRecipient(pr.id)}
                    />
                    {pr.email ?? "(no email)"}
                  </label>
                ))}
              </div>
            </div>

            {payListError && <p className="text-sm text-red-600">{payListError}</p>}

            <button
              onClick={handleSubmitPayList}
              disabled={submittingPayList}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {submittingPayList ? "Submitting..." : "Submit Pay List"}
            </button>
          </div>
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
                <p className="text-black/60 dark:text-white/60">Vendors</p>
                <p className="text-xl font-bold">{groups.length}</p>
              </div>
              <div>
                <p className="text-black/60 dark:text-white/60">Escalated</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{totals.escalated}</p>
              </div>
            </div>
          </div>
          <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Outstanding by Concept</h2>
            <HorizontalBarChart data={conceptChartData} formatValue={(v) => `$${Math.round(v).toLocaleString()}`} />
          </div>
        </div>

        {showPaste && (
          <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
            <p className="text-sm text-black/60 dark:text-white/60">
              Paste the whole &quot;Accrued Payables by Document&quot; export here (select all in Excel, copy, paste below) -
              this syncs the list: balances/dates/GL accounts refresh, payables no longer in the export are removed
              (paid off), and any Last Contact/Notes/Highlight you&apos;ve already logged on a still-open payable is
              kept. Given how many rows this report usually has, the preview below is a summary rather than a
              row-by-row grid - review the numbers, then check the full list in the page below after syncing.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setPreviewRows(null);
                setParseError(null);
              }}
              rows={6}
              placeholder="Paste the Accrued Payables report here..."
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
            {previewRows && previewSummary && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Found {previewRows.length} payable{previewRows.length === 1 ? "" : "s"} totaling {formatMoney(previewSummary.total)}:{" "}
                  {previewSummary.added} new, {previewSummary.updated} updated, {previewSummary.removed} will be removed (no longer
                  open).
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
            placeholder="Search vendor or document #..."
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
          {concepts.map((concept) => (
            <label key={concept} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={conceptFilter.has(concept)}
                onChange={() => toggleConceptFilter(concept)}
              />
              {concept}
            </label>
          ))}
        </div>

        <div className="space-y-4">
          {groups.length === 0 && (
            <p className="rounded-lg border border-black/10 p-4 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
              {payables.length === 0 ? "No open payables yet - paste in the Accrued Payables report above." : "Nothing matches the current search/filter."}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.vendor.id} className="space-y-2 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{g.vendor.vendor_name}</h2>
                  <p className="text-xs text-black/40 dark:text-white/40">{g.vendor.vendor_code}</p>
                </div>
                <p className="text-lg font-bold">{formatMoney(g.totalBalance)}</p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-2 py-2">Pay List</th>
                      <th className="px-2 py-2">Document</th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Concept</th>
                      <th className="px-2 py-2">GL Account</th>
                      <th className="px-2 py-2 text-right">Balance</th>
                      <th className="px-2 py-2">Last Contact</th>
                      <th className="px-2 py-2">Notes</th>
                      <th className="px-2 py-2">Highlight</th>
                      <th className="w-16 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {g.payables.map((p) => (
                      <tr key={p.id} className={`border-t border-black/10 dark:border-white/10 ${HIGHLIGHT_ROW_CLASS[p.highlight]}`}>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={payListSelection.has(p.id)}
                            onChange={() => togglePayListSelection(p.id)}
                            title="Add to Pay List"
                          />
                        </td>
                        <td className="px-2 py-1.5">{p.document}</td>
                        <td className="px-2 py-1.5">{p.doc_date ? formatDate(p.doc_date) : ""}</td>
                        <td className="px-2 py-1.5">{p.type ?? ""}</td>
                        <td className="px-2 py-1.5">{p.concept ?? ""}</td>
                        <td className="px-2 py-1.5">
                          <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${GL_BADGE_CLASS}`}>
                            {p.gl_account_label || p.gl_account_code}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{formatMoney(p.balance)}</td>
                        <td className="min-w-[7rem] px-1 py-1">
                          <input
                            type="date"
                            defaultValue={p.last_contact ?? ""}
                            onBlur={(e) => handleFieldSave(p.id, { last_contact: e.target.value || null })}
                            className={field}
                          />
                        </td>
                        <td className="min-w-[10rem] px-1 py-1">
                          <input
                            defaultValue={p.notes ?? ""}
                            onBlur={(e) => handleFieldSave(p.id, { notes: e.target.value })}
                            className={field}
                          />
                        </td>
                        <td className="min-w-[8rem] px-1 py-1">
                          <select
                            value={p.highlight}
                            onChange={(e) => handleFieldSave(p.id, { highlight: e.target.value as ApHighlight })}
                            className={field}
                          >
                            {AP_HIGHLIGHTS.map((h) => (
                              <option key={h.value} value={h.value}>
                                {h.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => handleDelete(p.id)} className="text-xs font-medium text-red-600 hover:underline">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
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
