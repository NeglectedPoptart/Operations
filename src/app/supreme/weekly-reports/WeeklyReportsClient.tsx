"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmProvider";
import type { BuiltReport } from "@/lib/weeklyReports/reports";
import { emailWeeklyReports, saveReportRecipients } from "./actions";

const field = "rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

export default function WeeklyReportsClient({
  end,
  today,
  label,
  reports,
  initialRecipients,
  canSend,
}: {
  end: string;
  today: string;
  label: string;
  reports: BuiltReport[];
  initialRecipients: string;
  canSend: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set(reports.map((r) => r.id)));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [recipients, setRecipients] = useState(initialRecipients);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  async function send() {
    const ids = reports.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (!(await confirm(`Email ${ids.length} report${ids.length === 1 ? "" : "s"} (${label}) to ${recipients}?`))) return;
    setResult(null);
    start(async () => {
      const r = await emailWeeklyReports({ end, ids, to: recipients });
      setResult("error" in r ? { ok: false, text: r.error } : { ok: true, text: r.sent });
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Weekly Reports</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            The 5 days ending <b>{end === today ? "today" : end}</b>: <b>{label}</b>
          </p>
        </div>
        <div className="flex items-end gap-2 text-sm">
          <label className="space-y-0.5">
            <span className="block text-xs text-black/60 dark:text-white/60">Last day of the range</span>
            <input type="date" value={end} max={today} onChange={(e) => e.target.value && router.push(`/supreme/weekly-reports?end=${e.target.value}`)} className={field} />
          </label>
          {end !== today && (
            <button onClick={() => router.push("/supreme/weekly-reports")} className="pb-1 text-sm font-medium text-green-700 hover:underline dark:text-green-400">
              Back to today
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.id} className="overflow-hidden rounded-xl border border-black/10 shadow-sm dark:border-white/10">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                className="h-4 w-4 accent-green-600"
                checked={selected.has(r.id)}
                onChange={() => setSelected((s) => toggle(s, r.id))}
                aria-label={`Include ${r.title}`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{r.title}</p>
                <p className="text-xs text-black/60 dark:text-white/60">{r.summary}</p>
              </div>
              <button onClick={() => setOpen((s) => toggle(s, r.id))} className="text-xs font-semibold text-green-700 hover:underline dark:text-green-400">
                {open.has(r.id) ? "Hide preview" : "Preview"}
              </button>
            </div>
            {open.has(r.id) && (
              <div className="overflow-x-auto border-t border-black/10 bg-white p-3 text-black dark:border-white/10" dangerouslySetInnerHTML={{ __html: r.html }} />
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-green-300 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-900/10">
        <p className="font-bold">Email the ticked reports</p>
        <label className="block space-y-0.5 text-sm">
          <span className="block text-xs text-black/60 dark:text-white/60">Send to (separate with commas) - remembered for next time</span>
          <input
            className={`${field} w-full`}
            value={recipients}
            placeholder="manager1@harvestbestinc.com, manager2@harvestbestinc.com"
            onChange={(e) => setRecipients(e.target.value)}
            onBlur={() => void saveReportRecipients(recipients)}
          />
        </label>
        <p className="text-xs text-black/60 dark:text-white/60">One email with each ticked report as a section. You get a blind copy, and replies come back to you.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void send()}
            disabled={pending || !canSend || selected.size === 0 || recipients.trim() === ""}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {pending ? "Sending..." : `Email ${selected.size} report${selected.size === 1 ? "" : "s"}`}
          </button>
          {!canSend && <span className="text-xs text-amber-600">Outlook isn&apos;t connected, so email can&apos;t be sent.</span>}
          {result && <span className={`text-sm font-medium ${result.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{result.text}</span>}
        </div>
      </div>
    </div>
  );
}
