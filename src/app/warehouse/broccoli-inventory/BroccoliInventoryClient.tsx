"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { currentWeekStart, daysSince, formatWeekLabel, nextWeekStart, prevWeekStart, weekNumberOf } from "@/lib/dates";
import { copyOrDownloadPng, renderPriceSheetPng, type CanvasBlock, type MonoRow } from "@/lib/fobPricing";
import {
  BROCCOLI_CROWN_QUALITIES,
  BROCCOLI_ICE_QUALITIES,
  isBroccoliLotFlagged,
  type BroccoliCrownQuality,
  type BroccoliIceQuality,
  type BroccoliLot,
  type BroccoliLotStatus,
  type BroccoliOrder,
} from "@/lib/types";
import {
  addLot,
  addOrder,
  deleteLot,
  deleteOrder,
  moveLotToFloor,
  pullFromArrivals,
  pullFromWarehouse,
  updateLot,
} from "./actions";

const field = "rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-black";
const HEADER_COLOR = "#2E7D32"; // matches Price Sheets / Arrivals' own header color

const CROWN_CYCLE: (BroccoliCrownQuality | null)[] = [null, "pass", "slight_caution", "caution", "urgent", "fail"];
const ICE_CYCLE: (BroccoliIceQuality | null)[] = [null, "none", "low", "med", "high"];

interface OrderDraft {
  orderNumber: string;
  qty: string;
  notes: string;
}
const EMPTY_ORDER_DRAFT: OrderDraft = { orderNumber: "", qty: "", notes: "" };

function crownInfo(value: BroccoliCrownQuality | null) {
  return BROCCOLI_CROWN_QUALITIES.find((c) => c.value === value) ?? null;
}
function iceInfo(value: BroccoliIceQuality | null) {
  return BROCCOLI_ICE_QUALITIES.find((c) => c.value === value) ?? null;
}

function computeAvailable(lot: BroccoliLot, orders: BroccoliOrder[]): number {
  const used = orders.reduce((s, o) => s + (o.qty ?? 0), 0);
  return (lot.qty ?? 0) - used;
}

function CycleBadge<T extends string>({
  value,
  cycle,
  info,
  unsetLabel,
  onChange,
}: {
  value: T | null;
  cycle: (T | null)[];
  info: (v: T | null) => { label: string; badgeClass: string } | null;
  unsetLabel: string;
  onChange: (next: T | null) => void;
}) {
  const current = info(value);
  function cycleNext() {
    const idx = cycle.indexOf(value);
    onChange(cycle[(idx + 1) % cycle.length]);
  }
  return (
    <button
      onClick={cycleNext}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
        current ? current.badgeClass : "bg-black/5 text-black/40 hover:bg-black/10 dark:bg-white/10 dark:text-white/40"
      }`}
    >
      {current ? current.label : unsetLabel}
    </button>
  );
}

// Grade sort key: #1 first, #2 second, any other explicit grade next, blank
// last - matches "Anything #1 goes first, Then anything #2."
function gradeRank(grade: string | null): number {
  const g = (grade ?? "").trim().replace(/^#/, "");
  if (g === "1") return 0;
  if (g === "2") return 1;
  if (g === "") return 99;
  return 50;
}
function gradeLabel(grade: string | null): string {
  const g = (grade ?? "").trim();
  return g === "" ? "Ungraded" : g.startsWith("#") ? g : `#${g}`;
}

const CROWN_RANK = new Map(BROCCOLI_CROWN_QUALITIES.map((c, i) => [c.value, i]));
const ICE_RANK = new Map(BROCCOLI_ICE_QUALITIES.map((c, i) => [c.value, i]));

function sortLots(lots: BroccoliLot[]): BroccoliLot[] {
  return [...lots].sort((a, b) => {
    const g = gradeRank(a.grade) - gradeRank(b.grade);
    if (g !== 0) return g;
    const c = (a.crown_quality ? CROWN_RANK.get(a.crown_quality)! : -1) - (b.crown_quality ? CROWN_RANK.get(b.crown_quality)! : -1);
    if (c !== 0) return c;
    const i = (a.ice_quality ? ICE_RANK.get(a.ice_quality)! : -1) - (b.ice_quality ? ICE_RANK.get(b.ice_quality)! : -1);
    if (i !== 0) return i;
    const ad = a.received_date ?? "";
    const bd = b.received_date ?? "";
    return ad.localeCompare(bd);
  });
}

