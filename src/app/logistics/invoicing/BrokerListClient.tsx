"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { daysSince, formatTimestampSlash, isoDateOf } from "@/lib/dates";
import type { Broker } from "@/lib/types";
import FighterJetToggle from "@/components/FighterJetToggle";
import { toggleRequestStatement, reorderBrokers, setBrokerActive } from "./actions";

// Green when the Statement Checker was run on this carrier within the last
// 2 days (of whatever "today" is when the page loads) - a quick "have I
// fallen behind on this one" signal at a glance.
function checkedRecently(lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) return false;
  const days = daysSince(isoDateOf(lastCheckedAt));
  return days !== null && days <= 2;
}

// A tile's own status coloring (green/yellow) always yields to the
// statement-request toggle, which the office actively clicked to flag this
// carrier - that intent should never be visually buried under whatever the
// aging happens to say.
function tileToneClasses(tone: "requested" | "green" | "yellow"): string {
  if (tone === "requested") {
    return "border-red-300/70 bg-red-50/60 dark:border-red-800/50 dark:bg-red-950/10";
  }
  if (tone === "green") {
    return "border-green-500/40 bg-green-50 hover:border-green-600 dark:border-green-700/40 dark:bg-green-950/20";
  }
  return "border-yellow-500/40 bg-yellow-50 hover:border-yellow-600 dark:border-yellow-700/40 dark:bg-yellow-950/20";
}

