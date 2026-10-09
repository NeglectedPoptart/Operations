"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { addDays, formatTimestamp } from "@/lib/dates";
import { copyOrDownloadPng } from "@/lib/fobPricing";
import {
  GREY_ROW,
  isMovedAway,
  qty,
  rgbaOf,
  shortDay,
  type OrderLegendItem,
  type OrderReportMeta,
  type PendingOrder,
} from "@/lib/pendingOrders";
import {
  copyOrdersForExcel,
  downloadOrdersXlsx,
  groupByShipDate,
  renderOrdersPng,
  type OrderSection,
} from "@/lib/pendingOrdersExport";
import {
  deleteLegendItem,
  deleteOrder,
  importOrdersReport,
  readOrdersPdf,
  saveLegendItem,
  updateOrder,
  type OrdersReadResult,
} from "./actions";

const btn = "rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const btnLine = `${btn} border border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10`;
const btnGreen = `${btn} bg-green-600 text-white hover:bg-green-700`;

function dayName(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "numeric", day: "numeric" });
}

export default function OrdersClient({
  initialOrders,
  initialLegend,
  meta,
  today,
}: {
  initialOrders: PendingOrder[];
  initialLegend: OrderLegendItem[];
  meta: OrderReportMeta | null;
  today: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const tomorrow = addDays(today, 1);

  const [orders, setOrders] = useState(initialOrders);
  const [legend, setLegend] = useState(initialLegend);
  const [legendOpen, setLegendOpen] = useState(false);
  const [hideGreyed, setHideGreyed] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [review, setReview] = useState<OrdersReadResult | null>(null);
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const legendById = useMemo(() => new Map(legend.map((l) => [l.id, l])), [legend]);

  const visible = useMemo(() => orders.filter((o) => !(hideGreyed && o.greyed)), [orders, hideGreyed]);
  const main = useMemo(() => visible.filter((o) => !isMovedAway(o, today)), [visible, today]);
  const moved = useMemo(() => visible.filter((o) => isMovedAway(o, today)), [visible, today]);
  const mainGroups = useMemo(() => groupByShipDate(main), [main]);
  const movedGroups = useMemo(() => groupByShipDate(moved), [moved]);

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(null), 3000);
  }

  // ---- order edits (optimistic)
  function patchOrder(id: string, patch: Partial<Pick<PendingOrder, "notes" | "legend_id" | "greyed" | "moved_to">>) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    updateOrder(id, patch).then((r) => {
      if ("error" in r) alert(`Couldn't save: ${r.error}`);
    });
  }

  async function removeOrder(o: PendingOrder) {
    if (!(await confirm(`Remove order ${o.order_no} from this list? It comes back if it is on the next report you upload.`))) return;
    setOrders((prev) => prev.filter((x) => x.id !== o.id));
    deleteOrder(o.id).catch(() => {});
  }

  // ---- legend
  function addLegend() {
    saveLegendItem({ name: `Color ${legend.length + 1}`, color: "#facc15", opacity: 0.45, position: legend.length }).then((r) => {
      if ("error" in r) return alert(r.error);
      setLegend((prev) => [...prev, { id: r.id, name: `Color ${prev.length + 1}`, color: "#facc15", opacity: 0.45, position: prev.length }]);
    });
  }

  function editLegend(item: OrderLegendItem, patch: Partial<OrderLegendItem>) {
    const next = { ...item, ...patch };
    setLegend((prev) => prev.map((l) => (l.id === item.id ? next : l)));
    const timers = saveTimers.current;
    clearTimeout(timers.get(item.id));
    timers.set(
      item.id,
      setTimeout(() => {
        saveLegendItem({ id: item.id, name: next.name, color: next.color, opacity: next.opacity }).then((r) => {
          if ("error" in r) alert(`Couldn't save the color: ${r.error}`);
        });
      }, 500),
    );
  }

  async function removeLegend(item: OrderLegendItem) {
    if (!(await confirm(`Delete the color "${item.name}"? Orders using it go back to no color.`))) return;
    setLegend((prev) => prev.filter((l) => l.id !== item.id));
    setOrders((prev) => prev.map((o) => (o.legend_id === item.id ? { ...o, legend_id: null } : o)));
    deleteLegendItem(item.id).catch(() => {});
  }

  // ---- loading a report
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("Reading the report...");
    const form = new FormData();
    form.append("file", file);
    try {
      const result = await readOrdersPdf(form);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      setReview(result);
      setRemoveIds(new Set(result.missing.map((m) => m.id)));
    } catch {
      alert("Couldn't read that file - try again.");
    } finally {
      setBusy(null);
    }
  }

  async function loadReport() {
    if (!review) return;
    setBusy("Loading...");
    try {
      const result = await importOrdersReport({
        orders: review.orders,
        removeIds: [...removeIds],
        fileName: review.fileName,
        parameters: review.parameters,
      });
      if ("error" in result) {
        alert(result.error);
        return;
      }
      setReview(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  // ---- exports
  const sections: OrderSection[] = [
    { title: "Today's pending orders", groups: mainGroups },
    { title: `Moved to tomorrow (${dayName(tomorrow)})`, groups: movedGroups },
  ];
  const heading = `Pending Orders - ${dayName(today)}`;
  const subheading = meta?.uploaded_at ? `From the report loaded ${formatTimestamp(meta.uploaded_at)}` : "";

  async function copyImage() {
    setBusy("Making the image...");
    try {
      const blob = await renderOrdersPng(sections, legend, heading, subheading);
      const result = await copyOrDownloadPng(blob, "pending-orders.png");
      flash(result === "copied" ? "Image copied!" : "Image downloaded!");
    } catch {
      alert("Could not create the image - try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copyExcel() {
    try {
      await copyOrdersForExcel(sections, legend, heading);
      flash("Copied - paste into Excel or an email.");
    } catch {
      alert("Could not copy to clipboard - your browser may not support it.");
    }
  }

  async function downloadXlsx() {
    setBusy("Making the spreadsheet...");
    try {
      await downloadOrdersXlsx(sections, legend, heading, `Pending Orders ${today}.xlsx`);
    } catch {
      alert("Could not create the spreadsheet - try again.");
    } finally {
      setBusy(null);
    }
  }

  const liveCount = main.length;
  const totalOrdered = main.reduce((s, o) => s + o.ordered, 0);

  function renderGroups(groups: ReturnType<typeof groupByShipDate>, isMoved: boolean) {
    return groups.map((g) => (
      <tbody key={`${isMoved}-${g.date ?? "none"}`}>
        <tr className="bg-black/5 dark:bg-white/10">
          <td colSpan={12} className="px-2 py-1.5 text-sm font-bold">
            Ship date {shortDay(g.date)}
            <span className="ml-2 font-normal text-black/60 dark:text-white/60">
              {g.orders.length} order{g.orders.length === 1 ? "" : "s"} · {qty(g.orders.reduce((s, o) => s + o.ordered, 0))} ordered
            </span>
          </td>
        </tr>
        {g.orders.map((o) => {
          const item = o.legend_id ? legendById.get(o.legend_id) : undefined;
          const bg = o.greyed ? GREY_ROW : item ? rgbaOf(item.color, item.opacity) : undefined;
          return (
            <tr key={o.id} style={bg ? { backgroundColor: bg } : undefined} className={`border-t border-black/10 align-top dark:border-white/10 ${o.greyed ? "text-gray-500" : ""}`}>
              <td className="relative px-1 py-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerFor(pickerFor === o.id ? null : o.id);
                  }}
                  title={item ? item.name : "Choose a color"}
                  className="h-5 w-5 rounded-full border border-black/40"
                  style={{ backgroundColor: item ? item.color : "transparent" }}
                />
                {pickerFor === o.id && (
                  <div className="absolute left-6 top-1 z-30 w-52 rounded-lg border border-black/20 bg-white p-2 text-black shadow-lg dark:border-white/20 dark:bg-neutral-900 dark:text-white">
                    {legend.length === 0 && <p className="px-1 py-1 text-xs text-black/60 dark:text-white/60">No colors yet - add some under Legend.</p>}
                    {legend.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => {
                          patchOrder(o.id, { legend_id: l.id });
                          setPickerFor(null);
                        }}
                        className="mb-1 flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        <span className="h-4 w-8 rounded border border-black/30" style={{ backgroundColor: rgbaOf(l.color, l.opacity) }} />
                        {l.name}
                      </button>
                    ))}
                    {o.legend_id && (
                      <button
                        onClick={() => {
                          patchOrder(o.id, { legend_id: null });
                          setPickerFor(null);
                        }}
                        className="w-full rounded px-1.5 py-1 text-left text-xs text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                      >
                        No color
                      </button>
                    )}
                  </div>
                )}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 font-medium">{o.order_no}</td>
              <td className="whitespace-nowrap px-2 py-1.5">{o.status}</td>
              <td className="px-2 py-1.5">
                <span className="font-medium">{o.customer_code}</span>
                {o.customer_name && o.customer_name !== o.customer_code && <span className="block text-xs opacity-70">{o.customer_name}</span>}
              </td>
              <td className="px-2 py-1.5">{o.salesperson}</td>
              <td className="px-2 py-1.5">{o.terms}</td>
              <td className="px-2 py-1.5 text-xs">{o.freight}</td>
              <td className="px-2 py-1.5 text-right">{qty(o.ordered)}</td>
              <td className="px-2 py-1.5 text-right">{o.shipped > 0 ? qty(o.shipped) : ""}</td>
              <td className="w-[22rem] min-w-[16rem] px-2 py-1">
                <NotesBox value={o.notes} onSave={(notes) => patchOrder(o.id, { notes })} />
              </td>
              <td className="whitespace-nowrap px-1 py-1.5 text-right">
                <button
                  onClick={() => patchOrder(o.id, { greyed: !o.greyed })}
                  title={o.greyed ? "Show as active again" : "Grey out (shipped)"}
                  className="rounded border border-black/20 px-1.5 py-0.5 text-xs hover:bg-black/10 dark:border-white/20 dark:hover:bg-white/10"
                >
                  {o.greyed ? "Un-grey" : "Shipped"}
                </button>{" "}
                {isMoved ? (
                  <button
                    onClick={() => patchOrder(o.id, { moved_to: null })}
                    className="rounded border border-black/20 px-1.5 py-0.5 text-xs hover:bg-black/10 dark:border-white/20 dark:hover:bg-white/10"
                  >
                    Back to today
                  </button>
                ) : (
                  <button
                    onClick={() => patchOrder(o.id, { moved_to: tomorrow })}
                    className="rounded border border-black/20 px-1.5 py-0.5 text-xs hover:bg-black/10 dark:border-white/20 dark:hover:bg-white/10"
                  >
                    Tomorrow →
                  </button>
                )}{" "}
                <button onClick={() => removeOrder(o)} title="Remove from the list" className="rounded px-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  ✕
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    ));
  }

  const head = (
    <thead className="bg-black/5 text-left text-xs dark:bg-white/10">
      <tr>
        <th className="w-8 px-1 py-2" />
        <th className="px-2 py-2">Order No</th>
        <th className="px-2 py-2">Status</th>
        <th className="px-2 py-2">Customer</th>
        <th className="px-2 py-2">Salesperson</th>
        <th className="px-2 py-2">Terms</th>
        <th className="px-2 py-2">Freight</th>
        <th className="px-2 py-2 text-right">Ordered</th>
        <th className="px-2 py-2 text-right">Shipped</th>
        <th className="px-2 py-2">Notes</th>
        <th className="px-2 py-2" />
      </tr>
    </thead>
  );

  return (
    <div className="space-y-4" onClick={() => pickerFor && setPickerFor(null)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {meta?.uploaded_at
              ? `Report loaded ${formatTimestamp(meta.uploaded_at)}${meta.uploaded_by ? ` by ${meta.uploaded_by}` : ""} · ${liveCount} pending · ${qty(totalOrdered)} ordered`
              : "Upload the Orders Summary PDF to get started."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={onFile} className="hidden" />
          <button onClick={() => fileInput.current?.click()} disabled={!!busy} className={btnGreen}>
            Upload report PDF
          </button>
          <button onClick={() => setLegendOpen((v) => !v)} className={btnLine}>
            Legend{legend.length > 0 ? ` (${legend.length})` : ""}
          </button>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={hideGreyed} onChange={(e) => setHideGreyed(e.target.checked)} />
            Hide greyed out
          </label>
          <button onClick={copyImage} disabled={!!busy || orders.length === 0} className={btnLine}>
            Copy image
          </button>
          <button onClick={copyExcel} disabled={orders.length === 0} className={btnLine}>
            Copy for Excel
          </button>
          <button onClick={downloadXlsx} disabled={!!busy || orders.length === 0} className={btnLine}>
            Download .xlsx
          </button>
        </div>
      </div>

      {(busy || message) && <p className="text-sm text-green-700 dark:text-green-400">{busy ?? message}</p>}

      {/* Legend: each color's name, color and opacity. */}
      {legend.length > 0 && !legendOpen && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Legend:</span>
          {legend.map((l) => (
            <span key={l.id} className="rounded border border-black/30 px-2.5 py-0.5" style={{ backgroundColor: rgbaOf(l.color, l.opacity) }}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      {legendOpen && (
        <div className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Legend</h2>
            <button onClick={addLegend} className={btnLine}>
              + Add color
            </button>
          </div>
          {legend.length === 0 && <p className="text-sm text-black/60 dark:text-white/60">No colors yet. Add one, name it, then click the dot at the left of any order to use it.</p>}
          {legend.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 rounded border border-black/10 p-2 dark:border-white/10">
              <span className="h-8 w-20 rounded border border-black/30" style={{ backgroundColor: rgbaOf(l.color, l.opacity) }} />
              <input
                value={l.name}
                readOnly={l.is_preset}
                onChange={(e) => editLegend(l, { name: e.target.value })}
                placeholder="Name"
                className={`w-44 rounded border border-gray-300 px-2 py-1 text-sm text-black ${l.is_preset ? "bg-gray-100" : "bg-white"}`}
              />
              <label className="flex items-center gap-1.5 text-xs">
                Color
                <input type="color" value={l.color} onChange={(e) => editLegend(l, { color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-gray-300 bg-white p-0.5" />
                <input
                  value={l.color}
                  onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && editLegend(l, { color: e.target.value })}
                  className="w-20 rounded border border-gray-300 bg-white px-1.5 py-1 font-mono text-xs text-black"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                Opacity
                <input type="range" min={5} max={100} value={Math.round(l.opacity * 100)} onChange={(e) => editLegend(l, { opacity: Number(e.target.value) / 100 })} className="w-32" />
                <span className="w-9 text-right">{Math.round(l.opacity * 100)}%</span>
              </label>
              {l.is_preset ? (
                <span className="ml-auto text-xs text-black/40 dark:text-white/40">Always there</span>
              ) : (
                <button onClick={() => removeLegend(l)} className="ml-auto text-xs text-red-600 hover:underline">
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Review of an uploaded report before it is loaded. */}
      {review && (
        <div className="space-y-3 rounded-lg border-2 border-green-600 p-4" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-bold">Load this report?</h2>
          <p className="text-sm text-black/70 dark:text-white/70">
            {review.fileName} · {review.parameters}
          </p>
          <p className="text-sm">
            <span className="font-bold">{review.added}</span> new order{review.added === 1 ? "" : "s"} ·{" "}
            <span className="font-bold">{review.updated}</span> already here (notes and colors are kept) ·{" "}
            <span className="font-bold">{review.newlyShipped.length}</span> show a shipped quantity and will be greyed out
          </p>
          {review.warnings.length > 0 && <p className="text-sm text-amber-600">{review.warnings.join(" ")}</p>}
          {review.missing.length > 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">These orders are on the page but not on this report - probably deleted. Tick the ones to remove:</p>
              {review.missing.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={removeIds.has(m.id)}
                    onChange={(e) =>
                      setRemoveIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(m.id);
                        else next.delete(m.id);
                        return next;
                      })
                    }
                  />
                  {m.order_no} - {m.customer} {m.ship_date ? `(ship ${shortDay(m.ship_date)})` : ""}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">Nothing on the page is missing from this report.</p>
          )}
          <div className="flex gap-2">
            <button onClick={loadReport} disabled={!!busy} className={btnGreen}>
              {busy ?? "Load report"}
            </button>
            <button onClick={() => setReview(null)} disabled={!!busy} className={btnLine}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm text-black/60 dark:border-white/20 dark:text-white/60">
          No orders yet. Click “Upload report PDF” and choose the Orders Summary you printed.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <div className="bg-green-700 px-3 py-1.5 text-sm font-bold text-white">Today&apos;s pending orders ({dayName(today)})</div>
            <table className="w-full text-sm">
              {head}
              {mainGroups.length > 0 ? (
                renderGroups(mainGroups, false)
              ) : (
                <tbody>
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-black/50 dark:text-white/50">
                      Nothing pending.
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>

          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <div className="bg-green-900 px-3 py-1.5 text-sm font-bold text-white">Moved to tomorrow ({dayName(tomorrow)})</div>
            <table className="w-full text-sm">
              {head}
              {movedGroups.length > 0 ? (
                renderGroups(movedGroups, true)
              ) : (
                <tbody>
                  <tr>
                    <td colSpan={11} className="px-3 py-5 text-center text-black/50 dark:text-white/50">
                      Nothing moved. Use “Tomorrow →” on an order to move it here.
                    </td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Notes box that saves when you click away.
function NotesBox({ value, onSave }: { value: string; onSave: (notes: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <textarea
      value={text}
      rows={Math.max(2, Math.min(6, text.split("\n").length + Math.floor(text.length / 45)))}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text)}
      placeholder="Add a note..."
      className="w-full resize-y rounded border border-black/20 bg-white/70 px-2 py-1 text-sm text-black placeholder:text-black/40 dark:border-white/20"
    />
  );
}
