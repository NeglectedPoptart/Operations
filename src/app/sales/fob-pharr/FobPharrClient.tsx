"use client";

import { Fragment, useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import UpdateStatusButton from "@/components/UpdateStatusButton";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { categoryForFobRow, gradeForFobRow, vendorAverageKeyForFobRow, type VendorAverage } from "@/lib/fobVendorCompare";
import { createClient } from "@/lib/supabase/client";
import type { FobFreightRate, FobItem, FobSection } from "@/lib/types";
import {
  buildWhatsAppSection,
  copyOrDownloadPng,
  escapeHtml,
  groupFobItems,
  type FobItemGroup as Group,
} from "@/lib/fobPricing";
import { buildCategoryBlocks, renderBrandedPriceSheetPng } from "@/lib/fobPriceSheetImage";
import { matchFobPriceLines, parseFobPriceEmail, type FobPriceMatch } from "@/lib/fobEmailParse";
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

const FOB_COLUMN_HEADERS = ["Commodity", "Unit Per", "Size", "FOB"];
function fobRowValues(item: FobItem) {
  return [item.variety ?? "", item.unit_per !== null ? String(item.unit_per) : "", item.size ?? "", formatFob(item.fob) || "-"];
}

function buildWhatsAppMessage(westernGroups: Group[], hotHouseGroups: Group[]) {
  const western = buildWhatsAppSection("WESTERN VEG", westernGroups, FOB_COLUMN_HEADERS, fobRowValues);
  const hotHouse = buildWhatsAppSection("HOT HOUSE", hotHouseGroups, FOB_COLUMN_HEADERS, fobRowValues);
  return `*${EMAIL_TITLE}*\n\n${EMAIL_INTRO}\n\n${western}\n\n${hotHouse}`;
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

function PriceEmailPanel({
  items,
  onApply,
}: {
  items: FobItem[];
  onApply: (id: string, fob: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<FobPriceMatch[] | null>(null);
  const [applied, setApplied] = useState(false);

  function handlePreview() {
    const parsed = parseFobPriceEmail(text);
    setPreview(matchFobPriceLines(parsed, items));
    setApplied(false);
  }

  function handleConfirm() {
    if (!preview) return;
    for (const line of preview) {
      for (const item of line.matches) {
        onApply(item.id, line.price);
      }
    }
    setApplied(true);
  }

  function handleCancel() {
    setPreview(null);
    setText("");
    setApplied(false);
  }

  const matchedCount = preview?.filter((p) => p.matches.length > 0).length ?? 0;
  const unmatchedLines = preview?.filter((p) => p.matches.length === 0) ?? [];

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Paste Pricing Email</h2>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          {open ? "Hide" : "Paste from Email"}
        </button>
      </div>
      {open && (
        <div className="space-y-3">
          <p className="text-sm text-black/60 dark:text-white/60">
            Paste the full morning pricing email below. Only lines that match a known item on this
            page will update - anything else is listed as not matched so you can update it by hand.
          </p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
              setApplied(false);
            }}
            rows={8}
            placeholder="Paste the pricing email text here..."
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
          />
          {!preview && (
            <button
              onClick={handlePreview}
              disabled={text.trim() === ""}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              Preview
            </button>
          )}
          {preview && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {matchedCount} price{matchedCount === 1 ? "" : "s"} matched
                {unmatchedLines.length > 0 ? `, ${unmatchedLines.length} not matched` : ""}.
              </p>
              <div className="max-h-72 overflow-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-black/5 text-left dark:bg-white/5">
                    <tr>
                      <th className="px-2 py-1">Category</th>
                      <th className="px-2 py-1">Label</th>
                      <th className="px-2 py-1">New Price</th>
                      <th className="px-2 py-1">Matched Item</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => (
                      <tr key={i} className="border-t border-black/10 dark:border-white/10">
                        <td className="px-2 py-1">{p.category}</td>
                        <td className="px-2 py-1">{p.label}</td>
                        <td className="px-2 py-1">{formatFob(p.price)}</td>
                        <td className="px-2 py-1">
                          {p.matches.length > 0 ? (
                            p.matches.map((m) => (
                              <div key={m.id}>
                                {m.commodity_group}
                                {m.variety ? ` - ${m.variety}` : ""}
                                {m.size ? ` (${m.size})` : ""}
                                <span className="text-black/40 dark:text-white/40">
                                  {" "}
                                  [{formatFob(m.fob)} → {formatFob(p.price)}]
                                </span>
                              </div>
                            ))
                          ) : (
                            <span className="text-red-600 dark:text-red-400">Not matched - skipped</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={matchedCount === 0 || applied}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {applied ? "Applied!" : `Apply ${matchedCount} price${matchedCount === 1 ? "" : "s"}`}
                </button>
                <button
                  onClick={handleCancel}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                >
                  {applied ? "Close" : "Cancel"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// "once we start uploading price sheets for that day and price lists has
// data to make an average" - shows nothing at all until there's at least
// one same-day vendor quote for the matching commodity, rather than
// comparing against stale or nonexistent data.
function FobVsVendorBadge({
  fob,
  commodityGroup,
  variety,
  vendorAverages,
}: {
  fob: number | null;
  commodityGroup: string;
  variety: string | null;
  vendorAverages: Record<string, VendorAverage>;
}) {
  if (fob === null) return null;
  const avg = vendorAverages[vendorAverageKeyForFobRow(commodityGroup, variety)];
  if (!avg) return null;

  const category = categoryForFobRow(commodityGroup, variety);
  const grade = gradeForFobRow(commodityGroup, variety);
  const label = grade ? `${category} ${grade}` : category;

  const pct = ((fob - avg.average) / avg.average) * 100;
  const over = pct >= 0;
  return (
    <span
      title={`Today's vendor average for ${label}: $${avg.average.toFixed(2)} across ${avg.count} quote${avg.count === 1 ? "" : "s"}`}
      className={`ml-1 whitespace-nowrap text-xs font-semibold ${
        over ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
      }`}
    >
      {over ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
    </span>
  );
}

function FobItemsSection({
  title,
  section,
  items,
  onFieldSave,
  onGroupRename,
  onAddItem,
  onMoveToCategory,
  onMoveWithinGroup,
  onDelete,
  vendorAverages,
}: {
  title: string;
  section: FobSection;
  items: FobItem[];
  onFieldSave: (
    id: string,
    patch: Partial<Pick<FobItem, "commodity_group" | "variety" | "unit_per" | "size" | "fob" | "position">>,
  ) => void;
  onGroupRename: (section: FobSection, oldName: string, newName: string) => void;
  onAddItem: (section: FobSection, category: string, isNewCategory: boolean) => Promise<void>;
  onMoveToCategory: (item: FobItem, category: string, isNewCategory: boolean) => void;
  onMoveWithinGroup: (item: FobItem, direction: "up" | "down") => void;
  onDelete: (id: string) => void;
  vendorAverages: Record<string, VendorAverage>;
}) {
  const groups = useMemo(() => groupFobItems(items, section), [items, section]);
  const categoryNames = useMemo(() => groups.map((g) => g.name), [groups]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addCategory, setAddCategory] = useState("__new__");
  const [addNewCategoryName, setAddNewCategoryName] = useState("");
  // Which row is mid-way through typing a brand-new category name after
  // picking "+ New Category..." from its own dropdown.
  const [recategorizing, setRecategorizing] = useState<{ itemId: string; name: string } | null>(null);

  async function handleAddSave() {
    const isNewCategory = addCategory === "__new__";
    const category = isNewCategory ? addNewCategoryName.trim() : addCategory;
    if (!category) {
      alert("Enter a category name.");
      return;
    }
    setSaving(true);
    try {
      await onAddItem(section, category, isNewCategory);
      setAddCategory("__new__");
      setAddNewCategoryName("");
      setAdding(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCategorySelect(item: FobItem, value: string) {
    if (value === "__new__") {
      setRecategorizing({ itemId: item.id, name: "" });
    } else if (value !== item.commodity_group) {
      onMoveToCategory(item, value, false);
    }
  }

  function handleConfirmNewCategory() {
    if (!recategorizing) return;
    const name = recategorizing.name.trim();
    if (!name) return;
    const item = items.find((i) => i.id === recategorizing.itemId);
    if (item) onMoveToCategory(item, name, true);
    setRecategorizing(null);
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Category</th>
              <th className="px-2 py-2">Commodity</th>
              <th className="px-2 py-2">Unit Per</th>
              <th className="px-2 py-2">Size</th>
              <th className="px-2 py-2">FOB</th>
              <th className="w-16 px-2 py-2" />
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.name}>
                <tr className="border-t border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
                  <td colSpan={7} className="px-2 py-1">
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
                {g.rows.map((item, idx) => (
                  <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                    <td className="min-w-[9rem] px-1 py-1">
                      {recategorizing?.itemId === item.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={recategorizing.name}
                            onChange={(e) => setRecategorizing({ itemId: item.id, name: e.target.value })}
                            placeholder="New category"
                            className={field}
                          />
                          <button
                            type="button"
                            onClick={handleConfirmNewCategory}
                            className="text-xs font-semibold text-green-600 hover:underline"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setRecategorizing(null)}
                            className="text-xs font-semibold text-black/40 hover:underline dark:text-white/40"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <select
                          value={item.commodity_group}
                          onChange={(e) => handleCategorySelect(item, e.target.value)}
                          className={field}
                        >
                          {categoryNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                          <option value="__new__">+ New Category…</option>
                        </select>
                      )}
                    </td>
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
                    <td className="min-w-[8rem] px-1 py-1">
                      <div className="flex items-center">
                        <input
                          type="number"
                          step="any"
                          defaultValue={item.fob ?? ""}
                          onBlur={(e) => onFieldSave(item.id, { fob: parseNum(e.target.value) })}
                          className={`${field} font-semibold`}
                        />
                        <FobVsVendorBadge
                          fob={item.fob}
                          commodityGroup={item.commodity_group}
                          variety={item.variety}
                          vendorAverages={vendorAverages}
                        />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => onMoveWithinGroup(item, "up")}
                        disabled={idx === 0}
                        title="Move up"
                        className="px-1 text-black/40 hover:text-black disabled:opacity-30 dark:text-white/40 dark:hover:text-white"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveWithinGroup(item, "down")}
                        disabled={idx === g.rows.length - 1}
                        title="Move down"
                        className="px-1 text-black/40 hover:text-black disabled:opacity-30 dark:text-white/40 dark:hover:text-white"
                      >
                        ▼
                      </button>
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
                <td colSpan={7} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          + Add Item
        </button>
      </div>
      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-green-500/50 bg-green-50/50 p-2 dark:bg-green-950/10">
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="font-medium">Category</span>
            <select
              value={addCategory}
              onChange={(e) => setAddCategory(e.target.value)}
              className={`${field} w-48`}
            >
              <option value="__new__">+ New Category</option>
              {categoryNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {addCategory === "__new__" && (
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="font-medium">New category name</span>
              <input
                value={addNewCategoryName}
                onChange={(e) => setAddNewCategoryName(e.target.value)}
                placeholder="e.g. Green Beans"
                className={`${field} w-48`}
              />
            </label>
          )}
          <button
            onClick={handleAddSave}
            disabled={saving}
            className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {saving ? "Adding..." : "Add Item"}
          </button>
          <button
            onClick={() => setAdding(false)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default function FobPharrClient({
  initialDate,
  initialItems,
  initialFreightRates,
  vendorAverages,
  isAdmin,
}: {
  initialDate: string;
  initialItems: FobItem[];
  initialFreightRates: FobFreightRate[];
  vendorAverages: Record<string, VendorAverage>;
  isAdmin: boolean;
}) {
  const confirm = useConfirm();
  // Each calendar day is its own full set of fob_items rows (see
  // src/lib/fobDaily.ts) - cache keyed by entry_date, same day-navigation
  // pattern as QC Agenda. Today's row is seeded server-side; every other
  // day is fetched client-side the first time it's opened.
  const [date, setDate] = useState(initialDate);
  const [cache, setCache] = useState<Record<string, FobItem[]>>(() => ({ [initialDate]: initialItems }));
  const [rates, setRates] = useState(initialFreightRates);
  const [copied, setCopied] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);

  const items = cache[date] ?? [];
  const loading = !(date in cache);
  const isToday = date === todayISO();

  function loadDate(target: string) {
    setDate(target);
    if (target in cache) return;

    const supabase = createClient();
    supabase
      .from("fob_items")
      .select("*")
      .eq("entry_date", target)
      .order("section", { ascending: true })
      .order("position", { ascending: true })
      .then(({ data }) => {
        setCache((prev) => ({ ...prev, [target]: (data ?? []) as FobItem[] }));
      });
  }

  function patchItems(updater: (items: FobItem[]) => FobItem[]) {
    setCache((prev) => ({ ...prev, [date]: updater(prev[date] ?? []) }));
  }

  function updateLocalItem(id: string, patch: Partial<FobItem>) {
    patchItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function handleItemFieldSave(
    id: string,
    patch: Partial<Pick<FobItem, "commodity_group" | "variety" | "unit_per" | "size" | "fob" | "position">>,
  ) {
    updateLocalItem(id, patch);
    updateFobItem(id, patch).catch(() => {});
  }

  function handleGroupRename(section: FobSection, oldName: string, newName: string) {
    const affected = items.filter((i) => i.section === section && i.commodity_group === oldName);
    patchItems((prev) =>
      prev.map((i) =>
        i.section === section && i.commodity_group === oldName ? { ...i, commodity_group: newName } : i,
      ),
    );
    affected.forEach((i) => updateFobItem(i.id, { commodity_group: newName }).catch(() => {}));
  }

  // A new item can join an existing category (appended to the end of that
  // group) or start a brand-new one (lands at the bottom of the section).
  // groupFobItems sorts by position, so this is what actually renders, not
  // just insertion order.
  async function handleAddItem(section: FobSection, category: string, isNewCategory: boolean) {
    const sectionItems = items.filter((i) => i.section === section);
    const position = isNewCategory
      ? Math.max(-1, ...sectionItems.map((i) => i.position)) + 1
      : Math.max(-1, ...sectionItems.filter((i) => i.commodity_group === category).map((i) => i.position)) + 1;
    const row = await addFobItem(section, position, category, date);
    patchItems((prev) => [...prev, row as FobItem]);
  }

  // Moving a row into a different category re-parents it - groupFobItems
  // only cares about commodity_group matching, so position just needs to
  // land it somewhere sensible (end of the target group, or the bottom of
  // the section for a brand-new one), not touch any other row.
  function handleMoveItemToCategory(item: FobItem, category: string, isNewCategory: boolean) {
    const sectionItems = items.filter((i) => i.section === item.section && i.id !== item.id);
    const position = isNewCategory
      ? Math.max(-1, ...sectionItems.map((i) => i.position)) + 1
      : Math.max(-1, ...sectionItems.filter((i) => i.commodity_group === category).map((i) => i.position)) + 1;
    handleItemFieldSave(item.id, { commodity_group: category, position });
  }

  function handleMoveItemWithinGroup(item: FobItem, direction: "up" | "down") {
    const siblings = items
      .filter((i) => i.section === item.section && i.commodity_group === item.commodity_group)
      .sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex((i) => i.id === item.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    handleItemFieldSave(item.id, { position: other.position });
    handleItemFieldSave(other.id, { position: item.position });
  }

  async function handleDeleteItem(id: string) {
    if (!(await confirm("Delete this item?"))) return;
    patchItems((prev) => prev.filter((i) => i.id !== id));
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
    if (!(await confirm("Delete this lane?"))) return;
    setRates((prev) => prev.filter((r) => r.id !== id));
    await deleteFreightRate(id).catch(() => {});
  }

  function buildFullHtml() {
    const westernGroups = groupFobItems(items, "western_veg");
    const hotHouseGroups = groupFobItems(items, "hot_house");
    return `${buildEmailHeaderHtml()}<table cellpadding="0" cellspacing="0" style="background:#ffffff;"><tr>
        <td valign="top" style="background:#ffffff;">${buildSectionHtml("Western Veg", "#8DC63F", westernGroups)}</td>
        <td style="width:24px;background:#ffffff;">&nbsp;</td>
        <td valign="top" style="background:#ffffff;">${buildSectionHtml("Hot House", "#FF3333", hotHouseGroups)}</td>
      </tr></table>`;
  }

  async function handleCopy() {
    const westernGroups = groupFobItems(items, "western_veg");
    const hotHouseGroups = groupFobItems(items, "hot_house");
    const html = buildFullHtml();
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

  async function handleCopyWhatsApp() {
    const westernGroups = groupFobItems(items, "western_veg");
    const hotHouseGroups = groupFobItems(items, "hot_house");
    const text = buildWhatsAppMessage(westernGroups, hotHouseGroups);

    try {
      await navigator.clipboard.writeText(text);
      setCopiedWhatsApp(true);
      setTimeout(() => setCopiedWhatsApp(false), 2000);
    } catch {
      alert("Could not copy to clipboard - your browser may not support it.");
    }
  }

  async function handleCopyImage() {
    try {
      const westernGroups = groupFobItems(items, "western_veg");
      const hotHouseGroups = groupFobItems(items, "hot_house");
      const priceValues = (item: FobItem) => [formatFob(item.fob) ? `$${formatFob(item.fob)}` : "CALL"];
      const blocks = [
        ...buildCategoryBlocks(westernGroups, priceValues),
        ...buildCategoryBlocks(hotHouseGroups, priceValues),
      ];
      const blob = await renderBrandedPriceSheetPng({
        badgeText: "Texas F.O.B.",
        priceColumns: ["FOB"],
        subtitle: EMAIL_INTRO,
        blocks,
      });
      const result = await copyOrDownloadPng(blob, "mcallen-fob-pricing.png");
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  // vendorAverages is only computed server-side for today's vendor price
  // sheets - comparing a past day's FOB price against today's average
  // wouldn't mean anything, so the badge is hidden while browsing history.
  const visibleVendorAverages = isToday ? vendorAverages : {};

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen lg:mx-[calc(7.5rem-50vw)] lg:w-[calc(100vw-15rem)] px-4 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-2xl font-bold">FOB Pricing</h1>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadDate(addDays(date, -1))}
            className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
          >
            ← Prev Day
          </button>
          <span className="text-sm font-medium">
            {formatDate(date)} {isToday && <span className="text-green-600">(today)</span>}
          </span>
          <button
            onClick={() => loadDate(addDays(date, 1))}
            className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
          >
            Next Day →
          </button>
          {!isToday && (
            <button onClick={() => loadDate(todayISO())} className="text-sm font-medium text-green-600 hover:underline">
              Back to today
            </button>
          )}
          {loading && <span className="text-xs text-black/40">loading…</span>}
        </div>

        {!isToday && (
          <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Viewing {formatDate(date)}&apos;s pricing - a look back at history, not today&apos;s live sheet.
          </p>
        )}

        {isToday && <UpdateStatusButton pageKey="fob-pharr" canEdit={isAdmin} />}

        {isToday && <PriceEmailPanel items={items} onApply={(id, fob) => handleItemFieldSave(id, { fob })} />}

        <FreightRatesPanel
          rates={rates}
          onFieldSave={handleRateFieldSave}
          onAdd={handleAddRate}
          onDelete={handleDeleteRate}
        />

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">McAllen FOB Pricing</h2>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              {copied ? "Copied!" : "Copy Price Sheet"}
            </button>
            <button
              onClick={handleCopyWhatsApp}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              {copiedWhatsApp ? "Copied!" : "Copy for WhatsApp"}
            </button>
            <button
              onClick={handleCopyImage}
              className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
            >
              {imageStatus ?? "Copy as Image"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <FobItemsSection
            title="Western Veg"
            section="western_veg"
            items={items}
            onFieldSave={handleItemFieldSave}
            onGroupRename={handleGroupRename}
            onAddItem={handleAddItem}
            onMoveToCategory={handleMoveItemToCategory}
            onMoveWithinGroup={handleMoveItemWithinGroup}
            onDelete={handleDeleteItem}
            vendorAverages={visibleVendorAverages}
          />
          <FobItemsSection
            title="Hot House"
            section="hot_house"
            items={items}
            onFieldSave={handleItemFieldSave}
            onGroupRename={handleGroupRename}
            onAddItem={handleAddItem}
            onMoveToCategory={handleMoveItemToCategory}
            onMoveWithinGroup={handleMoveItemWithinGroup}
            onDelete={handleDeleteItem}
            vendorAverages={visibleVendorAverages}
          />
        </div>
      </div>
    </div>
  );
}