export default function BrokerListClient({
  brokers,
  pendingCounts,
  doneCounts,
  flaggedCounts,
  overdueBrokerIds,
}: {
  brokers: Broker[];
  pendingCounts: Record<string, number>;
  doneCounts: Record<string, number>;
  flaggedCounts: Record<string, number>;
  overdueBrokerIds: Record<string, boolean>;
}) {
  // Active brokers stay in their own drag-orderable list (unchanged from
  // before); inactive ones move to a separate, non-reorderable list sorted
  // by name - toggling active/inactive moves a broker between the two.
  const [order, setOrder] = useState<Broker[]>(brokers.filter((b) => b.active));
  const [inactiveBrokers, setInactiveBrokers] = useState<Broker[]>(
    brokers.filter((b) => !b.active).sort((a, b) => a.name.localeCompare(b.name)),
  );
  const [editMode, setEditMode] = useState(false);
  const [requested, setRequested] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(brokers.map((b) => [b.id, b.request_statement])),
  );
  const [, startTransition] = useTransition();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const dragStartOrder = useRef<Broker[] | null>(null);

  function handleToggle(id: string) {
    const next = !requested[id];
    setRequested((prev) => ({ ...prev, [id]: next }));
    startTransition(async () => {
      try {
        await toggleRequestStatement(id, next);
      } catch {
        setRequested((prev) => ({ ...prev, [id]: !next }));
      }
    });
  }

  function handleActiveToggle(broker: Broker, nextActive: boolean) {
    if (nextActive) {
      setInactiveBrokers((prev) => prev.filter((b) => b.id !== broker.id));
      setOrder((prev) => [...prev, { ...broker, active: true }]);
    } else {
      setOrder((prev) => prev.filter((b) => b.id !== broker.id));
      setInactiveBrokers((prev) => [...prev, { ...broker, active: false }].sort((a, b) => a.name.localeCompare(b.name)));
    }
    startTransition(async () => {
      try {
        await setBrokerActive(broker.id, nextActive);
      } catch {
        // Revert the optimistic move on failure.
        if (nextActive) {
          setOrder((prev) => prev.filter((b) => b.id !== broker.id));
          setInactiveBrokers((prev) => [...prev, { ...broker, active: false }].sort((a, b) => a.name.localeCompare(b.name)));
        } else {
          setInactiveBrokers((prev) => prev.filter((b) => b.id !== broker.id));
          setOrder((prev) => [...prev, { ...broker, active: true }]);
        }
      }
    });
  }

  function handleDragStart(index: number) {
    dragStartOrder.current = order;
    setDraggedIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDraggedIndex(index);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const previous = dragStartOrder.current;
    const finalOrder = order;
    setDraggedIndex(null);
    dragStartOrder.current = null;
    if (!previous || previous.map((b) => b.id).join() === finalOrder.map((b) => b.id).join()) return;
    startTransition(async () => {
      try {
        await reorderBrokers(finalOrder.map((b) => b.id));
      } catch {
        setOrder(previous);
      }
    });
  }

  function handleDragEnd() {
    setDraggedIndex(null);
    dragStartOrder.current = null;
  }

  if (order.length === 0 && inactiveBrokers.length === 0) {
    return (
      <p className="text-sm text-black/40 dark:text-white/40">
        No brokers yet - add one from a Load form on the Board first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            editMode
              ? "bg-green-600 text-white hover:bg-green-700"
              : "border border-black/20 text-black/70 hover:border-green-600 hover:text-green-700 dark:border-white/20 dark:text-white/70"
          }`}
        >
          {editMode ? "Done arranging" : "Edit layout"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {order.map((b, index) => {
          const pending = pendingCounts[b.id] ?? 0;
          const done = doneCounts[b.id] ?? 0;
          const flagged = flaggedCounts[b.id] ?? 0;
          const total = pending + done;
          const statementRequested = requested[b.id] ?? false;
          // All caught up (nothing pending, so nothing can be sitting overdue
          // either) -> green; anything still pending, aging or not -> yellow.
          // A clicked statement request always wins over either.
          const tone: "requested" | "green" | "yellow" = statementRequested
            ? "requested"
            : pending === 0 && !overdueBrokerIds[b.id]
              ? "green"
              : "yellow";
          const cardClasses = `relative flex items-center gap-3 rounded-lg border p-4 shadow-sm transition ${tileToneClasses(tone)}`;

          const body = (
            <>
              <p className="font-medium">{b.name}</p>
              <p className="text-sm text-black/60 dark:text-white/60">
                {pending} pending · {done} done · {total} total
              </p>
              {flagged > 0 && (
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                  🚩 {flagged} flagged
                </p>
              )}
              <p className="text-xs text-black/40 dark:text-white/40">
                Last update: {formatTimestampSlash(b.last_activity_at) || "—"}
              </p>
              <p
                className={`text-xs ${
                  checkedRecently(b.last_statement_checked_at)
                    ? "font-semibold text-green-600 dark:text-green-400"
                    : "text-black/40 dark:text-white/40"
                }`}
              >
                Last statement checked: {formatTimestampSlash(b.last_statement_checked_at) || "—"}
              </p>
              {statementRequested && (
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                  Statement requested
                </p>
              )}
            </>
          );

          if (editMode) {
            return (
              <div
                key={b.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className={`${cardClasses} cursor-grab select-none active:cursor-grabbing ${
                  draggedIndex === index ? "opacity-40" : ""
                }`}
              >
                <span
                  aria-hidden
                  className="shrink-0 text-lg leading-none text-black/30 dark:text-white/30"
                >
                  ⠿
                </span>
                <div className="min-w-0 flex-1">{body}</div>
              </div>
            );
          }

          return (
            <div key={b.id} className={cardClasses}>
              <Link href={`/logistics/invoicing/${b.id}`} className="min-w-0 flex-1">
                {body}
              </Link>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <FighterJetToggle active={statementRequested} onToggle={() => handleToggle(b.id)} />
                <button
                  type="button"
                  onClick={() => handleActiveToggle(b, false)}
                  className="text-xs font-medium text-black/40 hover:text-black/70 hover:underline dark:text-white/40 dark:hover:text-white/70"
                >
                  Mark Inactive
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {inactiveBrokers.length > 0 && (
        <div className="space-y-2 border-t border-black/10 pt-4 dark:border-white/10">
          <h2 className="text-sm font-semibold text-black/50 dark:text-white/50">
            Not Actively Using ({inactiveBrokers.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inactiveBrokers.map((b) => {
              const pending = pendingCounts[b.id] ?? 0;
              const done = doneCounts[b.id] ?? 0;
              const total = pending + done;
              return (
                <div
                  key={b.id}
                  className="relative flex items-center gap-3 rounded-lg border border-black/10 bg-black/[0.03] p-4 opacity-60 grayscale transition hover:opacity-80 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <Link href={`/logistics/invoicing/${b.id}`} className="min-w-0 flex-1">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-sm text-black/60 dark:text-white/60">
                      {pending} pending · {done} done · {total} total
                    </p>
                    <p className="text-xs text-black/40 dark:text-white/40">
                      Last update: {formatTimestampSlash(b.last_activity_at) || "—"}
                    </p>
                    <p
                      className={`text-xs ${
                        checkedRecently(b.last_statement_checked_at)
                          ? "font-semibold text-green-600 dark:text-green-400"
                          : "text-black/40 dark:text-white/40"
                      }`}
                    >
                      Last statement checked: {formatTimestampSlash(b.last_statement_checked_at) || "—"}
                    </p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleActiveToggle(b, true)}
                    className="shrink-0 rounded-md border border-green-600 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                  >
                    Reactivate
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
