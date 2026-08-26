"use client";

import { useState, type ChangeEvent } from "react";
import { parseRateConfirmationText } from "@/lib/rateConfirmationParse";
import { splitDestinationLabel, validateCityStateLabel } from "@/lib/destination";
import LockedCombobox from "@/components/LockedCombobox";
import type { Broker } from "@/lib/types";
import {
  createBroker,
  createDestinationCity,
  createHub,
  createLoad,
  extractRateConfirmationText,
  lookupZipCityState,
  updateLoadRateConSent,
} from "./actions";

const field = "w-full rounded-md border border-black/20 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-black/20";
const label = "text-xs font-medium text-black/60 dark:text-white/60";

type BrokerChoice = { mode: "existing"; brokerId: string } | { mode: "new"; newName: string } | { mode: "none" };

// Same normalize-and-check-substrings approach as the Price Sheets vendor
// matcher - a best guess shown for confirmation, never trusted blindly.
function guessBrokerId(brokerName: string | null, brokers: Broker[]): string | null {
  if (!brokerName) return null;
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(brokerName);
  const exact = brokers.find((b) => norm(b.name) === target);
  if (exact) return exact.id;
  const partial = brokers.find((b) => {
    const nb = norm(b.name);
    return nb.length > 2 && target.length > 2 && (target.includes(nb) || nb.includes(target));
  });
  return partial?.id ?? null;
}

// One rate con PDF = one delivery stop. A LoadDraft is the truck: its own
// pickup date/source/rate/broker, plus one or more stops - multiple stops
// only happen when the user combines drafts that are riding the same
// truck (see combineInto below).
interface StopDraft {
  id: string;
  fileName: string;
  orderNumber: string;
  poNumber: string;
  clientName: string;
  destination: string;
  deliveryDate: string;
  appointment: string;
  warnings: string[];
}

interface LoadDraft {
  id: string;
  loadingDate: string;
  source: string;
  rate: string;
  notes: string;
  rateConSent: boolean;
  brokerChoice: BrokerChoice;
  warnings: string[];
  stops: StopDraft[];
  error: string | null;
}

function draftLabel(draft: LoadDraft, index: number): string {
  const first = draft.stops[0];
  const bits = [first?.orderNumber, first?.clientName].filter(Boolean);
  return bits.length > 0 ? `Load ${index + 1} - ${bits.join(" / ")}` : `Load ${index + 1} (${first?.fileName ?? "untitled"})`;
}

