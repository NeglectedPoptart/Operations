"use client";

export interface PickupFormState {
  pu_number: string;
  vendor: string;
  location: string;
}

export const emptyPickup: PickupFormState = { pu_number: "", vendor: "", location: "" };

const field = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";
const label = "text-xs font-medium text-black/60 dark:text-white/60";

// The truck's primary pickup is always loads.source (the hub) - this is
// only for EXTRA pickups on the same truck, so it starts empty rather than
// with one row like Stops/Drops does.
export default function PickupsEditor({
  pickups,
  onChange,
}: {
  pickups: PickupFormState[];
  onChange: (pickups: PickupFormState[]) => void;
}) {
  function updatePickup(index: number, patch: Partial<PickupFormState>) {
    onChange(pickups.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPickup() {
    onChange([...pickups, { ...emptyPickup }]);
  }

  function removePickup(index: number) {
    onChange(pickups.filter((_, i) => i !== index));
  }

  return (
    <div className="col-span-2 space-y-3 sm:col-span-4">
      <div className="flex items-center justify-between">
        <label className={label}>Pickups {pickups.length > 0 && <span>({pickups.length})</span>}</label>
        <button type="button" onClick={addPickup} className="text-xs font-medium text-green-600 hover:underline">
          + Pickup
        </button>
      </div>

      {pickups.map((pickup, i) => (
        <div key={i} className="rounded-md border border-black/10 p-3 dark:border-white/10">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-black/50 dark:text-white/50">Pickup {i + 1}</p>
            <button
              type="button"
              onClick={() => removePickup(i)}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className={label}>PU #</label>
              <input
                value={pickup.pu_number}
                onChange={(e) => updatePickup(i, { pu_number: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Vendor</label>
              <input
                value={pickup.vendor}
                onChange={(e) => updatePickup(i, { vendor: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Location</label>
              <input
                value={pickup.location}
                onChange={(e) => updatePickup(i, { location: e.target.value })}
                className={field}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
