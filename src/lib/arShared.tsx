// Shared between the main Accounts Receivable page and AR Troubles -
// the two are a straight partition of the same ar_invoices/ar_customers
// data (trouble_status === "none" vs. not), so the money-math and
// presentation helpers below need to stay identical between them rather
// than drift into two slightly-different copies.
import type { ArAgingBucket } from "@/lib/arAging";
import { escapeHtml } from "@/lib/fobPricing";
import type { ArCustomer, ArHighlight, ArInvoice } from "@/lib/types";

export function formatMoney(n: number | null): string {
  return n === null ? "" : `$${n.toFixed(2)}`;
}

export interface PayDiscrepancy {
  kind: "short" | "over";
  amount: number;
}

// A partial-credit invoice (the report's own "*" flag) means the customer
// has already taken a deduction/credit against it - whatever balance is
// still sitting open on it is money that's actually short, not money still
// expected to come in, so the balance itself IS the short-pay amount (not
// doc amount minus balance). A negative balance (regardless of the flag)
// means the opposite: a credit sitting on the account that we owe back or
// that can offset a future invoice - an over pay.
export function payDiscrepancy(invoice: ArInvoice): PayDiscrepancy | null {
  if (invoice.balance < 0) return { kind: "over", amount: Math.abs(invoice.balance) };
  if (!invoice.has_partial_credit || invoice.balance <= 0) return null;
  return { kind: "short", amount: invoice.balance };
}

export const DISCREPANCY_BADGE: Record<"short" | "over", string> = {
  short: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  over: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};

export function DiscrepancyBadge({ discrepancy }: { discrepancy: PayDiscrepancy | null }) {
  if (!discrepancy) return null;
  return (
    <span
      className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${DISCREPANCY_BADGE[discrepancy.kind]}`}
    >
      {discrepancy.kind === "short" ? "Short" : "Over"} ${discrepancy.amount.toFixed(2)}
    </span>
  );
}

export const BUCKET_BADGE: Record<ArAgingBucket, string> = {
  current: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "1-20": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "21-40": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "41-60": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "61+": "bg-red-200 text-red-900 dark:bg-red-950/60 dark:text-red-200",
};

export const HIGHLIGHT_ROW_CLASS: Record<ArHighlight, string> = {
  none: "",
  yellow: "bg-yellow-50 dark:bg-yellow-950/20",
  red: "bg-red-50 dark:bg-red-950/20",
};

export interface CustomerGroup {
  customer: ArCustomer;
  invoices: ArInvoice[];
  totalBalance: number;
  shortTotal: number;
  overTotal: number;
}

export function compareByDueDate(a: ArInvoice, b: ArInvoice): number {
  if (a.due_date === b.due_date) return a.position - b.position;
  if (a.due_date === null) return 1;
  if (b.due_date === null) return -1;
  return a.due_date < b.due_date ? -1 : 1;
}

export function buildGroups(customers: ArCustomer[], invoices: ArInvoice[]): CustomerGroup[] {
  const byCustomer = new Map<string, ArInvoice[]>();
  for (const inv of invoices) {
    if (!byCustomer.has(inv.customer_id)) byCustomer.set(inv.customer_id, []);
    byCustomer.get(inv.customer_id)!.push(inv);
  }
  return customers
    .map((customer) => {
      const invs = [...(byCustomer.get(customer.id) ?? [])].sort(compareByDueDate);
      let shortTotal = 0;
      let overTotal = 0;
      for (const inv of invs) {
        const d = payDiscrepancy(inv);
        if (!d) continue;
        if (d.kind === "short") shortTotal += d.amount;
        else overTotal += d.amount;
      }
      return { customer, invoices: invs, totalBalance: invs.reduce((sum, i) => sum + i.balance, 0), shortTotal, overTotal };
    })
    .filter((g) => g.invoices.length > 0)
    .sort((a, b) => b.totalBalance - a.totalBalance);
}

export function buildTableHtml(title: string, headers: string[], rows: string[][]): string {
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

export function buildPlainTextTable(title: string, headers: string[], rows: string[][]): string {
  const lines = [title, headers.join("\t")];
  if (rows.length === 0) lines.push("Nothing here.");
  for (const r of rows) lines.push(r.join("\t"));
  return lines.join("\n");
}
