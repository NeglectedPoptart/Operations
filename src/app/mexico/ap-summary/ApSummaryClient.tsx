"use client";

import { useState } from "react";
import { formatDateSlash, formatTimestamp, formatWeekLabel, weekNumberOf } from "@/lib/dates";
import { payInfo, payLabel, type PayInfo, type PayState } from "@/lib/apSummary";
import { buildPlainTextTable, buildTableHtml } from "@/lib/arShared";
import { setArrivalPaid } from "./actions";

export interface ApRow {
  id: string;
  weekStart: string;
  arrivalDate: string;
  growerId: string | null;
  grower: string;
  termsDays: number | null;
  termsNote: string | null;
  label: string | null;
  commodities: string[];
  boxes: string | null;
  price: string | null;
  manifesto: string | null;
  notes: string | null;
  paidAt: string | null;
  paidBy: string | null;
}

type Show = "unpaid" | "paid" | "all";

const field = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black placeholder:text-black/40";

const STATE_ROW: Record<PayState, string> = {
  overdue: "bg-red-100 dark:bg-red-950/40",
  due_today: "bg-red-100 dark:bg-red-950/40",
  soon: "bg-amber-100 dark:bg-amber-950/30",
  ok: "",
  no_terms: "",
  paid: "opacity-60",
};
const STATE_BADGE: Record<PayState, string> = {
  overdue: "bg-red-600 text-white",
  due_today: "bg-red-600 text-white",
  soon: "bg-amber-500 text-white",
  ok: "bg-green-100 text-green-800",
  no_terms: "bg-gray-200 text-gray-700",
  paid: "bg-gray-200 text-gray-600",
};

