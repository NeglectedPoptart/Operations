"use client";

import { useState } from "react";
import LoadSummary from "@/components/LoadSummary";
import type { Load } from "@/lib/types";
import { markPendingOrdersSeen, updateLoadStatus } from "./actions";

// Shown once per day, first time this user opens the List page (gated
// server-side in page.tsx via profiles.last_pending_orders_seen_date) -
// surfaces anything still Pending to Load from before today so it doesn't
// quietly sit unnoticed, with a quick way to move it along right here
// instead of hunting for it on the board below.
export default function PendingOrdersPopup({ initialLoads }: { initialLoads: Load[] }) {
  const [loads, setLoads] = useState(initialLoads);
  const [dismissed, setDismissed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (dismissed) return null;

  async function handleClose() {
    setDismissed(true);
    await markPendingOrdersSeen().catch(() => {});
  }

  async function handleStatusChange(id: string, status: "on_the_road" | "complete") {
    setBusyId(id);
    try {
      await updateLoadStatus(id, status);
      setLoads((prev) => prev.filter((l) => l.id !== id));
    } catch {
      alert("Couldn't update that load - try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-900">
        <div>
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Pending Orders Check</h2>
          <p className="text-xs text-black/50 dark:text-white/50">
            Anything still Pending to Load from before today - update it here, or leave it for later on the board.
          </p>
        </div>

        {loads.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No prior loads pending to change.</p>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {loads.map((load) => (
              <div
                key={load.id}
                className="rounded-lg border border-amber-400/60 bg-amber-50/50 p-3 dark:border-amber-700/50 dark:bg-amber-950/10"
              >
                <LoadSummary load={load} dateFirst />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleStatusChange(load.id, "on_the_road")}
                    disabled={busyId === load.id}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    On the Road
                  </button>
                  <button
                    onClick={() => handleStatusChange(load.id, "complete")}
                    disabled={busyId === load.id}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    Delivered
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleClose}
          className="w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          {loads.length === 0 ? "Got it" : "Done for now"}
        </button>
      </div>
    </div>
  );
}
