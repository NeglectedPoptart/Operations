"use client";

import { useMemo, useState } from "react";
import { formatDate, todayISO } from "@/lib/dates";
import { PRODUCE_CATEGORIES } from "@/lib/priceSheetParse";
import type { PriceSheetItem, Vendor, VendorCommodity } from "@/lib/types";

function formatMoney(n: number | null): string {
  return n === null ? "CALL" : `$${n.toFixed(2)}`;
}

export default function VendorCatalogClient({
  vendors,
  commodities,
  items,
}: {
  vendors: Vendor[];
  commodities: VendorCommodity[];
  items: PriceSheetItem[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const today = todayISO();
  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);

  const vendorIdsByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of commodities) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c.vendor_id);
    }
    return map;
  }, [commodities]);

  const itemsByVendorAndCategory = useMemo(() => {
    const map = new Map<string, PriceSheetItem[]>();
    for (const item of items) {
      const key = `${item.vendor_id}:${item.category}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of PRODUCE_CATEGORIES) {
      counts.set(category, (vendorIdsByCategory.get(category) ?? []).length);
    }
    return counts;
  }, [vendorIdsByCategory]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PRODUCE_CATEGORIES;
    return PRODUCE_CATEGORIES.filter((c) => c.toLowerCase().includes(q));
  }, [search]);

  const sellersForSelected = useMemo(() => {
    if (!selectedCategory) return [];
    const vendorIds = vendorIdsByCategory.get(selectedCategory) ?? [];
    return vendorIds
      .map((id) => vendorById.get(id))
      .filter((v): v is Vendor => Boolean(v))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((vendor) => {
        const isCurrent = vendor.sheet_date === today;
        const rows = isCurrent ? itemsByVendorAndCategory.get(`${vendor.id}:${selectedCategory}`) ?? [] : [];
        return { vendor, isCurrent, rows };
      });
  }, [selectedCategory, vendorIdsByCategory, vendorById, itemsByVendorAndCategory, today]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Vendor Catalog</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type a commodity..."
          className="w-56 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-black"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {filteredCategories.map((category) => {
          const count = categoryCounts.get(category) ?? 0;
          const active = category === selectedCategory;
          return (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`rounded-lg border p-3 text-left transition ${
                active
                  ? "border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-950/30"
                  : "border-black/10 hover:border-green-500/60 hover:bg-green-50/50 dark:border-white/10 dark:hover:bg-green-950/10"
              }`}
            >
              <div className="font-semibold">{category}</div>
              <div className="text-xs text-black/40 dark:text-white/40">
                {count} vendor{count === 1 ? "" : "s"}
              </div>
            </button>
          );
        })}
        {filteredCategories.length === 0 && (
          <p className="col-span-full text-sm text-black/40 dark:text-white/40">No matching commodity.</p>
        )}
      </div>

      {selectedCategory && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Who sells {selectedCategory}</h2>
          {sellersForSelected.length === 0 ? (
            <p className="text-sm text-black/40 dark:text-white/40">
              No vendor has been recorded selling {selectedCategory} yet - it&apos;ll show up here the first time it
              appears on a pasted price sheet.
            </p>
          ) : (
            <div className="space-y-3">
              {sellersForSelected.map(({ vendor, isCurrent, rows }) => (
                <div key={vendor.id} className="rounded border border-black/10 p-3 dark:border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{vendor.name}</span>
                    <span className="text-xs text-black/40 dark:text-white/40">
                      {isCurrent
                        ? `Priced today, ${formatDate(vendor.sheet_date)}`
                        : vendor.sheet_date
                          ? `Last sheet ${formatDate(vendor.sheet_date)} (not today - no current price)`
                          : "No sheet pasted yet"}
                    </span>
                  </div>
                  {rows.length > 0 && (
                    <table className="mt-2 w-full text-sm">
                      <thead className="bg-black/5 text-left dark:bg-white/5">
                        <tr>
                          <th className="px-2 py-1">Item</th>
                          <th className="px-2 py-1">Size</th>
                          <th className="px-2 py-1">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className="border-t border-black/10 dark:border-white/10">
                            <td className="px-2 py-1">{r.item_label}</td>
                            <td className="px-2 py-1">{r.size ?? ""}</td>
                            <td className="px-2 py-1">{formatMoney(r.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
