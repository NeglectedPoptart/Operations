"use client";

import { Fragment, useMemo, useState } from "react";
import type { SrInventoryLot, SrItem } from "@/lib/types";

const field = "rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// Columns the reference produce-ERP screen has that our schema can't back
// yet (no On Alert threshold, Hold reason, or warehouse-attributed Order/
// In Transit/Shipped quantities) - shown as placeholders so the shape/
// density matches, rather than silently dropping them.
const PLACEHOLDER_COLUMNS = ["On Alert", "Hold", "In.T", "Order", "Shipped", "Qty", "Price", "Amount"];

interface GradeRow {
  grade: string;
  phys: number;
  avl: number;
  rec: number;
}

interface DeskGroup {
  key: string;
  warehouse: string;
  commodity: string;
  variety: string;
  packStyle: string;
  size: string;
  grades: GradeRow[];
  subPhys: number;
  subAvl: number;
  subRec: number;
}

function buildDeskGroups(lots: SrInventoryLot[], items: SrItem[]): DeskGroup[] {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const groups = new Map<string, DeskGroup>();

  for (const lot of lots) {
    const item = lot.item_id ? itemById.get(lot.item_id) : undefined;
    const warehouse = (lot.warehouse ?? "").trim() || "Unassigned";
    const commodity = item?.commodity?.trim() || item?.name || "Unassigned Item";
    const variety = item?.variety?.trim() || "-";
    const packStyle = item?.pack_style?.trim() || "-";
    const size = item?.size?.trim() || "-";
    const grade = item?.grade?.trim() || "-";

    const groupKey = [warehouse, commodity, variety, packStyle, size].join("|");
    let group = groups.get(groupKey);
    if (!group) {
      group = { key: groupKey, warehouse, commodity, variety, packStyle, size, grades: [], subPhys: 0, subAvl: 0, subRec: 0 };
      groups.set(groupKey, group);
    }

    let gradeRow = group.grades.find((g) => g.grade === grade);
    if (!gradeRow) {
      gradeRow = { grade, phys: 0, avl: 0, rec: 0 };
      group.grades.push(gradeRow);
    }

    const phys = lot.qty_on_hand ?? 0;
    const rec = lot.qty_received ?? 0;
    gradeRow.phys += phys;
    gradeRow.rec += rec;
    group.subPhys += phys;
    group.subRec += rec;
    if (lot.status === "available") {
      gradeRow.avl += phys;
      group.subAvl += phys;
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) =>
      a.warehouse.localeCompare(b.warehouse) ||
      a.commodity.localeCompare(b.commodity) ||
      a.variety.localeCompare(b.variety) ||
      a.packStyle.localeCompare(b.packStyle) ||
      a.size.localeCompare(b.size),
  );
}

export default function WarehouseDeskTable({ lots, items }: { lots: SrInventoryLot[]; items: SrItem[] }) {
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [search, setSearch] = useState("");

  const warehouses = useMemo(() => {
    const set = new Set(lots.map((l) => (l.warehouse ?? "").trim() || "Unassigned"));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [lots]);

  const groups = useMemo(() => {
    const all = buildDeskGroups(lots, items);
    const term = search.trim().toLowerCase();
    return all.filter((g) => {
      if (warehouseFilter && g.warehouse !== warehouseFilter) return false;
      if (!term) return true;
      return [g.commodity, g.variety, g.packStyle, g.size].some((v) => v.toLowerCase().includes(term));
    });
  }, [lots, items, warehouseFilter, search]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-black/60 dark:text-white/60">
          Warehouse
          <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className={`${field} mt-0.5 block`}>
            <option value="">All Warehouses</option>
            {warehouses.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-black/60 dark:text-white/60">
          Dynamic Filter
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Commodity, variety, pack style, size..."
            className={`${field} mt-0.5 block w-64`}
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full whitespace-nowrap text-xs">
          <thead className="bg-green-50 text-left dark:bg-green-950/30">
            <tr>
              <th className="px-2 py-2">Whse</th>
              <th className="px-2 py-2">Comm</th>
              <th className="px-2 py-2">Var</th>
              <th className="px-2 py-2">PStyle</th>
              <th className="px-2 py-2">Size</th>
              <th className="px-2 py-2">Grade</th>
              <th className="px-2 py-2 text-right">Phys</th>
              <th className="px-2 py-2 text-right">Rec</th>
              {PLACEHOLDER_COLUMNS.map((c) => (
                <th key={c} className="px-2 py-2 text-right text-black/30 dark:text-white/30">
                  {c}
                </th>
              ))}
              <th className="bg-green-100 px-2 py-2 text-right dark:bg-green-900/40">Avl</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.key}>
                {group.grades.map((g, i) => (
                  <tr key={`${group.key}:${g.grade}`} className="border-t border-black/10 dark:border-white/10">
                    <td className="px-2 py-1.5">{i === 0 ? group.warehouse : ""}</td>
                    <td className="px-2 py-1.5">{i === 0 ? group.commodity : ""}</td>
                    <td className="px-2 py-1.5">{i === 0 ? group.variety : ""}</td>
                    <td className="px-2 py-1.5">{i === 0 ? group.packStyle : ""}</td>
                    <td className="px-2 py-1.5">{i === 0 ? group.size : ""}</td>
                    <td className="px-2 py-1.5">{g.grade}</td>
                    <td className="px-2 py-1.5 text-right">{g.phys.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{g.rec.toLocaleString()}</td>
                    {PLACEHOLDER_COLUMNS.map((c) => (
                      <td key={c} className="px-2 py-1.5 text-right text-black/25 dark:text-white/25">
                        —
                      </td>
                    ))}
                    <td className="bg-green-50/60 px-2 py-1.5 text-right font-medium dark:bg-green-950/20">
                      {g.avl.toLocaleString()}
                    </td>
                  </tr>
                ))}
                <tr key={`${group.key}:sub`} className="border-t border-black/10 bg-black/[0.03] font-semibold dark:border-white/10 dark:bg-white/[0.04]">
                  <td className="px-2 py-1.5" colSpan={5} />
                  <td className="px-2 py-1.5">Sub</td>
                  <td className="px-2 py-1.5 text-right">{group.subPhys.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right">{group.subRec.toLocaleString()}</td>
                  {PLACEHOLDER_COLUMNS.map((c) => (
                    <td key={c} className="px-2 py-1.5" />
                  ))}
                  <td className="bg-green-100 px-2 py-1.5 text-right dark:bg-green-900/40">{group.subAvl.toLocaleString()}</td>
                </tr>
              </Fragment>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={7 + PLACEHOLDER_COLUMNS.length} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No inventory matches this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-black/40 dark:text-white/40">
        On Alert, Hold, In Transit, Order, Shipped, Qty, Price, and Amount are placeholders for now - linking these to
        real Purchase/Sales Order data is next.
      </p>
    </div>
  );
}
