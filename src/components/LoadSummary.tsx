import { formatDate } from "@/lib/dates";
import type { Load, LoadStop } from "@/lib/types";

function DeliveryLine({ stop }: { stop: LoadStop }) {
  return (
    <p className="pl-3">
      {stop.delivery_date && <span>Delivery: {formatDate(stop.delivery_date)} </span>}
      {stop.appointment ? (
        <span>· Appt: {stop.appointment}</span>
      ) : (
        <span className="font-semibold text-red-600 dark:text-red-400">· ⚠ Missing Appointment</span>
      )}
    </p>
  );
}

// Shared header + per-stop breakdown used by both the Board's load cards and
// the Home page's Loading Today tiles, so a multi-drop load reads the same
// way everywhere - each drop's own destination/delivery date included.
// `dateFirst` moves the loading date above the client name instead of into
// the detail line below - used by the Logistics Summary page's Pending to
// Load section, which is already grouped into per-date subsections.
export default function LoadSummary({ load, dateFirst = false }: { load: Load; dateFirst?: boolean }) {
  const stops = [...load.load_stops].sort((a, b) => a.position - b.position);
  const pickups = [...load.load_pickups].sort((a, b) => a.position - b.position);
  const firstStop = stops[0];
  const multiDrop = stops.length > 1;
  const totalPicks = 1 + pickups.length;

  return (
    <>
      {dateFirst && (
        <p className="mb-1 text-sm font-semibold text-green-700 dark:text-green-400">
          {formatDate(load.loading_date) || "No date set"}
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {multiDrop ? (
              <span className="text-black/50 dark:text-white/50">
                {stops.map((s) => (s.order_number ? `#${s.order_number}` : "—")).join(", ")}
              </span>
            ) : (
              <>
                {firstStop?.client_name || "(no client)"}{" "}
                <span className="font-normal text-black/50 dark:text-white/50">
                  {firstStop?.order_number && `#${firstStop.order_number}`}
                  {firstStop?.po_number && ` · PO ${firstStop.po_number}`}
                </span>
              </>
            )}
            {multiDrop && (
              <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                {stops.length} drops
              </span>
            )}
            {totalPicks > 1 && (
              <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {totalPicks} picks
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

      {pickups.length > 0 && (
        <div className="mt-2 space-y-0.5 text-xs text-black/60 dark:text-white/60">
          {pickups.map((p, i) => (
            <p key={p.id}>
              <span className="font-medium">Pickup {i + 1}: </span>
              {[p.pu_number && `#${p.pu_number}`, p.vendor, p.location].filter(Boolean).join(" ")}
            </p>
          ))}
        </div>
      )}

      <div className="mt-2 space-y-1.5 text-xs text-black/60 dark:text-white/60">
        {multiDrop
          ? stops.map((stop, i) => (
              <div key={stop.id}>
                <p>
                  <span className="font-medium">Drop {i + 1}: </span>
                  <span className="font-bold text-black dark:text-white">{stop.client_name || "(no client)"}</span>
                  {stop.order_number && ` · #${stop.order_number}`}
                  {stop.po_number && ` · PO ${stop.po_number}`}
                  {(stop.destination_city || stop.destination_state) && (
                    <span>
                      {" "}
                      → {stop.destination_city}
                      {stop.destination_state && `, ${stop.destination_state}`}
                    </span>
                  )}
                </p>
                <DeliveryLine stop={stop} />
              </div>
            ))
          : firstStop && (
              <p>
                {!dateFirst && <span>Loading: {formatDate(load.loading_date) || "—"} · </span>}
                {firstStop.delivery_date && <span>Delivery: {formatDate(firstStop.delivery_date)} </span>}
                {firstStop.appointment ? (
                  <span>· Appt: {firstStop.appointment}</span>
                ) : (
                  <span className="font-semibold text-red-600 dark:text-red-400">· ⚠ Missing Appointment</span>
                )}
              </p>
            )}
      </div>

      {load.notes && <p className="mt-1 text-xs italic text-black/50 dark:text-white/50">{load.notes}</p>}
    </>
  );
}
