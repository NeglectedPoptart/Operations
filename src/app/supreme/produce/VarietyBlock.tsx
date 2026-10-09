"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import type { MxCommodity } from "@/lib/types";

// One variety of a commodity (e.g. Bell Peppers / 11lb) and its sizes
// (JBO, XLG, ...). Each size is its own selectable product in Arrivals, shown
// as "Commodity Variety Size".

const COMMON_SIZES = ["JBO", "XLG", "LGE", "MED", "SML"];
const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function isCh(size: string): boolean {
  const base = size.replace(/CH$/i, "");
  return /CH$/i.test(size) && COMMON_SIZES.includes(base.toUpperCase());
}

// JBO, XLG, LGE, MED, SML first, then other sizes, then the CH (choice) versions.
function sizeOrder(a: string, b: string): number {
  const rank = (s: string) => {
    const ch = isCh(s) ? 1 : 0;
    const base = ch ? s.replace(/CH$/i, "") : s;
    const idx = COMMON_SIZES.indexOf(base.toUpperCase());
    return { ch, idx: idx === -1 ? 99 : idx, text: base };
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra.ch !== rb.ch) return ra.ch - rb.ch;
  if (ra.idx !== rb.idx) return ra.idx - rb.idx;
  return ra.text.localeCompare(rb.text, undefined, { numeric: true });
}

function SizeChip({
  product,
  onRename,
  onDelete,
}: {
  product: MxCommodity;
  onRename: (product: MxCommodity, size: string) => void;
  onDelete: (product: MxCommodity) => void;
}) {
  const [text, setText] = useState(product.size ?? "");
  return (
    <span className="inline-flex items-center rounded-full border border-black/15 bg-black/[0.04] pl-2.5 pr-1 dark:border-white/20 dark:bg-white/10">
      <input
        value={text}
        size={Math.max(3, text.length)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const next = text.trim();
          if (!next) setText(product.size ?? "");
          else if (next !== product.size) onRename(product, next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        title="Click to rename"
        className="bg-transparent py-0.5 text-sm font-medium focus:outline-none"
      />
      <button onClick={() => onDelete(product)} title={`Remove ${product.size}`} className="ml-0.5 rounded-full px-1.5 text-sm text-black/40 hover:bg-red-100 hover:text-red-700 dark:text-white/40">
        ×
      </button>
    </span>
  );
}

export default function VarietyBlock({
  groupName,
  variety,
  rows,
  onRenameVariety,
  onDeleteVariety,
  onAddSizes,
  onRenameSize,
  onDeleteProduct,
}: {
  groupName: string;
  variety: string;
  // Every product row of this variety: sizes, and possibly a plain (no size) entry.
  rows: MxCommodity[];
  onRenameVariety: (oldVariety: string, newVariety: string) => void;
  onDeleteVariety: (variety: string) => void;
  onAddSizes: (variety: string, sizes: string[]) => Promise<void>;
  onRenameSize: (product: MxCommodity, size: string) => void;
  onDeleteProduct: (product: MxCommodity) => void;
}) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const sized = rows.filter((r) => r.size).sort((a, b) => sizeOrder(a.size!, b.size!));
  const plain = rows.find((r) => !r.size);
  const have = new Set(sized.map((r) => (r.size ?? "").toLowerCase()));
  const suggestions = COMMON_SIZES.filter((s) => !have.has(s.toLowerCase()));
  // Sizes that don't have their CH (choice) twin yet.
  const missingCh = sized.filter((r) => !isCh(r.size!) && COMMON_SIZES.includes(r.size!.toUpperCase()) && !have.has(`${r.size!.toLowerCase()}ch`));

  async function add(sizes: string[]) {
    const list = sizes.map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return;
    setBusy(true);
    try {
      await onAddSizes(variety, list);
      setDraft("");
    } catch {
      alert("Couldn't add those sizes - try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSize(p: MxCommodity) {
    if (!(await confirm(`Remove "${p.name}"? Existing arrivals keep their value, but it will not be selectable anymore.`))) return;
    onDeleteProduct(p);
  }

  return (
    <div className="space-y-1.5 rounded-md border border-black/10 p-2 dark:border-white/10">
      <div className="flex items-center gap-1.5">
        <input
          defaultValue={variety}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== variety) onRenameVariety(variety, next);
            else e.target.value = variety;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={`${field} font-medium`}
          title="Variety - click to rename"
        />
        <button
          onClick={async () => {
            if (await confirm(`Remove "${groupName} ${variety}" and all ${sized.length} of its sizes? Existing arrivals keep their value, but it will not be selectable anymore.`)) onDeleteVariety(variety);
          }}
          className="shrink-0 px-1 text-sm font-medium text-red-600 hover:text-red-700"
          title="Remove this variety and its sizes"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {sized.map((r) => (
          <SizeChip key={r.id} product={r} onRename={onRenameSize} onDelete={removeSize} />
        ))}
        {sized.length === 0 && <span className="text-xs italic text-black/40 dark:text-white/40">No sizes - selectable as &quot;{groupName} {variety}&quot;</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => add([s])}
            disabled={busy}
            className="rounded-full border border-dashed border-black/25 px-2 py-0.5 text-xs text-black/60 hover:border-green-600 hover:text-green-700 disabled:opacity-50 dark:border-white/25 dark:text-white/60"
          >
            + {s}
          </button>
        ))}
        {missingCh.length > 0 && (
          <button
            onClick={() => add(missingCh.map((r) => `${r.size}CH`))}
            disabled={busy}
            className="rounded-full border border-green-600 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
            title="Adds a CH (choice) version of each size"
          >
            + CH versions
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add(draft.split(/[,;\n]+/));
          }}
          placeholder="Add sizes: 20lb, 24ct Liner..."
          className={field}
        />
        <button
          onClick={() => add(draft.split(/[,;\n]+/))}
          disabled={busy || draft.trim() === ""}
          className="shrink-0 rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {busy ? "..." : "+ Add"}
        </button>
      </div>

      {plain && sized.length > 0 && (
        <p className="text-[11px] text-black/45 dark:text-white/45">
          &quot;{plain.name}&quot; on its own is hidden in Arrivals now that it has sizes.{" "}
          <button onClick={() => removeSize(plain)} className="text-red-600 hover:underline">
            Remove it
          </button>
        </p>
      )}
    </div>
  );
}
