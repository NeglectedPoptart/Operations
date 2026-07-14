"use client";

import { useState, useTransition } from "react";
import { createLoad, updateLoad } from "./actions";
import { LOAD_STATUSES, type Broker, type Load, type LoadStatus } from "@/lib/types";
import StopsEditor, { emptyStop, type StopFormState } from "./StopsEditor";

function stopsFromLoad(load: Load | null): StopFormState[] {
  if (!load || load.load_stops.length === 0) return [{ ...emptyStop }];
  return [...load.load_stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      order_number: s.order_number ?? "",
      po_number: s.po_number ?? "",
      client_name: s.client_name ?? "",
      destination: [s.destination_city, s.destination_state].filter(Boolean).join(", "),
      delivery_date: s.delivery_date ?? "",
      delivery_time: s.delivery_time ?? "",
    }));
}

// Splits a "City, ST" destination string into its two DB columns.
function splitDestination(destination: string): { destination_city: string; destination_state: string } {
  const [city, state] = destination.split(",").map((part) => part.trim());
  return { destination_city: city ?? "", destination_state: state ?? "" };
}

export default function LoadModal({
  load,
  brokers,
  cityOptions,
  initialStatus,
  onClose,
}: {
  load: Load | null;
  brokers: Broker[];
  cityOptions: string[];
  initialStatus: LoadStatus;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stops, setStops] = useState<StopFormState[]>(() => stopsFromLoad(load));

  function handleSubmit(formData: FormData) {
    setError(null);
    const stopsForSave = stops.map(({ destination, ...rest }) => ({
      ...rest,
      ...splitDestination(destination),
    }));
    formData.set("stops_json", JSON.stringify(stopsForSave));
    startTransition(async () => {
      try {
        if (load) {
          await updateLoad(load.id, formData);
        } else {
          await createLoad(formData);
        }
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const field = "w-full rounded-md border border-black/20 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-black/20";
  const selectField = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";
  const label = "text-xs font-medium text-black/60 dark:text-white/60";

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-lg dark:bg-neutral-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{load ? "Edit Load" : "Add Load"}</h2>
          <button onClick={onClose} className="text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white">
            ✕
          </button>
        </div>

        <form action={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-1">
            <label className={label}>Loading Date</label>
            <input type="date" name="loading_date" defaultValue={load?.loading_date ?? ""} className={field} />
          </div>
          <div className="col-span-1">
            <label className={label}>Source</label>
            <input name="source" defaultValue={load?.source ?? ""} className={field} />
          </div>
          <div className="col-span-1">
            <label className={label}>Status</label>
            <select name="status" defaultValue={load?.status ?? initialStatus} className={selectField}>
              {LOAD_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-1">
            <label className={label}>Rate (total)</label>
            <input type="number" step="0.01" name="rate" defaultValue={load?.rate ?? ""} className={field} />
          </div>

          <div className="col-span-2 sm:col-span-2">
            <label className={label}>Broker</label>
            <select name="broker_id" defaultValue={load?.broker_id ?? ""} className={selectField}>
              <option value="">--</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <StopsEditor stops={stops} onChange={setStops} cityOptions={cityOptions} />

          <div className="col-span-2 sm:col-span-4">
            <label className={label}>Status Notes</label>
            <textarea name="status_note" defaultValue={load?.status_note ?? ""} rows={2} className={field} />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={label}>Notes</label>
            <textarea name="notes" defaultValue={load?.notes ?? ""} rows={2} className={field} />
          </div>

          {error && <p className="col-span-2 text-sm text-red-600 sm:col-span-4">{error}</p>}

          <div className="col-span-2 flex justify-end gap-2 sm:col-span-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
