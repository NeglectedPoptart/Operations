"use client";

import { useState, type ReactNode } from "react";

// The "are you sure it's the right report?" pop-ups shown before an AR upload goes in.
// Level "double" is the normal check; "triple" is the extra, red one for a report whose
// date looks off (close to, or older than, the last upload).
export default function ArUploadConfirmModal({
  level,
  warnings,
  preview,
  busy,
  onConfirm,
  onCancel,
}: {
  level: "double" | "triple";
  warnings: string[];
  preview: ReactNode;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const triple = level === "triple";
  const [sure, setSure] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={busy ? undefined : onCancel}>
      <div
        className={`max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 text-black shadow-2xl ${triple ? "border-4 border-red-500" : "border-4 border-yellow-400"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={`text-xl font-extrabold ${triple ? "text-red-600" : "text-black"}`}>
          {triple ? "⚠ TRIPLE CHECK - is this really the right report?" : "DOUBLE CHECK - are you uploading the correct report?"}
        </h2>
        <p className="mt-1 text-sm text-black/70">
          {triple
            ? "The date on this report looks unusual compared with the last one loaded. Look at the highlighted report date and the customer list below before you go ahead."
            : "Uploading syncs the whole AR list: invoices that aren't in this file are removed along with their notes. Look at the highlighted report date and the customers below."}
        </p>
        {warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {warnings.map((w) => (
              <li key={w} className="rounded border border-red-400 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                ⚠ {w}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">{preview}</div>

        {triple && (
          <label className="mt-3 flex items-start gap-2 text-sm font-semibold">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5" />I have checked the report date and customers, and I&apos;m sure this is the correct report.
          </label>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="rounded-md border border-black/20 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50">
            Go back
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || (triple && !sure)}
            className={`rounded-md px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${triple ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}`}
          >
            {busy ? "Syncing..." : triple ? "Yes, upload this report" : "Yes, this is the right report"}
          </button>
        </div>
      </div>
    </div>
  );
}
