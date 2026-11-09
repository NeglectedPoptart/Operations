"use client";

import { useState } from "react";
import { APP_TIMEZONE } from "@/lib/dates";
import type { Submissions } from "@/lib/brokerPortal/staffReview";
import type { Load } from "@/lib/types";
import { approvePod, rejectPod, reviewChargeRequest } from "./actions";
import { inputClass, money, smallBtn, useRun } from "./LoadExtras";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: APP_TIMEZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function loadLabel(load: Load | undefined): string {
  if (!load) return "a load";
  const stops = load.load_stops;
  const orders = stops.map((s) => (s.order_number ? `#${s.order_number}` : null)).filter(Boolean).join(", ");
  const client = stops[0]?.client_name ?? "";
  return [load.brokers?.name, orders || client].filter(Boolean).join(" - ") || "a load";
}

function Files({ files }: { files: { name: string; url: string | null }[] }) {
  return (
    <span className="text-xs">
      {files.map((f, i) => (
        <span key={i}>
          {i > 0 ? " · " : ""}
          {f.url ? (
            <a href={f.url} target="_blank" rel="noreferrer" className="font-medium text-green-700 hover:underline dark:text-green-400">
              📄 {f.name}
            </a>
          ) : (
            f.name
          )}
        </span>
      ))}
    </span>
  );
}

// Top of the List page: what carriers have sent that needs a decision - a POD to review (then the load
// is marked Delivered) and charges to approve. Disappears when there is nothing waiting.
export default function BrokerSubmissions({ submissions, loads }: { submissions: Submissions; loads: Load[] }) {
  const byId = new Map(loads.map((l) => [l.id, l]));
  if (submissions.pods.length === 0 && submissions.charges.length === 0) return null;
  return (
    <section className="space-y-3 rounded-xl border-2 border-amber-400 bg-amber-50/60 p-4 dark:bg-amber-900/10">
      <h2 className="text-lg font-bold text-amber-800 dark:text-amber-300">
        Carrier submissions to review ({submissions.pods.length + submissions.charges.length})
      </h2>
      {submissions.pods.map((p) => (
        <PodRow key={p.loadId} pod={p} label={loadLabel(byId.get(p.loadId))} />
      ))}
      {submissions.charges.map((c) => (
        <ChargeRow key={c.id} charge={c} label={loadLabel(byId.get(c.loadId))} />
      ))}
    </section>
  );
}

function PodRow({ pod, label }: { pod: Submissions["pods"][number]; label: string }) {
  const { busy, run } = useRun();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2 rounded-lg border border-black/10 bg-white p-3 text-black dark:border-white/10">
      <p className="text-sm">
        <b>POD uploaded</b> · {label} <span className="text-black/50">· {when(pod.submittedAt)}</span>
      </p>
      <Files files={pod.files} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50" disabled={busy} onClick={() => void run(() => approvePod(pod.loadId))}>
          Approve &amp; mark Delivered
        </button>
        <button className={smallBtn} disabled={busy} onClick={() => setRejecting((v) => !v)}>
          Send back
        </button>
      </div>
      {rejecting && (
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputClass} min-w-64 flex-1`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's wrong (the carrier sees this)" />
          <button className={smallBtn} disabled={busy || !reason.trim()} onClick={() => void run(() => rejectPod(pod.loadId, reason))}>
            Send back to carrier
          </button>
        </div>
      )}
    </div>
  );
}

function ChargeRow({ charge, label }: { charge: Submissions["charges"][number]; label: string }) {
  const { busy, run } = useRun();
  const [amount, setAmount] = useState(String(charge.amount));
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2 rounded-lg border border-black/10 bg-white p-3 text-black dark:border-white/10">
      <p className="text-sm">
        <b>Charge requested: {charge.kind}</b> · {money(charge.amount)} · {label} <span className="text-black/50">· {when(charge.submittedAt)}</span>
      </p>
      {charge.note && <p className="text-xs text-black/70">{charge.note}</p>}
      {charge.files.length > 0 && <Files files={charge.files} />}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs">
          Approve at $
          <input className={`${inputClass} w-24`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
        <input className={`${inputClass} min-w-48 flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the carrier (required to decline)" />
        <button
          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          disabled={busy}
          onClick={() => void run(() => reviewChargeRequest({ id: charge.id, decision: "approve", note, amount: Number(amount) }))}
        >
          Approve
        </button>
        <button className={smallBtn} disabled={busy || !note.trim()} onClick={() => void run(() => reviewChargeRequest({ id: charge.id, decision: "reject", note }))}>
          Decline
        </button>
      </div>
    </div>
  );
}
