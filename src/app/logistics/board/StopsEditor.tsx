"use client";

import { formatMilitaryInput } from "@/lib/dates";

export interface StopFormState {
  order_number: string;
  po_number: string;
  client_name: string;
  destination: string;
  delivery_date: string;
  delivery_time: string;
}

export const emptyStop: StopFormState = {
  order_number: "",
  po_number: "",
  client_name: "",
  destination: "",
  delivery_date: "",
  delivery_time: "",
};

const field =
  "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";
const label = "text-xs font-medium text-black/60 dark:text-white/60";

export default function StopsEditor({
  stops,
  onChange,
  cityOptions,
}: {
  stops: StopFormState[];
  onChange: (stops: StopFormState[]) => void;
  cityOptions: string[];
}) {
  function updateStop(index: number, patch: Partial<StopFormState>) {
    onChange(stops.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStop() {
    onChange([...stops, { ...emptyStop }]);
  }

  function removeStop(index: number) {
    onChange(stops.filter((_, i) => i !== index));
  }

  return (
    <div className="col-span-2 space-y-3 sm:col-span-4">
      <datalist id="destination-city-options">
        {cityOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="flex items-center justify-between">
        <label className={label}>
          Stops / Drops {stops.length > 1 && <span>({stops.length})</span>}
        </label>
        <button
          type="button"
          onClick={addStop}
          className="text-xs font-medium text-green-600 hover:underline"
        >
          + Add Drop
        </button>
      </div>

      {stops.map((stop, i) => (
        <div key={i} className="rounded-md border border-black/10 p-3 dark:border-white/10">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-black/50 dark:text-white/50">
              Drop {i + 1}
            </p>
            {stops.length > 1 && (
              <button
                type="button"
                onClick={() => removeStop(i)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={label}>Order #</label>
              <input
                value={stop.order_number}
                onChange={(e) => updateStop(i, { order_number: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>PO #</label>
              <input
                value={stop.po_number}
                onChange={(e) => updateStop(i, { po_number: e.target.value })}
                className={field}
              />
            </div>
            <div className="col-span-2">
              <label className={label}>Client Name</label>
              <input
                value={stop.client_name}
                onChange={(e) => updateStop(i, { client_name: e.target.value })}
                className={field}
              />
            </div>
            <div className="col-span-2">
              <label className={label}>Destination (City, ST)</label>
              <input
                list="destination-city-options"
                placeholder="Houston, TX"
                value={stop.destination}
                onChange={(e) => updateStop(i, { destination: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Delivery Date</label>
              <input
                type="date"
                value={stop.delivery_date}
                onChange={(e) => updateStop(i, { delivery_date: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Delivery Time</label>
              <input
                placeholder="1400 or 2:00 PM"
                value={stop.delivery_time}
                onChange={(e) => updateStop(i, { delivery_time: e.target.value })}
                onBlur={(e) => updateStop(i, { delivery_time: formatMilitaryInput(e.target.value) })}
                className={field}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
