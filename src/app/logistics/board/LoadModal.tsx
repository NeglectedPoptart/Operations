"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  type LoadDocumentLink,
  createDestinationCity,
  createHub,
  createLoad,
  assignPodToStop,
  getLoadDocuments,
  recordLoadDeliveryBol,
  recordLoadPod,
  recordStopPod,
  recordLoadRateCon,
  removeLoadDocument,
  resetRateConSignature,
  setPodPending,
  updateLoad,
} from "./actions";
import { splitDestinationLabel, validateCityStateLabel } from "@/lib/destination";
import { LOAD_STATUSES, type Broker, type Load, type LoadStatus } from "@/lib/types";
import LockedCombobox from "@/components/LockedCombobox";
import { StopPodControls } from "./LoadExtras";
import PickupsEditor, { type PickupFormState } from "./PickupsEditor";
import StopsEditor, { emptyStop, type StopFormState } from "./StopsEditor";

function stopsFromLoad(load: Load | null): StopFormState[] {
  if (!load || load.load_stops.length === 0) return [{ ...emptyStop }];
  return [...load.load_stops]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      order_number: s.order_number ?? "",
      po_number: s.po_number ?? "",
      client_name: s.client_name ?? "",
      destination: [s.destination_city, s.destination_state].filter(Boolean).join(", "),
      delivery_date: s.delivery_date ?? "",
      delivery_time: s.delivery_time ?? "",
      appointment: s.appointment ?? "",
    }));
}

function pickupsFromLoad(load: Load | null): PickupFormState[] {
  if (!load) return [];
  return [...load.load_pickups]
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      pu_number: p.pu_number ?? "",
      vendor: p.vendor ?? "",
      location: p.location ?? "",
    }));
}

