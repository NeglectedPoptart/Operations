// Shared money-math and presentation helpers for the Accounts Receivable
// page and the Home tile. On the report's flags: lower-case "t" = a trouble
// claim still PENDING (trouble_status "pending" - these are the Trouble
// files, kept out of the main summary); capital "T" = claim POSTED, already
// reviewed and adjusted (trouble_status "posted" - resolved, so it counts
// like any normal invoice).
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

// A SHORT PAY is a customer who paid (a check or ACH was applied against the
// invoice) and still leaves a balance - whatever is still open is the amount
// they are short, so the balance itself is the short-pay amount. An invoice
// whose difference from the doc amount is only an Adjustment (a deduction
// already reviewed and agreed, e.g. doc 6,015 - adjustment 1,680 = balance
// 4,335) is NOT a short pay. This needs the "Including Credits" report, which
// lists the credits under each invoice; for an invoice last synced from the
// older report (payments_total unknown) the old rule applies: the report's "*"
// partial-credit flag with a balance left. A negative balance is the
// opposite: a credit sitting on the account - an over pay.
export function payDiscrepancy(invoice: ArInvoice): PayDiscrepancy | null {
  if (invoice.balance < 0) return { kind: "over", amount: Math.abs(invoice.balance) };
  if (invoice.balance <= 0) return null;
  const paid = invoice.payments_total;
  if (paid !== null && paid !== undefined) return paid > 0 ? { kind: "short", amount: invoice.balance } : null;
  return invoice.has_partial_credit ? { kind: "short", amount: invoice.balance } : null;
}

// Payments (check/ACH) and adjustments already applied, for display.
export function creditsSummary(invoice: ArInvoice): { paid: number; adjustments: number } | null {
  if (invoice.credits_total === null || invoice.credits_total === undefined) return null;
  const paid = invoice.payments_total ?? 0;
  const adjustments = Math.round((invoice.credits_total - paid) * 100) / 100;
  if (paid <= 0 && adjustments === 0) return null;
  return { paid, adjustments };
}

export const DISCREPANCY_BADGE: Record<"short" | "over", string> = {
  short: "bg-yellow-300 text-black dark:bg-yellow-400 dark:text-black",
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

// Big and yellow on purpose, like the Trouble badge - a customer paid but is
// still short.
export function ShortPayBadge({ amount }: { amount: number }) {
  return (
    <span className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded bg-yellow-300 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-black dark:bg-yellow-400">
      ⚠ Short Pay
      <span className="font-extrabold normal-case">${amount.toFixed(2)}</span>
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

export interface ArSummaryTotals {
  total: number;
  customers: number;
  escalated: number;
  needsContact: number;
  troubleClaims: number;
  shortTotal: number;
  overTotal: number;
}

// Same math as the Summary card's totals useMemo in ArClient.tsx - kept
// here, not there, so the sync action (server-side, no React) can compute
// this exact shape too when it saves the "as of this sync" snapshot that
// Show Changes compares the next sync against.
export function computeArSummaryTotals(invoices: ArInvoice[]): ArSummaryTotals {
  // Pending-trouble invoices are listed on the AR page but kept out of the
  // main summary - they get their own figures (computeTroubleTotals).
  const nonTrouble = invoices.filter((i) => i.trouble_status !== "pending");
  const customerIds = new Set(nonTrouble.map((i) => i.customer_id));
  let total = 0;
  let escalated = 0;
  let needsContact = 0;
  let shortTotal = 0;
  let overTotal = 0;
  for (const inv of nonTrouble) {
    total += inv.balance;
    if (inv.highlight === "red") escalated++;
    if (inv.highlight === "yellow") needsContact++;
    const d = payDiscrepancy(inv);
    if (d) {
      if (d.kind === "short") shortTotal += d.amount;
      else overTotal += d.amount;
    }
  }
  return {
    total,
    customers: customerIds.size,
    escalated,
    needsContact,
    troubleClaims: invoices.filter((i) => i.trouble_status === "pending").length,
    shortTotal,
    overTotal,
  };
}

// The figures for invoices with a trouble claim still pending ("t"),
// shown in their own box on the AR page instead of the main summary.
export interface ArTroubleTotals {
  total: number;
  count: number;
  shortTotal: number;
  overTotal: number;
}

export function computeTroubleTotals(invoices: ArInvoice[]): ArTroubleTotals {
  let total = 0;
  let count = 0;
  let shortTotal = 0;
  let overTotal = 0;
  for (const inv of invoices) {
    if (inv.trouble_status !== "pending") continue;
    count++;
    total += inv.balance;
    const d = payDiscrepancy(inv);
    if (d) {
      if (d.kind === "short") shortTotal += d.amount;
      else overTotal += d.amount;
    }
  }
  return { total, count, shortTotal, overTotal };
}

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