export default function ApSummaryClient({ today, initialRows }: { today: string; initialRows: ApRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [show, setShow] = useState<Show>("unpaid");
  const [warnDays, setWarnDays] = useState(3);
  const [growerFilter, setGrowerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [urgentFirst, setUrgentFirst] = useState(true);
  const [copied, setCopied] = useState(false);

  const withInfo = rows.map((r) => ({ r, info: payInfo(r.arrivalDate, today, r.termsDays, !!r.paidAt, warnDays) }));
  const unpaid = withInfo.filter((x) => x.info.state !== "paid");
  const count = (...states: PayState[]) => unpaid.filter((x) => states.includes(x.info.state)).length;
  const overdue = count("overdue");
  const dueToday = count("due_today");
  const soon = count("soon");
  const noTerms = count("no_terms");

  const growers = [...new Map(rows.map((r) => [r.grower, r.grower])).values()].sort((a, b) => a.localeCompare(b));
  const q = search.trim().toLowerCase();
  const shown = withInfo
    .filter(({ r, info }) => {
      if (show === "unpaid" && info.state === "paid") return false;
      if (show === "paid" && info.state !== "paid") return false;
      if (growerFilter && r.grower !== growerFilter) return false;
      if (q && !`${r.grower} ${r.commodities.join(" ")} ${r.manifesto ?? ""} ${r.label ?? ""} ${r.notes ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => {
      if (urgentFirst) {
        // Past due first (most overdue at the top), then soonest due; loads with no terms last.
        const da = a.info.daysLeft ?? Number.MAX_SAFE_INTEGER;
        const db = b.info.daysLeft ?? Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
      }
      return b.r.arrivalDate.localeCompare(a.r.arrivalDate);
    });

  // A short look at each recent week: how many loads came in and how many are still unpaid.
  const weeks = [...new Set(rows.map((r) => r.weekStart))].sort().reverse().slice(0, 8).map((w) => {
    const inWeek = withInfo.filter((x) => x.r.weekStart === w);
    return {
      week: w,
      loads: inWeek.length,
      unpaid: inWeek.filter((x) => x.info.state !== "paid").length,
      urgent: inWeek.filter((x) => ["overdue", "due_today", "soon"].includes(x.info.state)).length,
    };
  });

  async function togglePaid(row: ApRow) {
    const paid = !row.paidAt;
    // Show it straight away; put it back if the save fails.
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, paidAt: paid ? new Date().toISOString() : null, paidBy: paid ? "you" : null } : r)));
    const result = await setArrivalPaid(row.id, paid);
    if ("error" in result) {
      alert(result.error);
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, paidAt: result.paidAt, paidBy: result.paidBy } : r)));
  }

  const HEADERS = ["Arrived", "Days since", "Grower", "Label", "Commodity", "Boxes", "Price to grower", "Manifesto", "AP terms", "Pay by", "Status"];
  const cells = (r: ApRow, info: PayInfo) => [
    formatDateSlash(r.arrivalDate),
    String(info.daysSince),
    r.grower,
    r.label ?? "",
    r.commodities.join("; "),
    r.boxes ?? "",
    r.price ?? "",
    r.manifesto ?? "",
    r.termsDays !== null ? `Net ${r.termsDays}${r.termsNote ? ` (${r.termsNote})` : ""}` : "",
    info.dueDate ? formatDateSlash(info.dueDate) : "",
    payLabel(info),
  ];

  async function copyForEmail() {
    const body = shown.map(({ r, info }) => cells(r, info));
    const html = buildTableHtml("AP Summary - received loads", HEADERS, body);
    const text = buildPlainTextTable("AP Summary - received loads", HEADERS, body);
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Could not copy to clipboard - your browser may not support it.");
    }
  }

  const urgentTotal = overdue + dueToday + soon;
  const tile = (label: string, value: number, tone: string) => (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8 lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">AP Summary</h1>
            <p className="text-sm text-black/60 dark:text-white/60">
              Every load received from Mexico, the days since it arrived, and when it is due to be paid (the grower&apos;s AP terms, set on Mexico &gt; Growers).
            </p>
          </div>
          <button onClick={copyForEmail} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
            {copied ? "Copied!" : "Copy for Email"}
          </button>
        </div>

        {urgentTotal > 0 && (
          <div className={`rounded-lg border-2 px-4 py-2.5 text-sm font-semibold ${overdue + dueToday > 0 ? "border-red-500 bg-red-50 text-red-800" : "border-amber-500 bg-amber-50 text-amber-900"}`}>
            {overdue + dueToday > 0 ? "⚠ " : ""}
            {overdue > 0 && `${overdue} load${overdue === 1 ? "" : "s"} past due`}
            {overdue > 0 && (dueToday > 0 || soon > 0) && " · "}
            {dueToday > 0 && `${dueToday} due today`}
            {dueToday > 0 && soon > 0 && " · "}
            {soon > 0 && `${soon} due within ${warnDays} day${warnDays === 1 ? "" : "s"}`}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tile("Unpaid loads", unpaid.length, "border-black/15")}
          {tile("Past due", overdue, overdue > 0 ? "border-red-500 bg-red-50 text-red-800" : "border-black/15")}
          {tile("Due today", dueToday, dueToday > 0 ? "border-red-500 bg-red-50 text-red-800" : "border-black/15")}
          {tile(`Due in ${warnDays} days or less`, soon, soon > 0 ? "border-amber-500 bg-amber-50 text-amber-900" : "border-black/15")}
          {tile("Grower has no terms", noTerms, noTerms > 0 ? "border-gray-400 bg-gray-50 text-gray-800" : "border-black/15")}
        </div>

        {weeks.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-xs">
              <thead className="bg-black/5 text-left dark:bg-white/10">
                <tr>
                  <th className="px-3 py-1.5">Week</th>
                  <th className="px-3 py-1.5 text-right">Loads received</th>
                  <th className="px-3 py-1.5 text-right">Still unpaid</th>
                  <th className="px-3 py-1.5 text-right">Due soon / past due</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.week} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-3 py-1">
                      Week {weekNumberOf(w.week)} · {formatWeekLabel(w.week)}
                    </td>
                    <td className="px-3 py-1 text-right">{w.loads}</td>
                    <td className="px-3 py-1 text-right">{w.unpaid}</td>
                    <td className={`px-3 py-1 text-right font-semibold ${w.urgent > 0 ? "text-red-600" : ""}`}>{w.urgent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/5">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search grower, commodity, manifesto..." className={`${field} w-64`} />
          <select value={growerFilter} onChange={(e) => setGrowerFilter(e.target.value)} className={field}>
            <option value="">All growers</option>
            {growers.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5">
            Show
            <select value={show} onChange={(e) => setShow(e.target.value as Show)} className={field}>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="all">All</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Warn when due within
            <select value={warnDays} onChange={(e) => setWarnDays(Number(e.target.value))} className={field}>
              {[1, 2, 3, 4, 5, 7, 10].map((d) => (
                <option key={d} value={d}>
                  {d} day{d === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={urgentFirst} onChange={(e) => setUrgentFirst(e.target.checked)} />
            Most urgent first
          </label>
          <span className="ml-auto text-xs text-black/50 dark:text-white/50">{shown.length} load{shown.length === 1 ? "" : "s"}</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left text-xs dark:bg-white/10">
              <tr>
                <th className="px-2 py-2">Paid</th>
                <th className="px-2 py-2">Arrived</th>
                <th className="px-2 py-2 text-right">Days since</th>
                <th className="px-2 py-2">Grower</th>
                <th className="px-2 py-2">Commodity</th>
                <th className="px-2 py-2">Boxes</th>
                <th className="px-2 py-2">Price to grower</th>
                <th className="px-2 py-2">Manifesto</th>
                <th className="px-2 py-2">AP terms</th>
                <th className="px-2 py-2">Pay by</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ r, info }) => (
                <tr key={r.id} className={`border-t border-black/10 align-top dark:border-white/10 ${STATE_ROW[info.state]}`}>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={!!r.paidAt}
                      onChange={() => void togglePaid(r)}
                      title={r.paidAt ? `Paid ${formatTimestamp(r.paidAt)}${r.paidBy ? ` by ${r.paidBy}` : ""} - click to undo` : "Mark as paid"}
                      className="h-4 w-4 accent-green-600"
                    />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">{formatDateSlash(r.arrivalDate)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{info.daysSince}</td>
                  <td className="px-2 py-1.5 font-medium">
                    {r.grower}
                    {r.label && <span className="block text-xs font-normal opacity-60">{r.label}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-xs">{r.commodities.map((c) => <div key={c}>{c}</div>)}</td>
                  <td className="px-2 py-1.5">{r.boxes}</td>
                  <td className="px-2 py-1.5">{r.price}</td>
                  <td className="px-2 py-1.5">{r.manifesto}</td>
                  <td className="px-2 py-1.5 text-xs">
                    {r.termsDays !== null ? `Net ${r.termsDays}` : <span className="text-black/40 dark:text-white/40">not set</span>}
                    {r.termsNote && <span className="block opacity-70">{r.termsNote}</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">{info.dueDate ? formatDateSlash(info.dueDate) : ""}</td>
                  <td className="px-2 py-1.5">
                    <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${STATE_BADGE[info.state]}`}>{payLabel(info)}</span>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-black/50 dark:text-white/50">
                    {rows.length === 0 ? "No loads have been marked Arrived yet - tick Arrived on the Arrivals sheet." : "Nothing matches the current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
