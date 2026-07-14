"use client";

import { useMemo, useState } from "react";
import { LOAD_STATUSES, type Broker, type Load, type LoadStatus } from "@/lib/types";
import LoadCard from "./LoadCard";
import LoadModal from "./LoadModal";

export default function BoardClient({ loads, brokers }: { loads: Load[]; brokers: Broker[] }) {
  const [editingLoad, setEditingLoad] = useState<Load | null | undefined>(undefined);
  const [newStatus, setNewStatus] = useState<LoadStatus>("pending_to_load");

  const modalOpen = editingLoad !== undefined;

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const load of loads) {
      for (const stop of load.load_stops) {
        const label = [stop.destination_city, stop.destination_state].filter(Boolean).join(", ");
        if (label) set.add(label);
      }
    }
    return Array.from(set).sort();
  }, [loads]);

  return (
    <div className="space-y-8">
      {LOAD_STATUSES.map((section) => {
        const sectionLoads = loads.filter((l) => l.status === section.value);
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
          cityOptions={cityOptions}
          initialStatus={newStatus}
          onClose={() => setEditingLoad(undefined)}
        />
      )}
    </div>
  );
}
