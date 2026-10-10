"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  createCommodity,
  deleteCommodity,
  renameCommodityGroup,
  updateCommodityGroupTemps,
  addCommoditySizes,
  deleteCommodityVariety,
  renameCommoditySize,
  renameCommodityVariety,
} from "@/app/mexico/growers/actions";
import type { CartonType, MxCommodity } from "@/lib/types";
import { addCartonType, deleteCartonType, renameCartonType, type ProductLabel } from "./actions";
import LabelsPanel from "./LabelsPanel";
import VarietyBlock from "./VarietyBlock";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// The carton's name, editable in place: type a new name and press Enter or
// click away. Everything that uses the carton keeps it (they refer to it by
// id), so only the label changes.
function CartonNameCell({ item, onRename }: { item: CartonType; onRename: (id: string, name: string) => Promise<void> }) {
  const [text, setText] = useState(item.name);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const name = text.trim();
    if (name === item.name) return;
    if (!name) {
      setText(item.name);
      return;
    }
    setSaving(true);
    try {
      await onRename(item.id, name);
    } catch {
      alert(`Couldn't rename it to "${name}" - a carton type with that name may already exist.`);
      setText(item.name);
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      value={text}
      disabled={saving}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(item.name);
          e.currentTarget.blur();
        }
      }}
      className="w-full min-w-[12rem] rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-gray-300 focus:border-green-600 focus:bg-white focus:text-black focus:outline-none"
    />
  );
}

// Position-ordered add/delete list - same shape as Repack Inventory's item
// list (src/app/warehouse/repack-inventory/RepackInventoryClient.tsx).
function CartonTypesPanel({
  items,
  onAdd,
  onDelete,
  onRename,
}: {
  items: CartonType[];
  onAdd: (name: string) => Promise<void>;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const confirm = useConfirm();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await onAdd(name);
      setNewName("");
    } catch {
      alert(`Couldn't add "${name}" - a carton type with that name may already exist.`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!(await confirm(`Delete "${name}"? Arrivals already using it keep their carton, but it will no longer be selectable.`))) return;
    onDelete(id);
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Carton Types</h2>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Name</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-2 py-1">
                  <CartonNameCell item={c} onRename={onRename} />
                </td>
                <td className="px-2 py-1.5">
                  <button onClick={() => handleDelete(c.id, c.name)} className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={2} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No carton types yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add a carton type..."
          className={`${field} max-w-xs`}
        />
        <button
          onClick={handleAdd}
          disabled={adding || newName.trim() === ""}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {adding ? "Adding..." : "+ Add"}
        </button>
      </div>
    </div>
  );
}

interface VarietyActions {
  onRenameVariety: (groupName: string, oldVariety: string, newVariety: string) => void;
  onDeleteVariety: (groupName: string, variety: string) => void;
  onAddSizes: (group: CommodityGroupRows, variety: string, sizes: string[]) => Promise<void>;
  onRenameSize: (product: MxCommodity, size: string) => void;
}

interface CommodityGroupRows {
  groupName: string;
  products: MxCommodity[];
  tempLow: number | null;
  tempHigh: number | null;
}