export default function LoadModal({
  load,
  brokers,
  hubOptions: initialHubOptions,
  cityOptions: initialCityOptions,
  initialStatus,
  onClose,
}: {
  load: Load | null;
  brokers: Broker[];
  hubOptions: string[];
  cityOptions: string[];
  initialStatus: LoadStatus;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stops, setStops] = useState<StopFormState[]>(() => stopsFromLoad(load));
  const [pickups, setPickups] = useState<PickupFormState[]>(() => pickupsFromLoad(load));
  const [source, setSource] = useState(load?.source ?? "");
  const [hubOptions, setHubOptions] = useState(initialHubOptions);
  const [cityOptions, setCityOptions] = useState(initialCityOptions);

  // Proof of delivery ------------------------------------------------------
  const [allDocs, setAllDocs] = useState<LoadDocumentLink[]>([]);
  const podDocs = allDocs.filter((d) => d.kind === "pod");
  // Multi-drop loads: which drop a POD belongs to. The upload goes to the picked drop (default: the next
  // drop with no POD yet); "" = the whole load.
  const stopsSorted = load ? [...load.load_stops].sort((a, b) => a.position - b.position) : [];
  const multiDrop = stopsSorted.length > 1;
  const [podStopChoice, setPodStopChoice] = useState<string | null>(null);
  const defaultPodStop = stopsSorted.find((s) => !s.delivered_at && !podDocs.some((d) => d.stop_id === s.id)) ?? stopsSorted[0];
  const podStopId = !multiDrop ? "" : (podStopChoice ?? defaultPodStop?.id ?? "");
  const dropLabel = (i: number) => {
    const st = stopsSorted[i];
    return `Drop ${i + 1}: ${st.client_name || "(no client)"}${st.order_number ? ` #${st.order_number}` : st.po_number ? ` PO ${st.po_number}` : ""}`;
  };
  const rateConDocs = allDocs.filter((d) => d.kind === "ratecon" || d.kind === "ratecon_signed");
  const [rateConBusy, setRateConBusy] = useState(false);
  // Delivery BOL (optional): on an existing load it uploads straight away; on a new load the chosen file is
  // uploaded right after the load is saved.
  const bolDocs = allDocs.filter((d) => d.kind === "delivery_bol");
  const [bolBusy, setBolBusy] = useState(false);
  const [bolFiles, setBolFiles] = useState<File[]>([]);
  const createdLoadId = useRef<string | null>(null);
  const [podUploading, setPodUploading] = useState(false);
  const [podError, setPodError] = useState<string | null>(null);
  const loadId = load?.id ?? null;

  useEffect(() => {
    if (!loadId) return;
    getLoadDocuments(loadId).then(setAllDocs).catch(() => {});
  }, [loadId]);

  // The rate confirmation PDF kept on the load: the carrier reads and e-signs it on their Broker Pending List.
  async function handleRateConFile(file: File) {
    if (!load) return;
    setPodError(null);
    setRateConBusy(true);
    try {
      const storagePath = `ratecons/${load.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await createClient().storage.from("load-documents").upload(storagePath, file, { contentType: "application/pdf" });
      if (uploadError) throw new Error(uploadError.message);
      const r = await recordLoadRateCon({ loadId: load.id, fileName: file.name, storagePath, contentType: "application/pdf", sizeBytes: file.size });
      if ("error" in r) throw new Error(r.error);
      setAllDocs(await getLoadDocuments(load.id));
    } catch (e) {
      setPodError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setRateConBusy(false);
    }
  }

  async function uploadDeliveryBol(forLoadId: string, file: File) {
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const storagePath = `bols/${forLoadId}/${crypto.randomUUID()}${ext}`;
    const { error: uploadError } = await createClient().storage.from("load-documents").upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) throw new Error(uploadError.message);
    const r = await recordLoadDeliveryBol({ loadId: forLoadId, fileName: file.name, storagePath, contentType: file.type || null, sizeBytes: file.size });
    if ("error" in r) throw new Error(r.error);
  }

  async function handleBolFile(files: File[]) {
    if (!load) return;
    setPodError(null);
    setBolBusy(true);
    try {
      for (const file of files) await uploadDeliveryBol(load.id, file);
      setAllDocs(await getLoadDocuments(load.id));
    } catch (e) {
      setPodError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBolBusy(false);
    }
  }

  async function handlePodFile(files: File[]) {
    if (!load) return;
    setPodError(null);
    setPodUploading(true);
    try {
      // On a multi-drop load the POD is tied to the drop picked beside the button.
      if (podStopId) {
        for (const file of files) {
          const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
          const storagePath = `manual/${load.id}/${crypto.randomUUID()}${ext}`;
          const { error: uploadError } = await createClient()
            .storage.from("load-documents")
            .upload(storagePath, file, { contentType: file.type || undefined });
          if (uploadError) throw new Error(uploadError.message);
          const r = await recordStopPod({ stopId: podStopId, loadId: load.id, fileName: file.name, storagePath, contentType: file.type || null, sizeBytes: file.size });
          if ("error" in r) throw new Error(r.error);
        }
        setAllDocs(await getLoadDocuments(load.id));
        return;
      }
      // Straight to Storage from the browser (a server action's body is
      // capped far below a scan's size), then recorded against the load.
      for (const file of files) {
        const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
        const storagePath = `manual/${load.id}/${crypto.randomUUID()}${ext}`;
        const { error: uploadError } = await createClient()
          .storage.from("load-documents")
          .upload(storagePath, file, { contentType: file.type || undefined });
        if (uploadError) throw new Error(uploadError.message);
        await recordLoadPod({
          loadId: load.id,
          fileName: file.name,
          storagePath,
          contentType: file.type || null,
          sizeBytes: file.size,
        });
      }
      onClose();
    } catch (e) {
      setPodError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setPodUploading(false);
    }
  }

  function addHubOption(name: string) {
    setHubOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
    createHub(name).catch(() => {});
  }

  function addCityOption(label: string) {
    setCityOptions((prev) => (prev.includes(label) ? prev : [...prev, label].sort()));
    createDestinationCity(label).catch(() => {});
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    const stopsForSave = stops.map(({ destination, ...rest }) => {
      const { city, state } = splitDestinationLabel(destination);
      return { ...rest, destination_city: city, destination_state: state };
    });
    formData.set("stops_json", JSON.stringify(stopsForSave));
    formData.set("pickups_json", JSON.stringify(pickups));
    startTransition(async () => {
      try {
        if (load) {
          await updateLoad(load.id, formData);
        } else {
          // If the BOL upload failed last time, the load already exists - only retry the file.
          const id = createdLoadId.current ?? (await createLoad(formData));
          createdLoadId.current = id;
          if (bolFiles.length > 0) {
            try {
              for (const f of [...bolFiles]) {
                await uploadDeliveryBol(id, f);
                setBolFiles((prev) => prev.filter((x) => x !== f));
              }
            } catch (e) {
              throw new Error(`The load was added, but the Delivery BOL didn't upload (${e instanceof Error ? e.message : "upload failed"}). Press Save to try the file again, or clear it and attach it later by editing the load.`);
            }
          }
        }
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const field = "w-full rounded-md border border-black/20 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-black/20";
  const selectField = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";
  const label = "text-xs font-medium text-black/60 dark:text-white/60";

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-lg dark:bg-neutral-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{load ? "Edit Load" : "Add Load"}</h2>
          <button onClick={onClose} className="text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white">
            ✕
          </button>
        </div>

        <form action={handleSubmit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-1">
            <label className={label}>Loading Date</label>
            <input type="date" name="loading_date" defaultValue={load?.loading_date ?? ""} className={field} />
          </div>
          <div className="col-span-1">
            <label className={label}>Source City</label>
            <input type="hidden" name="source" value={source} />
            <LockedCombobox
              value={source}
              onChange={setSource}
              options={hubOptions}
              onAddOption={addHubOption}
              validateNew={validateCityStateLabel}
              placeholder="Pharr, TX"
              className={field}
            />
          </div>
          <div className="col-span-1">
            <label className={label}>Status</label>
            <select name="status" defaultValue={load?.status ?? initialStatus} className={selectField}>
              {LOAD_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-1">
            <label className={label}>Rate (total)</label>
            <input type="number" step="0.01" name="rate" defaultValue={load?.rate ?? ""} className={field} />
          </div>

          <div className="col-span-2 sm:col-span-2">
            <label className={label}>Broker</label>
            <select name="broker_id" defaultValue={load?.broker_id ?? ""} className={selectField}>
              <option value="">--</option>
              {brokers
                .filter((b) => b.active || b.id === load?.broker_id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {!b.active ? " (inactive)" : ""}
                  </option>
                ))}
            </select>
          </div>

          <label className="col-span-2 flex items-start gap-2 text-xs text-black/70 dark:text-white/70 sm:col-span-4">
            <input
              type="checkbox"
              name="source_is_pickup"
              value="1"
              defaultChecked={load?.source_is_pickup === false}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Buying from vendors - the Source City is only the lane, not a pickup. The tile counts just the pickups below
              (PU # = the vendor&apos;s pickup number, separate from the order #).
            </span>
          </label>

          <PickupsEditor pickups={pickups} onChange={setPickups} />

          <StopsEditor
            stops={stops}
            onChange={setStops}
            cityOptions={cityOptions}
            onAddCityOption={addCityOption}
          />

          <div className="col-span-2 sm:col-span-4">
            <label className={label}>Notes</label>
            <textarea name="notes" defaultValue={load?.notes ?? ""} rows={2} className={field} />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className={label}>ETA / Location Update</label>
            <textarea name="eta_note" defaultValue={load?.eta_note ?? ""} rows={2} className={field} />
          </div>

          <div className="col-span-2 space-y-2 rounded-md border border-black/10 p-3 text-sm dark:border-white/10 sm:col-span-4">
            <p className="text-xs font-semibold text-black/70 dark:text-white/70">Delivery BOL (optional - the carrier can download it from their Broker Pending List)</p>
            {load ? (
              <>
                {bolDocs.length === 0 && <p className="text-xs text-black/50 dark:text-white/50">No Delivery BOL is attached to this load.</p>}
                {bolDocs.map((d) => (
                  <p key={d.id} className="text-xs">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-green-700 hover:underline dark:text-green-400">
                        📎 {d.file_name}
                      </a>
                    ) : (
                      <span>{d.file_name}</span>
                    )}{" "}
                    <button type="button" className="text-red-600 hover:underline" onClick={() => removeLoadDocument(d.id).then(() => getLoadDocuments(load.id).then(setAllDocs))}>
                      remove
                    </button>
                  </p>
                ))}
                <label className="inline-block cursor-pointer rounded-md border border-black/20 px-2 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                  {bolBusy ? "Uploading..." : bolDocs.length > 0 ? "Attach another Delivery BOL" : "Attach Delivery BOL"}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    className="hidden"
                    disabled={bolBusy}
                    onChange={(e) => {
                      const fs = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      if (fs.length > 0) void handleBolFile(fs);
                    }}
                  />
                </label>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="cursor-pointer rounded-md border border-black/20 px-2 py-1 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                  {bolFiles.length > 0 ? "Attach another file" : "Attach Delivery BOL"}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const fs = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      if (fs.length > 0) setBolFiles((prev) => [...prev, ...fs]);
                    }}
                  />
                </label>
                {bolFiles.length > 0 ? (
                  <>
                    <span>📎 {bolFiles.map((f) => f.name).join(", ")}</span>
                    <button type="button" className="text-red-600 hover:underline" onClick={() => setBolFiles([])}>
                      clear
                    </button>
                  </>
                ) : (
                  <span className="text-black/50 dark:text-white/50">Only when there is one - leave blank otherwise.</span>
                )}
              </div>
            )}
          </div>

          {load && (
            <div className="col-span-2 space-y-2 rounded-md border border-black/10 p-3 text-sm dark:border-white/10 sm:col-span-4">
              <p className="text-xs font-semibold text-black/70 dark:text-white/70">Rate confirmation (what the carrier signs on their Broker Pending List)</p>
              {rateConDocs.length === 0 && <p className="text-xs text-black/50 dark:text-white/50">No rate confirmation PDF is attached to this load yet.</p>}
              {rateConDocs.map((d) => (
                <p key={d.id} className="text-xs">
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-green-700 hover:underline dark:text-green-400">
                      {d.kind === "ratecon_signed" ? "✍" : "📄"} {d.file_name}
                    </a>
                  ) : (
                    <span>{d.file_name}</span>
                  )}{" "}
                  {d.kind === "ratecon" && (
                    <button type="button" className="text-red-600 hover:underline" onClick={() => removeLoadDocument(d.id).then(() => getLoadDocuments(load.id).then(setAllDocs))}>
                      remove
                    </button>
                  )}
                </p>
              ))}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="cursor-pointer rounded-md border border-black/20 px-2 py-1 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                  {rateConBusy ? "Uploading..." : "Attach rate confirmation PDF"}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    disabled={rateConBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void handleRateConFile(f);
                    }}
                  />
                </label>
                {load.ratecon_signed_at && (
                  <>
                    <span className="text-green-700 dark:text-green-400">Signed by {load.ratecon_signed_by}</span>
                    <button type="button" className="text-red-600 hover:underline" onClick={() => startTransition(() => resetRateConSignature(load.id).then(onClose))}>
                      Let the carrier sign again
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {load && load.load_stops.length > 1 && (
            <div className="col-span-2 space-y-1.5 rounded-md border border-black/10 p-3 text-sm dark:border-white/10 sm:col-span-4">
              <p className="text-xs font-semibold text-black/70 dark:text-white/70">Per-drop delivery ({load.load_stops.length} drops)</p>
              {[...load.load_stops]
                .sort((a, b) => a.position - b.position)
                .map((stop, i) => (
                  <p key={stop.id} className="text-xs">
                    <span className="font-medium">Drop {i + 1}: {stop.client_name || "(no client)"}</span>
                    <StopPodControls stop={stop} loadId={load.id} />
                  </p>
                ))}
            </div>
          )}

          {load && (
            <div className="col-span-2 space-y-2 rounded-md border border-black/10 p-3 text-sm dark:border-white/10 sm:col-span-4">
              <p className="text-xs font-semibold text-black/70 dark:text-white/70">Proof of Delivery (POD)</p>
              {podDocs.map((d) => {
                const stopIndex = load.load_stops
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .findIndex((s) => s.id === d.stop_id);
                return (
                  <p key={d.id} className="text-xs">
                    {multiDrop ? (
                      <select
                        value={d.stop_id ?? ""}
                        disabled={podUploading}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          void assignPodToStop(d.id, v).then(async (r) => {
                            if ("error" in r) setPodError(r.error);
                            else setAllDocs(await getLoadDocuments(load.id));
                          });
                        }}
                        className={`mr-1.5 rounded border px-1 py-0.5 text-[11px] ${d.stop_id ? "border-black/20 dark:border-white/20" : "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"}`}
                        title="Which drop this POD is for - the delivered email sends each customer their own POD"
                      >
                        <option value="">Not tied to a drop</option>
                        {stopsSorted.map((st, i) => (
                          <option key={st.id} value={st.id}>{dropLabel(i)}</option>
                        ))}
                      </select>
                    ) : (
                      stopIndex >= 0 && <span className="font-medium">Drop {stopIndex + 1}: </span>
                    )}
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="font-medium text-green-700 hover:underline dark:text-green-400">
                        📄 {d.file_name}
                      </a>
                    ) : (
                      <span>📄 {d.file_name}</span>
                    )}{" "}
                    <span className="text-black/40 dark:text-white/40">({d.source === "email" ? "from carrier email" : d.source === "carrier" ? "uploaded by the carrier" : "uploaded"}
                      {d.review_status === "pending" ? " - waiting for your review" : d.review_status === "rejected" ? " - sent back" : ""})</span>
                  </p>
                );
              })}
              {multiDrop && podDocs.some((d) => !d.stop_id) && (
                <p className="text-xs text-amber-700 dark:text-amber-300">A POD that isn&apos;t tied to a drop won&apos;t be emailed to customers - pick its drop above.</p>
              )}
              {podDocs.length === 0 && load.status === "complete" && (
                <p className="text-xs text-black/50 dark:text-white/50">No POD is attached to this load - attach one below.</p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {load.status === "on_the_road" && (
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={load.pod_pending}
                      disabled={pending}
                      onChange={(e) => startTransition(() => setPodPending(load.id, e.target.checked).then(onClose))}
                    />
                    Delivered - Pending POD
                  </label>
                )}
                {multiDrop && (
                  <label className="flex items-center gap-1.5">
                    POD is for
                    <select
                      value={podStopId}
                      onChange={(e) => setPodStopChoice(e.target.value)}
                      className="rounded border border-black/20 px-1 py-0.5 text-xs dark:border-white/20 dark:bg-transparent"
                    >
                      {stopsSorted.map((st, i) => (
                        <option key={st.id} value={st.id}>{dropLabel(i)}</option>
                      ))}
                      <option value="">Whole load (all drops)</option>
                    </select>
                  </label>
                )}
                <label className="cursor-pointer rounded-md border border-black/20 px-2 py-1 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                  {podUploading ? "Uploading..." : multiDrop && podStopId ? "Attach POD to this drop" : load.status === "complete" ? "Attach POD" : "Attach POD and mark Complete"}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    multiple
                    className="hidden"
                    disabled={podUploading}
                    onChange={(e) => {
                      const fs = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      if (fs.length > 0) void handlePodFile(fs);
                    }}
                  />
                </label>
              </div>
              {podError && <p className="text-xs text-red-600">{podError}</p>}
            </div>
          )}

          {error && <p className="col-span-2 text-sm text-red-600 sm:col-span-4">{error}</p>}

          <div className="col-span-2 flex justify-end gap-2 sm:col-span-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
