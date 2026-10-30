"use client";

import { useState } from "react";
import LoadSummary from "@/components/LoadSummary";
import { todayISO } from "@/lib/dates";
import type { LoadCharge } from "@/lib/loadCharges";
import type { Broker, Load } from "@/lib/types";
import LoadModal from "./LoadModal";
import { ClaimBanner, LoadClaimCharges, RequestUpdateButton, inputClass, smallBtn, useRun } from "./LoadExtras";
import {
  markPendingOrdersSeen,
  setPodPending,
  updateLoadQuick,
  updateLoadRateConSent,
  updateLoadReady,
  updateLoadStatus,
} from "./actions";

const noEta = (l: Load) => !l.eta_note?.trim();

type Tab = "all" | "pending" | "road";

// The Logistics List's order check: everything that needs a look in one big window -
// loads still Pending to Load from before today, and loads On the Road (the ones with no
// carrier ETA yet stand out). From here you can move a load along, mark it delivered,
// flag it Ready / Rate Con / POD / Claim, add freight charges, and edit it.
// Opens by itself the first time each day (autoOpen); the button opens it any time.
export default function PendingOrdersCheck({
  loads,
  chargesByLoadId,
  brokers,
  hubOptions,
  cityOptions,
  autoOpen,
}: {
  loads: Load[];
  chargesByLoadId: Record<string, LoadCharge[]>;
  brokers: Broker[];
  hubOptions: string[];
  cityOptions: string[];
  autoOpen: boolean;
}) {
  const today = todayISO();
  const [open, setOpen] = useState(autoOpen);
  const [tab, setTab] = useState<Tab>("all");
  const [includeFuture, setIncludeFuture] = useState(false);
  const [onlyNoEta, setOnlyNoEta] = useState(false);
  const [onlyClaims, setOnlyClaims] = useState(false);
  const [editing, setEditing] = useState<Load | null>(null);

  const pendingAll = loads
    .filter((l) => l.status === "pending_to_load" && l.loading_date !== null && (includeFuture || l.loading_date < today))
    .sort((a, b) => (a.loading_date ?? "").localeCompare(b.loading_date ?? ""));
  // On the Road: loads with no carrier ETA first, then by loading date.
  const roadAll = loads
    .filter((l) => l.status === "on_the_road")
    .sort((a, b) => Number(noEta(b)) - Number(noEta(a)) || (a.loading_date ?? "").localeCompare(b.loading_date ?? ""));

  const noEtaCount = roadAll.filter(noEta).length;
  const claimCount = [...pendingAll, ...roadAll].filter((l) => l.claim_flag).length;
  // "No carrier ETA" is about loads on the road, so it leaves the pending list empty.
  const pending = onlyNoEta ? [] : pendingAll.filter((l) => !onlyClaims || l.claim_flag);
  const road = roadAll.filter((l) => (!onlyNoEta || noEta(l)) && (!onlyClaims || l.claim_flag));

  async function close() {
    setOpen(false);
    await markPendingOrdersSeen().catch(() => {});
  }

  const attention = pendingAll.length + noEtaCount;
  const chipClass = (on: boolean) => `rounded-full border px-3 py-1 text-xs font-semibold ${on ? "border-green-700 bg-green-600 text-white" : "border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"}`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-md border px-3 py-1.5 text-sm font-medium ${attention > 0 ? "border-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200" : "border-black/20 hover:bg-black/5 dark:border-white/20"}`}
      >
        Order Check
        {attention > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-white">{attention}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-5">
          <div className="flex h-[94vh] w-full max-w-[1600px] flex-col rounded-xl bg-white shadow-2xl dark:bg-neutral-900">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 px-5 py-3 dark:border-white/10">
              <div>
                <h2 className="text-xl font-bold text-green-700 dark:text-green-400">Order Check</h2>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Loads still Pending to Load from before today, and everything On the Road. Update them here, or leave them for later on the board.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-amber-100 px-2 py-1 font-semibold text-amber-900">{pendingAll.length} pending to load</span>
                <span className="rounded bg-blue-100 px-2 py-1 font-semibold text-blue-900">{roadAll.length} on the road</span>
                <span className={`rounded px-2 py-1 font-semibold ${noEtaCount > 0 ? "bg-red-600 text-white" : "bg-green-100 text-green-900"}`}>{noEtaCount} without a carrier ETA</span>
                {claimCount > 0 && <span className="rounded bg-red-100 px-2 py-1 font-semibold text-red-800">🚩 {claimCount} claim{claimCount === 1 ? "" : "s"}</span>}
                <button onClick={() => void close()} className="ml-2 rounded-md bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700">
                  Done for now
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-5 py-2 dark:border-white/10">
              {(
                [
                  ["all", "Everything"],
                  ["pending", "Pending to Load"],
                  ["road", "On the Road"],
                ] as const
              ).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} className={chipClass(tab === key)}>
                  {label}
                </button>
              ))}
              <span className="mx-2 h-5 w-px bg-black/15 dark:bg-white/20" />
              <label className="flex items-center gap-1.5 text-xs font-medium">
                <input type="checkbox" checked={onlyNoEta} onChange={(e) => setOnlyNoEta(e.target.checked)} />
                Only loads with no carrier ETA
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium">
                <input type="checkbox" checked={onlyClaims} onChange={(e) => setOnlyClaims(e.target.checked)} />
                Only claims
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium">
                <input type="checkbox" checked={includeFuture} onChange={(e) => setIncludeFuture(e.target.checked)} />
                Also show pending loads for today and later
              </label>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
              {tab !== "road" && (
                <section>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Pending to Load {includeFuture ? "" : "- before today"} ({pending.length})
                  </h3>
                  {pending.length === 0 ? (
                    <p className="text-sm text-black/50 dark:text-white/50">Nothing pending to change.</p>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {pending.map((l) => (
                        <CheckCard key={l.id} load={l} kind="pending" charges={chargesByLoadId[l.id] ?? []} onFullEdit={() => setEditing(l)} />
                      ))}
                    </div>
                  )}
                </section>
              )}
              {tab !== "pending" && (
                <section>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400">On the Road ({road.length})</h3>
                  {road.length === 0 ? (
                    <p className="text-sm text-black/50 dark:text-white/50">Nothing on the road{onlyNoEta ? " without an ETA" : ""}.</p>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {road.map((l) => (
                        <CheckCard key={l.id} load={l} kind="road" charges={chargesByLoadId[l.id] ?? []} onFullEdit={() => setEditing(l)} />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* The full load editor (stops, pickups, broker...) sits above the check. */}
      {editing && (
        <div className="relative z-[60]">
          <LoadModal load={editing} brokers={brokers} hubOptions={hubOptions} cityOptions={cityOptions} initialStatus={editing.status} onClose={() => setEditing(null)} />
        </div>
      )}
    </>
  );
}

function CheckCard({ load, kind, charges, onFullEdit }: { load: Load; kind: "pending" | "road"; charges: LoadCharge[]; onFullEdit: () => void }) {
  const [editing, setEditing] = useState(false);
  const { busy, run } = useRun(() => setEditing(false));
  const [edit, setEdit] = useState({ loading_date: "", rate: "", notes: "", eta_note: "" });

  const missingEta = kind === "road" && noEta(load);

  const tone = load.claim_flag
    ? "border-red-500 bg-red-50/60 dark:bg-red-950/20"
    : missingEta
      ? "border-red-400 bg-red-50 dark:bg-red-950/20"
      : kind === "road"
        ? "border-blue-400/70 bg-blue-50/40 dark:bg-blue-950/10"
        : "border-amber-400/70 bg-amber-50/50 dark:bg-amber-950/10";

  const flag = (on: boolean, onLabel: string, offLabel: string, onClick: () => void) => (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded px-2 py-1 text-xs font-medium ${on ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}
    >
      {on ? onLabel : offLabel}
    </button>
  );

  return (
    <div className={`space-y-2 rounded-lg border-2 p-3 ${tone}`}>
      <ClaimBanner load={load} />
      {missingEta && <p className="rounded bg-red-600 px-2.5 py-1 text-xs font-bold text-white">⚠ No carrier ETA yet</p>}

      <LoadSummary load={load} dateFirst={kind === "pending"} compact />

      {kind === "road" && (
        <label className="flex items-center gap-2 text-xs font-medium">
          <span className={missingEta ? "font-bold text-red-700 dark:text-red-300" : "text-black/60 dark:text-white/60"}>Carrier ETA</span>
          <input
            key={load.eta_note ?? ""}
            defaultValue={load.eta_note ?? ""}
            placeholder="Type the carrier's ETA..."
            onBlur={(e) => {
              if (e.target.value.trim() !== (load.eta_note ?? "").trim()) void run(() => updateLoadQuick(load.id, { eta_note: e.target.value }));
            }}
            className={`${inputClass} min-w-0 flex-1 ${missingEta ? "border-red-500 ring-1 ring-red-400" : ""}`}
          />
        </label>
      )}

      <LoadClaimCharges
        load={load}
        charges={charges}
        flags={
          <>
            {kind === "pending" && flag(load.ready_to_load, "Ready to Load", "Not Ready", () => void run(() => updateLoadReady(load.id, !load.ready_to_load)))}
            {flag(load.rate_con_sent, "Rate Con Sent", "⚠ Rate Con Not Sent", () => void run(() => updateLoadRateConSent(load.id, !load.rate_con_sent)))}
            {kind === "road" && (
              <button
                onClick={() => void run(() => setPodPending(load.id, !load.pod_pending))}
                disabled={busy}
                className={`rounded px-2 py-1 text-xs font-medium ${load.pod_pending ? "bg-amber-200 text-amber-900" : "border border-black/20 hover:bg-black/5 dark:border-white/20"}`}
                title="The carrier says it is delivered - waiting on the signed POD"
              >
                📄 {load.pod_pending ? "Pending POD" : "Mark pending POD"}
              </button>
            )}
            {kind === "road" && <RequestUpdateButton load={load} className="rounded-md border border-black/20 px-2 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20" />}
          </>
        }
      />

      {editing && (
        <div className="grid grid-cols-2 gap-2 rounded border border-black/15 bg-white/70 p-2 dark:border-white/15 dark:bg-white/5">
          <label className="text-xs font-medium">
            Loading date
            <input type="date" value={edit.loading_date} onChange={(e) => setEdit({ ...edit, loading_date: e.target.value })} className={`${inputClass} mt-0.5 block w-full`} />
          </label>
          <label className="text-xs font-medium">
            Freight rate $
            <input type="number" step="0.01" value={edit.rate} onChange={(e) => setEdit({ ...edit, rate: e.target.value })} className={`${inputClass} mt-0.5 block w-full`} />
          </label>
          <label className="col-span-2 text-xs font-medium">
            Carrier ETA
            <input value={edit.eta_note} onChange={(e) => setEdit({ ...edit, eta_note: e.target.value })} className={`${inputClass} mt-0.5 block w-full`} />
          </label>
          <label className="col-span-2 text-xs font-medium">
            Notes
            <textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={2} className={`${inputClass} mt-0.5 block w-full`} />
          </label>
          <div className="col-span-2 flex gap-2">
            <button
              disabled={busy}
              onClick={() =>
                void run(() =>
                  updateLoadQuick(load.id, {
                    loading_date: edit.loading_date || null,
                    rate: edit.rate === "" ? null : Number(edit.rate),
                    notes: edit.notes,
                    eta_note: edit.eta_note,
                  }),
                )
              }
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className={smallBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-2">
          {kind === "pending" && (
            <button
              onClick={() => void run(() => updateLoadStatus(load.id, "on_the_road"))}
              disabled={busy}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              On the Road
            </button>
          )}
          <button
            onClick={() => void run(() => updateLoadStatus(load.id, "complete"))}
            disabled={busy}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            Delivered
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEdit({ loading_date: load.loading_date ?? "", rate: load.rate !== null ? String(load.rate) : "", notes: load.notes ?? "", eta_note: load.eta_note ?? "" });
              setEditing((v) => !v);
            }}
            className={smallBtn}
          >
            Quick edit
          </button>
          <button onClick={onFullEdit} className={smallBtn}>
            Full edit...
          </button>
        </div>
      </div>
    </div>
  );
}
