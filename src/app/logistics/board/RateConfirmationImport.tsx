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

interface ReviewState {
  loadingDate: string;
  deliveryDate: string;
  source: string;
  rate: string;
  notes: string;
  orderNumber: string;
  poNumber: string;
  clientName: string;
  destination: string;
  appointment: string;
  rateConSent: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [brokerChoice, setBrokerChoice] = useState<BrokerChoice>({ mode: "none" });
  const [hubOptions, setHubOptions] = useState(initialHubOptions);
  const [cityOptions, setCityOptions] = useState(initialCityOptions);
  const [saving, setSaving] = useState(false);

  function reset() {
    setReview(null);
    setWarnings([]);
    setBrokerChoice({ mode: "none" });
    setError(null);
  }

  function addHubOption(name: string) {
    setHubOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
    createHub(name).catch(() => {});
  }

  function addCityOption(name: string) {
    setCityOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
    createDestinationCity(name).catch(() => {});
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await extractRateConfirmationText(formData);
      if ("error" in result) {
        setError(`Couldn't read that PDF (${result.error}).`);
        return;
      }
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

      const foundWarnings: string[] = [];
      if (!parsed.source) foundWarnings.push("Couldn't identify the source warehouse - pick it below.");
      if (!destination) foundWarnings.push("Couldn't determine the destination city - pick it below.");
      if (!parsed.loadingDate) foundWarnings.push("Couldn't find a pick up date.");
      if (!parsed.deliveryDate) foundWarnings.push("Couldn't find a delivery date.");
      if (!parsed.rate) foundWarnings.push("Couldn't find the freight rate.");
      setWarnings(foundWarnings);

      setReview({
        loadingDate: parsed.loadingDate ?? "",
        deliveryDate: parsed.deliveryDate ?? "",
        source: parsed.source ?? "",
        rate: parsed.rate !== null ? String(parsed.rate) : "",
        notes: parsed.notes ?? "",
        orderNumber: parsed.orderNumber ?? "",
        poNumber: parsed.poNumber ?? "",
        clientName: parsed.clientName ?? "",
        destination,
        appointment: parsed.appointment ?? "",
        rateConSent: true,
      });

      const guessedBrokerId = guessBrokerId(parsed.brokerName, brokers);
      setBrokerChoice(
        guessedBrokerId
          ? { mode: "existing", brokerId: guessedBrokerId }
          : { mode: "new", newName: parsed.brokerName ?? "" },
      );
    } catch (err) {
      setError(`Couldn't read that PDF (${err instanceof Error ? err.message : String(err)}).`);
    } finally {
      setUploading(false);
    }
  }

  function updateReview(patch: Partial<ReviewState>) {
    setReview((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function handleConfirm() {
    if (!review) return;
    if (brokerChoice.mode === "new" && !brokerChoice.newName.trim()) {
      alert("Enter a broker name, or pick an existing one.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let brokerId = "";
      if (brokerChoice.mode === "existing") {
        brokerId = brokerChoice.brokerId;
      } else if (brokerChoice.mode === "new") {
        const broker = await createBroker(brokerChoice.newName.trim());
        brokerId = broker.id;
      }

      const { city, state } = splitDestinationLabel(review.destination);

      const formData = new FormData();
      formData.set("loading_date", review.loadingDate);
      formData.set("source", review.source);
      formData.set("status", "pending_to_load");
      formData.set("rate", review.rate);
      formData.set("broker_id", brokerId);
      formData.set("notes", review.notes);
      formData.set(
        "stops_json",
        JSON.stringify([
          {
            order_number: review.orderNumber || null,
            po_number: review.poNumber || null,
            client_name: review.clientName || null,
            destination_city: city || null,
            destination_state: state || null,
            delivery_date: review.deliveryDate || null,
            delivery_time: null,
            appointment: review.appointment || null,
          },
        ]),
      );

      const loadId = await createLoad(formData);
      if (review.rateConSent) {
        await updateLoadRateConSent(loadId, true).catch(() => {});
      }

      reset();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-green-700 dark:text-green-400">Upload Rate Confirmation (PDF)</h2>
          <p className="text-xs text-black/50 dark:text-white/50">
            Upload the Freight Confirmation PDF sent to a carrier - fields below are a starting guess, review before saving.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen((o) => !o);
            if (open) reset();
          }}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          {open ? "Hide" : "Upload PDF"}
        </button>
      </div>

      {open && (
        <div className="space-y-4">
          {!review && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                {uploading ? "Reading file..." : "Upload .pdf"}
                <input type="file" accept=".pdf" onChange={handleUpload} disabled={uploading} className="hidden" />
              </label>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {review && (
            <>
              {warnings.length > 0 && (
                <ul className="list-inside list-disc rounded-md border border-amber-500/30 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className={label}>Pick up Date</label>
                  <input
                    type="date"
                    value={review.loadingDate}
                    onChange={(e) => updateReview({ loadingDate: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Source (Warehouse)</label>
                  <LockedCombobox
                    value={review.source}
                    onChange={(v) => updateReview({ source: v })}
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
                    value={review.rate}
                    onChange={(e) => updateReview({ rate: e.target.value })}
                    className={field}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className={label}>Broker</label>
                  <select
                    value={brokerChoice.mode === "existing" ? brokerChoice.brokerId : "__new__"}
                    onChange={(e) =>
                      e.target.value === "__new__"
                        ? setBrokerChoice({ mode: "new", newName: "" })
                        : setBrokerChoice({ mode: "existing", brokerId: e.target.value })
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
                  {brokerChoice.mode === "new" && (
                    <input
                      value={brokerChoice.newName}
                      onChange={(e) => setBrokerChoice({ mode: "new", newName: e.target.value })}
                      placeholder="Broker name"
                      className={`${field} mt-1`}
                    />
                  )}
                </div>

                <div>
                  <label className={label}>Order #</label>
                  <input
                    value={review.orderNumber}
                    onChange={(e) => updateReview({ orderNumber: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>PO #</label>
                  <input
                    value={review.poNumber}
                    onChange={(e) => updateReview({ poNumber: e.target.value })}
                    className={field}
                  />
                </div>
                <div className="col-span-2">
                  <label className={label}>Client (Ship To)</label>
                  <input
                    value={review.clientName}
                    onChange={(e) => updateReview({ clientName: e.target.value })}
                    className={field}
                  />
                </div>

                <div>
                  <label className={label}>Destination City</label>
                  <LockedCombobox
                    value={review.destination}
                    onChange={(v) => updateReview({ destination: v })}
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
                    value={review.deliveryDate}
                    onChange={(e) => updateReview({ deliveryDate: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Appointment</label>
                  <input
                    value={review.appointment}
                    onChange={(e) => updateReview({ appointment: e.target.value })}
                    placeholder="e.g. 830am"
                    className={field}
                  />
                </div>

                <div className="col-span-2 sm:col-span-4">
                  <label className={label}>Notes</label>
                  <textarea
                    value={review.notes}
                    onChange={(e) => updateReview({ notes: e.target.value })}
                    rows={3}
                    className={field}
                  />
                </div>

                <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-4">
                  <input
                    type="checkbox"
                    checked={review.rateConSent}
                    onChange={(e) => updateReview({ rateConSent: e.target.checked })}
                  />
                  Rate confirmation already sent to carrier
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Confirm & Add to Pending to Load"}
                </button>
                <button
                  onClick={reset}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