interface GradeGroup {
  key: string;
  label: string;
  crownGroups: { key: string; label: string | null; iceGroups: { key: string; label: string | null; lots: BroccoliLot[] }[] }[];
}

// Builds the nested Grade -> Crown -> Ice grouping for On Floor / Issues
// Flagged. Inbound calls this too but every lot in it has null Crown/Ice,
// so it collapses to a single ungrouped leaf per grade automatically.
function groupLots(lots: BroccoliLot[]): GradeGroup[] {
  const sorted = sortLots(lots);
  const gradeMap = new Map<string, BroccoliLot[]>();
  for (const lot of sorted) {
    const key = gradeLabel(lot.grade);
    if (!gradeMap.has(key)) gradeMap.set(key, []);
    gradeMap.get(key)!.push(lot);
  }
  return Array.from(gradeMap.entries()).map(([gLabel, gLots]) => {
    const crownMap = new Map<string, BroccoliLot[]>();
    for (const lot of gLots) {
      const key = lot.crown_quality ?? "__none__";
      if (!crownMap.has(key)) crownMap.set(key, []);
      crownMap.get(key)!.push(lot);
    }
    const crownGroups = Array.from(crownMap.entries()).map(([cKey, cLots]) => {
      const iceMap = new Map<string, BroccoliLot[]>();
      for (const lot of cLots) {
        const key = lot.ice_quality ?? "__none__";
        if (!iceMap.has(key)) iceMap.set(key, []);
        iceMap.get(key)!.push(lot);
      }
      const iceGroups = Array.from(iceMap.entries()).map(([iKey, iLots]) => ({
        key: iKey,
        label: iKey === "__none__" ? null : iceInfo(iKey as BroccoliIceQuality)?.label ?? iKey,
        lots: iLots,
      }));
      return {
        key: cKey,
        label: cKey === "__none__" ? null : crownInfo(cKey as BroccoliCrownQuality)?.label ?? cKey,
        iceGroups,
      };
    });
    return { key: gLabel, label: gLabel, crownGroups };
  });
}

// Top-level (not defined inside the page component) so it keeps its own
// identity across renders instead of being torn down and rebuilt - state
// like the order-draft inputs below would otherwise reset on every keystroke
// elsewhere on the page.
function LotRow({
  lot,
  showFloorControls,
  orders,
  onPatchLot,
  onDeleteLot,
  onMoveToFloor,
  isAddingOrder,
  orderDraft,
  onOrderDraftChange,
  onStartAddOrder,
  onCancelAddOrder,
  onSaveOrder,
  onDeleteOrder,
}: {
  lot: BroccoliLot;
  showFloorControls: boolean;
  orders: BroccoliOrder[];
  onPatchLot: (patch: Partial<BroccoliLot>) => void;
  onDeleteLot: () => void;
  onMoveToFloor: () => void;
  isAddingOrder: boolean;
  orderDraft: OrderDraft;
  onOrderDraftChange: (draft: OrderDraft) => void;
  onStartAddOrder: () => void;
  onCancelAddOrder: () => void;
  onSaveOrder: () => void;
  onDeleteOrder: (orderId: string) => void;
}) {
  const age = daysSince(lot.received_date);
  const availableQty = computeAvailable(lot, orders);
  return (
    <div className="space-y-1 border-t border-black/10 py-2 first:border-t-0 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-2">
        <input
          defaultValue={lot.lot_number ?? ""}
          onBlur={(e) => onPatchLot({ lot_number: e.target.value || null })}
          placeholder="Lot #"
          className={`${field} w-24`}
        />
        <input
          type="date"
          defaultValue={lot.received_date ?? ""}
          onBlur={(e) => onPatchLot({ received_date: e.target.value || null })}
          className={`${field} w-36`}
        />
        <span className="text-xs text-black/50 dark:text-white/50">{age === null ? "-" : `${age}d`}</span>
        <input
          defaultValue={lot.label ?? ""}
          onBlur={(e) => onPatchLot({ label: e.target.value || null })}
          placeholder="Label"
          className={`${field} w-20`}
        />
        <input
          defaultValue={lot.grade ?? ""}
          onBlur={(e) => onPatchLot({ grade: e.target.value || null })}
          placeholder="Grade"
          className={`${field} w-16`}
        />
        <input
          type="number"
          step="any"
          defaultValue={lot.qty ?? ""}
          onBlur={(e) => onPatchLot({ qty: e.target.value === "" ? null : Number(e.target.value) })}
          placeholder="Qty"
          className={`${field} w-20`}
        />
        {showFloorControls && (
          <>
            <CycleBadge
              value={lot.crown_quality}
              cycle={CROWN_CYCLE}
              info={crownInfo}
              unsetLabel="Set Crown"
              onChange={(v) => onPatchLot({ crown_quality: v })}
            />
            <CycleBadge
              value={lot.ice_quality}
              cycle={ICE_CYCLE}
              info={iceInfo}
              unsetLabel="Set Ice"
              onChange={(v) => onPatchLot({ ice_quality: v })}
            />
          </>
        )}
        {!showFloorControls && (
          <button onClick={onMoveToFloor} className="rounded-md bg-green-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-green-700">
            Move to On Floor
          </button>
        )}
        <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300">
          Available: {availableQty.toLocaleString()}
        </span>
        <button onClick={onDeleteLot} className="text-[11px] font-medium text-red-600 hover:underline">
          Delete
        </button>
      </div>

      <div className="ml-2 space-y-0.5 pl-3 text-xs text-black/50 dark:text-white/50">
        {orders.map((o) => (
          <div key={o.id} className="flex items-center gap-2">
            <span>
              ↳ Order {o.order_number || "-"} · Qty {o.qty ?? 0}
              {o.notes ? ` · ${o.notes}` : ""}
            </span>
            <button onClick={() => onDeleteOrder(o.id)} className="text-red-500 hover:underline">
              remove
            </button>
          </div>
        ))}
        {isAddingOrder ? (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <input
              value={orderDraft.orderNumber}
              onChange={(e) => onOrderDraftChange({ ...orderDraft, orderNumber: e.target.value })}
              placeholder="Order #"
              className={`${field} w-24`}
            />
            <input
              type="number"
              step="any"
              value={orderDraft.qty}
              onChange={(e) => onOrderDraftChange({ ...orderDraft, qty: e.target.value })}
              placeholder="Qty"
              className={`${field} w-20`}
            />
            <input
              value={orderDraft.notes}
              onChange={(e) => onOrderDraftChange({ ...orderDraft, notes: e.target.value })}
              placeholder="Notes"
              className={`${field} w-32`}
            />
            <button onClick={onSaveOrder} className="rounded-md bg-green-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-green-700">
              Save
            </button>
            <button onClick={onCancelAddOrder} className="text-[11px] text-black/50 hover:underline dark:text-white/50">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={onStartAddOrder} className="font-medium text-green-700 hover:underline dark:text-green-400">
            + Order
          </button>
        )}
      </div>
    </div>
  );
}

