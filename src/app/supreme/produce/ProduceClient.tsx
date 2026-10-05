"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  createCommodity,
  deleteCommodity,
  renameCommodityGroup,
  updateCommodityVariety,
} from "@/app/mexico/growers/actions";
import type { CartonType, MxCommodity } from "@/lib/types";
import { addCartonType, deleteCartonType } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// Position-ordered add/delete list - same shape as Repack Inventory's item
// list (src/app/warehouse/repack-inventory/RepackInventoryClient.tsx).
function CartonTypesPanel({ items, onAdd, onDelete }: { items: CartonType[]; onAdd: (name: string) => Promise<void>; onDelete: (id: string) => void }) {
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
                <td className="px-2 py-1.5">{c.name}</td>
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

interface CommodityGroupRows {
  groupName: string;
  products: MxCommodity[];
}

// Grouped by commodity_group (falling back to the product's own name for a
// row that's never been organized yet - e.g. one auto-created from an
// Arrivals paste import, which only ever supplies a flat name), then each
// group's own varieties sorted alphabetically (blank variety - a group's
// sole, not-yet-split-out entry - sorts first).
function groupByCommodity(items: MxCommodity[]): CommodityGroupRows[] {
  const map = new Map<string, MxCommodity[]>();
  for (const p of items) {
    const key = p.commodity_group || p.name;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return Array.from(map.entries())
    .map(([groupName, products]) => ({
      groupName,
      products: [...products].sort((a, b) => (a.variety ?? "").localeCompare(b.variety ?? "")),
    }))
    .sort((a, b) => a.groupName.localeCompare(b.groupName));
}

function CommodityGroupSection({
  group,
  onAddVariety,
  onDelete,
  onVarietyChange,
  onRenameGroup,
}: {
  group: CommodityGroupRows;
  onAddVariety: (groupName: string) => Promise<void>;
  onDelete: (id: string, label: string) => void;
  onVarietyChange: (product: MxCommodity, variety: string) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
}) {
  const confirm = useConfirm();
  const [addingVariety, setAddingVariety] = useState(false);

  async function handleAddVariety() {
    setAddingVariety(true);
    try {
      await onAddVariety(group.groupName);
    } finally {
      setAddingVariety(false);
    }
  }

  async function handleDelete(p: MxCommodity) {
    const label = p.variety ? `${group.groupName} ${p.variety}` : group.groupName;
    if (!(await confirm(`Remove "${label}"? Existing arrivals keep their value, but it won't be selectable anymore.`))) return;
    onDelete(p.id, label);
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/10 dark:border-white/10">
      <div className="flex items-center justify-between gap-2 border-b border-black/10 bg-black/[0.03] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
        <input
          defaultValue={group.groupName}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== group.groupName) onRenameGroup(group.groupName, name);
            else e.target.value = group.groupName;
          }}
          className={`${field} max-w-xs font-semibold`}
        />
        <button
          onClick={handleAddVariety}
          disabled={addingVariety}
          className="shrink-0 text-xs font-medium text-green-700 hover:underline disabled:opacity-60 dark:text-green-400"
        >
          {addingVariety ? "Adding..." : "+ Add Variety"}
        </button>
      </div>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-black/50 dark:text-white/50">
            <tr>
              <th className="px-1 py-1">Variety</th>
              <th className="w-16 px-1 py-1" />
            </tr>
          </thead>
          <tbody>
            {group.products.map((p) => (
              <tr key={p.id} className="border-t border-black/10 dark:border-white/10">
                <td className="min-w-[8rem] px-1 py-1">
                  <input
                    defaultValue={p.variety ?? ""}
                    placeholder="e.g. Red"
                    onBlur={(e) => onVarietyChange(p, e.target.value)}
                    className={field}
                  />
                </td>
                <td className="px-1 py-1.5">
                  <button onClick={() => handleDelete(p)} className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductsPanel({
  items,
  onAdd,
  onDelete,
  onVarietyChange,
  onRenameGroup,
}: {
  items: MxCommodity[];
  onAdd: (commodityGroup: string, variety: string | null) => Promise<void>;
  onDelete: (id: string) => void;
  onVarietyChange: (product: MxCommodity, variety: string) => void;
  onRenameGroup: (oldName: string, newName: string) => void;
}) {
  const [newGroup, setNewGroup] = useState("");
  const [newVariety, setNewVariety] = useState("");
  const [adding, setAdding] = useState(false);

  const groups = groupByCommodity(items);
  const groupNames = groups.map((g) => g.groupName);

  async function handleAdd() {
    const group = newGroup.trim();
    if (!group) return;
    setAdding(true);
    try {
      await onAdd(group, newVariety.trim() || null);
      setNewGroup("");
      setNewVariety("");
    } catch {
      alert(`Couldn't add "${group}${newVariety.trim() ? ` ${newVariety.trim()}` : ""}" - it may already exist.`);
    } finally {
      setAdding(false);
    }
  }

  async function handleAddVariety(groupName: string) {
    // name = "{group} {variety}" is unique per product - a blank variety
    // would collide with the group's own un-split entry (or any other
    // blank-variety row already added), since both would resolve to the
    // bare group name. A throwaway numbered placeholder sidesteps that;
    // the user overwrites it with the real variety right away.
    const existingCount = groups.find((g) => g.groupName === groupName)?.products.length ?? 0;
    await onAdd(groupName, String(existingCount + 1)).catch(() => alert(`Couldn't add a new variety to "${groupName}".`));
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Products</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Organized by Commodity Group (e.g. &quot;Bell Pepper&quot;), each with its own Varieties (e.g. &quot;Red&quot;) -
        this is the same list Arrivals picks from (shown there as &quot;Group Variety&quot;).
      </p>

      <div className="space-y-3">
        {groups.map((g) => (
          <CommodityGroupSection
            key={g.groupName}
            group={g}
            onAddVariety={handleAddVariety}
            onDelete={onDelete}
            onVarietyChange={onVarietyChange}
            onRenameGroup={onRenameGroup}
          />
        ))}
        {groups.length === 0 && <p className="text-sm text-black/40 dark:text-white/40">No products yet.</p>}
      </div>

      <datalist id="commodity-group-options">
        {groupNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          placeholder="Commodity Group (e.g. Bell Pepper)..."
          list="commodity-group-options"
          className={`${field} max-w-xs`}
        />
        <input
          value={newVariety}
          onChange={(e) => setNewVariety(e.target.value)}
          placeholder="Variety (optional)..."
          className={`${field} max-w-xs`}
        />
        <button
          onClick={handleAdd}
          disabled={adding || newGroup.trim() === ""}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {adding ? "Adding..." : "+ Add"}
        </button>
      </div>
    </div>
  );
}

export default function ProduceClient({
  initialCartonTypes,
  initialProducts,
}: {
  initialCartonTypes: CartonType[];
  initialProducts: MxCommodity[];
}) {
  const [cartonTypes, setCartonTypes] = useState(initialCartonTypes);
  const [products, setProducts] = useState(initialProducts);

  async function handleAddCartonType(name: string) {
    const nextPosition = cartonTypes.length > 0 ? Math.max(...cartonTypes.map((c) => c.position)) + 1 : 1;
    const row = (await addCartonType(name, nextPosition)) as CartonType;
    setCartonTypes((prev) => [...prev, row]);
  }

  async function handleDeleteCartonType(id: string) {
    setCartonTypes((prev) => prev.filter((c) => c.id !== id));
    await deleteCartonType(id).catch(() => {});
  }

  async function handleAddProduct(commodityGroup: string, variety: string | null) {
    const row = (await createCommodity(commodityGroup, variety)) as MxCommodity;
    setProducts((prev) => [...prev, row]);
  }

  async function handleDeleteProduct(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    await deleteCommodity(id).catch(() => {});
  }

  function handleVarietyChange(product: MxCommodity, variety: string) {
    const trimmed = variety.trim();
    if (trimmed === (product.variety ?? "")) return;
    const commodityGroup = product.commodity_group ?? product.name;
    const name = [commodityGroup, trimmed].filter(Boolean).join(" ");
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, variety: trimmed || null, name } : p)));
    updateCommodityVariety(product.id, commodityGroup, trimmed || null).catch(() => {});
  }

  function handleRenameGroup(oldName: string, newName: string) {
    setProducts((prev) =>
      prev.map((p) => {
        if ((p.commodity_group ?? p.name) !== oldName) return p;
        return { ...p, commodity_group: newName, name: [newName, p.variety ?? ""].filter(Boolean).join(" ") };
      }),
    );
    renameCommodityGroup(oldName, newName).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Produce</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Manage the products Arrivals picks from, and the carton types Carton Inventory tracks.
        </p>
      </div>
      <CartonTypesPanel items={cartonTypes} onAdd={handleAddCartonType} onDelete={handleDeleteCartonType} />
      <ProductsPanel
        items={products}
        onAdd={handleAddProduct}
        onDelete={handleDeleteProduct}
        onVarietyChange={handleVarietyChange}
        onRenameGroup={handleRenameGroup}
      />
    </div>
  );
}
