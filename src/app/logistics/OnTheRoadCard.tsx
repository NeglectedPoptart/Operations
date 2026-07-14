"use client";

import { useState, useTransition } from "react";
import { updateNotes } from "./board/actions";
import { destinationLabel } from "@/lib/laneLabel";
import type { Load } from "@/lib/types";

export default function OnTheRoadCard({ load }: { load: Load }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(load.notes ?? "");
  const stops = [...load.load_stops].sort((a, b) => a.position - b.position);
  const label = destinationLabel(stops);

  function handleSubmit() {
    startTransition(() => updateNotes(load.id, note));
  }

  return (
    <div className="rounded-lg border border-black/10 p-3 shadow-sm dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {stops[0]?.client_name || "(no client)"}
          </p>
          <p className="text-sm text-black/70 dark:text-white/70">
            {load.source || "?"} → {label || "?"}
          </p>
        </div>
        <div className="text-right text-sm">
          {load.rate != null && (
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">
              ${load.rate.toLocaleString()}
            </p>
          )}
          {load.brokers?.name && <p className="text-black/60 dark:text-white/60">{load.brokers.name}</p>}
        </div>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-black/60 dark:text-white/60">
            ETA / location update
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={1}
            placeholder="e.g. Bebo 2pm eta"
            className="w-full resize-y rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-black"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={pending}
          className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Update"}
        </button>
      </div>
    </div>
  );
}
