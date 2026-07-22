"use client";

import { useMemo, useState } from "react";
import { isBellPepper, parseColdInventoryPaste, type ParsedColdInventoryItem } from "@/lib/coldInventoryParse";
import type { ColdInventoryItem, ColdInventoryStatus } from "@/lib/types";
import { importColdInventory, updateColdInventoryNotes, updateColdInventoryStatus } from "./actions";

const STATUS_CYCLE: (ColdInventoryStatus | null)[] = [null, "good", "issue", "dump"];

function nextStatus(current: ColdInventoryStatus | null): ColdInventoryStatus | null {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

function cellClasses(status: ColdInventoryStatus | null): string {
  switch (status) {
    case "good":
      return "bg-green-100 text-green-900 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-200";
    case "issue":
      return "bg-red-100 text-red-900 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-200";
    case "dump":
      return "bg-purple-100 text-purple-900 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-200";
    default:
      return "bg-white text-black hover:bg-black/5 dark:bg-white/5 dark:text-white/80 dark:hover:bg-white/10";
  }
}

function statusLabel(status: ColdInventoryStatus | null): string {
  if (status === "good") return "Good";
  if (status === "issue") return "Issue";
  if (status === "dump") return "Dump";
  return "Unmarked";
}

interface ColumnGroup {
  commodity: string;
  sizes: { size: string; key: string }[];
}

function buildColumnGroups(items: ColdInventoryItem[]): ColumnGroup[] {
  const groups = new Map<string, ColumnGroup>();
  const order: string[] = [];
  const sorted = [...items].sort((a, b) => a.column_order - b.column_order);
  for (const item of sorted) {
    if (!groups.has(item.commodity)) {
      groups.set(item.commodity, { commodity: item.commodity, sizes: [] });
      order.push(item.commodity);
    }
    const group = groups.get(item.commodity)!;
    if (!group.sizes.some((s) => s.size === item.size)) {
      group.sizes.push({ size: item.size, key: `${item.commodity}::${item.size}` });
    }
  }
  return order.map((c) => groups.get(c)!);
}

function buildManifestList(items: ColdInventoryItem[]): string[] {
  const orderByManifest = new Map<string, number>();
  for (const item of items) {
    if (!orderByManifest.has(item.manifest)) orderByManifest.set(item.manifest, item.manifest_order);
  }
  return Array.from(orderByManifest.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([manifest]) => manifest);
}

function InventorySection({
  title,
  items,
  onCycleStatus,
}: {
  title: string;
  items: ColdInventoryItem[];
  onCycleStatus: (item: ColdInventoryItem) => void;
}) {
  const columnGroups = useMemo(() => buildColumnGroups(items), [items]);
  const manifests = useMemo(() => buildManifestList(items), [items]);
  const cellByKey = useMemo(() => {
    const map = new Map<string, ColdInventoryItem>();
    for (const item of items) map.set(`${item.manifest}::${item.commodity}::${item.size}`, item);
    return map;
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{title}</h2>
        <p className="text-sm text-black/40 dark:text-white/40">Nothing in this section.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-10 bg-black/5 px-2 py-2 align-bottom dark:bg-neutral-900">
                Manifest
              </th>
              {columnGroups.map((g) => (
                <th
                  key={g.commodity}
                  colSpan={g.sizes.length}
                  className="whitespace-nowrap border-l border-black/10 px-2 py-1.5 text-center dark:border-white/10"
                >
                  {g.commodity}
                </th>
              ))}
            </tr>
            <tr>
              {columnGroups.map((g) =>
                g.sizes.map((s) => (
                  <th
                    key={s.key}
                    className="whitespace-nowrap border-l border-black/10 px-2 py-1 text-center font-normal text-black/60 dark:border-white/10 dark:text-white/60"
                  >
                    {s.size}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {manifests.map((manifest) => (
              <tr key={manifest} className="border-t border-black/10 dark:border-white/10">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-1 font-medium dark:bg-neutral-950">
                  {manifest}
                </td>
                {columnGroups.map((g) =>
                  g.sizes.map((s) => {
                    const item = cellByKey.get(`${manifest}::${s.key}`);
                    if (!item) {
                      return (
                        <td
                          key={s.key}
                          className="border-l border-black/10 px-2 py-1 text-center text-black/20 dark:border-white/10 dark:text-white/20"
                        >
                          -
                        </td>
                      );
                    }
                    return (
                      <td key={s.key} className="border-l border-black/10 p-0 dark:border-white/10">
                        <button
                          type="button"
                          onClick={() => onCycleStatus(item)}
                          title={statusLabel(item.status)}
                          className={`h-full w-full px-2 py-1 text-center font-medium transition ${cellClasses(item.status)}`}
                        >
                          {item.qty.toLocaleString()}
                        </button>
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FlaggedItemsTable({
  items,
  onCycleStatus,
  onNotesSave,
}: {
  items: ColdInventoryItem[];
  onCycleStatus: (item: ColdInventoryItem) => void;
  onNotesSave: (id: string, notes: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-red-300 bg-red-50/50 p-4 dark:border-red-800 dark:bg-red-950/20">
      <h2 className="text-sm font-bold text-red-700 dark:text-red-400">
        Flagged Items ({items.length})
      </h2>
      <div className="overflow-x-auto rounded border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-1.5">Manifest</th>
              <th className="px-2 py-1.5">Commodity</th>
              <th className="px-2 py-1.5">Size</th>
              <th className="px-2 py-1.5">Qty</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-2 py-1 font-medium">{item.manifest}</td>
                <td className="px-2 py-1">{item.commodity}</td>
                <td className="px-2 py-1">{item.size}</td>
                <td className="px-2 py-1">{item.qty.toLocaleString()}</td>
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => onCycleStatus(item)}
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${cellClasses(item.status)}`}
                  >
                    {statusLabel(item.status)}
                  </button>
                </td>
                <td className="min-w-[14rem] px-1 py-1">
                  <input
                    defaultValue={item.notes ?? ""}
                    onBlur={(e) => onNotesSave(item.id, e.target.value)}
                    placeholder="Notes..."
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ColdInventoryClient({ initialItems }: { initialItems: ColdInventoryItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [showPaste, setShowPaste] = useState(initialItems.length === 0);
  const [pasteText, setPasteText] = useState("");
  const [previewItems, setPreviewItems] = useState<ParsedColdInventoryItem[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const bellPepperItems = useMemo(() => items.filter((i) => isBellPepper(i.commodity)), [items]);
  const otherItems = useMemo(() => items.filter((i) => !isBellPepper(i.commodity)), [items]);
  const flaggedItems = useMemo(
    () =>
      items
        .filter((i) => i.status === "issue" || i.status === "dump")
        .sort((a, b) => a.manifest_order - b.manifest_order || a.column_order - b.column_order),
    [items],
  );

  function handlePreview() {
    const result = parseColdInventoryPaste(pasteText);
    if (result.error) {
      setParseError(result.error);
      setPreviewItems(null);
      return;
    }
    setParseError(null);
    setPreviewItems(result.items);
  }

  async function handleConfirmImport() {
    if (!previewItems) return;
    setImporting(true);
    try {
      const result = await importColdInventory(previewItems);
      setItems(result);
      setPreviewItems(null);
      setPasteText("");
      setShowPaste(false);
    } finally {
      setImporting(false);
    }
  }

  function handleCancelPreview() {
    setPreviewItems(null);
    setParseError(null);
  }

  function handleCycleStatus(item: ColdInventoryItem) {
    const status = nextStatus(item.status);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)));
    updateColdInventoryStatus(item.id, status).catch(() => {});
  }

  function handleNotesSave(id: string, notes: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, notes } : i)));
    updateColdInventoryNotes(id, notes).catch(() => {});
  }

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Cold Inventory</h1>
          <button
            onClick={() => setShowPaste((s) => !s)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {showPaste ? "Hide paste box" : "Paste from Excel"}
          </button>
        </div>

        {showPaste && (
          <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
            <p className="text-sm text-black/60 dark:text-white/60">
              Copy the full pivot report from Excel (both header rows, every manifest) and paste below.
              This replaces the entire current inventory - anything not in the new paste is removed, but
              Good/Issue/Dump status and notes carry over for items that reappear.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setPreviewItems(null);
                setParseError(null);
              }}
              rows={6}
              placeholder="Paste tab-separated rows from Excel here..."
              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-black"
            />
            {parseError && <p className="text-sm text-red-600">{parseError}</p>}

            {!previewItems && (
              <button
                onClick={handlePreview}
                disabled={pasteText.trim() === ""}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                Preview
              </button>
            )}

            {previewItems && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Found {previewItems.length} line item{previewItems.length === 1 ? "" : "s"}:
                </p>
                <div className="max-h-64 overflow-auto rounded border border-black/10 dark:border-white/10">
                  <table className="w-full text-xs">
                    <thead className="bg-black/5 text-left dark:bg-white/5">
                      <tr>
                        <th className="px-2 py-1">Manifest</th>
                        <th className="px-2 py-1">Commodity</th>
                        <th className="px-2 py-1">Size</th>
                        <th className="px-2 py-1">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewItems.map((r, i) => (
                        <tr key={i} className="border-t border-black/10 dark:border-white/10">
                          <td className="px-2 py-1">{r.manifest}</td>
                          <td className="px-2 py-1">{r.commodity}</td>
                          <td className="px-2 py-1">{r.size}</td>
                          <td className="px-2 py-1">{r.qty.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmImport}
                    disabled={importing}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    {importing ? "Importing..." : `Confirm Import (replaces current inventory)`}
                  </button>
                  <button
                    onClick={handleCancelPreview}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <FlaggedItemsTable items={flaggedItems} onCycleStatus={handleCycleStatus} onNotesSave={handleNotesSave} />

        {items.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">
            No inventory yet - paste in the cold storage report from Excel above.
          </p>
        ) : (
          <div className="space-y-8">
            <InventorySection title="Bell Peppers" items={bellPepperItems} onCycleStatus={handleCycleStatus} />
            <InventorySection title="Everything Else" items={otherItems} onCycleStatus={handleCycleStatus} />
          </div>
        )}
      </div>
    </div>
  );
}
