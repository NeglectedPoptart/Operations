"use client";

import { useState } from "react";
import { markDailyReminderSeen } from "@/app/actions";
import type { DailyReminderCheck } from "@/lib/dailyReminders";

function ReminderRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
        ok
          ? "border-green-500/30 bg-green-50 text-green-800 dark:border-green-800/40 dark:bg-green-950/20 dark:text-green-300"
          : "border-amber-500/30 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300"
      }`}
    >
      <span aria-hidden="true">{ok ? "✅" : "⚠️"}</span>
      <span>{label}</span>
    </div>
  );
}

export default function DailyReminderModal({ check }: { check: DailyReminderCheck }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const coldInventoryGood = check.coldInventoryTotalCount === 0 || check.coldInventoryNotGreenCount === 0;

  async function handleDismiss() {
    setDismissed(true);
    await markDailyReminderSeen().catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-900">
        <div>
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Daily Check</h2>
          <p className="text-xs text-black/50 dark:text-white/50">Before you get started today:</p>
        </div>
        <div className="space-y-2">
          <ReminderRow
            ok={check.oldAgeUpdatedToday}
            label={check.oldAgeUpdatedToday ? "Old Age updated today" : "Old Age hasn't been updated yet today"}
          />
          <ReminderRow
            ok={check.qcAgendaUpdatedToday}
            label={check.qcAgendaUpdatedToday ? "QC Agenda updated today" : "QC Agenda hasn't been updated yet today"}
          />
          <ReminderRow
            ok={coldInventoryGood}
            label={
              check.coldInventoryTotalCount === 0
                ? "Cold Inventory is empty"
                : coldInventoryGood
                  ? `Cold Inventory - all ${check.coldInventoryTotalCount} items are green`
                  : `Cold Inventory - ${check.coldInventoryNotGreenCount} of ${check.coldInventoryTotalCount} items are not green`
            }
          />
        </div>
        <button
          onClick={handleDismiss}
          className="w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