export default function RateConfirmationImport({
  brokers,
  hubOptions: initialHubOptions,
  cityOptions: initialCityOptions,
}: {
  brokers: Broker[];
  hubOptions: string[];
  cityOptions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<LoadDraft[]>([]);
  const [hubOptions, setHubOptions] = useState(initialHubOptions);
  const [cityOptions, setCityOptions] = useState(initialCityOptions);
  const [savingAll, setSavingAll] = useState(false);

  function reset() {
    setDrafts([]);
    setUploadError(null);
  }

  function addHubOption(name: string) {
    setHubOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
    createHub(name).catch(() => {});
  }

  function addCityOption(name: string) {
    setCityOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
    createDestinationCity(name).catch(() => {});
  }

  async function parseFileToDraft(file: File): Promise<LoadDraft> {
    const formData = new FormData();
    formData.append("file", file);
    const result = await extractRateConfirmationText(formData);
    if ("error" in result) throw new Error(result.error);
    const parsed = parseRateConfirmationText(result.text, hubOptions);

    let destination = "";
    if (parsed.destinationZip) {
      const zipMatch = await lookupZipCityState(parsed.destinationZip).catch(() => null);
      if (zipMatch) {
        const exact = cityOptions.find(
          (c) => c.toLowerCase() === `${zipMatch.city}, ${zipMatch.state}`.toLowerCase(),
        );
        destination = exact ?? `${zipMatch.city}, ${zipMatch.state}`;
      }
    }

    const loadWarnings: string[] = [];
    if (!parsed.source) loadWarnings.push("Couldn't identify the source warehouse - pick it below.");
    if (!parsed.loadingDate) loadWarnings.push("Couldn't find a pick up date.");
    if (!parsed.rate) loadWarnings.push("Couldn't find the freight rate.");

    const stopWarnings: string[] = [];
    if (!destination) stopWarnings.push("Couldn't determine the destination city - pick it below.");
    if (!parsed.deliveryDate) stopWarnings.push("Couldn't find a delivery date.");

    const guessedBrokerId = guessBrokerId(parsed.brokerName, brokers);

    return {
      id: crypto.randomUUID(),
      loadingDate: parsed.loadingDate ?? "",
      source: parsed.source ?? "",
      rate: parsed.rate !== null ? String(parsed.rate) : "",
      notes: parsed.notes ?? "",
      rateConSent: true,
      brokerChoice: guessedBrokerId
        ? { mode: "existing", brokerId: guessedBrokerId }
        : { mode: "new", newName: parsed.brokerName ?? "" },
      warnings: loadWarnings,
      stops: [
        {
          id: crypto.randomUUID(),
          fileName: file.name,
          orderNumber: parsed.orderNumber ?? "",
          poNumber: parsed.poNumber ?? "",
          clientName: parsed.clientName ?? "",
          destination,
          deliveryDate: parsed.deliveryDate ?? "",
          appointment: parsed.appointment ?? "",
          warnings: stopWarnings,
        },
      ],
      error: null,
    };
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    const newDrafts: LoadDraft[] = [];
    const failures: string[] = [];
    for (const file of files) {
      try {
        newDrafts.push(await parseFileToDraft(file));
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setDrafts((prev) => [...prev, ...newDrafts]);
    if (failures.length > 0) {
      setUploadError(`Couldn't read ${failures.length} file(s) - ${failures.join("; ")}`);
    }
    setUploading(false);
  }

  function updateDraft(id: string, patch: Partial<LoadDraft>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function updateStop(draftId: string, stopId: string, patch: Partial<StopDraft>) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftId ? { ...d, stops: d.stops.map((s) => (s.id === stopId ? { ...s, ...patch } : s)) } : d,
      ),
    );
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  // Merges every stop from `id` onto the end of `targetId`'s stop list (so
  // one truck carrying multiple rate cons becomes one load with multiple
  // stops) and drops the now-empty source draft. The target keeps its own
  // load-level fields (pickup date, source, rate, broker) - those apply to
  // the whole truck, not per stop, so there's nothing to merge there.
  function combineInto(id: string, targetId: string) {
    setDrafts((prev) => {
      const source = prev.find((d) => d.id === id);
      if (!source) return prev;
      return prev
        .map((d) => (d.id === targetId ? { ...d, stops: [...d.stops, ...source.stops] } : d))
        .filter((d) => d.id !== id);
    });
  }

  // Pulls one stop back out into its own load draft, inheriting the parent
  // draft's pickup date/source/rate/broker as a starting point since those
  // aren't stored per stop. Only meaningful (and only shown in the UI) when
  // the draft has more than one stop.
  function splitOut(draftId: string, stopId: string) {
    setDrafts((prev) => {
      const source = prev.find((d) => d.id === draftId);
      const stop = source?.stops.find((s) => s.id === stopId);
      if (!source || !stop || source.stops.length <= 1) return prev;
      const rest = source.stops.filter((s) => s.id !== stopId);
      const newDraft: LoadDraft = { ...source, id: crypto.randomUUID(), stops: [stop], error: null };
      return prev.map((d) => (d.id === draftId ? { ...d, stops: rest } : d)).concat(newDraft);
    });
  }

  async function saveDraft(draft: LoadDraft) {
    let brokerId = "";
    if (draft.brokerChoice.mode === "existing") {
      brokerId = draft.brokerChoice.brokerId;
    } else if (draft.brokerChoice.mode === "new") {
      const broker = await createBroker(draft.brokerChoice.newName.trim());
      brokerId = broker.id;
    }

    const stopsPayload = draft.stops.map((s) => {
      const { city, state } = splitDestinationLabel(s.destination);
      return {
        order_number: s.orderNumber || null,
        po_number: s.poNumber || null,
        client_name: s.clientName || null,
        destination_city: city || null,
        destination_state: state || null,
        delivery_date: s.deliveryDate || null,
        delivery_time: null,
        appointment: s.appointment || null,
      };
    });

    const formData = new FormData();
    formData.set("loading_date", draft.loadingDate);
    formData.set("source", draft.source);
    formData.set("status", "pending_to_load");
    formData.set("rate", draft.rate);
    formData.set("broker_id", brokerId);
    formData.set("notes", draft.notes);
    formData.set("stops_json", JSON.stringify(stopsPayload));

    const loadId = await createLoad(formData);
    if (draft.rateConSent) {
      await updateLoadRateConSent(loadId, true).catch(() => {});
    }
  }

  async function handleConfirmAll() {
    const missingBrokerIndex = drafts.findIndex(
      (d) => d.brokerChoice.mode === "new" && !d.brokerChoice.newName.trim(),
    );
    if (missingBrokerIndex !== -1) {
      alert(`Enter a broker name for "${draftLabel(drafts[missingBrokerIndex], missingBrokerIndex)}", or pick an existing one.`);
      return;
    }
    setSavingAll(true);
    const remaining: LoadDraft[] = [];
    for (const draft of drafts) {
      try {
        await saveDraft(draft);
      } catch (e) {
        remaining.push({ ...draft, error: e instanceof Error ? e.message : "Something went wrong" });
      }
    }
    setDrafts(remaining);
    setSavingAll(false);
    if (remaining.length === 0) setOpen(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Upload Rate Confirmation (PDF)</h2>
          <p className="text-xs text-black/50 dark:text-white/50">
            Upload one or more Freight Confirmation PDFs - each becomes its own load draft below. Combine drafts
            that are riding the same truck before saving, or leave them separate.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen((o) => !o);
            if (open) reset();
          }}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          {open ? "Hide" : "Upload PDF(s)"}
        </button>
      </div>

      {open && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
              {uploading ? "Reading files..." : "Upload .pdf(s)"}
              <input
                type="file"
                accept=".pdf"
                multiple
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            {drafts.length > 0 && (
              <span className="text-xs text-black/50 dark:text-white/50">
                {drafts.length} load draft{drafts.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {uploadError && <p className="whitespace-pre-line text-sm text-red-600">{uploadError}</p>}

          {drafts.map((draft, index) => (
            <div key={draft.id} className="space-y-3 rounded-md border border-black/15 p-3 dark:border-white/15">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold">{draftLabel(draft, index)}</h3>
                <div className="flex items-center gap-2">
                  {drafts.length > 1 && (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) combineInto(draft.id, e.target.value);
                      }}
                      className={`${field} w-auto bg-white text-xs`}
                    >
                      <option value="">Combine into another load...</option>
                      {drafts
                        .filter((d) => d.id !== draft.id)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {draftLabel(d, drafts.indexOf(d))}
                          </option>
                        ))}
                    </select>
                  )}
                  <button onClick={() => removeDraft(draft.id)} className="text-xs font-medium text-red-600 hover:underline">
                    Remove
                  </button>
                </div>
              </div>

              {draft.error && <p className="text-sm text-red-600">{draft.error}</p>}

              {draft.warnings.length > 0 && (
                <ul className="list-inside list-disc rounded-md border border-amber-500/30 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300">
                  {draft.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className={label}>Pick up Date</label>
                  <input
                    type="date"
                    value={draft.loadingDate}
                    onChange={(e) => updateDraft(draft.id, { loadingDate: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Source (Warehouse)</label>
                  <LockedCombobox
                    value={draft.source}
                    onChange={(v) => updateDraft(draft.id, { source: v })}
                    options={hubOptions}
                    onAddOption={addHubOption}
                    validateNew={validateCityStateLabel}
                    placeholder="Pharr, TX"
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Freight Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    value={draft.rate}
                    onChange={(e) => updateDraft(draft.id, { rate: e.target.value })}
                    className={field}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className={label}>Broker</label>
                  <select
                    value={draft.brokerChoice.mode === "existing" ? draft.brokerChoice.brokerId : "__new__"}
                    onChange={(e) =>
                      updateDraft(draft.id, {
                        brokerChoice:
                          e.target.value === "__new__"
                            ? { mode: "new", newName: "" }
                            : { mode: "existing", brokerId: e.target.value },
                      })
                    }
                    className={`${field} bg-white`}
                  >
                    <option value="__new__">+ Create new broker</option>
                    {brokers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {draft.brokerChoice.mode === "new" && (
                    <input
                      value={draft.brokerChoice.newName}
                      onChange={(e) => updateDraft(draft.id, { brokerChoice: { mode: "new", newName: e.target.value } })}
                      placeholder="Broker name"
                      className={`${field} mt-1`}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {draft.stops.map((stop) => (
                  <div key={stop.id} className="space-y-2 rounded-md bg-black/5 p-2 dark:bg-white/5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-black/50 dark:text-white/50">{stop.fileName}</p>
                      {draft.stops.length > 1 && (
                        <button
                          onClick={() => splitOut(draft.id, stop.id)}
                          className="text-xs font-medium text-black/60 hover:underline dark:text-white/60"
                        >
                          Split into its own load
                        </button>
                      )}
                    </div>
                    {stop.warnings.length > 0 && (
                      <ul className="list-inside list-disc rounded-md border border-amber-500/30 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300">
                        {stop.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <label className={label}>Order #</label>
                        <input
                          value={stop.orderNumber}
                          onChange={(e) => updateStop(draft.id, stop.id, { orderNumber: e.target.value })}
                          className={field}
                        />
                      </div>
                      <div>
                        <label className={label}>PO #</label>
                        <input
                          value={stop.poNumber}
                          onChange={(e) => updateStop(draft.id, stop.id, { poNumber: e.target.value })}
                          className={field}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className={label}>Client (Ship To)</label>
                        <input
                          value={stop.clientName}
                          onChange={(e) => updateStop(draft.id, stop.id, { clientName: e.target.value })}
                          className={field}
                        />
                      </div>
                      <div>
                        <label className={label}>Destination City</label>
                        <LockedCombobox
                          value={stop.destination}
                          onChange={(v) => updateStop(draft.id, stop.id, { destination: v })}
                          options={cityOptions}
                          onAddOption={addCityOption}
                          validateNew={validateCityStateLabel}
                          placeholder="Houston, TX"
                          className={field}
                        />
                      </div>
                      <div>
                        <label className={label}>Delivery Date</label>
                        <input
                          type="date"
                          value={stop.deliveryDate}
                          onChange={(e) => updateStop(draft.id, stop.id, { deliveryDate: e.target.value })}
                          className={field}
                        />
                      </div>
                      <div>
                        <label className={label}>Appointment</label>
                        <input
                          value={stop.appointment}
                          onChange={(e) => updateStop(draft.id, stop.id, { appointment: e.target.value })}
                          placeholder="e.g. 830am"
                          className={field}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className={label}>Notes</label>
                <textarea
                  value={draft.notes}
                  onChange={(e) => updateDraft(draft.id, { notes: e.target.value })}
                  rows={2}
                  className={field}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.rateConSent}
                  onChange={(e) => updateDraft(draft.id, { rateConSent: e.target.checked })}
                />
                Rate confirmation already sent to carrier
              </label>
            </div>
          ))}

          {drafts.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={handleConfirmAll}
                disabled={savingAll}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
              >
                {savingAll ? "Saving..." : `Confirm & Add ${drafts.length} Load${drafts.length === 1 ? "" : "s"} to Pending to Load`}
              </button>
              <button
                onClick={reset}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
              >
                Cancel All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
