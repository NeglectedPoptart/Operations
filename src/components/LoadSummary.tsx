"use client";

import { useState } from "react";
import { formatDate } from "@/lib/dates";
import type { Load, LoadStop } from "@/lib/types";

// Past this many drops, listing every stop makes the tile towering compared
// to every other load's card - collapse the breakdown behind a toggle
// instead (the header above already shows every order number at a glance).
const DROP_LIST_COLLAPSE_THRESHOLD = 3;

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
// `compact` lays the same information out across the width in about half the
// height - used for the Completed list.
export default function LoadSummary({ load, dateFirst = false, compact = false }: { load: Load; dateFirst?: boolean; compact?: boolean }) {
  const [dropsExpanded, setDropsExpanded] = useState(false);
  const stops = [...load.load_stops].sort((a, b) => a.position - b.position);
  const pickups = [...load.load_pickups].sort((a, b) => a.position - b.position);
  const firstStop = stops[0];
  const multiDrop = stops.length > 1;
  const manyDrops = stops.length > DROP_LIST_COLLAPSE_THRESHOLD;
  const totalPicks = 1 + pickups.length;

  return (
    <>
      {dateFirst && (
        <p className="mb-1 text-sm font-semibold text-green-700 dark:text-green-400">
          {formatDate(load.loading_date) || "No date set"}
        </p>
      )}
      <div className={compact ? "flex flex-wrap items-baseline gap-x-4 gap-y-0" : "flex flex-wrap items-start justify-between gap-2"}>
        <div className={compact ? "flex flex-wrap items-baseline gap-x-3" : undefined}>
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
        <div className={compact ? "flex flex-wrap items-baseline gap-x-3 text-sm" : "text-right text-sm"}>
          {load.rate != null && (
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">
              ${load.rate.toLocaleString()}
            </p>
          )}
          {load.brokers?.name && <p className="text-black/60 dark:text-white/60">{load.brokers.name}</p>}
        </div>
      </div>

      {pickups.length > 0 && (
        <div className={`${compact ? "mt-0.5" : "mt-2"} space-y-0.5 text-xs text-black/60 dark:text-white/60`}>
          {pickups.map((p, i) => (
            <p key={p.id}>
              <span className="font-medium">Pickup {i + 1}: </span>
              {[p.pu_number && `#${p.pu_number}`, p.vendor, p.location].filter(Boolean).join(" ")}
            </p>
          ))}
        </div>
      )}

      <div className={`${compact ? "mt-0.5" : "mt-2"} space-y-1.5 text-xs text-black/60 dark:text-white/60`}>
        {multiDrop
          ? (!manyDrops || dropsExpanded) &&
            stops.map((stop, i) => (
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
        {manyDrops && (
          <button
            onClick={() => setDropsExpanded((e) => !e)}
            className="font-medium text-green-700 hover:underline dark:text-green-400"
          >
            {dropsExpanded ? "▲ Hide drops" : `▼ Show all ${stops.length} drops`}
          </button>
        )}
      </div>

      <LoadNotes notes={load.notes} compact={compact} />
    </>
  );
}

// The load's notes. Lines the email agent added ("[Agent 11/11] ...": a carrier's ETA or location, a
// delivered notice, a POD received) stand out as blue call-outs with their date, newest last; anything
// typed by hand stays as the small grey italic text.
const AGENT_LINE = /^\[Agent (\d{1,2}\/\d{1,2})\]\s*(.*)$/;
const AGENT_LINES_SHOWN = 3;

function LoadNotes({ notes, compact }: { notes: string | null; compact: boolean }) {
  const [showAll, setShowAll] = useState(false);
  if (!notes?.trim()) return null;
  const typed: string[] = [];
  const agent: { date: string; text: string }[] = [];
  for (const line of notes.split("\n")) {
    if (!line.trim()) continue;
    const m = AGENT_LINE.exec(line.trim());
    if (m) agent.push({ date: m[1], text: m[2] });
    else typed.push(line);
  }
  const hidden = showAll ? 0 : Math.max(0, agent.length - AGENT_LINES_SHOWN);
  const shown = hidden > 0 ? agent.slice(agent.length - AGENT_LINES_SHOWN) : agent;
  return (
    <div className={`${compact ? "mt-0.5" : "mt-1.5"} space-y-1`}>
      {typed.length > 0 && <p className="text-xs italic text-black/50 dark:text-white/50">{typed.join("\n")}</p>}
      {hidden > 0 && (
        <button onClick={() => setShowAll(true)} className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">
          ▼ {hidden} earlier email update{hidden === 1 ? "" : "s"}
        </button>
      )}
      {shown.map((a, i) => (
        <p key={i} className="rounded border-l-4 border-blue-500 bg-blue-50 px-2 py-1 text-sm font-semibold text-blue-900 dark:bg-blue-900/30 dark:text-blue-100">
          <span title="Added from the carrier's email reply">📧</span> <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{a.date}</span> {a.text}
        </p>
      ))}
    </div>
  );
}
