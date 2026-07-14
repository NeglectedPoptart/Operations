import { formatDate } from "@/lib/dates";
import type { Load } from "@/lib/types";

// Shared header + per-stop breakdown used by both the Board's load cards and
// the Home page's Loading Today tiles, so a multi-drop load reads the same
// way everywhere - each drop's own destination/delivery date included.
export default function LoadSummary({ load }: { load: Load }) {
  const stops = [...load.load_stops].sort((a, b) => a.position - b.position);
  const firstStop = stops[0];
  const additionalStops = stops.slice(1);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {firstStop?.client_name || "(no client)"}{" "}
            <span className="font-normal text-black/50 dark:text-white/50">
              {firstStop?.order_number && `#${firstStop.order_number}`}
              {firstStop?.po_number && ` · PO ${firstStop.po_number}`}
            </span>
            {stops.length > 1 && (
              <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                {stops.length} drops
              </span>
            )}
          </p>
          <p className="text-sm text-black/70 dark:text-white/70">
            {load.source || "?"} → {firstStop?.destination_city || "?"}
            {firstStop?.destination_state && `, ${firstStop.destination_state}`}
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

      <div className="mt-2 space-y-1 text-xs text-black/60 dark:text-white/60">
        <p>
          Loading: {formatDate(load.loading_date) || "—"}
          {additionalStops.length === 0 && firstStop && (firstStop.delivery_date || firstStop.delivery_time) && (
            <span>
              {" "}
              · Delivery: {formatDate(firstStop.delivery_date) || "—"} {firstStop.delivery_time}
            </span>
          )}
        </p>
        {additionalStops.map((stop, i) => (
          <p key={stop.id}>
            <span className="font-medium">Drop {i + 2}: </span>
            {stop.client_name && <span>{stop.client_name} · </span>}
            {stop.order_number && `#${stop.order_number} `}
            {stop.po_number && `· PO ${stop.po_number} `}
            {(stop.destination_city || stop.destination_state) && (
              <span>
                → {stop.destination_city}
                {stop.destination_state && `, ${stop.destination_state}`}{" "}
              </span>
            )}
            {formatDate(stop.delivery_date) || "—"} {stop.delivery_time}
          </p>
        ))}
      </div>

      {load.notes && <p className="mt-1 text-xs italic text-black/50 dark:text-white/50">{load.notes}</p>}
    </>
  );
}
