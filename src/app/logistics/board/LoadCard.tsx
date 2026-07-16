"use client";

import { useTransition } from "react";
import { deleteLoad, updateLoadReady, updateLoadStatus } from "./actions";
import { LOAD_STATUSES, type Load, type LoadStatus } from "@/lib/types";
import LoadSummary from "@/components/LoadSummary";

export default function LoadCard({
  load,
  onEdit,
  dateFirst = false,
}: {
  load: Load;
  onEdit: () => void;
  dateFirst?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function handleStatusChange(status: LoadStatus) {
    startTransition(() => updateLoadStatus(load.id, status));
  }

  function handleDelete() {
    if (!confirm("Delete this load?")) return;
    startTransition(() => deleteLoad(load.id));
  }

  function handleToggleReady() {
    startTransition(() => updateLoadReady(load.id, !load.ready_to_load));
  }

  const borderClass =
    load.status === "pending_to_load"
      ? load.ready_to_load
        ? "border-green-400 dark:border-green-600"
        : "border-red-300 dark:border-red-800"
      : "border-black/10 dark:border-white/10";

  return (
    <div className={`rounded-lg border p-3 shadow-sm ${borderClass}`}>
      <LoadSummary load={load} dateFirst={dateFirst} />

      {load.status === "pending_to_load" && (
        <button
          onClick={handleToggleReady}
          disabled={pending}
          className={`mt-2 rounded px-2 py-0.5 text-xs font-medium ${
            load.ready_to_load
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          }`}
        >
          {load.ready_to_load ? "Ready to Load" : "Not Ready"}
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <select
          value={load.status}
          disabled={pending}
          onChange={(e) => handleStatusChange(e.target.value as LoadStatus)}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-black"
        >
          {LOAD_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2 text-xs">
          <button onClick={onEdit} className="font-medium text-green-600 hover:underline">
            Edit
          </button>
          <button onClick={handleDelete} disabled={pending} className="font-medium text-red-600 hover:underline">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
