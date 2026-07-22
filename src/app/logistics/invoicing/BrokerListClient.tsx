"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { formatTimestampSlash } from "@/lib/dates";
import type { Broker } from "@/lib/types";
import FighterJetToggle from "@/components/FighterJetToggle";
import { toggleRequestStatement, reorderBrokers } from "./actions";

export default function BrokerListClient({
  brokers,
  pendingCounts,
  doneCounts,
}: {
  brokers: Broker[];
  pendingCounts: Record<string, number>;
  doneCounts: Record<string, number>;
}) {
  const [order, setOrder] = useState<Broker[]>(brokers);
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

  if (order.length === 0) {
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
          const active = requested[b.id] ?? false;
          const cardClasses = `relative flex items-center gap-3 rounded-lg border p-4 shadow-sm transition ${
            active
              ? "border-red-500/60 bg-red-50 dark:bg-red-950/20"
              : "border-black/10 hover:border-green-600 dark:border-white/10"
          }`;

          const body = (
            <>
              <p className="font-medium">{b.name}</p>
              <p className="text-sm text-black/60 dark:text-white/60">
                {pending} pending · {done} done
              </p>
              <p className="text-xs text-black/40 dark:text-white/40">
                Last update: {formatTimestampSlash(b.last_activity_at) || "—"}
              </p>
              {active && (
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
              <FighterJetToggle active={active} onToggle={() => handleToggle(b.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
