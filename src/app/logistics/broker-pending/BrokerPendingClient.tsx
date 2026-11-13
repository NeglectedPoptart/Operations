"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_TIMEZONE, formatDate } from "@/lib/dates";
import { rateIsConfirmed } from "@/lib/brokerPortal/rateConfirmed";
import { PORTAL_CHARGE_KINDS, type PortalCharge, type PortalDoc, type PortalLoad } from "@/lib/brokerPortal/types";
import { createClient } from "@/lib/supabase/client";
import { approvePod, recordLoadPod } from "../board/actions";
import { confirmRate, prepareUploads, requestCharge, saveEta, submitPod, withdrawCharge } from "./actions";
import SignModal from "./SignModal";

const field = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-black";
const btn = "rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50";
const btnLight = "rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { timeZone: APP_TIMEZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_LABEL: Record<PortalLoad["status"], string> = {
  pending_to_load: "Pending to Load",
  on_the_road: "On the Road",
  complete: "Delivered",
};

// What this carrier still has to do on a load.
function openTasks(l: PortalLoad): string[] {
  const tasks: string[] = [];
  // A load Harvest Best has already marked delivered still needs the signature and the rate confirmed.
  if (l.rateConSent && !l.signedAt && l.rateCons.length > 0) tasks.push("Sign the rate confirmation");
  if (l.rate !== null && !rateIsConfirmed(l)) tasks.push(l.rateConfirmedAt ? "Confirm the new rate" : "Confirm the rate");
  if (l.status === "complete") return tasks;
  if (l.status === "on_the_road" && !(l.etaNote ?? "").trim()) tasks.push("Add an ETA");
  if (l.podRejectedNote) tasks.push("Upload the POD again");
  return tasks;
}

async function uploadFiles(loadId: string, purpose: "pod" | "charge", files: File[]) {
  const prep = await prepareUploads({ loadId, purpose, files: files.map((f) => ({ name: f.name })) });
  if ("error" in prep) throw new Error(prep.error);
  const storage = createClient().storage.from("load-documents");
  const done: { path: string; name: string; type: string; size: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const { error } = await storage.uploadToSignedUrl(prep.uploads[i].path, prep.uploads[i].token, files[i], { contentType: files[i].type || undefined });
    if (error) throw new Error(`${files[i].name} didn't upload: ${error.message}`);
    done.push({ path: prep.uploads[i].path, name: files[i].name, type: files[i].type, size: files[i].size });
  }
  return done;
}

