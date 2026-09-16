"use client";

import { useState, type ChangeEvent } from "react";
import {
  diffStatementAgainstInvoices,
  parsePastedStatement,
  parsePdfStatement,
  type PendingRow,
  type PostResultRow,
  type ParseResult,
} from "@/lib/statementParse";
import type { Broker, InvoiceStatement } from "@/lib/types";
import { applyStatementCheck, extractPdfText, getInvoiceStatementsForBroker } from "./actions";
import StatementDiffTables, { summarizeDiff } from "./StatementDiffTables";

export default function StatementCheckerClient({ brokers }: { brokers: Broker[] }) {
  const [brokerId, setBrokerId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [postResults, setPostResults] = useState<PostResultRow[] | null>(null);
  const [pendingRows, setPendingRows] = useState<PendingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [applying, setApplying] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  function handleBrokerChange(id: string) {
    setBrokerId(id);
    setPostResults(null);
    setPendingRows(null);
    setDoneMessage(null);
  }

  // Shared by both the paste flow and the PDF-upload flow - everything past
  // "here are the parsed rows" is identical regardless of where they came from.
  async function runCheck(parsed: ParseResult) {
    if (parsed.error) {
      setError(parsed.error);
      setPostResults(null);
      setPendingRows(null);
      return;
    }
    const items: InvoiceStatement[] = await getInvoiceStatementsForBroker(brokerId);
    const { posts, pendingRows: notFound } = diffStatementAgainstInvoices(parsed.rows, items);

    setPostResults(posts);
    setPendingRows(notFound);
  }

  async function handleCheck() {
    setError(null);
    setDoneMessage(null);
    if (!brokerId) {
      setError("Pick a carrier first.");
      return;
    }
    setLoading(true);
    try {
      await runCheck(parsePastedStatement(pasteText));
    } finally {
      setLoading(false);
    }
  }

  async function handlePdfUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setDoneMessage(null);
    if (!brokerId) {
      setError("Pick a carrier first.");
      return;
    }
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
      await runCheck(parsePdfStatement(result.text));
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleApply() {
    if (!postResults || !pendingRows || !brokerId) return;
    setApplying(true);
    try {
      const removeIds = postResults.filter((r) => r.action === "remove" && r.matchId).map((r) => r.matchId as string);
      const doneFlagIds = postResults.filter((r) => r.action === "flag" && r.matchId).map((r) => r.matchId as string);
      const pendingIds = pendingRows.map((r) => r.id);
      await applyStatementCheck(brokerId, removeIds, doneFlagIds, pendingIds);
      setDoneMessage(`Removed ${removeIds.length}, flagged ${doneFlagIds.length}, marked ${pendingIds.length} pending.`);
      setPostResults(null);
      setPendingRows(null);
      setPasteText("");
    } finally {
      setApplying(false);
    }
  }

  function handleCancel() {
    setPostResults(null);
    setPendingRows(null);
  }

  const { removeCount, flagCount, pendingCount } = summarizeDiff(postResults ?? [], pendingRows ?? []);

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Statement Checker</h2>
      <p className="text-sm text-black/60 dark:text-white/60">
        Pick the carrier, then paste their statement (needs Document, Journal, and Balance columns) or upload the
        statement as a PDF - rows Journal marks &quot;Open&quot; are left alone. For &quot;Post&quot; rows matched to
        this list: no balance shown means
        fully paid, so it&apos;s marked Done and removed; a balance still shown means it&apos;s marked Done but
        flagged instead. Anything on this list that doesn&apos;t show up anywhere in the statement gets marked
        Pending. A Pending invoice that already has a note on it is left alone either way and called out separately
        for manual review instead - a note is treated as a deliberate &quot;don&apos;t touch this one&quot; flag.
      </p>

      <div>
        <label className="text-xs font-medium text-black/60 dark:text-white/60">Carrier</label>
        <select
          value={brokerId}
          onChange={(e) => handleBrokerChange(e.target.value)}
          className="block rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
        >
          <option value="">-- Select --</option>
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        rows={5}
        placeholder="Paste tab-separated statement rows here (including the header row)..."
        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {doneMessage && <p className="text-sm text-green-700 dark:text-green-400">{doneMessage}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleCheck}
          disabled={loading || uploadingPdf}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {loading ? "Checking..." : "Check Statement"}
        </button>
        <label className="cursor-pointer rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
          {uploadingPdf ? "Reading PDF..." : "Or upload a PDF"}
          <input
            type="file"
            accept="application/pdf"
            onChange={handlePdfUpload}
            disabled={uploadingPdf || loading}
            className="hidden"
          />
        </label>
      </div>

      {postResults && pendingRows && (
        <div className="space-y-4">
          <StatementDiffTables posts={postResults} pendingRows={pendingRows} />

          <div className="flex gap-2">
            <button
              onClick={handleApply}
              disabled={applying || removeCount + flagCount + pendingCount === 0}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {applying ? "Applying..." : `Apply (${removeCount + flagCount + pendingCount})`}
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
