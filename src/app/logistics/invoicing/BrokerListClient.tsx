"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Broker } from "@/lib/types";
import FighterJetToggle from "@/components/FighterJetToggle";
import { toggleRequestStatement, reorderBrokers } from "./actions";

export default function BrokerListClient({
  brokers,
  pendingCounts,
}: {
  brokers: Broker[];
  pendingCounts: Record<string, number>;
}) {
  const [order, setOrder] = useState<Broker[]>(brokers);
  const [editMode, setEditMode] = useState(false);
  const [requested, setRequested] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(brokers.map((b) => [b.id, b.request_statement])),
  );
  const [, startTransition] = useTransition();

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

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    const previous = order;
    setOrder(next);
    startTransition(async () => {
      try {
        await reorderBrokers(next.map((b) => b.id));
      } catch {
        setOrder(previous);
      }
    });
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
                {pending} pending invoice{pending === 1 ? "" : "s"}
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
              <div key={b.id} className={cardClasses}>
                <div className="min-w-0 flex-1">{body}</div>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${b.name} up`}
                    className="flex h-6 w-8 items-center justify-center rounded border border-black/20 text-xs font-bold disabled:opacity-30 dark:border-white/20"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    aria-label={`Move ${b.name} down`}
                    className="flex h-6 w-8 items-center justify-center rounded border border-black/20 text-xs font-bold disabled:opacity-30 dark:border-white/20"
                  >
                    ▼
                  </button>
                </div>
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
