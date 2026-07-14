"use client";

import { useTransition } from "react";
import { updateLoadStatus } from "./board/actions";
import type { Broker, LoadStop } from "@/lib/types";

export interface DeliveringStop extends LoadStop {
  loads: {
    id: string;
    source: string | null;
    rate: number | null;
    status_note: string | null;
    brokers: Broker | null;
  } | null;
}

export default function DeliveringCard({ stop }: { stop: DeliveringStop }) {
  const [pending, startTransition] = useTransition();
  const load = stop.loads;

  function handleConfirmDelivered() {
    if (!load) return;
    startTransition(() => updateLoadStatus(load.id, "complete"));
  }

  return (
    <div className="rounded-lg border border-black/10 p-3 shadow-sm dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {stop.client_name || "(no client)"}{" "}
            <span className="font-normal text-black/50 dark:text-white/50">
              {stop.order_number && `#${stop.order_number}`}
              {stop.po_number && ` · PO ${stop.po_number}`}
            </span>
          </p>
          <p className="text-sm text-black/70 dark:text-white/70">
            {load?.source || "?"} → {stop.destination_city || "?"}
            {stop.destination_state && `, ${stop.destination_state}`}
          </p>
        </div>
        <div className="text-right text-sm">
          {load?.rate != null && (
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">
              ${load.rate.toLocaleString()}
            </p>
          )}
          {load?.brokers?.name && <p className="text-black/60 dark:text-white/60">{load.brokers.name}</p>}
        </div>
      </div>
      <p className="mt-2 text-xs text-black/60 dark:text-white/60">
        Delivering today{stop.delivery_time && ` at ${stop.delivery_time}`}
      </p>
      {load?.status_note && (
        <p className="mt-2 rounded bg-yellow-50 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
          {load.status_note}
        </p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-xs text-black/40 dark:text-white/40">Marks the whole load Complete</span>
        <button
          onClick={handleConfirmDelivered}
          disabled={pending || !load}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Confirming..." : "Confirm Delivered"}
        </button>
      </div>
    </div>
  );
}
