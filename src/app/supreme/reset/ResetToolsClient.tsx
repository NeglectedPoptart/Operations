"use client";

import { useState } from "react";
import { resetAllPageStatus } from "@/app/actions";
import { useConfirm } from "@/components/ConfirmProvider";

// Each entry is one self-contained reset action - adding a new one later is
// just pushing another object onto this array, no new plumbing needed.
interface ResetTool {
  key: string;
  title: string;
  description: string;
  confirmText: string;
  run: () => Promise<void>;
}

const TOOLS: ResetTool[] = [
  {
    key: "page-status",
    title: "Up to Date Statuses",
    description:
      'Clears every page\'s "Mark as Up to Date" confirmation (FOB Pharr, Delivered pricing, PAS Files, QC Agenda, Cold Inventory, AM Holdovers, Local Inbounds, Pending to Invoice) - everyone sees the amber "not confirmed" state again until they re-check and re-mark it.',
    confirmText: 'Reset every "Up to Date" button across the app? This affects everyone, not just this page.',
    run: resetAllPageStatus,
  },
];

export default function ResetToolsClient() {
  const confirm = useConfirm();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [doneKey, setDoneKey] = useState<string | null>(null);

  async function handleRun(tool: ResetTool) {
    if (!(await confirm(tool.confirmText))) return;
    setBusyKey(tool.key);
    try {
      await tool.run();
      setDoneKey(tool.key);
      setTimeout(() => setDoneKey(null), 2500);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reset Tools</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Admin-only maintenance actions - each one resets state across the whole app, not just one page, so use them
        deliberately.
      </p>

      <div className="space-y-4">
        {TOOLS.map((tool) => (
          <div key={tool.key} className="rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{tool.title}</h2>
                <p className="mt-1 text-sm text-black/60 dark:text-white/60">{tool.description}</p>
              </div>
              <button
                onClick={() => handleRun(tool)}
                disabled={busyKey === tool.key}
                className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busyKey === tool.key ? "Resetting..." : doneKey === tool.key ? "Reset!" : "Reset All"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
