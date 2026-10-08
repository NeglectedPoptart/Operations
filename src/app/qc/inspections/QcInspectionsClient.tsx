"use client";

import Link from "next/link";
import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { QC_RESULTS, type QcInspection } from "@/lib/types";
import InspectionPanel from "./InspectionPanel";
import { addQcInspectionRow, deleteQcInspectionRow, updateQcInspectionRow } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// Left-to-right column order for arrow-key navigation, each tagged with how
// it should treat Left/Right: a "text" cell only hands the key over to
// navigation once the caret is already at that edge (so normal in-text
// cursor movement still works while editing); every other kind has no such
// native use for Left/Right, so it always navigates.
const COLUMNS = [
  { key: "entry_date", kind: "other" },
  { key: "po", kind: "text" },
  { key: "lot", kind: "text" },
  { key: "product", kind: "text" },
  { key: "qc", kind: "text" },
  { key: "chat", kind: "other" },
  { key: "report", kind: "other" },
  { key: "status", kind: "text" },
  { key: "result", kind: "other" },
  { key: "notes", kind: "text" },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];

export default function QcInspectionsClient({ initialItems }: { initialItems: QcInspection[] }) {
  const confirm = useConfirm();
  const [items, setItems] = useState(initialItems);
  const [adding, setAdding] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterQc, setFilterQc] = useState("");
  const [filterResult, setFilterResult] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const cellRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map());

  function cellKey(rowIndex: number, col: ColKey) {
    return `${rowIndex}-${col}`;
  }

  function registerCell(rowIndex: number, col: ColKey) {
    return (el: HTMLInputElement | HTMLSelectElement | null) => {
      const key = cellKey(rowIndex, col);
      if (el) cellRefs.current.set(key, el);
      else cellRefs.current.delete(key);
    };
  }

  function focusCell(rowIndex: number, col: ColKey) {
    cellRefs.current.get(cellKey(rowIndex, col))?.focus();
  }

  function handleCellKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>, rowIndex: number, col: ColKey) {
    const colIndex = COLUMNS.findIndex((c) => c.key === col);
    const isTextCol = COLUMNS[colIndex].kind === "text";
    const target = e.currentTarget;

    switch (e.key) {
      case "ArrowDown":
      case "Enter":
        e.preventDefault();
        focusCell(rowIndex + 1, col);
        return;
      case "ArrowUp":
        e.preventDefault();
        focusCell(rowIndex - 1, col);
        return;
      case "ArrowLeft": {
        if (isTextCol && target instanceof HTMLInputElement) {
          if (target.selectionStart !== 0 || target.selectionEnd !== 0) return;
        }
        const prev = COLUMNS[colIndex - 1];
        if (prev) {
          e.preventDefault();
          focusCell(rowIndex, prev.key);
        }
        return;
      }
      case "ArrowRight": {
        if (isTextCol && target instanceof HTMLInputElement) {
          if (target.selectionStart !== target.value.length || target.selectionEnd !== target.value.length) return;
        }
        const next = COLUMNS[colIndex + 1];
        if (next) {
          e.preventDefault();
          focusCell(rowIndex, next.key);
        }
        return;
      }
    }
  }

  // Newest date on top; same-day rows stay in the order they were entered.
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const dateCompare = (b.entry_date ?? "").localeCompare(a.entry_date ?? "");
      if (dateCompare !== 0) return dateCompare;
      return a.position - b.position;
    });
  }, [items]);

  const displayedItems = useMemo(() => {
    let list = sortedItems.filter(
      (i) =>
        (!dateFrom || (i.entry_date ?? "") >= dateFrom) &&
        (!dateTo || (i.entry_date ?? "") <= dateTo) &&
        (!filterQc || (i.qc ?? "").trim().toUpperCase() === filterQc) &&
        (!filterResult || (i.result ?? "") === filterResult),
    );
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        [i.entry_date, i.po, i.lot, i.product, i.qc, i.status, i.result, i.notes].some((field) =>
          (field ?? "").toLowerCase().includes(q),
        ),
      );
    }
    return list;
  }, [sortedItems, dateFrom, dateTo, filterQc, filterResult, search]);

  // The initials that appear on the sheet, for the Inspector filter.
  const inspectors = useMemo(
    () => [...new Set(items.map((i) => (i.qc ?? "").trim().toUpperCase()).filter(Boolean))].sort(),
    [items],
  );
  const filtering = !!(search || dateFrom || dateTo || filterQc || filterResult);

  async function handleAddRow() {
    setAdding(true);
    try {
      const nextPosition = items.length > 0 ? Math.max(...items.map((i) => i.position)) + 1 : 1;
      const row = await addQcInspectionRow(nextPosition);
      setItems((prev) => [...prev, row as QcInspection]);
    } finally {
      setAdding(false);
    }
  }

  function handleFieldSave(id: string, patch: Partial<QcInspection>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    updateQcInspectionRow(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this row?"))) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteQcInspectionRow(id).catch(() => {});
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)] px-4 sm:px-8">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">QC Inspection History</h1>
          <div className="flex gap-2">
            <Link
              href="/qc/inspections/new"
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              + New Inspection
            </Link>
            <button
              onClick={handleAddRow}
              disabled={adding}
              className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-60 dark:border-white/20 dark:hover:bg-white/10"
            >
              {adding ? "Adding..." : "+ Add Row"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO, lot, product, QC, status, result, notes..."
            className="w-72 rounded border border-gray-300 bg-white px-2 py-1 text-black"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-black/60 hover:underline dark:text-white/60">
              Clear search
            </button>
          )}
          <span className="mx-1 text-black/20 dark:text-white/20">|</span>
          <label className="text-black/60 dark:text-white/60">
            From{" "}
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1 text-black" />
          </label>
          <label className="text-black/60 dark:text-white/60">
            To{" "}
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1 text-black" />
          </label>
          <label className="text-black/60 dark:text-white/60">
            Inspector{" "}
            <select value={filterQc} onChange={(e) => setFilterQc(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1 text-black">
              <option value="">All</option>
              {inspectors.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </label>
          <label className="text-black/60 dark:text-white/60">
            Result{" "}
            <select value={filterResult} onChange={(e) => setFilterResult(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1 text-black">
              <option value="">All</option>
              {QC_RESULTS.map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {filtering && (
            <button
              onClick={() => {
                setSearch("");
                setDateFrom("");
                setDateTo("");
                setFilterQc("");
                setFilterResult("");
              }}
              className="text-black/60 hover:underline dark:text-white/60"
            >
              Clear all filters
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="w-8 px-1 py-2" />
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">PO</th>
                <th className="px-2 py-2">Lot</th>
                <th className="px-2 py-2">Product</th>
                <th className="px-2 py-2">QC</th>
                <th className="px-2 py-2 text-center">Chat</th>
                <th className="px-2 py-2 text-center">Report</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Result</th>
                <th className="px-2 py-2">Notes</th>
                <th className="w-16 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {displayedItems.map((item, rowIndex) => (
                <Fragment key={item.id}>
                <tr className="border-t border-black/10 dark:border-white/10">
                  <td className="px-1 py-1 text-center">
                    {item.lot_inspection_id ? (
                      <button
                        onClick={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
                        aria-expanded={openId === item.id}
                        aria-label="Show report and photos"
                        title="Report and photos"
                        className="rounded p-1 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={`h-4 w-4 transition-transform ${openId === item.id ? "rotate-90" : ""}`}>
                          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ) : null}
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <input
                      ref={registerCell(rowIndex, "entry_date")}
                      type="date"
                      defaultValue={item.entry_date ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { entry_date: e.target.value || null })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "entry_date")}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      ref={registerCell(rowIndex, "po")}
                      defaultValue={item.po ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { po: e.target.value })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "po")}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[4rem] px-1 py-1">
                    <input
                      ref={registerCell(rowIndex, "lot")}
                      defaultValue={item.lot ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { lot: e.target.value })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "lot")}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[10rem] px-1 py-1">
                    <input
                      ref={registerCell(rowIndex, "product")}
                      defaultValue={item.product ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { product: e.target.value })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "product")}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[3rem] px-1 py-1">
                    <input
                      ref={registerCell(rowIndex, "qc")}
                      defaultValue={item.qc ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { qc: e.target.value })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "qc")}
                      className={field}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      ref={registerCell(rowIndex, "chat")}
                      type="checkbox"
                      checked={item.chat}
                      onChange={(e) => handleFieldSave(item.id, { chat: e.target.checked })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "chat")}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      ref={registerCell(rowIndex, "report")}
                      type="checkbox"
                      checked={item.report}
                      onChange={(e) => handleFieldSave(item.id, { report: e.target.checked })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "report")}
                    />
                  </td>
                  <td className="min-w-[5rem] px-1 py-1">
                    <input
                      ref={registerCell(rowIndex, "status")}
                      defaultValue={item.status ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { status: e.target.value })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "status")}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[8rem] px-1 py-1">
                    <select
                      ref={registerCell(rowIndex, "result")}
                      value={item.result ?? ""}
                      onChange={(e) => handleFieldSave(item.id, { result: e.target.value || null })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "result")}
                      className={field}
                    >
                      <option value="">-</option>
                      {QC_RESULTS.map((r) => (
                        <option key={r.label} value={r.label}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="min-w-[16rem] px-1 py-1">
                    <input
                      ref={registerCell(rowIndex, "notes")}
                      defaultValue={item.notes ?? ""}
                      onBlur={(e) => handleFieldSave(item.id, { notes: e.target.value })}
                      onKeyDown={(e) => handleCellKeyDown(e, rowIndex, "notes")}
                      className={field}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                {item.lot_inspection_id && openId === item.id && (
                  <tr className="border-t border-black/10 bg-green-50/50 dark:border-white/10 dark:bg-green-950/10">
                    <td colSpan={12}>
                      <InspectionPanel
                        inspectionId={item.lot_inspection_id}
                        onEmailed={() => setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, mail: true } : i)))}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
              {displayedItems.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    {filtering
                      ? "Nothing matches the current search/filter."
                      : 'No inspections yet - click "+ Add Row" above to log one.'}
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