// Grouped by commodity_group (falling back to the product's own name for a
// row that has never been organized - e.g. one auto-created from an Arrivals
// paste import, which only supplies a flat name). Temperatures are stored on
// every row of a group and kept identical, so any row's value will do.
function groupByCommodity(items: MxCommodity[]): CommodityGroupRows[] {
  const map = new Map<string, MxCommodity[]>();
  for (const p of items) {
    const key = p.commodity_group || p.name;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return Array.from(map.entries())
    .map(([groupName, products]) => {
      const withTemps = products.find((p) => p.temp_low !== null || p.temp_high !== null);
      return {
        groupName,
        products: [...products].sort((a, b) => (a.variety ?? "").localeCompare(b.variety ?? "")),
        tempLow: withTemps?.temp_low ?? null,
        tempHigh: withTemps?.temp_high ?? null,
      };
    })
    .sort((a, b) => a.groupName.localeCompare(b.groupName));
}

function parseTemp(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

// One tile per commodity, laid out like the ERP's Commodity - Variety window:
// Name, then the temperature range, then its varieties underneath (name only).
function CommodityTile({
  group,
  onAddVariety,
  onDelete,
  actions,
  onRenameGroup,
  onTempsChange,
}: {
  group: CommodityGroupRows;
  onAddVariety: (group: CommodityGroupRows, variety: string) => Promise<void>;
  onDelete: (id: string) => void;
  actions: VarietyActions;
  onRenameGroup: (oldName: string, newName: string) => void;
  onTempsChange: (groupName: string, low: number | null, high: number | null) => void;
}) {
  const confirm = useConfirm();
  const [newVariety, setNewVariety] = useState("");
  const [adding, setAdding] = useState(false);
  // A tile can be folded away to just its name.
  const [open, setOpen] = useState(true);
  const [low, setLow] = useState(group.tempLow === null ? "" : String(group.tempLow));
  const [high, setHigh] = useState(group.tempHigh === null ? "" : String(group.tempHigh));

  const base = group.products.find((p) => !p.variety);
  const varieties = group.products.filter((p) => p.variety);
  const varietyNames = [...new Set(varieties.map((p) => p.variety as string))];

  function saveTemps() {
    const nextLow = parseTemp(low);
    const nextHigh = parseTemp(high);
    if (nextLow === group.tempLow && nextHigh === group.tempHigh) return;
    onTempsChange(group.groupName, nextLow, nextHigh);
  }

  async function handleAdd() {
    const name = newVariety.trim();
    if (!name) return;
    setAdding(true);
    try {
      await onAddVariety(group, name);
      setNewVariety("");
    } catch {
      alert(`Could not add "${name}" to ${group.groupName} - it may already exist.`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(p: MxCommodity) {
    const label = p.variety ? `${group.groupName} ${p.variety}` : group.groupName;
    if (!(await confirm(`Remove "${label}"? Existing arrivals keep their value, but it will not be selectable anymore.`))) return;
    onDelete(p.id);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-end gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title={open ? "Fold this commodity away" : "Open this commodity"}
          className="mb-1 shrink-0 rounded p-1 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}>
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <label className="min-w-0 flex-1 text-xs font-medium text-black/60 dark:text-white/60">
          Name
          <input
            defaultValue={group.groupName}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== group.groupName) onRenameGroup(group.groupName, name);
              else e.target.value = group.groupName;
            }}
            className={`${field} mt-0.5 font-semibold`}
          />
        </label>
      </div>
      {!open && (
        <p className="pl-8 text-xs text-black/50 dark:text-white/50">
          {varietyNames.length} variet{varietyNames.length === 1 ? "y" : "ies"}
          {group.products.filter((p) => p.size).length > 0 ? `, ${group.products.filter((p) => p.size).length} sizes` : ""}
          {group.tempLow !== null || group.tempHigh !== null ? ` · ${group.tempLow ?? "?"}-${group.tempHigh ?? "?"}°` : ""}
        </p>
      )}

      {open && (<>
      <div className="flex items-end gap-2">
        <span className="pb-1.5 text-xs font-medium text-black/60 dark:text-white/60">Temperatures</span>
        <label className="text-xs text-black/60 dark:text-white/60">
          Low
          <input
            type="number"
            step="any"
            value={low}
            onChange={(e) => setLow(e.target.value)}
            onBlur={saveTemps}
            className={`${field} mt-0.5 w-16`}
          />
        </label>
        <label className="text-xs text-black/60 dark:text-white/60">
          High
          <input
            type="number"
            step="any"
            value={high}
            onChange={(e) => setHigh(e.target.value)}
            onBlur={saveTemps}
            className={`${field} mt-0.5 w-16`}
          />
        </label>
      </div>

      <div className="space-y-1 border-t border-black/10 pt-2 dark:border-white/10">
        <p className="text-xs font-medium text-black/60 dark:text-white/60">Varieties</p>
        {base && (
          <div className="flex items-center justify-between gap-2 text-xs italic text-black/40 dark:text-white/40">
            <span className="min-w-0 truncate">
              {varieties.length === 0 ? `No varieties - used as "${base.name}"` : `Also selectable as "${base.name}"`}
            </span>
            <button onClick={() => handleDelete(base)} className="shrink-0 not-italic text-red-600 hover:underline">
              Remove
            </button>
          </div>
        )}
        {varietyNames.map((v) => (
          <VarietyBlock
            key={v}
            groupName={group.groupName}
            variety={v}
            rows={varieties.filter((p) => p.variety === v)}
            onRenameVariety={(oldV, newV) => actions.onRenameVariety(group.groupName, oldV, newV)}
            onDeleteVariety={(variety) => actions.onDeleteVariety(group.groupName, variety)}
            onAddSizes={(variety, sizes) => actions.onAddSizes(group, variety, sizes)}
            onRenameSize={actions.onRenameSize}
            onDeleteProduct={(p) => onDelete(p.id)}
          />
        ))}
        <div className="flex items-center gap-1.5">
          <input
            value={newVariety}
            onChange={(e) => setNewVariety(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="Add a variety..."
            className={field}
          />
          <button
            onClick={handleAdd}
            disabled={adding || newVariety.trim() === ""}
            className="shrink-0 rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {adding ? "..." : "+ Add"}
          </button>
        </div>
      </div>
      </>)}
    </div>
  );
}

function ProductsPanel({
  items,
  onAdd,
  onDelete,
  actions,
  onRenameGroup,
  onTempsChange,
}: {
  items: MxCommodity[];
  onAdd: (commodityGroup: string, variety: string | null, temps: { low: number | null; high: number | null }) => Promise<void>;
  onDelete: (id: string) => void;
  actions: VarietyActions;
  onRenameGroup: (oldName: string, newName: string) => void;
  onTempsChange: (groupName: string, low: number | null, high: number | null) => void;
}) {
  const [newGroup, setNewGroup] = useState("");
  const [newLow, setNewLow] = useState("");
  const [newHigh, setNewHigh] = useState("");
  const [newVariety, setNewVariety] = useState("");
  const [adding, setAdding] = useState(false);

  const groups = groupByCommodity(items);

  async function handleAdd() {
    const group = newGroup.trim();
    if (!group) return;
    setAdding(true);
    try {
      await onAdd(group, newVariety.trim() || null, { low: parseTemp(newLow), high: parseTemp(newHigh) });
      setNewGroup("");
      setNewLow("");
      setNewHigh("");
      setNewVariety("");
    } catch {
      alert(`Could not add "${group}${newVariety.trim() ? ` ${newVariety.trim()}` : ""}" - it may already exist.`);
    } finally {
      setAdding(false);
    }
  }

  async function handleAddVariety(group: CommodityGroupRows, variety: string) {
    await onAdd(group.groupName, variety, { low: group.tempLow, high: group.tempHigh });
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Commodities</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Each commodity has a temperature range and its varieties. This is the same list Arrivals picks from, shown there
        as &quot;Commodity Variety&quot;.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.03]">
        <label className="text-xs font-medium">
          Name
          <input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder="e.g. Bell Pepper"
            list="commodity-group-options"
            className={`${field} mt-0.5 w-44`}
          />
        </label>
        <label className="text-xs font-medium">
          Temp Low
          <input type="number" step="any" value={newLow} onChange={(e) => setNewLow(e.target.value)} className={`${field} mt-0.5 w-20`} />
        </label>
        <label className="text-xs font-medium">
          Temp High
          <input type="number" step="any" value={newHigh} onChange={(e) => setNewHigh(e.target.value)} className={`${field} mt-0.5 w-20`} />
        </label>
        <label className="text-xs font-medium">
          Variety (optional)
          <input value={newVariety} onChange={(e) => setNewVariety(e.target.value)} placeholder="e.g. Red" className={`${field} mt-0.5 w-40`} />
        </label>
        <button
          onClick={handleAdd}
          disabled={adding || newGroup.trim() === ""}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {adding ? "Adding..." : "+ Add Commodity"}
        </button>
        <datalist id="commodity-group-options">
          {groups.map((g) => (
            <option key={g.groupName} value={g.groupName} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <CommodityTile
            key={g.groupName}
            group={g}
            onAddVariety={handleAddVariety}
            onDelete={onDelete}
            actions={actions}
            onRenameGroup={onRenameGroup}
            onTempsChange={onTempsChange}
          />
        ))}
      </div>
      {groups.length === 0 && <p className="text-sm text-black/40 dark:text-white/40">No commodities yet.</p>}
    </div>
  );
}

export default function ProduceClient({
  initialCartonTypes,
  initialProducts,
  initialLabels,
}: {
  initialCartonTypes: CartonType[];
  initialProducts: MxCommodity[];
  initialLabels: ProductLabel[];
}) {
  const [cartonTypes, setCartonTypes] = useState(initialCartonTypes);
  const [products, setProducts] = useState(initialProducts);

  async function handleAddCartonType(name: string) {
    const nextPosition = cartonTypes.length > 0 ? Math.max(...cartonTypes.map((c) => c.position)) + 1 : 1;
    const row = (await addCartonType(name, nextPosition)) as CartonType;
    setCartonTypes((prev) => [...prev, row]);
  }

  async function handleRenameCartonType(id: string, name: string) {
    await renameCartonType(id, name);
    setCartonTypes((prev) => prev.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)));
  }

  async function handleDeleteCartonType(id: string) {
    setCartonTypes((prev) => prev.filter((c) => c.id !== id));
    await deleteCartonType(id).catch(() => {});
  }

  async function handleAddProduct(commodityGroup: string, variety: string | null, temps: { low: number | null; high: number | null }) {
    const row = (await createCommodity(commodityGroup, variety, temps)) as MxCommodity;
    setProducts((prev) => [...prev, row]);
  }

  async function handleDeleteProduct(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    await deleteCommodity(id).catch(() => {});
  }


  const nameOf = (group: string, variety: string | null, size: string | null) =>
    [group, variety ?? "", size ?? ""].map((s) => s.trim()).filter(Boolean).join(" ");

  async function handleAddSizes(group: CommodityGroupRows, variety: string, sizes: string[]) {
    const rows = (await addCommoditySizes(group.groupName, variety, sizes, { low: group.tempLow, high: group.tempHigh })) as MxCommodity[];
    setProducts((prev) => [...prev, ...rows]);
  }

  function handleRenameSize(product: MxCommodity, size: string) {
    const group = product.commodity_group ?? product.name;
    const trimmed = size.trim().replace(/\s+/g, " ");
    const before = products;
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, size: trimmed, name: nameOf(group, product.variety, trimmed) } : p)));
    renameCommoditySize(product.id, group, product.variety, trimmed).catch(() => {
      alert(`Couldn't rename it to "${trimmed}" - that size may already exist.`);
      setProducts(before);
    });
  }

  function handleRenameVariety(groupName: string, oldVariety: string, newVariety: string) {
    const trimmed = newVariety.trim();
    const before = products;
    setProducts((prev) =>
      prev.map((p) =>
        (p.commodity_group ?? p.name) === groupName && p.variety === oldVariety
          ? { ...p, variety: trimmed, name: nameOf(groupName, trimmed, p.size) }
          : p,
      ),
    );
    renameCommodityVariety(groupName, oldVariety, trimmed).catch(() => {
      alert(`Couldn't rename it to "${trimmed}" - that name may already exist.`);
      setProducts(before);
    });
  }

  function handleDeleteVariety(groupName: string, variety: string) {
    setProducts((prev) => prev.filter((p) => !((p.commodity_group ?? p.name) === groupName && p.variety === variety)));
    deleteCommodityVariety(groupName, variety).catch(() => {});
  }

  const varietyActions: VarietyActions = {
    onRenameVariety: handleRenameVariety,
    onDeleteVariety: handleDeleteVariety,
    onAddSizes: handleAddSizes,
    onRenameSize: handleRenameSize,
  };

  function handleRenameGroup(oldName: string, newName: string) {
    setProducts((prev) =>
      prev.map((p) => {
        if ((p.commodity_group ?? p.name) !== oldName) return p;
        return { ...p, commodity_group: newName, name: nameOf(newName, p.variety, p.size) };
      }),
    );
    renameCommodityGroup(oldName, newName).catch(() => {});
  }

  function handleTempsChange(groupName: string, low: number | null, high: number | null) {
    setProducts((prev) =>
      prev.map((p) => ((p.commodity_group ?? p.name) === groupName ? { ...p, temp_low: low, temp_high: high } : p)),
    );
    updateCommodityGroupTemps(groupName, low, high).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Produce</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Manage the commodities and varieties Arrivals picks from, and the carton types Carton Inventory tracks.
        </p>
      </div>
      <ProductsPanel
        items={products}
        onAdd={handleAddProduct}
        onDelete={handleDeleteProduct}
        actions={varietyActions}
        onRenameGroup={handleRenameGroup}
        onTempsChange={handleTempsChange}
      />
      <CartonTypesPanel items={cartonTypes} onAdd={handleAddCartonType} onDelete={handleDeleteCartonType} onRename={handleRenameCartonType} />
      <LabelsPanel initialLabels={initialLabels} />
    </div>
  );
}
