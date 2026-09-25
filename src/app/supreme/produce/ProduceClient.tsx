"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { createCommodity, deleteCommodity, updateCommodityCartonType, updateCommodityName } from "@/app/mexico/growers/actions";
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
    if (!(await confirm(`Delete "${name}"? Any products assigned to it will show no carton type.`))) return;
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

function ProductsPanel({
  items,
  cartonTypes,
  onAdd,
  onDelete,
  onCartonTypeChange,
  onNameChange,
}: {
  items: MxCommodity[];
  cartonTypes: CartonType[];
  onAdd: (name: string) => Promise<void>;
  onDelete: (id: string) => void;
  onCartonTypeChange: (id: string, cartonTypeId: string | null) => void;
  onNameChange: (id: string, name: string) => void;
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
      alert(`Couldn't add "${name}" - a product with that name may already exist.`);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!(await confirm(`Remove "${name}"? Existing arrivals keep their value, but it won't be selectable anymore.`))) return;
    onDelete(id);
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Products</h2>
      <p className="text-xs text-black/50 dark:text-white/50">
        Same list Arrivals picks its commodities from - assigning a carton type here is what lets Carton Inventory
        eventually pull from Arrivals automatically.
      </p>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Carton Type</th>
              <th className="w-16 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-black/10 dark:border-white/10">
                <td className="min-w-[10rem] px-1 py-1">
                  <input
                    defaultValue={p.name}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== p.name) onNameChange(p.id, name);
                      else e.target.value = p.name;
                    }}
                    className={field}
                  />
                </td>
                <td className="min-w-[10rem] px-1 py-1">
                  <select
                    value={p.carton_type_id ?? ""}
                    onChange={(e) => onCartonTypeChange(p.id, e.target.value || null)}
                    className={field}
                  >
                    <option value="">--</option>
                    {cartonTypes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <button onClick={() => handleDelete(p.id, p.name)} className="text-xs font-medium text-red-600 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No products yet.
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
          placeholder="Add a product..."
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
    setProducts((prev) => prev.map((p) => (p.carton_type_id === id ? { ...p, carton_type_id: null } : p)));
    await deleteCartonType(id).catch(() => {});
  }

  async function handleAddProduct(name: string) {
    const row = (await createCommodity(name)) as MxCommodity;
    setProducts((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function handleDeleteProduct(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    await deleteCommodity(id).catch(() => {});
  }

  function handleCartonTypeChange(id: string, cartonTypeId: string | null) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, carton_type_id: cartonTypeId } : p)));
    updateCommodityCartonType(id, cartonTypeId).catch(() => {});
  }

  function handleProductNameChange(id: string, name: string) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)).sort((a, b) => a.name.localeCompare(b.name)));
    updateCommodityName(id, name).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Produce</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Manage the products Arrivals picks from, and which carton type each one ships in.
        </p>
      </div>
      <CartonTypesPanel items={cartonTypes} onAdd={handleAddCartonType} onDelete={handleDeleteCartonType} />
      <ProductsPanel
        items={products}
        cartonTypes={cartonTypes}
        onAdd={handleAddProduct}
        onDelete={handleDeleteProduct}
        onCartonTypeChange={handleCartonTypeChange}
        onNameChange={handleProductNameChange}
      />
    </div>
  );
}
