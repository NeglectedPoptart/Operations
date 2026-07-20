"use client";

import { useState } from "react";
import { normalizeInvoiceNo, parsePastedStatement, type ParsedStatementLine } from "@/lib/statementParse";
import type { Broker } from "@/lib/types";
import { applyStatementCheck, getInvoiceStatementsForBroker } from "./actions";

type ResultAction = "remove" | "flag" | "not-found" | "not-done";

interface ResultRow extends ParsedStatementLine {
  action: ResultAction;
  matchId: string | null;
}

function formatMoney(n: number | null) {
  return n === null ? "-" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function actionLabel(action: ResultAction) {
  switch (action) {
    case "remove":
      return { text: "Posted & paid - will remove", cls: "font-medium text-green-700 dark:text-green-400" };
    case "flag":
      return { text: "Posted but has a balance - will flag", cls: "font-medium text-red-700 dark:text-red-400" };
    case "not-done":
      return { text: "On list but not marked Done - no action", cls: "text-black/40 dark:text-white/40" };
    case "not-found":
      return { text: "Not on this list", cls: "text-black/40 dark:text-white/40" };
  }
}

export default function StatementCheckerClient({ brokers }: { brokers: Broker[] }) {
  const [brokerId, setBrokerId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  function handleBrokerChange(id: string) {
    setBrokerId(id);
    setResults(null);
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
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const items = await getInvoiceStatementsForBroker(brokerId);
      const ourMap = new Map(items.map((i) => [normalizeInvoiceNo(i.invoice_no), i]));
      const postRows = parsed.rows.filter((r) => r.journalStatus === "post");
      const computed: ResultRow[] = postRows.map((r) => {
        const match = ourMap.get(normalizeInvoiceNo(r.document));
        if (!match) return { ...r, action: "not-found", matchId: null };
        if (match.status !== "done") return { ...r, action: "not-done", matchId: match.id };
        if (r.balance === null) return { ...r, action: "remove", matchId: match.id };
        return { ...r, action: "flag", matchId: match.id };
      });
      setResults(computed);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!results || !brokerId) return;
    setApplying(true);
    try {
      const removeIds = results.filter((r) => r.action === "remove" && r.matchId).map((r) => r.matchId as string);
      const flagIds = results.filter((r) => r.action === "flag" && r.matchId).map((r) => r.matchId as string);
      await applyStatementCheck(brokerId, removeIds, flagIds);
      setDoneMessage(`Removed ${removeIds.length}, flagged ${flagIds.length}.`);
      setResults(null);
      setPasteText("");
    } finally {
      setApplying(false);
    }
  }

  const removeCount = results?.filter((r) => r.action === "remove").length ?? 0;
  const flagCount = results?.filter((r) => r.action === "flag").length ?? 0;

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Statement Checker</h2>
      <p className="text-sm text-black/60 dark:text-white/60">
        Pick the carrier, then paste their statement (needs Document, Journal, and Balance columns) - rows Journal
        marks &quot;Open&quot; are ignored. For &quot;Post&quot; rows: an invoice marked Done here with no balance
        shown is fully paid and gets removed from the list; one marked Done here that still shows a balance gets
        flagged instead.
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

      {results && (
        <div className="space-y-3">
          <p className="text-sm">
            {results.length} Posted row{results.length === 1 ? "" : "s"} found: {removeCount} will be removed,{" "}
            {flagCount} will be flagged.
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
                {results.map((r, i) => {
                  const label = actionLabel(r.action);
                  return (
                    <tr key={i} className="border-t border-black/10 dark:border-white/10">
                      <td className="px-2 py-1">{r.document}</td>
                      <td className="px-2 py-1">{formatMoney(r.balance)}</td>
                      <td className={`px-2 py-1 ${label.cls}`}>{label.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              disabled={applying || removeCount + flagCount === 0}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {applying ? "Applying..." : `Apply (${removeCount + flagCount})`}
            </button>
            <button
              onClick={() => setResults(null)}
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
