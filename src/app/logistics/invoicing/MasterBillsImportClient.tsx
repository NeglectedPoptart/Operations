"use client";

import { useState, type ChangeEvent } from "react";
import {
  diffStatementAgainstInvoices,
  splitVendorSections,
  type PendingRow,
  type PostResultRow,
} from "@/lib/statementParse";
import type { Broker, InvoiceStatement } from "@/lib/types";
import { applyStatementCheck, extractPdfText } from "./actions";
import StatementDiffTables, { summarizeDiff } from "./StatementDiffTables";

interface MatchedCarrier {
  broker: Broker;
  posts: PostResultRow[];
  pendingRows: PendingRow[];
}

interface UnmatchedSection {
  vendorName: string;
  vendorCode: string;
  rowCount: number;
}

function normalize(s: string): string {
  return s.trim().toUpperCase();
}

function findBrokerForSection(vendorName: string, vendorCode: string, brokers: Broker[]): Broker | null {
  const code = normalize(vendorCode);
  const name = normalize(vendorName);
  return brokers.find((b) => normalize(b.name) === code || normalize(b.name) === name) ?? null;
}

export default function MasterBillsImportClient({
  brokers,
  initialStatements,
}: {
  brokers: Broker[];
  initialStatements: InvoiceStatement[];
}) {
  const [pasteText, setPasteText] = useState("");
  const [matched, setMatched] = useState<MatchedCarrier[] | null>(null);
  const [unmatched, setUnmatched] = useState<UnmatchedSection[] | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [applying, setApplying] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);

  function runImport(text: string) {
    const sections = splitVendorSections(text);
    if (sections.length === 0) {
      setError("Couldn't find any \"Vendor: ... [code]\" sections in this text - make sure it's the full Bills report.");
      setMatched(null);
      setUnmatched(null);
      return;
    }

    const statementsByBroker = new Map<string, InvoiceStatement[]>();
    for (const s of initialStatements) {
      const list = statementsByBroker.get(s.broker_id) ?? [];
      list.push(s);
      statementsByBroker.set(s.broker_id, list);
    }

    const matchedByBrokerId = new Map<string, MatchedCarrier>();
    const unmatchedSections: UnmatchedSection[] = [];

    for (const section of sections) {
      const broker = findBrokerForSection(section.vendorName, section.vendorCode, brokers);
      if (!broker) {
        unmatchedSections.push({ vendorName: section.vendorName, vendorCode: section.vendorCode, rowCount: section.rows.length });
        continue;
      }
      const { posts, pendingRows } = diffStatementAgainstInvoices(section.rows, statementsByBroker.get(broker.id) ?? []);
      const existing = matchedByBrokerId.get(broker.id);
      if (existing) {
        existing.posts.push(...posts);
        existing.pendingRows.push(...pendingRows);
      } else {
        matchedByBrokerId.set(broker.id, { broker, posts, pendingRows });
      }
    }

    // Only surface carriers where the master PDF actually changes something -
    // a carrier with nothing to remove/flag/mark-pending is just noise here.
    const actionable = [...matchedByBrokerId.values()]
      .filter((m) => {
        const { removeCount, flagCount, pendingCount } = summarizeDiff(m.posts, m.pendingRows);
        return removeCount + flagCount + pendingCount > 0;
      })
      .sort((a, b) => a.broker.name.localeCompare(b.broker.name));

    setMatched(actionable);
    setUnmatched(unmatchedSections.sort((a, b) => b.rowCount - a.rowCount));
    setExcludedIds(new Set());
    setExpandedIds(new Set());
    setError(null);
    setDoneMessage(null);
  }

  async function handlePdfUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setDoneMessage(null);
    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await extractPdfText(formData);
      if ("error" in result) {
        setError(`Couldn't read that PDF (${result.error}) - try pasting the text instead.`);
        return;
      }
      setPasteText(result.text);
      runImport(result.text);
    } finally {
      setUploadingPdf(false);
    }
  }

  function handleCheckPaste() {
    setError(null);
    setDoneMessage(null);
    setLoading(true);
    try {
      runImport(pasteText);
    } finally {
      setLoading(false);
    }
  }

  function toggleExcluded(brokerId: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(brokerId)) next.delete(brokerId);
      else next.add(brokerId);
      return next;
    });
  }

  function toggleExpanded(brokerId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(brokerId)) next.delete(brokerId);
      else next.add(brokerId);
      return next;
    });
  }

  async function handleApplyAll() {
    if (!matched) return;
    const toApply = matched.filter((m) => !excludedIds.has(m.broker.id));
    if (toApply.length === 0) return;
    setApplying(true);
    try {
      await Promise.all(
        toApply.map((m) => {
          const removeIds = m.posts.filter((r) => r.action === "remove" && r.matchId).map((r) => r.matchId as string);
          const doneFlagIds = m.posts.filter((r) => r.action === "flag" && r.matchId).map((r) => r.matchId as string);
          const pendingIds = m.pendingRows.map((r) => r.id);
          return applyStatementCheck(m.broker.id, removeIds, doneFlagIds, pendingIds);
        }),
      );
      setDoneMessage(`Reconciled ${toApply.length} carrier${toApply.length === 1 ? "" : "s"} from the master PDF.`);
      setMatched(null);
      setUnmatched(null);
      setPasteText("");
    } finally {
      setApplying(false);
    }
  }

  function handleCancel() {
    setMatched(null);
    setUnmatched(null);
  }

  const includedCount = matched?.filter((m) => !excludedIds.has(m.broker.id)).length ?? 0;

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Master Bills Import</h2>
      <p className="text-sm text-black/60 dark:text-white/60">
        Upload the full company-wide &quot;Bills&quot; PDF export (every vendor, not just carriers) and this finds the
        sections whose vendor code or name matches one of your tracked carriers, then runs the same Statement Checker
        reconciliation on each one automatically - no need to isolate each carrier&apos;s statement by hand.
      </p>

      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        rows={4}
        placeholder="Or paste the extracted Bills report text here..."
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 font-mono text-xs text-black"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {doneMessage && <p className="text-sm text-green-700 dark:text-green-400">{doneMessage}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
          {uploadingPdf ? "Reading PDF..." : "Upload Bills PDF"}
          <input
            type="file"
            accept="application/pdf"
            onChange={handlePdfUpload}
            disabled={uploadingPdf || loading}
            className="hidden"
          />
        </label>
        <button
          onClick={handleCheckPaste}
          disabled={loading || uploadingPdf || pasteText.trim() === ""}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-60 dark:border-white/20 dark:hover:bg-white/10"
        >
          {loading ? "Scanning..." : "Scan Pasted Text"}
        </button>
      </div>

      {matched && unmatched && (
        <div className="space-y-4">
          <p className="text-sm">
            {matched.length} carrier{matched.length === 1 ? "" : "s"} matched with changes to reconcile, {unmatched.length}{" "}
            vendor section{unmatched.length === 1 ? "" : "s"} in the PDF weren&apos;t a tracked carrier and were skipped.
          </p>

          {matched.length === 0 && (
            <p className="text-sm text-black/40 dark:text-white/40">Nothing to reconcile - every matched carrier is already up to date.</p>
          )}

          <div className="space-y-2">
            {matched.map((m) => {
              const { removeCount, flagCount, reviewCount, pendingCount } = summarizeDiff(m.posts, m.pendingRows);
              const excluded = excludedIds.has(m.broker.id);
              const expanded = expandedIds.has(m.broker.id);
              return (
                <div key={m.broker.id} className="rounded-lg border border-black/10 dark:border-white/10">
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!excluded}
                      onChange={() => toggleExcluded(m.broker.id)}
                      className="h-4 w-4"
                    />
                    <button onClick={() => toggleExpanded(m.broker.id)} className="flex-1 text-left text-sm font-medium">
                      {m.broker.name}
                    </button>
                    <span className="text-xs text-black/60 dark:text-white/60">
                      {removeCount} remove · {flagCount} flag{reviewCount > 0 && ` · ${reviewCount} review`} · {pendingCount} pending
                    </span>
                    <button onClick={() => toggleExpanded(m.broker.id)} className="text-xs font-medium text-green-700 hover:underline dark:text-green-400">
                      {expanded ? "Hide detail" : "Show detail"}
                    </button>
                  </div>
                  {expanded && (
                    <div className="border-t border-black/10 p-3 dark:border-white/10">
                      <StatementDiffTables posts={m.posts} pendingRows={m.pendingRows} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {unmatched.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowUnmatched((s) => !s)}
                className="text-xs font-medium text-black/60 hover:underline dark:text-white/60"
              >
                {showUnmatched ? "Hide" : "Show"} skipped vendor sections ({unmatched.length})
              </button>
              {showUnmatched && (
                <div className="max-h-48 overflow-auto rounded border border-black/10 text-xs dark:border-white/10">
                  <table className="w-full">
                    <thead className="bg-black/5 text-left dark:bg-white/5">
                      <tr>
                        <th className="px-2 py-1">Code</th>
                        <th className="px-2 py-1">Vendor Name</th>
                        <th className="px-2 py-1">Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatched.map((u, i) => (
                        <tr key={i} className="border-t border-black/10 dark:border-white/10">
                          <td className="px-2 py-1">{u.vendorCode}</td>
                          <td className="px-2 py-1">{u.vendorName}</td>
                          <td className="px-2 py-1">{u.rowCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleApplyAll}
              disabled={applying || includedCount === 0}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {applying ? "Applying..." : `Apply ${includedCount} Carrier${includedCount === 1 ? "" : "s"}`}
            </button>
            <button
              onClick={handleCancel}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