// Harvest Best staff, looking at a carrier's list: mark a load delivered themselves and attach the POD, without
// waiting for the carrier. A load whose rate confirmation is still unsigned stays on the carrier's list with an
// amber "still needs signature" tag until they sign.
function StaffActions({ load: l, onMessage }: { load: PortalLoad; onMessage: (m: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unsigned = openTasks(l).some((t) => /sign/i.test(t));

  async function finish(fn: () => Promise<void>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onMessage(message);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong - try again.");
    } finally {
      setBusy(false);
    }
  }

  const warn = unsigned ? " The carrier hasn't signed the rate confirmation yet, so it will stay on their list as \"Delivered - still needs signature\" until they do." : "";

  async function markDelivered() {
    if (!window.confirm(`Mark this load Delivered?${warn}`)) return;
    await finish(async () => {
      const r = await approvePod(l.id);
      if ("error" in r) throw new Error(r.error);
    }, "Marked delivered.");
  }

  async function addPod(files: File[]) {
    if (files.length === 0) return;
    if (l.status !== "complete" && !window.confirm(`Attach ${files.length === 1 ? "this POD" : `these ${files.length} PODs`} and mark the load Delivered?${warn}`)) return;
    await finish(async () => {
      const storage = createClient().storage.from("load-documents");
      for (const file of files) {
        const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
        const storagePath = `manual/${l.id}/${crypto.randomUUID()}${ext}`;
        const { error: uploadError } = await storage.upload(storagePath, file, { contentType: file.type || undefined });
        if (uploadError) throw new Error(`${file.name} didn't upload: ${uploadError.message}`);
        await recordLoadPod({ loadId: l.id, fileName: file.name, storagePath, contentType: file.type || null, sizeBytes: file.size });
      }
    }, l.status === "complete" ? "POD added." : "POD added and the load marked delivered.");
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-dashed border-blue-400 bg-blue-50/60 p-3 text-sm dark:bg-blue-900/20">
      <p className="text-xs font-bold uppercase text-blue-800 dark:text-blue-200">Harvest Best staff</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btn} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Working..." : l.status === "complete" ? "Add a POD" : "Add POD & mark delivered"}
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void addPod(files);
            }}
          />
        </label>
        {l.status !== "complete" && (
          <button className={btnLight} disabled={busy} onClick={() => void markDelivered()}>
            Mark delivered (no POD yet)
          </button>
        )}
      </div>
      {unsigned && <p className="text-xs text-amber-800 dark:text-amber-300">The rate confirmation is still unsigned. A delivered load stays on the carrier&apos;s list and shows here as &ldquo;still needs signature&rdquo; until they sign.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Check({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-green-600 text-white" : "border-2 border-amber-500 text-amber-600"}`}>{done ? "✓" : "!"}</span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

function DocLink({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="font-medium text-green-700 hover:underline dark:text-green-400">
      {name}
    </a>
  ) : (
    <span>{name}</span>
  );
}

// View + "Download PDF" for each copy of a document, so a carrier can keep copies for their accounting.
function Copies({ docs, noun }: { docs: PortalDoc[]; noun: string }) {
  if (docs.length === 0) return null;
  return (
    <p className="text-sm">
      {docs.map((d, i) => (
        <span key={d.id} className="mr-4 inline-block whitespace-nowrap">
          <DocLink name={`View ${noun}${docs.length > 1 ? ` ${i + 1}` : ""}`} url={d.url} />
          {d.downloadUrl && (
            <>
              {" · "}
              <a href={d.downloadUrl} className="font-medium text-green-700 hover:underline dark:text-green-400" title={`Save ${d.name} to this device`}>
                ⬇ Download PDF
              </a>
            </>
          )}
        </span>
      ))}
    </p>
  );
}

export default function BrokerPendingClient({
  loads,
  loadError,
  companyName,
  readOnly,
  brokers,
  brokerId,
}: {
  loads: PortalLoad[];
  loadError: string | null;
  companyName: string;
  readOnly: boolean;
  brokers: { id: string; name: string }[];
  brokerId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [signing, setSigning] = useState<PortalLoad | null>(null);

  const groups = useMemo(() => {
    const byNeed = (a: PortalLoad, b: PortalLoad) => openTasks(b).length - openTasks(a).length || (a.loadingDate ?? "").localeCompare(b.loadingDate ?? "");
    return [
      { key: "pending_to_load", title: "Pending to Load", items: loads.filter((l) => l.status === "pending_to_load").sort(byNeed) },
      { key: "on_the_road", title: "On the Road", items: loads.filter((l) => l.status === "on_the_road").sort(byNeed) },
      { key: "complete", title: "Delivered - last 30 days", items: loads.filter((l) => l.status === "complete").sort((a, b) => (b.loadingDate ?? "").localeCompare(a.loadingDate ?? "")) },
    ];
  }, [loads]);
  const needing = loads.filter((l) => openTasks(l).length > 0).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Broker Pending List</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Loads booked with <b>{companyName}</b>. {needing > 0 ? <b className="text-amber-600">{needing} need{needing === 1 ? "s" : ""} something from you.</b> : "Nothing needs your action right now."}
          </p>
        </div>
        {readOnly && (
          <label className="space-y-0.5 text-sm">
            <span className="block text-xs text-black/60 dark:text-white/60">Preview as carrier</span>
            <select value={brokerId} onChange={(e) => router.push(`/logistics/broker-pending?broker=${e.target.value}`)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black">
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {readOnly && <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-900/30 dark:text-blue-200">Preview - this is what the carrier sees. Their buttons are switched off here.</p>}
      {message && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-200" role="status">
          {message}
        </p>
      )}
      {loadError && <p className="text-sm text-red-600">Couldn&apos;t load the list: {loadError}</p>}

      {groups.map((g) => (
        <section key={g.key} className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-black/60 dark:text-white/60">
            {g.title} ({g.items.length})
          </h2>
          {g.items.length === 0 && <p className="text-sm text-black/50 dark:text-white/50">Nothing here.</p>}
          {g.items.map((l) => (
            <LoadTile key={l.id} load={l} readOnly={readOnly} onSign={() => setSigning(l)} onMessage={setMessage} />
          ))}
        </section>
      ))}

      {signing && (
        <SignModal
          load={signing}
          defaultName=""
          onClose={() => setSigning(null)}
          onDone={(m) => {
            setSigning(null);
            setMessage(m);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function LoadTile({ load: l, readOnly, onSign, onMessage }: { load: PortalLoad; readOnly: boolean; onSign: () => void; onMessage: (m: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"eta" | "pod" | "charge" | null>(null);

  const confirmed = rateIsConfirmed(l);
  const booked = Boolean(l.signedAt) && confirmed;
  const tasks = openTasks(l);
  const first = l.stops[0];
  const title = l.stops.length > 1 ? l.stops.map((s) => (s.orderNumber ? `#${s.orderNumber}` : "-")).join(", ") : `${first?.client || "Load"}${first?.orderNumber ? ` #${first.orderNumber}` : ""}`;
  const pendingPod = l.pods.some((p) => p.status === "pending");

  async function run(fn: () => Promise<{ ok: true; message?: string } | { error: string }>, after?: () => void) {
    setError(null);
    setBusy(true);
    try {
      const r = await fn();
      if ("error" in r) setError(r.error);
      else {
        if (r.message) onMessage(r.message);
        after?.();
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong - try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`space-y-3 rounded-xl border p-4 shadow-sm ${tasks.length > 0 ? "border-amber-400" : "border-black/10 dark:border-white/10"}`}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold">{title}</p>
          <p className="text-sm text-black/60 dark:text-white/60">
            {l.loadingDate ? `Pick up ${formatDate(l.loadingDate)}` : "Pick up date not set"}
            {l.source ? ` · from ${l.source}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className="rounded-full bg-black/10 px-2.5 py-1 dark:bg-white/10">{STATUS_LABEL[l.status]}</span>
          {l.status === "pending_to_load" && (
            <span className={`rounded-full px-2.5 py-1 ${l.ready ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>{l.ready ? "READY TO LOAD" : "Not ready yet"}</span>
          )}
          {l.status === "complete" && (
            <span className={`rounded-full px-2.5 py-1 ${tasks.length === 0 ? "bg-green-600 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"}`}>
              {tasks.length === 0 ? "✓ Fully done" : `Delivered - still needs ${tasks.some((t) => /sign/i.test(t)) ? "signature" : "rate confirmed"}`}
            </span>
          )}
          {l.status !== "complete" && (
            <span className={`rounded-full px-2.5 py-1 ${booked ? "bg-green-600 text-white" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"}`}>{booked ? "✓ Fully booked" : "Booking incomplete"}</span>
          )}
        </div>
      </div>

      {/* The load */}
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-black/50 dark:text-white/50">Pick up</p>
          {l.pickups.length === 0 && <p>{l.source ?? "-"}</p>}
          {l.source && l.pickups.length > 0 && <p>{l.source}</p>}
          {l.pickups.map((p, i) => (
            <p key={i}>
              <b>PU# {p.puNumber || "-"}</b>
              {p.vendor ? ` · ${p.vendor}` : ""}
              {p.location ? ` · ${p.location}` : ""}
            </p>
          ))}
          <p className="pt-1">
            <b>Rate:</b> {l.rate === null ? "not set" : money(l.rate)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-black/50 dark:text-white/50">{l.stops.length > 1 ? "Deliveries" : "Delivery"}</p>
          {l.stops.map((s, i) => (
            <p key={i}>
              {s.orderNumber && <b>#{s.orderNumber} </b>}
              {s.poNumber ? `PO ${s.poNumber} · ` : ""}
              {s.client ?? ""}
              {s.destination ? ` → ${s.destination}` : ""}
              {s.deliveryDate ? ` · ${formatDate(s.deliveryDate)}` : ""}
              {s.deliveryTime ? ` ${s.deliveryTime}` : ""}
              {s.appointment ? ` · Appt ${s.appointment}` : ""}
            </p>
          ))}
        </div>
      </div>

      {l.status === "complete" && tasks.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          Harvest Best has marked this load delivered, but it is still waiting on you: {tasks.join(" and ").toLowerCase()}.
        </p>
      )}

      {/* What they need to do */}
      <div className="space-y-2.5 rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.05]">
        {/* Rate confirmation */}
        <Check done={Boolean(l.signedAt)}>
          <p className="font-semibold">Rate confirmation</p>
          {l.signedAt ? (
            <div className="space-y-1">
              <p className="text-black/70 dark:text-white/70">
                Signed by {l.signedBy} · {when(l.signedAt)}
              </p>
              <Copies docs={l.signedCopies} noun="signed copy" />
              <Copies docs={l.rateCons} noun="original" />
            </div>
          ) : !l.rateConSent || l.rateCons.length === 0 ? (
            <p className="text-black/60 dark:text-white/60">Waiting for Harvest Best to send the rate confirmation.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button className={btn} disabled={readOnly} onClick={onSign}>
                Review &amp; sign
              </button>
              <Copies docs={l.rateCons} noun="rate confirmation" />
            </div>
          )}
        </Check>

        {/* Rate */}
        <Check done={confirmed}>
          <p className="font-semibold">Truck rate</p>
          {l.rate === null ? (
            <p className="text-black/60 dark:text-white/60">No rate on this load yet.</p>
          ) : confirmed ? (
            <p className="text-black/70 dark:text-white/70">
              {money(l.rate)} confirmed{l.rateConfirmedBy ? ` by ${l.rateConfirmedBy}` : ""} · {when(l.rateConfirmedAt)}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {l.rateConfirmedAt ? "The rate changed - " : ""}
                Rate is <b>{money(l.rate)}</b>
              </span>
              <button className={btn} disabled={readOnly || busy} onClick={() => void run(() => confirmRate(l.id))}>
                Confirm {money(l.rate)}
              </button>
            </div>
          )}
        </Check>

        {/* ETA */}
        {l.status !== "complete" && (
          <Check done={Boolean((l.etaNote ?? "").trim())}>
            <p className="font-semibold">ETA</p>
            {(l.etaNote ?? "").trim() ? (
              <p className="text-black/70 dark:text-white/70">
                {l.etaNote}
                {l.etaUpdatedBy ? ` · entered by ${l.etaUpdatedBy} ${when(l.etaUpdatedAt)}` : ""}
              </p>
            ) : (
              <p className="text-black/60 dark:text-white/60">{l.status === "on_the_road" ? "No ETA yet." : "Add an ETA once the truck is on the road."}</p>
            )}
            {l.status === "on_the_road" && (
              <button className={`${btnLight} mt-1.5`} disabled={readOnly} onClick={() => setPanel(panel === "eta" ? null : "eta")}>
                {(l.etaNote ?? "").trim() ? "Update ETA" : "Add ETA"}
              </button>
            )}
          </Check>
        )}

        {/* POD */}
        <Check done={l.status === "complete"}>
          <p className="font-semibold">Proof of delivery</p>
          {l.status === "complete" ? (
            <p className="text-black/70 dark:text-white/70">Delivered and approved by Harvest Best.</p>
          ) : (
            <>
              {l.podRejectedNote && <p className="font-medium text-red-600">Sent back: {l.podRejectedNote}</p>}
              {pendingPod && <p className="text-amber-700 dark:text-amber-300">POD received {when(l.podSubmittedAt)} - Harvest Best is reviewing it.</p>}
              {!pendingPod && !l.podRejectedNote && <p className="text-black/60 dark:text-white/60">Upload the signed POD after the load delivers. Harvest Best reviews it and marks the load delivered.</p>}
              {!pendingPod && (
                <button className={`${btnLight} mt-1.5`} disabled={readOnly} onClick={() => setPanel(panel === "pod" ? null : "pod")}>
                  {l.podRejectedNote ? "Upload a new POD" : "Upload POD"}
                </button>
              )}
            </>
          )}
          {l.pods.length > 0 && (
            <p className="mt-1 text-xs text-black/60 dark:text-white/60">
              {l.pods.map((p, i) => (
                <span key={p.id}>
                  {i > 0 ? " · " : ""}
                  <DocLink name={p.name} url={p.url} />
                  {p.status === "rejected" ? " (sent back)" : p.status === "pending" ? " (under review)" : ""}
                </span>
              ))}
            </p>
          )}
        </Check>
      </div>

      {readOnly && <StaffActions load={l} onMessage={onMessage} />}

      {panel === "eta" && <EtaForm loadId={l.id} onClose={() => setPanel(null)} run={run} busy={busy} />}
      {panel === "pod" && <PodForm loadId={l.id} onClose={() => setPanel(null)} run={run} busy={busy} />}

      {/* Charges */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase text-black/50 dark:text-white/50">Extra charges</p>
          <button className={btnLight} disabled={readOnly} onClick={() => setPanel(panel === "charge" ? null : "charge")}>
            + Request a charge
          </button>
        </div>
        {l.charges.length === 0 && <p className="text-xs text-black/50 dark:text-white/50">Layover, redelivery, added stops and other extras you request show here until Harvest Best approves them.</p>}
        {l.charges.map((c) => (
          <ChargeRow key={c.id} c={c} readOnly={readOnly} busy={busy} onWithdraw={() => void run(() => withdrawCharge(c.id))} />
        ))}
        {panel === "charge" && <ChargeForm loadId={l.id} onClose={() => setPanel(null)} run={run} busy={busy} />}
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}

type Run = (fn: () => Promise<{ ok: true; message?: string } | { error: string }>, after?: () => void) => Promise<void>;

function EtaForm({ loadId, onClose, run, busy }: { loadId: string; onClose: () => void; run: Run; busy: boolean }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2 rounded-lg border border-black/15 p-3 dark:border-white/15">
      <p className="text-sm font-semibold">When will the truck arrive?</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
        <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where it is now (optional)" maxLength={300} />
      </div>
      <div className="flex gap-2">
        <button className={btn} disabled={busy || (!date && !note.trim())} onClick={() => void run(() => saveEta({ loadId, date, time, note }), onClose)}>
          Save ETA
        </button>
        <button className={btnLight} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function FilePicker({ files, setFiles, label }: { files: File[]; setFiles: (f: File[]) => void; label: string }) {
  return (
    <div className="space-y-1">
      <label className={`${btnLight} inline-block cursor-pointer`}>
        {label}
        <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 10))} />
      </label>
      {files.length > 0 && (
        <ul className="text-xs text-black/70 dark:text-white/70">
          {files.map((f, i) => (
            <li key={i}>
              {f.name} ({Math.max(1, Math.round(f.size / 1024))} KB){" "}
              <button className="text-red-600 hover:underline" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PodForm({ loadId, onClose, run, busy }: { loadId: string; onClose: () => void; run: Run; busy: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setErr(null);
    setUploading(true);
    try {
      const uploaded = await uploadFiles(loadId, "pod", files);
      await run(() => submitPod({ loadId, files: uploaded }), onClose);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed - try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/15 p-3 dark:border-white/15">
      <p className="text-sm font-semibold">Upload the signed proof of delivery</p>
      <p className="text-xs text-black/60 dark:text-white/60">A photo or scan of the signed BOL / POD. You can add more than one page.</p>
      <FilePicker files={files} setFiles={setFiles} label="Choose photo or PDF" />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button className={btn} disabled={busy || uploading || files.length === 0} onClick={() => void send()}>
          {uploading ? "Uploading..." : "Send POD"}
        </button>
        <button className={btnLight} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ChargeForm({ loadId, onClose, run, busy }: { loadId: string; onClose: () => void; run: Run; busy: boolean }) {
  const [kind, setKind] = useState<string>(PORTAL_CHARGE_KINDS[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setErr(null);
    setUploading(true);
    try {
      const uploaded = files.length > 0 ? await uploadFiles(loadId, "charge", files) : [];
      await run(() => requestCharge({ loadId, kind, amount: Number(amount), note, files: uploaded }), onClose);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed - try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/15 p-3 dark:border-white/15">
      <p className="text-sm font-semibold">Request a charge for approval</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
          {PORTAL_CHARGE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Amount ($)" />
      </div>
      <textarea className={field} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened (where, when, how long)" maxLength={1000} />
      <FilePicker files={files} setFiles={setFiles} label="Attach receipt / photo (optional)" />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button className={btn} disabled={busy || uploading || !amount || note.trim().length < 3} onClick={() => void send()}>
          {uploading ? "Uploading..." : "Send for approval"}
        </button>
        <button className={btnLight} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ChargeRow({ c, readOnly, busy, onWithdraw }: { c: PortalCharge; readOnly: boolean; busy: boolean; onWithdraw: () => void }) {
  const style = c.status === "approved" ? "bg-green-100 text-green-800" : c.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800";
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10">
      <div className="min-w-0 flex-1">
        <p>
          <b>{c.kind}</b> · {money(c.amount)} <span className="text-xs text-black/50 dark:text-white/50">· {when(c.submittedAt)}</span>
        </p>
        {c.note && <p className="text-xs text-black/70 dark:text-white/70">{c.note}</p>}
        {c.files.length > 0 && (
          <p className="text-xs">
            {c.files.map((f, i) => (
              <span key={f.id}>
                {i > 0 ? " · " : ""}
                <DocLink name={f.name} url={f.url} />
              </span>
            ))}
          </p>
        )}
        {c.reviewNote && <p className="text-xs italic text-black/70 dark:text-white/70">Harvest Best: {c.reviewNote}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>{c.status === "pending" ? "Waiting for approval" : c.status === "approved" ? "Approved" : "Not approved"}</span>
        {c.status === "pending" && !readOnly && (
          <button className="text-xs text-red-600 hover:underline" disabled={busy} onClick={onWithdraw}>
            Withdraw
          </button>
        )}
      </div>
    </div>
  );
}
