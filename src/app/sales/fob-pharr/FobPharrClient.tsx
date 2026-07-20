"use client";

import { Fragment, useMemo, useState } from "react";
import type { FobFreightRate, FobItem, FobSection } from "@/lib/types";
import { escapeHtml, groupFobItems, type FobItemGroup as Group } from "@/lib/fobPricing";
import {
  addFobItem,
  addFreightRate,
  deleteFobItem,
  deleteFreightRate,
  updateFobItem,
  updateFreightRate,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function parseNum(value: string): number | null {
  if (value.trim() === "") return null;
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

function formatFob(n: number | null) {
  return n === null ? "" : `$${n.toFixed(2)}`;
}

const EMAIL_TITLE = "McAllen FOB Pricing";
const EMAIL_INTRO =
  "Please find our current price sheet attached for your review, If you have any questions or would like to discuss volume pricing or specific product needs please let us know!";

function buildEmailHeaderHtml() {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;margin-bottom:10px;background:#ffffff;">
      <tr><td style="text-align:center;font-size:18px;font-weight:bold;padding-bottom:8px;background:#ffffff;color:#000000;">${escapeHtml(EMAIL_TITLE)}</td></tr>
      <tr><td style="text-align:center;border:1px solid #000;padding:6px;font-size:12.5px;background:#ffffff;color:#000000;">${escapeHtml(EMAIL_INTRO)}</td></tr>
    </table>`;
}

function buildSectionHtml(title: string, headerBg: string, groups: Group[]) {
  const cell = "padding:3px 6px;border:1px solid #000;background:#ffffff;color:#000000;";
  const rows = groups
    .map(
      (g) => `
      <tr><td colspan="4" style="background:#f0f0f0;color:#000000;font-weight:bold;padding:4px 6px;border:1px solid #000;">${escapeHtml(g.name)}</td></tr>
      ${g.rows
        .map(
          (r) => `
        <tr>
          <td style="${cell}">${escapeHtml(r.variety ?? "")}</td>
          <td style="${cell}text-align:right;">${r.unit_per ?? ""}</td>
          <td style="${cell}">${escapeHtml(r.size ?? "")}</td>
          <td style="${cell}text-align:right;">${escapeHtml(formatFob(r.fob))}</td>
        </tr>`,
        )
        .join("")}`,
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #000;font-family:Calibri,Arial,sans-serif;font-size:12.5px;background:#ffffff;color:#000000;">
      <tr><td colspan="4" style="background:${headerBg};color:#000000;font-weight:bold;text-align:center;padding:6px;border:1px solid #000;">${escapeHtml(title)}</td></tr>
      <tr style="background:#dddddd;color:#000000;font-weight:bold;">
        <td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">Commodity</td>
        <td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">Unit Per</td>
        <td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">Size</td>
        <td style="padding:3px 6px;border:1px solid #000;background:#dddddd;color:#000000;">FOB</td>
      </tr>
      ${rows}
    </table>`;
}

function buildPlainText(title: string, groups: Group[]) {
  const lines = [title, "Commodity\tUnit Per\tSize\tFOB"];
  for (const g of groups) {
    lines.push(g.name);
    for (const r of g.rows) {
      lines.push(`${r.variety ?? ""}\t${r.unit_per ?? ""}\t${r.size ?? ""}\t${formatFob(r.fob)}`);
    }
  }
  return lines.join("\n");
}

function FreightRatesPanel({
  rates,
  onFieldSave,
  onAdd,
  onDelete,
}: {
  rates: FobFreightRate[];
  onFieldSave: (id: string, patch: Partial<Pick<FobFreightRate, "lane" | "ltl" | "ftl">>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Freight Rates</h2>
        <p className="text-xs text-black/40 dark:text-white/40">Reference only - stays until you change it</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Lane</th>
              <th className="px-2 py-2">LTL</th>
              <th className="px-2 py-2">FTL</th>
              <th className="px-2 py-2">$ / Pallet</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => {
              const perPallet = r.ftl !== null ? r.ftl / 24 : null;
              return (
                <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      defaultValue={r.lane}
                      onBlur={(e) => onFieldSave(r.id, { lane: e.target.value })}
                      className={`${field} font-medium`}
                    />
                  </td>
                  <td className="min-w-[6rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      defaultValue={r.ltl ?? ""}
                      onBlur={(e) => onFieldSave(r.id, { ltl: parseNum(e.target.value) })}
                      className={field}
                    />
                  </td>
                  <td className="min-w-[7rem] px-1 py-1">
                    <input
                      type="number"
                      step="any"
                      defaultValue={r.ftl ?? ""}
                      onBlur={(e) => onFieldSave(r.id, { ftl: parseNum(e.target.value) })}
                      className={field}
                    />
                  </td>
                  <td className="px-3 py-1 text-sm text-black/60 dark:text-white/60">
                    {perPallet !== null ? `$${perPallet.toFixed(2)}` : "-"}
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => onDelete(r.id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        onClick={onAdd}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
      >
        + Add Lane
      </button>
    </div>
  );
}

function FobItemsSection({
  title,
  section,
  items,
  onFieldSave,
  onGroupRename,
  onAdd,
  onDelete,
}: {
  title: string;
  section: FobSection;
  items: FobItem[];
  onFieldSave: (
    id: string,
    patch: Partial<Pick<FobItem, "commodity_group" | "variety" | "unit_per" | "size" | "fob">>,
  ) => void;
  onGroupRename: (section: FobSection, oldName: string, newName: string) => void;
  onAdd: (section: FobSection) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const groups = useMemo(() => groupFobItems(items, section), [items, section]);
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    try {
      await onAdd(section);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Commodity</th>
              <th className="px-2 py-2">Unit Per</th>
              <th className="px-2 py-2">Size</th>
              <th className="px-2 py-2">FOB</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.name}>
                <tr className="border-t border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
                  <td colSpan={5} className="px-2 py-1">
                    <input
                      defaultValue={g.name}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== g.name) onGroupRename(section, g.name, next);
                      }}
                      className="w-full bg-transparent px-1 py-0.5 text-sm font-bold text-black outline-none dark:text-white"
                    />
                  </td>
                </tr>
                {g.rows.map((item) => (
                  <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="min-w-[10rem] px-1 py-1">
                      <input
                        defaultValue={item.variety ?? ""}
                        onBlur={(e) => onFieldSave(item.id, { variety: e.target.value || null })}
                        className={field}
                      />
                    </td>
                    <td className="min-w-[5rem] px-1 py-1">
                      <input
                        type="number"
                        step="any"
                        defaultValue={item.unit_per ?? ""}
                        onBlur={(e) => onFieldSave(item.id, { unit_per: parseNum(e.target.value) })}
                        className={field}
                      />
                    </td>
                    <td className="min-w-[5rem] px-1 py-1">
                      <input
                        defaultValue={item.size ?? ""}
                        onBlur={(e) => onFieldSave(item.id, { size: e.target.value || null })}
                        className={field}
                      />
                    </td>
                    <td className="min-w-[6rem] px-1 py-1">
                      <input
                        type="number"
                        step="any"
                        defaultValue={item.fob ?? ""}
                        onBlur={(e) => onFieldSave(item.id, { fob: parseNum(e.target.value) })}
                        className={`${field} font-semibold`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => onDelete(item.id)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        onClick={handleAdd}
        disabled={adding}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {adding ? "Adding..." : "+ Add Item"}
      </button>
    </div>
  );
}

export default function FobPharrClient({
  initialItems,
  initialFreightRates,
}: {
  initialItems: FobItem[];
  initialFreightRates: FobFreightRate[];
}) {
  const [items, setItems] = useState(initialItems);
  const [rates, setRates] = useState(initialFreightRates);
  const [copied, setCopied] = useState(false);

  function updateLocalItem(id: string, patch: Partial<FobItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function handleItemFieldSave(
    id: string,
    patch: Partial<Pick<FobItem, "commodity_group" | "variety" | "unit_per" | "size" | "fob">>,
  ) {
    updateLocalItem(id, patch);
    updateFobItem(id, patch).catch(() => {});
  }

  function handleGroupRename(section: FobSection, oldName: string, newName: string) {
    const affected = items.filter((i) => i.section === section && i.commodity_group === oldName);
    setItems((prev) =>
      prev.map((i) =>
        i.section === section && i.commodity_group === oldName ? { ...i, commodity_group: newName } : i,
      ),
    );
    affected.forEach((i) => updateFobItem(i.id, { commodity_group: newName }).catch(() => {}));
  }

  async function handleAddItem(section: FobSection) {
    const sectionItems = items.filter((i) => i.section === section);
    const nextPosition = sectionItems.length > 0 ? Math.max(...sectionItems.map((i) => i.position)) + 1 : 1;
    const row = await addFobItem(section, nextPosition);
    setItems((prev) => [...prev, row as FobItem]);
  }

  async function handleDeleteItem(id: string) {
    if (!confirm("Delete this item?")) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await deleteFobItem(id).catch(() => {});
  }

  function updateLocalRate(id: string, patch: Partial<FobFreightRate>) {
    setRates((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function handleRateFieldSave(id: string, patch: Partial<Pick<FobFreightRate, "lane" | "ltl" | "ftl">>) {
    updateLocalRate(id, patch);
    updateFreightRate(id, patch).catch(() => {});
  }

  async function handleAddRate() {
    const nextPosition = rates.length > 0 ? Math.max(...rates.map((r) => r.position)) + 1 : 1;
    const row = await addFreightRate(nextPosition);
    setRates((prev) => [...prev, row as FobFreightRate]);
  }

  async function handleDeleteRate(id: string) {
    if (!confirm("Delete this lane?")) return;
    setRates((prev) => prev.filter((r) => r.id !== id));
    await deleteFreightRate(id).catch(() => {});
  }

  async function handleCopy() {
    const westernGroups = groupFobItems(items, "western_veg");
    const hotHouseGroups = groupFobItems(items, "hot_house");
    const html = `${buildEmailHeaderHtml()}<table cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr>
        <td valign="top" style="background:#ffffff;">${buildSectionHtml("Western Veg", "#8DC63F", westernGroups)}</td>
        <td style="width:24px;background:#ffffff;">&nbsp;</td>
        <td valign="top" style="background:#ffffff;">${buildSectionHtml("Hot House", "#FF3333", hotHouseGroups)}</td>
      </tr></table>`;
    const text = `${EMAIL_TITLE}\n\n${EMAIL_INTRO}\n\n${buildPlainText("Western Veg", westernGroups)}\n\n${buildPlainText("Hot House", hotHouseGroups)}`;

    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Could not copy to clipboard - your browser may not support it.");
    }
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-2xl font-bold">FOB Pricing</h1>

        <FreightRatesPanel
          rates={rates}
          onFieldSave={handleRateFieldSave}
          onAdd={handleAddRate}
          onDelete={handleDeleteRate}
        />

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">McAllen FOB Pricing</h2>
          <button
            onClick={handleCopy}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            {copied ? "Copied!" : "Copy Price Sheet"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <FobItemsSection
            title="Western Veg"
            section="western_veg"
            items={items}
            onFieldSave={handleItemFieldSave}
            onGroupRename={handleGroupRename}
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />
          <FobItemsSection
            title="Hot House"
            section="hot_house"
            items={items}
            onFieldSave={handleItemFieldSave}
            onGroupRename={handleGroupRename}
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />
        </div>
      </div>
    </div>
  );
}
