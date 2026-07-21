"use client";

import { useState } from "react";
import { normalizeInvoiceNo, parsePastedStatement, type ParsedStatementLine } from "@/lib/statementParse";
import type { Broker, InvoiceStatement } from "@/lib/types";
import { applyStatementCheck, getInvoiceStatementsForBroker } from "./actions";

type PostAction = "remove" | "flag" | "not-found";

interface PostResultRow extends ParsedStatementLine {
  action: PostAction;
  matchId: string | null;
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
  const [applying, setApplying] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  function handleBrokerChange(id: string) {
    setBrokerId(id);
    setPostResults(null);
    setPendingRows(null);
    setDoneMessage(null);
  }

  async function handleCheck() {
    setError(null);
    setDoneMessage(null);
    if (!brokerId) {
      setError("Pick a carrier first.");
      return;
    }
    const parsed = parsePastedStatement(pasteText);
    if (parsed.error) {
      setError(parsed.error);
      setPostResults(null);
      setPendingRows(null);
      return;
    }
    setLoading(true);
    try {
      const items: InvoiceStatement[] = await getInvoiceStatementsForBroker(brokerId);
      const ourMap = new Map(items.map((i) => [normalizeInvoiceNo(i.invoice_no), i]));

      // Anything appearing anywhere in the pasted statement (Post or Open)
      // counts as "on the bills list" - only rows missing entirely get
      // marked Pending below.
      const foundKeys = new Set(parsed.rows.map((r) => normalizeInvoiceNo(r.document)));

      const posts: PostResultRow[] = parsed.rows
        .filter((r) => r.journalStatus === "post")
        .map((r) => {
          const match = ourMap.get(normalizeInvoiceNo(r.document));
          if (!match) return { ...r, action: "not-found", matchId: null };
          if (r.balance === null) return { ...r, action: "remove", matchId: match.id };
          return { ...r, action: "flag", matchId: match.id };
        });

      const notFound: PendingRow[] = items
        .filter((i) => !foundKeys.has(normalizeInvoiceNo(i.invoice_no)))
        .map((i) => ({ id: i.id, invoice_no: i.invoice_no }));

      setPostResults(posts);
      setPendingRows(notFound);
    } finally {
      setLoading(false);
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
  const pendingCount = pendingRows?.length ?? 0;

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Statement Checker</h2>
      <p className="text-sm text-black/60 dark:text-white/60">
        Pick the carrier, then paste their statement (needs Document, Journal, and Balance columns) - rows Journal
        marks &quot;Open&quot; are left alone. For &quot;Post&quot; rows matched to this list: no balance shown means
        fully paid, so it&apos;s marked Done and removed; a balance still shown means it&apos;s marked Done but
        flagged instead. Anything on this list that doesn&apos;t show up anywhere in the statement gets marked
        Pending.
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

      <button
        onClick={handleCheck}
        disabled={loading}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {loading ? "Checking..." : "Check Statement"}
      </button>

      {postResults && pendingRows && (
        <div className="space-y-4">
          <p className="text-sm">
            {postResults.length} Posted row{postResults.length === 1 ? "" : "s"} found: {removeCount} will be
            removed, {flagCount} will be flagged. {pendingCount} invoice{pendingCount === 1 ? "" : "s"} on this list
            not in the statement will be marked Pending.
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
                {postResults.map((r, i) => {
                  const label = actionLabel(r.action);
                  return (
                    <tr key={i} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-2 py-1">{r.document}</td>
                      <td className="px-2 py-1">{formatMoney(r.balance)}</td>
                      <td className={`px-2 py-1 ${label.cls}`}>{label.text}</td>
                    </tr>
                  );
                })}
                {postResults.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-3 text-center text-black/40 dark:text-white/40">
                      No Posted rows in the pasted statement.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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
