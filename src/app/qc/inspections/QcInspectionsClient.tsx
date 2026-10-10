"use client";

import Link from "next/link";
import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { QC_RESULTS, type QcInspection } from "@/lib/types";
import GroupPanel from "./GroupPanel";
import InspectionPanel from "./InspectionPanel";
import { addQcInspectionRow, deleteQcInspectionRow, resetInspectionColumnWidths, saveInspectionColumnWidths, updateQcInspectionRow } from "./actions";

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

// The table columns, left to right, with their starting widths (pixels). An
// Admin can resize them (Edit layout) and the sizes are saved for everyone.
const COL_DEFS = [
  { key: "expand", label: "", center: false },
  { key: "entry_date", label: "Date", center: false },
  { key: "po", label: "PO", center: false },
  { key: "lot", label: "Lot", center: false },
  { key: "product", label: "Product", center: false },
  { key: "qc", label: "QC", center: false },
  { key: "chat", label: "Chat", center: true },
  { key: "report", label: "Report", center: true },
  { key: "status", label: "Status", center: false },
  { key: "result", label: "Result", center: false },
  { key: "notes", label: "Notes", center: false },
  { key: "actions", label: "", center: false },
] as const;
const DEFAULT_WIDTHS: Record<string, number> = {
  expand: 36,
  entry_date: 140,
  po: 90,
  lot: 110,
  product: 220,
  qc: 60,
  chat: 60,
  report: 70,
  status: 110,
  result: 150,
  notes: 320,
  actions: 70,
};
const MIN_COL_WIDTH = 28;

type FlatRow =
  | { kind: "row"; item: QcInspection; nested: boolean }
  | { kind: "group"; key: string; items: QcInspection[]; open: boolean };

