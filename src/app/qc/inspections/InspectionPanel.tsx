"use client";

import { useEffect, useRef, useState } from "react";
import { emailInspectionReport, getInspectionDetail, type InspectionDetail } from "./reportActions";

const btn =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";
const RECIPIENTS_KEY = "qc-report-recipients";

function EmailModal({
  inspectionId,
  onClose,
  onSent,
}: {
  inspectionId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(() => {
    try {
      return window.localStorage.getItem(RECIPIENTS_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string[] | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const result = await emailInspectionReport(inspectionId, to, message);
      if ("error" in result) setError(result.error);
      else {
        setSentTo(result.sentTo);
        try {
          window.localStorage.setItem(RECIPIENTS_KEY, to);
        } catch {
          // remembering recipients is only a convenience
        }
        onSent();
      }
    } catch {
      setError("Couldn't send - try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 text-black shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Email report</h2>
          <button onClick={onClose} aria-label="Close" className="text-black/50 hover:text-black">
            ✕
          </button>
        </div>
        {sentTo ? (
          <div className="space-y-3">
            <p className="text-sm text-green-700">Sent to {sentTo.join(", ")} with the report attached.</p>
            <button onClick={onClose} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
              Done
            </button>
          </div>
        ) : (
          <>
            <label className="block text-sm">
              To (separate several with commas)
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="buyer@company.com, grower@company.com"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
              />
            </label>
            <label className="block text-sm">
              Message (optional)
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Please find the quality inspection report attached."
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black"
              />
            </label>
            <p className="text-xs text-black/50">Sent from the HOPS mailbox with the PDF attached. Replies come to you.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5">
                Cancel
              </button>
              <button
                onClick={send}
                disabled={busy || to.trim() === ""}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {busy ? "Sending..." : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// The drop-down under a history row: summary, photos, and the report actions.
export default function InspectionPanel({
  inspectionId,
  onEmailed,
}: {
  inspectionId: string;
  onEmailed: () => void;
}) {
  const [detail, setDetail] = useState<InspectionDetail | null | undefined>(undefined);
  const [emailing, setEmailing] = useState(false);
  const printFrame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let live = true;
    getInspectionDetail(inspectionId)
      .then((d) => live && setDetail(d))
      .catch(() => live && setDetail(null));
    return () => {
      live = false;
    };
  }, [inspectionId]);

  const reportUrl = `/qc/inspections/${inspectionId}/report`;

  function print() {
    const frame = printFrame.current;
    if (!frame) return;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    };
    frame.src = `${reportUrl}?t=${Date.now()}`;
  }

  if (detail === undefined) return <p className="px-2 py-3 text-sm text-black/50 dark:text-white/50">Loading...</p>;
  if (detail === null) return <p className="px-2 py-3 text-sm text-black/50 dark:text-white/50">The full report for this row couldn&apos;t be loaded.</p>;

  return (
    <div className="space-y-3 px-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <a href={reportUrl} target="_blank" rel="noreferrer" className={btn}>
          View report
        </a>
        <a href={`${reportUrl}?download=1`} className={btn}>
          Download PDF
        </a>
        <button onClick={print} className={btn}>
          Print
        </button>
        <button onClick={() => setEmailing(true)} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>
          Email report
        </button>
        <iframe ref={printFrame} title="Print report" className="hidden" />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <span className="block text-xs text-black/50 dark:text-white/50">Plan</span>
          {detail.planName}
        </div>
        <div>
          <span className="block text-xs text-black/50 dark:text-white/50">Inspected by</span>
          {detail.inspectorName ?? "-"}
        </div>
        <div>
          <span className="block text-xs text-black/50 dark:text-white/50">Sample size</span>
          {detail.sampleSize ?? "-"}
        </div>
        <div>
          <span className="block text-xs text-black/50 dark:text-white/50">Result</span>
          <span className="font-semibold">{detail.result ?? "-"}</span>
        </div>
        <div>
          <span className="block text-xs text-black/50 dark:text-white/50">Serious defects</span>
          {detail.serious}
        </div>
        <div>
          <span className="block text-xs text-black/50 dark:text-white/50">Non-serious defects</span>
          {detail.nonSerious}
        </div>
        <div>
          <span className="block text-xs text-black/50 dark:text-white/50">Total defects</span>
          <span className="font-semibold">{detail.total}</span>
        </div>
      </div>
      {(detail.notes1 || detail.notes2) && (
        <div className="space-y-1 text-sm">
          {detail.notes1 && <p>{detail.notes1}</p>}
          {detail.notes2 && <p className="text-black/70 dark:text-white/70">{detail.notes2}</p>}
        </div>
      )}

      {detail.photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {detail.photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="Inspection photo" loading="lazy" className="aspect-square w-full rounded-md object-cover" />
            </a>
          ))}
        </div>
      ) : (
        <p className="text-sm text-black/50 dark:text-white/50">No photos on this inspection.</p>
      )}

      {emailing && <EmailModal inspectionId={inspectionId} onClose={() => setEmailing(false)} onSent={onEmailed} />}
    </div>
  );
}
