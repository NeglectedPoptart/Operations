"use client";

import { useRef, useState } from "react";
import type { QcInspection } from "@/lib/types";
import { EmailModal } from "./InspectionPanel";
import { emailGroupReports } from "./reportActions";

const btn =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

// The "all reports" actions for a PO / lot that has several commodities, each
// with its own inspection and report. The commodities themselves are the rows
// listed under this panel - open one for its own report, photos and WhatsApp.
export default function GroupPanel({ items, onEmailed }: { items: QcInspection[]; onEmailed: (ids: string[]) => void }) {
  const [emailing, setEmailing] = useState(false);
  const printFrame = useRef<HTMLIFrameElement>(null);

  const withReports = items.filter((i) => i.lot_inspection_id);
  const ids = withReports.map((i) => i.lot_inspection_id as string);
  const without = items.length - withReports.length;
  const url = `/qc/inspections/group/report?ids=${ids.join(",")}`;

  function print() {
    const frame = printFrame.current;
    if (!frame) return;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    };
    frame.src = `${url}&t=${Date.now()}`;
  }

  return (
    <div className="space-y-2 px-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">All {ids.length} reports</span>
        <a href={url} target="_blank" rel="noreferrer" className={btn}>
          View all
        </a>
        <a href={`${url}&download=1`} className={btn}>
          Download all
        </a>
        <button onClick={print} className={btn}>
          Print all
        </button>
        <button onClick={() => setEmailing(true)} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>
          Email all ({ids.length} PDFs, one email)
        </button>
        <iframe ref={printFrame} title="Print reports" className="hidden" />
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">
        View, download and print join the reports into one PDF. Email all sends one email with a separate PDF for each commodity. For one
        commodity&apos;s own report, photos or WhatsApp message, open its row below.
        {without > 0 && ` ${without} row${without === 1 ? " has" : "s have"} no report and ${without === 1 ? "isn't" : "aren't"} included.`}
      </p>
      {emailing && (
        <EmailModal
          title={`Email all ${ids.length} reports`}
          send={(to, message) => emailGroupReports(ids, to, message)}
          onClose={() => setEmailing(false)}
          onSent={() => onEmailed(ids)}
        />
      )}
    </div>
  );
}
