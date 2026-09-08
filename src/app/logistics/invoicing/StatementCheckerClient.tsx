"use client";

import { useState, type ChangeEvent } from "react";
import { normalizeInvoiceNo, parsePastedStatement, parsePdfStatement, type ParsedStatementLine, type ParseResult } from "@/lib/statementParse";
import type { Broker, InvoiceStatement } from "@/lib/types";
import { applyStatementCheck, extractPdfText, getInvoiceStatementsForBroker } from "./actions";

type PostAction = "remove" | "flag" | "review" | "not-found";

interface PostResultRow extends ParsedStatementLine {
  action: PostAction;
  matchId: string | null;
  note: string | null;
}

interface PendingRow {
  id: string;
  invoice_no: string;
}

function formatMoney(n: number | null) {
  return n === null ? "-" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function actionLabel(action: PostAction) {
  switch (action) {
    case "remove":
      return { text: "Posted & paid - will mark Done & remove", cls: "font-medium text-green-700 dark:text-green-400" };
    case "flag":
      return {
        text: "Posted but has a balance - will mark Done & flag",
        cls: "font-medium text-red-700 dark:text-red-400",
      };
    case "review":
      return {
        text: "Pending with a note - needs manual review",
        cls: "font-medium text-blue-700 dark:text-blue-400",
      };
    case "not-found":
      return { text: "Not on this list", cls: "text-black/40 dark:text-white/40" };
  }
}

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
    const ourMap = new Map(items.map((i) => [normalizeInvoiceNo(i.invoice_no), i]));

    // Anything appearing anywhere in the statement (Post or Open) counts as
    // "on the bills list" - only rows missing entirely get marked Pending below.
    const foundKeys = new Set(parsed.rows.map((r) => normalizeInvoiceNo(r.document)));

    const posts: PostResultRow[] = parsed.rows
      .filter((r) => r.journalStatus === "post")
      .map((r) => {
        const match = ourMap.get(normalizeInvoiceNo(r.document));
        if (!match) return { ...r, action: "not-found", matchId: null, note: null };
        // A note left on a Pending invoice is a deliberate "don't touch
        // this one" flag (e.g. a dispute in progress) - the statement
        // showing it as Posted doesn't override that, it just means a
        // person needs to look at it instead of it silently flipping.
        if (match.status === "pending" && match.notes) {
          return { ...r, action: "review", matchId: match.id, note: match.notes };
        }
        if (r.balance === null) return { ...r, action: "remove", matchId: match.id, note: match.notes };
        return { ...r, action: "flag", matchId: match.id, note: match.notes };
      });

    const notFound: PendingRow[] = items
      .filter((i) => !foundKeys.has(normalizeInvoiceNo(i.invoice_no)))
      .map((i) => ({ id: i.id, invoice_no: i.invoice_no }));

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

  const removeCount = postResults?.filter((r) => r.action === "remove").length ?? 0;
  const flagCount = postResults?.filter((r) => r.action === "flag").length ?? 0;
  const reviewRows = postResults?.filter((r) => r.action === "review") ?? [];
  const mainResults = postResults?.filter((r) => r.action !== "review") ?? [];
  const pendingCount = pendingRows?.length ?? 0;

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
          <p className="text-sm">
            {postResults.length} Posted row{postResults.length === 1 ? "" : "s"} found: {removeCount} will be
            removed, {flagCount} will be flagged{reviewRows.length > 0 && `, ${reviewRows.length} held for review`}.{" "}
            {pendingCount} invoice{pendingCount === 1 ? "" : "s"} on this list not in the statement will be marked
            Pending.
          </p>

          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-black/5 text-left dark:bg-white/5">
                <tr>
                  <th className="px-2 py-2">Document</th>
                  <th className="px-2 py-2">Balance</th>
                  <th className="px-2 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {mainResults.map((r, i) => {
                  const label = actionLabel(r.action);
                  return (
                    <tr key={i} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-2 py-1">{r.document}</td>
                      <td className="px-2 py-1">{formatMoney(r.balance)}</td>
                      <td className={`px-2 py-1 ${label.cls}`}>{label.text}</td>
                    </tr>
                  );
                })}
                {mainResults.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-center text-black/40 dark:text-white/40">
                      No Posted rows in the pasted statement.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {reviewRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                Needs Manual Review - pending with a note, left alone:
              </p>
              <div className="overflow-x-auto rounded-lg border border-blue-200 dark:border-blue-900/40">
                <table className="w-full text-sm">
                  <thead className="bg-blue-50 text-left dark:bg-blue-950/20">
                    <tr>
                      <th className="px-2 py-2">Document</th>
                      <th className="px-2 py-2">Balance</th>
                      <th className="px-2 py-2">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.map((r, i) => (
                      <tr key={i} className="border-t border-blue-100 dark:border-blue-900/30">
                        <td className="px-2 py-1">{r.document}</td>
                        <td className="px-2 py-1">{formatMoney(r.balance)}</td>
                        <td className="px-2 py-1 italic text-black/70 dark:text-white/70">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pendingRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Not in the statement - will be marked Pending:</p>
              <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-2 py-2">Invoice #</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRows.map((r) => (
                      <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-2 py-1 text-yellow-700 dark:text-yellow-400">{r.invoice_no}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
