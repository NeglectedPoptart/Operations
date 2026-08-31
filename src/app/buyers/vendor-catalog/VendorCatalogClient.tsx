"use client";

import { useMemo, useState } from "react";
import { updatePriceSheetItem } from "@/app/buyers/price-sheets/actions";
import { formatDate, todayISO } from "@/lib/dates";
import { normalizeCategory, PRODUCE_CATEGORIES } from "@/lib/priceSheetParse";
import type { PriceSheetItem, Vendor, VendorCommodity } from "@/lib/types";

function formatMoney(n: number | null): string {
  return n === null ? "CALL" : `$${n.toFixed(2)}`;
}

const sizeInput =
  "w-20 min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm transition-colors hover:bg-black/5 focus:border-green-500 focus:bg-white focus:text-black focus:outline-none focus:ring-1 focus:ring-green-500 dark:hover:bg-white/10 dark:focus:bg-black/40";

export default function VendorCatalogClient({
  vendors,
  commodities,
  items: initialItems,
}: {
  vendors: Vendor[];
  commodities: VendorCommodity[];
  items: PriceSheetItem[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [items, setItems] = useState(initialItems);

  // Auto-categorization comes in wrong sometimes (a size/grade the parser
  // misread) - this lets it be fixed right here rather than only in Price
  // Sheets, and the fix feeds straight into the vendor average / FOB
  // comparison since both read from the same price_sheet_items rows.
  function handleSizeSave(id: string, size: string) {
    const trimmed = size.trim();
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, size: trimmed || null } : i)));
    updatePriceSheetItem(id, { size: trimmed || null }).catch(() => {});
  }

  const today = todayISO();
  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);

  // Normalized so a vendor filed under an old raw label ("Broccoli",
  // "Tomatoes"...) still counts toward the canonical category tile
  // (normalizeCategory upgrades those, same as it does for display).
  const vendorIdsByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of commodities) {
      const category = normalizeCategory(c.category);
      if (!map.has(category)) map.set(category, []);
      map.get(category)!.push(c.vendor_id);
    }
    return map;
  }, [commodities]);

  const itemsByVendorAndCategory = useMemo(() => {
    const map = new Map<string, PriceSheetItem[]>();
    for (const item of items) {
      const key = `${item.vendor_id}:${normalizeCategory(item.category)}`;
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

  const itemsByVendor = useMemo(() => {
    const map = new Map<string, PriceSheetItem[]>();
    for (const item of items) {
      if (!map.has(item.vendor_id)) map.set(item.vendor_id, []);
      map.get(item.vendor_id)!.push(item);
    }
    return map;
  }, [items]);

  // price_sheet_items is a full-replace snapshot per vendor (whatever their
  // last paste was) - there's no history to keep beyond that, so "priced
  // today total or last time" is just this same item list either way, with
  // vendor.sheet_date telling you which case you're looking at.
  const allVendors = useMemo(
    () =>
      [...vendors]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((vendor) => {
          const vendorItems = itemsByVendor.get(vendor.id) ?? [];
          return { vendor, vendorItems, isCurrent: vendor.sheet_date === today };
        }),
    [vendors, itemsByVendor, today],
  );

  const pricedTodayCount = useMemo(() => allVendors.filter((v) => v.isCurrent).length, [allVendors]);

  const sellersForSelected = useMemo(() => {
    if (!selectedCategory) return [];
    const vendorIds = vendorIdsByCategory.get(selectedCategory) ?? [];
    return vendorIds
      .map((id) => vendorById.get(id))
      .filter((v): v is Vendor => Boolean(v))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((vendor) => {
        const isCurrent = vendor.sheet_date === today;
        // Not just for a current sheet - price_sheet_items is a full-replace
        // snapshot of the vendor's last paste either way (see the comment on
        // allVendors above), so even when it's not from today this is still
        // their last known price, worth showing next to the "Last sheet
        // {date}" note rather than leaving the row blank.
        const rows = itemsByVendorAndCategory.get(`${vendor.id}:${selectedCategory}`) ?? [];
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

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-black/10 px-4 py-2 shadow-sm dark:border-white/10">
          <p className="text-xl font-bold">{vendors.length}</p>
          <p className="text-xs text-black/50 dark:text-white/50">Total Vendors</p>
        </div>
        <div className="rounded-lg border border-black/10 px-4 py-2 shadow-sm dark:border-white/10">
          <p className="text-xl font-bold text-green-700 dark:text-green-400">{pricedTodayCount}</p>
          <p className="text-xs text-black/50 dark:text-white/50">Priced Today</p>
        </div>
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
                          ? `Last sheet ${formatDate(vendor.sheet_date)} (not today - showing last price)`
                          : "No sheet pasted yet"}
                    </span>
                  </div>
                  {rows.length > 0 &&
                    (isCurrent ? (
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
                              <td className="px-2 py-1">
                                <input
                                  defaultValue={r.size ?? ""}
                                  onBlur={(e) => handleSizeSave(r.id, e.target.value)}
                                  className={sizeInput}
                                />
                              </td>
                              <td className="px-2 py-1">{formatMoney(r.price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      // Muted, note-style rendering (same treatment as the
                      // "Last sheet {date}" line above) - this isn't a
                      // current quote, so it shouldn't read with the same
                      // visual weight as a live price table.
                      <table className="mt-2 w-full text-xs text-black/40 dark:text-white/40">
                        <thead className="text-left">
                          <tr>
                            <th className="px-2 py-1 font-medium">Item</th>
                            <th className="px-2 py-1 font-medium">Size</th>
                            <th className="px-2 py-1 font-medium">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.id} className="border-t border-black/5 dark:border-white/5">
                              <td className="px-2 py-1">{r.item_label}</td>
                              <td className="px-2 py-1">{r.size ?? ""}</td>
                              <td className="px-2 py-1">{formatMoney(r.price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Below the commodity results on purpose - this list can get long,
          and clicking a commodity above shouldn't require scrolling past it
          to see the answer. */}
      <div className="space-y-2 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
        <h2 className="text-lg font-bold text-green-700 dark:text-green-400">All Vendors</h2>
        {allVendors.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">No vendors entered yet.</p>
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {allVendors.map(({ vendor, vendorItems, isCurrent }) => (
              <div key={vendor.id} className="group relative py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{vendor.name}</span>
                  <span className="text-xs text-black/50 dark:text-white/50">
                    <span className={isCurrent ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>
                      {vendor.sheet_date ? `Updated ${formatDate(vendor.sheet_date)}` : "No sheet yet"}
                    </span>
                    {" · "}
                    {vendorItems.length} item{vendorItems.length === 1 ? "" : "s"} priced
                  </span>
                </div>

                {vendorItems.length > 0 && (
                  <div className="invisible absolute left-0 top-full z-20 w-80 max-w-[90vw] rounded-md border border-black/10 bg-white p-2 opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 dark:border-white/10 dark:bg-neutral-900">
                    {!isCurrent && (
                      <p className="mb-1.5 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        ⚠ Last pricing as of {formatDate(vendor.sheet_date)} - not from today
                      </p>
                    )}
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-black/5 text-left dark:bg-white/10">
                          <tr>
                            <th className="px-1 py-0.5">Item</th>
                            <th className="px-1 py-0.5">Size</th>
                            <th className="px-1 py-0.5">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vendorItems.map((item) => (
                            <tr key={item.id} className="border-t border-black/10 dark:border-white/10">
                              <td className="px-1 py-0.5">{item.item_label}</td>
                              <td className="px-1 py-0.5">{item.size ?? ""}</td>
                              <td className="px-1 py-0.5">{formatMoney(item.price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
