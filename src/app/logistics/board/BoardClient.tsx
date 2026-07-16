"use client";

import { useState } from "react";
import { formatDate } from "@/lib/dates";
import { groupByLoadingDate } from "@/lib/loadGrouping";
import { LOAD_STATUSES, type Broker, type Load, type LoadStatus } from "@/lib/types";
import LoadCard from "./LoadCard";
import LoadModal from "./LoadModal";

export default function BoardClient({
  loads,
  brokers,
  hubOptions,
  cityOptions,
}: {
  loads: Load[];
  brokers: Broker[];
  hubOptions: string[];
  cityOptions: string[];
}) {
  const [editingLoad, setEditingLoad] = useState<Load | null | undefined>(undefined);
  const [newStatus, setNewStatus] = useState<LoadStatus>("pending_to_load");

  const modalOpen = editingLoad !== undefined;

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
