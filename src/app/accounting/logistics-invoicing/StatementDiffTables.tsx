import type { PendingRow, PostAction, PostResultRow } from "@/lib/statementParse";

// Shared by the single-carrier Statement Checker and the multi-carrier
// Master Bills Import - once a carrier's statement has been diffed against
// its existing invoice_statements rows, the preview tables are identical
// regardless of which flow produced the diff.
export function summarizeDiff(posts: PostResultRow[], pendingRows: PendingRow[]) {
  return {
    removeCount: posts.filter((r) => r.action === "remove").length,
    flagCount: posts.filter((r) => r.action === "flag").length,
    reviewCount: posts.filter((r) => r.action === "review").length,
    pendingCount: pendingRows.length,
  };
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

export default function StatementDiffTables({ posts, pendingRows }: { posts: PostResultRow[]; pendingRows: PendingRow[] }) {
  const { removeCount, flagCount, reviewCount, pendingCount } = summarizeDiff(posts, pendingRows);
  const reviewRows = posts.filter((r) => r.action === "review");
  const mainResults = posts.filter((r) => r.action !== "review");

  return (
    <div className="space-y-4">
      <p className="text-sm">
        {posts.length} Posted row{posts.length === 1 ? "" : "s"} found: {removeCount} will be removed, {flagCount} will
        be flagged{reviewCount > 0 && `, ${reviewCount} held for review`}. {pendingCount} invoice
        {pendingCount === 1 ? "" : "s"} on this list not in the statement will be marked Pending.
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
    </div>
  );
}
