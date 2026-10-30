"use client";

import { useState, type ReactNode } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate } from "@/lib/dates";
import { CHARGE_KINDS, type LoadCharge } from "@/lib/loadCharges";
import type { Load } from "@/lib/types";
import { addLoadCharge, deleteLoadCharge, requestCarrierUpdate, setLoadClaim } from "./actions";

// The Claim flag and the extra freight charges on a load - shared by the List's load
// cards and the Order Check window, so they work the same in both.

export const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const smallBtn = "rounded-md border border-black/20 px-2.5 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";
export const inputClass = "rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black placeholder:text-black/40";

// Runs a server action, shows its error if it returns one, and tracks "busy".
export function useRun(onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      const result = await fn();
      if (result && typeof result === "object" && "error" in result) alert(String((result as { error: string }).error));
      else onDone?.();
    } catch {
      alert("Couldn't save that - try again.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

// Emails the load's carrier asking for a location / ETA (and the signed POD if it is delivered).
// Sends the same email the Load ETA agent sends, right now; replies are read back the same way.
export function RequestUpdateButton({ load, className = smallBtn }: { load: Load; className?: string }) {
  const confirm = useConfirm();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const carrier = load.brokers?.name ?? "the carrier";

  async function send() {
    if (!(await confirm(`Email ${carrier} asking for a location and ETA on this load?`))) return;
    setState("sending");
    try {
      const result = await requestCarrierUpdate(load.id);
      if ("error" in result) {
        alert(result.error);
        setState("idle");
      } else {
        setState("sent");
        setTimeout(() => setState("idle"), 8000);
      }
    } catch {
      alert("Couldn't send the email - try again.");
      setState("idle");
    }
  }

  return (
    <button
      onClick={() => void send()}
      disabled={state === "sending"}
      title={`Email ${carrier} asking for a current location and ETA (and the POD if delivered)`}
      className={`${className} ${state === "sent" ? "!border-green-600 !text-green-700" : ""}`}
    >
      {state === "sending" ? "Sending..." : state === "sent" ? "✓ Update requested" : "✉ Request update"}
    </button>
  );
}

// The red bar across a load that is flagged as a Claim.
export function ClaimBanner({ load }: { load: Load }) {
  const { busy, run } = useRun();
  if (!load.claim_flag) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white">
      <span>
        🚩 CLAIM{load.claim_note ? ` - ${load.claim_note}` : ""}
        {load.claim_flagged_by ? ` (flagged by ${load.claim_flagged_by}${load.claim_flagged_at ? `, ${formatDate(load.claim_flagged_at.slice(0, 10))}` : ""})` : ""}
      </span>
      <button onClick={() => void run(() => setLoadClaim(load.id, false, ""))} disabled={busy} className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30">
        Clear claim
      </button>
    </div>
  );
}

// "Flag as Claim" plus the charges box (freight + extra charges = total) with its add form.
// `flags` are the load's other flag buttons, shown on the same row as the Claim one.
export function LoadClaimCharges({ load, charges, flags }: { load: Load; charges: LoadCharge[]; flags?: ReactNode }) {
  const confirm = useConfirm();
  const [panel, setPanel] = useState<null | "charge" | "claim">(null);
  const { busy, run } = useRun(() => setPanel(null));
  const [charge, setCharge] = useState({ kind: CHARGE_KINDS[0] as string, amount: "", note: "" });
  const [claimNote, setClaimNote] = useState("");
  const chargeTotal = charges.reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="space-y-2">
      {(flags || !load.claim_flag) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {flags}
          {!load.claim_flag && (
            <button onClick={() => setPanel(panel === "claim" ? null : "claim")} disabled={busy} className={`${smallBtn} text-red-700 dark:text-red-300`}>
              🚩 Flag as Claim
            </button>
          )}
        </div>
      )}

      <div className="rounded border border-black/10 bg-white/60 px-2.5 py-1.5 text-xs dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">
            Freight {load.rate !== null ? money(Number(load.rate)) : "-"}
            {charges.length > 0 && (
              <>
                {" "}
                + charges {money(chargeTotal)} = <b>{money((load.rate !== null ? Number(load.rate) : 0) + chargeTotal)}</b>
              </>
            )}
          </span>
          <button onClick={() => setPanel(panel === "charge" ? null : "charge")} disabled={busy} className={smallBtn}>
            + Add charge
          </button>
        </div>
        {charges.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>
                  <b>{c.kind}</b> {money(Number(c.amount))}
                  {c.note ? ` - ${c.note}` : ""}
                  <span className="text-black/40 dark:text-white/40">{c.created_by ? ` · ${c.created_by}` : ""}</span>
                </span>
                <button
                  onClick={async () => {
                    if (await confirm(`Remove the ${c.kind} charge of ${money(Number(c.amount))}?`)) void run(() => deleteLoadCharge(c.id));
                  }}
                  disabled={busy}
                  title="Remove this charge"
                  className="text-red-600 hover:underline"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {panel === "charge" && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-black/15 bg-white/70 p-2 dark:border-white/15 dark:bg-white/5">
          <label className="text-xs font-medium">
            Charge
            <select value={charge.kind} onChange={(e) => setCharge({ ...charge, kind: e.target.value })} className={`${inputClass} mt-0.5 block`}>
              {CHARGE_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            Amount $ (minus = credit)
            <input type="number" step="0.01" value={charge.amount} onChange={(e) => setCharge({ ...charge, amount: e.target.value })} className={`${inputClass} mt-0.5 block w-28`} />
          </label>
          <label className="min-w-[10rem] flex-1 text-xs font-medium">
            Note
            <input value={charge.note} onChange={(e) => setCharge({ ...charge, note: e.target.value })} placeholder="What happened" className={`${inputClass} mt-0.5 block w-full`} />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await addLoadCharge({ loadId: load.id, kind: charge.kind, amount: Number(charge.amount), note: charge.note });
                if (!("error" in result)) setCharge({ kind: CHARGE_KINDS[0], amount: "", note: "" });
                return result;
              })
            }
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {panel === "claim" && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-red-300 bg-white/70 p-2 dark:bg-white/5">
          <label className="min-w-[12rem] flex-1 text-xs font-medium">
            What happened? (so it can be reviewed later)
            <input value={claimNote} onChange={(e) => setClaimNote(e.target.value)} placeholder="e.g. Product arrived warm, driver late..." className={`${inputClass} mt-0.5 block w-full`} />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await setLoadClaim(load.id, true, claimNote);
                if (!("error" in result)) setClaimNote("");
                return result;
              })
            }
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Flag as Claim
          </button>
        </div>
      )}
    </div>
  );
}
