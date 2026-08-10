"use client";

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/dates";
import { groupByLoadingDate } from "@/lib/loadGrouping";
import { LOAD_STATUSES, type Broker, type Load, type LoadStatus } from "@/lib/types";
import LoadCard from "./LoadCard";
import LoadModal from "./LoadModal";
import PendingOrdersPopup from "./PendingOrdersPopup";
import RateConfirmationImport from "./RateConfirmationImport";

export default function BoardClient({
  loads,
  brokers,
  hubOptions,
  cityOptions,
  initialOverdueLoads,
}: {
  loads: Load[];
  brokers: Broker[];
  hubOptions: string[];
  cityOptions: string[];
  initialOverdueLoads: Load[] | null;
}) {
  const [editingLoad, setEditingLoad] = useState<Load | null | undefined>(undefined);
  const [newStatus, setNewStatus] = useState<LoadStatus>("pending_to_load");
  const [customerFilter, setCustomerFilter] = useState("");

  const modalOpen = editingLoad !== undefined;

  // Only customers who actually have a stop on the list right now - never a
  // static/fixed list, so it always reflects what's actually on the board.
  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const load of loads) {
      for (const stop of load.load_stops) {
        if (stop.client_name?.trim()) names.add(stop.client_name.trim());
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [loads]);

  const filteredLoads = useMemo(() => {
    if (!customerFilter) return loads;
    return loads.filter((l) => l.load_stops.some((s) => s.client_name?.trim() === customerFilter));
  }, [loads, customerFilter]);

  return (
    <div className="space-y-8">
      {initialOverdueLoads !== null && <PendingOrdersPopup initialLoads={initialOverdueLoads} />}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">Filter by customer</span>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
          >
            <option value="">All customers</option>
            {customerOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {customerFilter && (
          <button
            onClick={() => setCustomerFilter("")}
            className="text-xs font-medium text-black/50 hover:underline dark:text-white/50"
          >
            Clear
          </button>
        )}
      </div>

      <RateConfirmationImport brokers={brokers} hubOptions={hubOptions} cityOptions={cityOptions} />

      {LOAD_STATUSES.map((section) => {
        const rawSectionLoads = filteredLoads.filter((l) => l.status === section.value);
        // Completed loads read newest-first - everything else keeps the
        // server's oldest-first order (loads are fetched sorted ascending by
        // loading_date, which is what "Pending to Load"'s day-by-day
        // grouping below expects).
        const sectionLoads =
          section.value === "complete"
            ? [...rawSectionLoads].sort((a, b) => (b.loading_date ?? "").localeCompare(a.loading_date ?? ""))
            : rawSectionLoads;
        return (
          <section key={section.value}>
            <div className="mb-3 flex items-center justify-between border-b-2 border-green-600 pb-2">
              <h2 className="text-lg font-bold text-green-700 dark:text-green-400">
                {section.label} <span className="text-sm font-normal text-black/40">({sectionLoads.length})</span>
              </h2>
              <button
                onClick={() => {
                  setNewStatus(section.value);
                  setEditingLoad(null);
                }}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                + Add Load
              </button>
            </div>
            {sectionLoads.length === 0 ? (
              <p className="text-sm text-black/40 dark:text-white/40">No loads here.</p>
            ) : section.value === "pending_to_load" ? (
              <div className="space-y-5">
                {groupByLoadingDate(sectionLoads).map((group) => (
                  <div key={group.date ?? "no-date"}>
                    <h3 className="mb-2 text-sm font-semibold text-black/60 dark:text-white/60">
                      {group.date ? formatDate(group.date) : "No Date Set"}{" "}
                      <span className="font-normal text-black/40">({group.loads.length})</span>
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {group.loads.map((load) => (
                        <LoadCard key={load.id} load={load} onEdit={() => setEditingLoad(load)} dateFirst />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {sectionLoads.map((load) => (
                  <LoadCard key={load.id} load={load} onEdit={() => setEditingLoad(load)} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {modalOpen && (
        <LoadModal
          load={editingLoad ?? null}
          brokers={brokers}
          hubOptions={hubOptions}
          cityOptions={cityOptions}
          initialStatus={newStatus}
          onClose={() => setEditingLoad(undefined)}
        />
      )}
    </div>
  );
}