export default function QcInspectionsClient({
  initialItems,
  savedWidths,
  canEditLayout,
}: {
  initialItems: QcInspection[];
  savedWidths: Record<string, number> | null;
  canEditLayout: boolean;
}) {
  const confirm = useConfirm();
  const [items, setItems] = useState(initialItems);
  const [adding, setAdding] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterQc, setFilterQc] = useState("");
  const [filterResult, setFilterResult] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // Column widths: what an Admin saved, or the defaults.
  const [widths, setWidths] = useState<Record<string, number>>({ ...DEFAULT_WIDTHS, ...(savedWidths ?? {}) });
  const [editing, setEditing] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const widthsBeforeEdit = useRef<Record<string, number>>({});
  const totalWidth = COL_DEFS.reduce((sum, c) => sum + (widths[c.key] ?? DEFAULT_WIDTHS[c.key]), 0);
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

  // Moves to the cell in that row, or the next row in that direction that has
  // one (a collapsed group has no cells to land on).
  function focusCell(rowIndex: number, col: ColKey, step: 1 | -1 = 1) {
    for (let i = rowIndex; i >= 0 && i < 5000; i += step) {
      const el = cellRefs.current.get(cellKey(i, col));
      if (el) {
        el.focus();
        return;
      }
      if (i > rowIndex + 500 || i < rowIndex - 500) return;
    }
  }

  function focusCellExact(rowIndex: number, col: ColKey) {
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
        focusCell(rowIndex + 1, col, 1);
        return;
      case "ArrowUp":
        e.preventDefault();
        focusCell(rowIndex - 1, col, -1);
        return;
      case "ArrowLeft": {
        if (isTextCol && target instanceof HTMLInputElement) {
          if (target.selectionStart !== 0 || target.selectionEnd !== 0) return;
        }
        const prev = COLUMNS[colIndex - 1];
        if (prev) {
          e.preventDefault();
          focusCellExact(rowIndex, prev.key);
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
          focusCellExact(rowIndex, next.key);
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

  // Rows of the same PO / lot on the same day - several commodities received
  // together, each inspected and reported on its own - are gathered under one
  // line. A group opens to show its rows and the "all reports" actions.
  const flat = useMemo(() => {
    const norm = (s: string | null) => (s ?? "").replace(/\s+/g, "").toUpperCase();
    const keyOf = (i: QcInspection) => (norm(i.po) || norm(i.lot) ? `${i.entry_date ?? ""}|${norm(i.po)}|${norm(i.lot)}` : null);
    const members = new Map<string, QcInspection[]>();
    for (const i of displayedItems) {
      const k = keyOf(i);
      if (k) members.set(k, [...(members.get(k) ?? []), i]);
    }
    const out: FlatRow[] = [];
    const done = new Set<string>();
    for (const i of displayedItems) {
      const k = keyOf(i);
      const group = k ? members.get(k) : undefined;
      if (k && group && group.length > 1) {
        if (done.has(k)) continue;
        done.add(k);
        const open = openGroups.has(k);
        out.push({ kind: "group", key: k, items: group, open });
        if (open) for (const m of group) out.push({ kind: "row", item: m, nested: true });
      } else {
        out.push({ kind: "row", item: i, nested: false });
      }
    }
    return out;
  }, [displayedItems, openGroups]);

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

  // Drag the right edge of a heading to change that column's width.
  function startResize(key: string, e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widths[key] ?? DEFAULT_WIDTHS[key];
    const move = (ev: PointerEvent) =>
      setWidths((w) => ({ ...w, [key]: Math.max(MIN_COL_WIDTH, Math.round(startWidth + ev.clientX - startX)) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function startEditingLayout() {
    widthsBeforeEdit.current = widths;
    setEditing(true);
  }

  function cancelEditingLayout() {
    setWidths(widthsBeforeEdit.current);
    setEditing(false);
  }

  async function saveLayout() {
    setLayoutBusy(true);
    try {
      const result = await saveInspectionColumnWidths(widths);
      if ("error" in result) {
        alert(`Couldn't save the layout: ${result.error}`);
        return;
      }
      setEditing(false);
    } finally {
      setLayoutBusy(false);
    }
  }

  async function resetLayout() {
    if (!(await confirm("Put every column back to its original width, for everyone?"))) return;
    setLayoutBusy(true);
    try {
      const result = await resetInspectionColumnWidths();
      if ("error" in result) {
        alert(`Couldn't reset the layout: ${result.error}`);
        return;
      }
      setWidths({ ...DEFAULT_WIDTHS });
      setEditing(false);
    } finally {
      setLayoutBusy(false);
    }
  }

  // The single line for a PO / lot with several commodities.
  function renderGroup(g: Extract<FlatRow, { kind: "group" }>) {
    const first = g.items[0];
    const products = g.items.map((i) => (i.product ?? "").trim()).filter(Boolean);
    const qcs = [...new Set(g.items.map((i) => (i.qc ?? "").trim().toUpperCase()).filter(Boolean))];
    const results = [...new Set(g.items.map((i) => (i.result ?? "").trim()).filter(Boolean))];
    const reported = g.items.filter((i) => i.lot_inspection_id).length;
    const mailed = g.items.filter((i) => i.mail).length;
    return (
      <Fragment key={`group-${g.key}`}>
        <tr
          onClick={() => toggleGroup(g.key)}
          className="cursor-pointer border-t border-black/10 bg-green-50/60 font-medium hover:bg-green-50 dark:border-white/10 dark:bg-green-950/20 dark:hover:bg-green-950/30"
        >
          <td className="px-1 py-1.5 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={`mx-auto h-4 w-4 text-green-700 transition-transform dark:text-green-400 ${g.open ? "rotate-90" : ""}`}>
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </td>
          <td className="whitespace-nowrap px-2 py-1.5">{first.entry_date ?? ""}</td>
          <td className="px-2 py-1.5">{first.po}</td>
          <td className="px-2 py-1.5">{first.lot}</td>
          <td className="px-2 py-1.5">
            <span className="mr-2 rounded-full bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">{g.items.length} commodities</span>
            {products.join(", ")}
          </td>
          <td className="px-2 py-1.5">{qcs.join(", ")}</td>
          <td className="px-2 py-1.5 text-center text-xs text-black/60 dark:text-white/60" />
          <td className="px-2 py-1.5 text-center text-xs text-black/60 dark:text-white/60">
            {reported}/{g.items.length}
          </td>
          <td className="px-2 py-1.5 text-xs text-black/60 dark:text-white/60">{mailed > 0 ? `${mailed}/${g.items.length} emailed` : ""}</td>
          <td className="px-2 py-1.5">{results.join(" / ")}</td>
          <td className="px-2 py-1.5 text-xs text-black/50 dark:text-white/50">{g.open ? "Click to close" : "Click to open"}</td>
          <td />
        </tr>
        {g.open && (
          <tr className="border-t border-black/10 bg-green-50/40 dark:border-white/10 dark:bg-green-950/10">
            <td colSpan={12}>
              <GroupPanel
                items={g.items}
                onEmailed={(ids) => setItems((prev) => prev.map((i) => (i.lot_inspection_id && ids.includes(i.lot_inspection_id) ? { ...i, mail: true } : i)))}
              />
            </td>
          </tr>
        )}
      </Fragment>
    );
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
            {canEditLayout && !editing && (
              <button
                onClick={startEditingLayout}
                className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Edit layout
              </button>
            )}
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

        {editing && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-green-600 bg-green-50 p-3 text-sm dark:bg-green-950/20">
            <span className="font-medium">
              Editing the layout: drag the green edge of a column heading to make it wider or narrower (double-click an edge to reset that column).
            </span>
            <button onClick={saveLayout} disabled={layoutBusy} className="rounded-md bg-green-600 px-3 py-1.5 font-medium text-white hover:bg-green-700 disabled:opacity-60">
              {layoutBusy ? "Saving..." : "Save layout (for everyone)"}
            </button>
            <button onClick={cancelEditingLayout} disabled={layoutBusy} className="rounded-md border border-black/20 px-3 py-1.5 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
              Cancel
            </button>
            <button onClick={resetLayout} disabled={layoutBusy} className="text-red-600 hover:underline">
              Reset to original
            </button>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="text-sm" style={{ tableLayout: "fixed", width: totalWidth }}>
            <colgroup>
              {COL_DEFS.map((c) => (
                <col key={c.key} style={{ width: widths[c.key] }} />
              ))}
            </colgroup>
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                {COL_DEFS.map((c) => (
                  <th key={c.key} className={`relative py-2 ${c.key === "expand" || c.key === "actions" ? "px-1" : "px-2"} ${c.center ? "text-center" : ""}`}>
                    {c.label}
                    {editing && (
                      <span
                        onPointerDown={(e) => startResize(c.key, e)}
                        onDoubleClick={() => setWidths((w) => ({ ...w, [c.key]: DEFAULT_WIDTHS[c.key] }))}
                        title="Drag to resize - double-click to reset this column"
                        className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize bg-green-500/30 hover:bg-green-600/60"
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flat.map((r, rowIndex) => {
                if (r.kind === "group") return renderGroup(r);
                const item = r.item;
                return (
                <Fragment key={item.id}>
                <tr className={`border-t border-black/10 dark:border-white/10 ${r.nested ? "bg-black/[0.025] dark:bg-white/[0.03]" : ""}`}>
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
);              })}
              {flat.length === 0 && (
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