function GroupedSection({
  lots: sectionLots,
  showFloorControls,
  ordersByLot,
  addingOrderFor,
  orderDraft,
  onPatchLot,
  onDeleteLot,
  onMoveToFloor,
  onStartAddOrder,
  onCancelAddOrder,
  onOrderDraftChange,
  onSaveOrder,
  onDeleteOrder,
}: {
  lots: BroccoliLot[];
  showFloorControls: boolean;
  ordersByLot: Map<string, BroccoliOrder[]>;
  addingOrderFor: string | null;
  orderDraft: OrderDraft;
  onPatchLot: (lotId: string, patch: Partial<BroccoliLot>) => void;
  onDeleteLot: (lotId: string) => void;
  onMoveToFloor: (lotId: string) => void;
  onStartAddOrder: (lotId: string) => void;
  onCancelAddOrder: () => void;
  onOrderDraftChange: (draft: OrderDraft) => void;
  onSaveOrder: (lotId: string) => void;
  onDeleteOrder: (orderId: string) => void;
}) {
  const groups = groupLots(sectionLots);
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-black/10 p-4 text-center text-sm text-black/40 dark:border-white/10 dark:text-white/40">
        Nothing here yet.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key} className="space-y-2">
          <h3 className="rounded-md bg-green-700 px-2 py-1 text-sm font-bold text-white">Grade {g.label}</h3>
          {g.crownGroups.map((c) => (
            <div key={c.key} className="space-y-1">
              {c.label && (
                <h4 className="rounded bg-black/5 px-2 py-0.5 text-xs font-semibold text-black/70 dark:bg-white/10 dark:text-white/70">
                  {c.label}
                </h4>
              )}
              {c.iceGroups.map((i) => (
                <div key={i.key}>
                  {i.label && <p className="px-2 text-[11px] font-medium text-black/50 dark:text-white/50">Ice: {i.label}</p>}
                  <div className="rounded-lg border border-black/10 px-3 dark:border-white/10">
                    {i.lots.map((lot) => (
                      <LotRow
                        key={lot.id}
                        lot={lot}
                        showFloorControls={showFloorControls}
                        orders={ordersByLot.get(lot.id) ?? []}
                        onPatchLot={(patch) => onPatchLot(lot.id, patch)}
                        onDeleteLot={() => onDeleteLot(lot.id)}
                        onMoveToFloor={() => onMoveToFloor(lot.id)}
                        isAddingOrder={addingOrderFor === lot.id}
                        orderDraft={orderDraft}
                        onOrderDraftChange={onOrderDraftChange}
                        onStartAddOrder={() => onStartAddOrder(lot.id)}
                        onCancelAddOrder={onCancelAddOrder}
                        onSaveOrder={() => onSaveOrder(lot.id)}
                        onDeleteOrder={onDeleteOrder}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function BroccoliInventoryClient({
  initialLots,
  initialOrders,
}: {
  initialLots: BroccoliLot[];
  initialOrders: BroccoliOrder[];
}) {
  const confirm = useConfirm();
  const [lots, setLots] = useState(initialLots);
  const [orders, setOrders] = useState(initialOrders);
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [pullingWarehouse, setPullingWarehouse] = useState(false);
  const [pullingArrivals, setPullingArrivals] = useState(false);
  const [addingOrderFor, setAddingOrderFor] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<OrderDraft>(EMPTY_ORDER_DRAFT);
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const ordersByLot = useMemo(() => {
    const map = new Map<string, BroccoliOrder[]>();
    for (const o of orders) {
      if (!map.has(o.lot_id)) map.set(o.lot_id, []);
      map.get(o.lot_id)!.push(o);
    }
    return map;
  }, [orders]);

  function patchLot(id: string, patch: Partial<BroccoliLot>) {
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    updateLot(id, patch).catch(() => {});
  }

  async function handleDeleteLot(id: string) {
    if (!(await confirm("Delete this lot? Any orders under it go too."))) return;
    setLots((prev) => prev.filter((l) => l.id !== id));
    setOrders((prev) => prev.filter((o) => o.lot_id !== id));
    await deleteLot(id).catch(() => {});
  }

  async function handleAddLot(status: BroccoliLotStatus) {
    const sectionLots = lots.filter((l) => l.status === status);
    const nextPosition = sectionLots.length > 0 ? Math.max(...sectionLots.map((l) => l.position)) + 1 : 1;
    const row = (await addLot(status, nextPosition)) as BroccoliLot;
    setLots((prev) => [...prev, row]);
  }

  async function handleMoveToFloor(id: string) {
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, status: "on_floor" } : l)));
    await moveLotToFloor(id).catch(() => {});
  }

  async function handlePullWarehouse() {
    setPullingWarehouse(true);
    try {
      const rows = (await pullFromWarehouse()) as BroccoliLot[];
      setLots((prev) => {
        const byId = new Map(prev.map((l) => [l.id, l]));
        for (const r of rows) byId.set(r.id, r);
        return Array.from(byId.values());
      });
    } finally {
      setPullingWarehouse(false);
    }
  }

  async function handlePullArrivals() {
    setPullingArrivals(true);
    try {
      const result = (await pullFromArrivals(weekStart)) as { lots: BroccoliLot[]; orders: BroccoliOrder[] };
      setLots((prev) => {
        const byId = new Map(prev.map((l) => [l.id, l]));
        for (const r of result.lots) byId.set(r.id, r);
        return Array.from(byId.values());
      });
      if (result.orders.length > 0) {
        setOrders((prev) => {
          const byId = new Map(prev.map((o) => [o.id, o]));
          for (const r of result.orders) byId.set(r.id, r);
          return Array.from(byId.values());
        });
      }
    } finally {
      setPullingArrivals(false);
    }
  }

  function startAddOrder(lotId: string) {
    setAddingOrderFor(lotId);
    setOrderDraft(EMPTY_ORDER_DRAFT);
  }

  async function saveOrder(lotId: string) {
    const lotOrders = ordersByLot.get(lotId) ?? [];
    const nextPosition = lotOrders.length > 0 ? Math.max(...lotOrders.map((o) => o.position)) + 1 : 1;
    const qty = orderDraft.qty.trim() === "" ? null : Number(orderDraft.qty);
    const row = (await addOrder(lotId, nextPosition, orderDraft.orderNumber.trim(), qty, orderDraft.notes.trim())) as BroccoliOrder;
    setOrders((prev) => [...prev, row]);
    setAddingOrderFor(null);
  }

  async function handleDeleteOrder(id: string) {
    setOrders((prev) => prev.filter((o) => o.id !== id));
    await deleteOrder(id).catch(() => {});
  }

  const onFloorLots = lots.filter((l) => l.status === "on_floor" && !isBroccoliLotFlagged(l));
  const flaggedLots = lots.filter((l) => l.status === "on_floor" && isBroccoliLotFlagged(l));
  const inboundLots = lots.filter((l) => l.status === "inbound");

  // Both variants share the same trailing two columns (Qty/Available col,
  // then Notes), so an indented order sub-row can put its own qty/notes in
  // those same slots regardless of which header set is active - only the
  // number of blank middle columns differs.
  function buildImageBlock(title: string, sectionLots: BroccoliLot[], includeCrownIce: boolean): CanvasBlock {
    const headers = includeCrownIce
      ? ["Lot / Order", "Received", "Age", "Label", "Grade", "Crown", "Ice", "Qty / Available", "Notes"]
      : ["Lot / Order", "Expected", "Label", "Grade", "Qty / Available", "Notes"];
    const middleBlankCount = headers.length - 3; // everything between col 0 and the last two columns
    const groups = groupLots(sectionLots);
    const rows: MonoRow[] = [];
    for (const g of groups) {
      const allLots = g.crownGroups.flatMap((c) => c.iceGroups.flatMap((i) => i.lots));
      rows.push({ group: `Grade ${g.label}` });
      for (const lot of sortLots(allLots)) {
        const age = daysSince(lot.received_date);
        const lotOrders = ordersByLot.get(lot.id) ?? [];
        const availableQty = computeAvailable(lot, lotOrders);
        rows.push({
          cells: includeCrownIce
            ? [
                lot.lot_number ?? "-",
                lot.received_date ?? "-",
                age === null ? "-" : `${age}d`,
                lot.label ?? "-",
                lot.grade ?? "-",
                crownInfo(lot.crown_quality)?.label ?? "-",
                iceInfo(lot.ice_quality)?.label ?? "-",
                `${lot.qty ?? 0} / ${availableQty}`,
                lot.notes ?? "",
              ]
            : [lot.lot_number ?? "-", lot.received_date ?? "-", lot.label ?? "-", lot.grade ?? "-", `${lot.qty ?? 0} / ${availableQty}`, lot.notes ?? ""],
        });
        for (const o of lotOrders) {
          rows.push({
            cells: [`  -> Order ${o.order_number ?? "-"}`, ...Array(middleBlankCount).fill(""), String(o.qty ?? 0), o.notes ?? ""],
          });
        }
      }
    }
    return {
      title,
      headerColor: HEADER_COLOR,
      columnHeaders: headers,
      rows: rows.length > 0 ? rows : [{ cells: ["Nothing logged.", ...Array(headers.length - 1).fill("")] }],
    };
  }

  async function handleCopyImage() {
    try {
      const blocks: CanvasBlock[] = [
        buildImageBlock("On Floor", onFloorLots, true),
        buildImageBlock("Inbound", inboundLots, false),
        buildImageBlock("On Floor - Issues Flagged", flaggedLots, true),
      ];
      const blob = await renderPriceSheetPng({
        title: "Broccoli Inventory",
        message: `As of ${formatWeekLabel(weekStart)}`,
        blocks,
        direction: "column",
      });
      const result = await copyOrDownloadPng(blob, "broccoli-inventory.png");
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  function buildEmailSection(title: string, sectionLots: BroccoliLot[]): string {
    const groups = groupLots(sectionLots);
    if (groups.length === 0) return `${title}\n  Nothing here.\n`;
    let text = `${title}\n`;
    for (const g of groups) {
      text += `  Grade ${g.label}\n`;
      const allLots = sortLots(g.crownGroups.flatMap((c) => c.iceGroups.flatMap((i) => i.lots)));
      for (const lot of allLots) {
        const age = daysSince(lot.received_date);
        const lotOrders = ordersByLot.get(lot.id) ?? [];
        const bits = [
          lot.lot_number ?? "Lot",
          lot.received_date ? `Received ${lot.received_date}${age !== null ? ` (${age}d)` : ""}` : null,
          lot.label,
          crownInfo(lot.crown_quality)?.label,
          iceInfo(lot.ice_quality)?.label,
          `Qty ${lot.qty ?? 0}`,
          `Available ${computeAvailable(lot, lotOrders)}`,
        ].filter(Boolean);
        text += `    ${bits.join(" | ")}\n`;
        for (const o of lotOrders) {
          text += `      -> Order ${o.order_number ?? "-"} | Qty ${o.qty ?? 0}${o.notes ? ` | ${o.notes}` : ""}\n`;
        }
      }
    }
    return text;
  }

  async function handleCopyEmail() {
    try {
      const text = [
        `BROCCOLI INVENTORY - ${formatWeekLabel(weekStart)}`,
        "",
        buildEmailSection("ON FLOOR", onFloorLots),
        buildEmailSection("INBOUND", inboundLots),
        buildEmailSection("ON FLOOR - ISSUES FLAGGED", flaggedLots),
      ].join("\n");
      await navigator.clipboard.writeText(text);
      setEmailStatus("Copied!");
      setTimeout(() => setEmailStatus(null), 2500);
    } catch {
      alert("Could not copy - try again.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Broccoli Inventory</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            On-floor and inbound broccoli, grouped by Grade, Crown Condition, and Ice Condition.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleCopyImage} className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800">
            {imageStatus ?? "Copy as Image"}
          </button>
          <button
            onClick={handleCopyEmail}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {emailStatus ?? "Copy to Email"}
          </button>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">On Floor</h2>
          <button
            onClick={handlePullWarehouse}
            disabled={pullingWarehouse}
            className="rounded-md border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-60 dark:text-green-400 dark:hover:bg-green-900/20"
          >
            {pullingWarehouse ? "Pulling..." : "Pull from Warehouse Inventory"}
          </button>
        </div>
        <GroupedSection
          lots={onFloorLots}
          showFloorControls
          ordersByLot={ordersByLot}
          addingOrderFor={addingOrderFor}
          orderDraft={orderDraft}
          onPatchLot={patchLot}
          onDeleteLot={handleDeleteLot}
          onMoveToFloor={handleMoveToFloor}
          onStartAddOrder={startAddOrder}
          onCancelAddOrder={() => setAddingOrderFor(null)}
          onOrderDraftChange={setOrderDraft}
          onSaveOrder={saveOrder}
          onDeleteOrder={handleDeleteOrder}
        />
        <button onClick={() => handleAddLot("on_floor")} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
          + Add Lot
        </button>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">Inbound</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart(prevWeekStart(weekStart))} className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20">
              ← Prev
            </button>
            <span className="text-xs font-medium">
              Week {weekNumberOf(weekStart)} - {formatWeekLabel(weekStart)}
            </span>
            <button onClick={() => setWeekStart(nextWeekStart(weekStart))} className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20">
              Next →
            </button>
            <button
              onClick={handlePullArrivals}
              disabled={pullingArrivals}
              className="rounded-md border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-60 dark:text-green-400 dark:hover:bg-green-900/20"
            >
              {pullingArrivals ? "Pulling..." : "Pull from Mexico Arrivals"}
            </button>
          </div>
        </div>
        <GroupedSection
          lots={inboundLots}
          showFloorControls={false}
          ordersByLot={ordersByLot}
          addingOrderFor={addingOrderFor}
          orderDraft={orderDraft}
          onPatchLot={patchLot}
          onDeleteLot={handleDeleteLot}
          onMoveToFloor={handleMoveToFloor}
          onStartAddOrder={startAddOrder}
          onCancelAddOrder={() => setAddingOrderFor(null)}
          onOrderDraftChange={setOrderDraft}
          onSaveOrder={saveOrder}
          onDeleteOrder={handleDeleteOrder}
        />
        <button onClick={() => handleAddLot("inbound")} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
          + Add Lot
        </button>
      </section>

      {flaggedLots.length > 0 && (
        <section className="space-y-2">
          <h2 className="border-b-2 border-red-600 pb-1 text-lg font-bold text-red-700 dark:text-red-400">On Floor - Issues Flagged</h2>
          <GroupedSection
            lots={flaggedLots}
            showFloorControls
            ordersByLot={ordersByLot}
            addingOrderFor={addingOrderFor}
            orderDraft={orderDraft}
            onPatchLot={patchLot}
            onDeleteLot={handleDeleteLot}
            onMoveToFloor={handleMoveToFloor}
            onStartAddOrder={startAddOrder}
            onCancelAddOrder={() => setAddingOrderFor(null)}
            onOrderDraftChange={setOrderDraft}
            onSaveOrder={saveOrder}
            onDeleteOrder={handleDeleteOrder}
          />
        </section>
      )}
    </div>
  );
}
