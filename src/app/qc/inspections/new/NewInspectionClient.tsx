"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/imageResize";
import {
  defectTotals,
  percentText,
  type PlanDefect,
  type QcPlan,
} from "@/lib/qcPlans";
import PickListField from "@/components/PickListField";
import WhatsappShareButton from "@/components/WhatsappShare";
import { submitInspection } from "./actions";

// Big inputs (16px text) so a phone doesn't zoom in on focus.
const input = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-black";
const label = "block text-sm font-medium text-black/70 dark:text-white/70";

interface PhotoItem {
  id: string;
  blob: Blob;
  preview: string;
}

// Header values a new commodity on the same PO / lot starts with.
const SHARED_HEADER_KEYS = ["facility", "grower", "lot_number", "receive_date", "pack_date"];

// "2026-10-08T17:53" in the device's own clock, for the datetime-local box.
function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function NewInspectionClient({
  plans,
  fieldOptions,
  listsReady,
}: {
  plans: QcPlan[];
  fieldOptions: Record<string, string[]>;
  listsReady: boolean;
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const plan = plans.find((p) => p.id === planId) ?? null;
  const config = plan?.config ?? null;

  const [inspectionTime, setInspectionTime] = useState(nowLocalInput);
  const [header, setHeader] = useState<Record<string, string>>({});
  // The pick-lists, which grow as entries are added from the form.
  const [lists, setLists] = useState(fieldOptions);
  const [sampleSize, setSampleSize] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [samples, setSamples] = useState<Record<string, string>[]>([]);
  const [notes1, setNotes1] = useState("");
  const [notes2, setNotes2] = useState("");
  const [result, setResult] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [another, setAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState("");
  // The last inspection that was submitted, for the Send to WhatsApp button.
  const [lastId, setLastId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // What a new commodity on the same PO carries over from the one just submitted.
  const carryRef = useRef<Record<string, string> | null>(null);
  const [lastCarry, setLastCarry] = useState<Record<string, string>>({});

  function carriedHeader(next: QcPlan | null): Record<string, string> {
    const carry = carryRef.current;
    if (!carry) return {};
    const keys = new Set((next?.config.headerFields ?? []).map((f) => f.key));
    return Object.fromEntries(Object.entries(carry).filter(([k, v]) => keys.has(k) && v));
  }

  // Starting a plan (or switching plans) resets everything that belongs to it.
  function resetForPlan(next: QcPlan | null) {
    const cfg = next?.config;
    setCounts({});
    setSamples(Array.from({ length: cfg?.sampleCount ?? 0 }, () => ({})));
    setSampleSize(cfg?.defaultSampleSize ? String(cfg.defaultSampleSize) : "");
    setNotes1("");
    setNotes2("");
    setResult("");
    setReason("");
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
    // A new commodity on the same PO keeps the PO / lot, grower and facility.
    setHeader(carriedHeader(next));
    setInspectionTime(nowLocalInput());
  }

  useEffect(() => {
    // Set up the form for whichever plan is selected first, and on every switch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetForPlan(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const size = Number(sampleSize) > 0 ? Number(sampleSize) : null;
  const rows = useMemo(
    () => (config?.defects ?? []).map((d) => ({ d, count: Math.max(0, Math.round(Number(counts[d.key]) || 0)) })),
    [config, counts],
  );
  const totals = defectTotals(rows.map((r) => ({ severity: r.d.severity, count: r.count })));

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const resized = await Promise.all(
      Array.from(files).map(async (f) => {
        const blob = await resizeImage(f);
        return { id: crypto.randomUUID(), blob, preview: URL.createObjectURL(blob) };
      }),
    );
    setPhotos((prev) => [...prev, ...resized]);
    if (fileInput.current) fileInput.current.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function submit() {
    if (!plan || !config) return;
    setError(null);
    for (const f of config.headerFields) {
      if (f.required && !(header[f.key] ?? "").trim()) {
        setError(`${f.label} is required.`);
        return;
      }
    }
    setBusy(true);
    try {
      // Photos go straight from the phone to storage (a server action's body
      // is capped far below a set of photos), then the inspection links them.
      const supabase = createClient();
      const folder = `inspections/${crypto.randomUUID()}`;
      const photoPaths: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const path = `${folder}/${String(i + 1).padStart(2, "0")}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("qc-photos")
          .upload(path, photos[i].blob, { contentType: "image/jpeg" });
        if (uploadError) throw new Error(`Photo ${i + 1} didn't upload: ${uploadError.message}`);
        photoPaths.push(path);
      }

      const defectCounts: Record<string, number> = {};
      for (const r of rows) defectCounts[r.d.key] = r.count;

      const saved = await submitInspection({
        planId: plan.id,
        inspectionTime: new Date(inspectionTime).toISOString(),
        header,
        sampleSize: size,
        defectCounts,
        samples,
        notes1,
        notes2,
        result,
        photoPaths,
        reason,
      });
      setLastId(saved.id);
      // What the next commodity on this PO / lot shares with this one.
      const shared: Record<string, string> = {};
      for (const k of SHARED_HEADER_KEYS) if (header[k]) shared[k] = header[k];
      setLastCarry(shared);
      if (another) {
        carryRef.current = shared;
        resetForPlan(plan);
        setDone(true);
      } else {
        // Stay here with the WhatsApp button and the next steps, instead of jumping away.
        carryRef.current = null;
        setFinished(true);
        resetForPlan(plan);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit the inspection - try again.");
    } finally {
      setBusy(false);
    }
  }

  if (plans.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">New Inspection</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          There are no inspection plans yet. The Quality Control Manager creates them under QC &gt; Inspection Plans.
        </p>
      </div>
    );
  }

  const defectSection = (severity: PlanDefect["severity"], title: string) => (
    <div className="space-y-2">
      <h3 className="text-base font-bold">{title}</h3>
      {rows
        .filter((r) => r.d.severity === severity)
        .map(({ d, count }) => (
          <div key={d.key} className="grid grid-cols-[1fr_5rem_4.5rem] items-center gap-2">
            <span className="text-sm text-black/70 dark:text-white/70">{d.name}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={counts[d.key] ?? ""}
              placeholder="0"
              onChange={(e) => setCounts((c) => ({ ...c, [d.key]: e.target.value }))}
              className={`${input} px-2 py-1.5 text-center`}
            />
            <span className="text-right text-sm font-bold">{count > 0 ? percentText(count, size) : ""}</span>
          </div>
        ))}
      <div className="grid grid-cols-[1fr_5rem_4.5rem] items-center gap-2 border-t border-black/20 pt-1 font-bold dark:border-white/20">
        <span>Total {title.toLowerCase()}</span>
        <span className="text-center">{severity === "serious" ? totals.serious : totals.nonSerious}</span>
        <span className="text-right text-sm">
          {percentText(severity === "serious" ? totals.serious : totals.nonSerious, size)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold">New Inspection</h1>
        {done && !finished && (
          <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300">
            <span>Inspection submitted - it&apos;s in Inspection History. Pick the next commodity below - the PO and lot are filled in.</span>
            {lastId && <WhatsappShareButton inspectionId={lastId} label="Send the last one to WhatsApp" className="rounded-md bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700" />}
          </div>
        )}
      </div>

      {finished && lastId && (
        <div className="space-y-4 rounded-lg border-2 border-green-600 p-6">
          <p className="text-lg font-bold text-green-700 dark:text-green-400">Inspection submitted</p>
          <p className="text-sm text-black/70 dark:text-white/70">It&apos;s saved and in Inspection History.</p>
          <WhatsappShareButton
            inspectionId={lastId}
            label="Send to WhatsApp"
            className="w-full rounded-md bg-green-600 px-6 py-3 text-lg font-semibold text-white hover:bg-green-700 sm:w-auto"
          />
          <div className="flex flex-wrap gap-3 text-sm">
            <button
              onClick={() => {
                // Another commodity on the same PO / lot: its details are filled in.
                carryRef.current = lastCarry;
                resetForPlan(plan);
                setFinished(false);
                setDone(false);
              }}
              className="rounded-md bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
            >
              Add new commodity (same PO and lot)
            </button>
            <button
              onClick={() => {
                carryRef.current = null;
                resetForPlan(plan);
                setFinished(false);
                setDone(false);
              }}
              className="rounded-md border border-black/20 px-4 py-2 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              New inspection
            </button>
            <Link href="/qc/inspections" className="rounded-md border border-black/20 px-4 py-2 font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
              Inspection History
            </Link>
          </div>
        </div>
      )}

      <label className={`${label} block max-w-md ${finished ? "hidden" : ""}`}>
        Inspection plan
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={`${input} mt-1`}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {plan && config && !finished && (
        <>
          <section className="grid grid-cols-1 items-start gap-x-4 gap-y-3 rounded-lg border border-black/10 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 dark:border-white/10">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="block text-black/50 dark:text-white/50">Commodity</span>
                <span className="font-medium">{plan.commodity}</span>
              </div>
              <div>
                <span className="block text-black/50 dark:text-white/50">Control point</span>
                <span className="font-medium">{plan.control_point || "-"}</span>
              </div>
            </div>
            <label className={label}>
              Inspection time
              <input type="datetime-local" value={inspectionTime} onChange={(e) => setInspectionTime(e.target.value)} className={`${input} mt-1`} />
            </label>
            {config.headerFields.map((f) => (
              <label key={f.key} className={label}>
                {f.label}
                {f.required && <span className="ml-1 text-red-600">*</span>}
                {f.type === "select" ? (
                  <select value={header[f.key] ?? ""} onChange={(e) => setHeader((h) => ({ ...h, [f.key]: e.target.value }))} className={`${input} mt-1`}>
                    <option value=""></option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : listsReady && f.type === "text" && !/lot|date|note/.test(f.key) ? (
                  <PickListField
                    inputClass={input}
                    fieldKey={f.key}
                    value={header[f.key] ?? ""}
                    options={lists[f.key] ?? []}
                    onChange={(v) => setHeader((h) => ({ ...h, [f.key]: v }))}
                    onAdded={(v) => setLists((prev) => ({ ...prev, [f.key]: [...(prev[f.key] ?? []).filter((o) => o !== v), v].sort((a, b) => a.localeCompare(b)) }))}
                  />
                ) : (
                  <input
                    type={f.type === "date" || /date/.test(f.key) ? "date" : "text"}
                    value={header[f.key] ?? ""}
                    onChange={(e) => setHeader((h) => ({ ...h, [f.key]: e.target.value }))}
                    className={`${input} mt-1`}
                  />
                )}
              </label>
            ))}
            <label className={label}>
              Notes #1
              <input value={notes1} onChange={(e) => setNotes1(e.target.value)} className={`${input} mt-1`} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              Reason for the result <span className="text-black/40 dark:text-white/40">(goes in the WhatsApp message: &quot;CAUTION DUE TO ...&quot;)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mixed weights and low packed ice" className={`${input} mt-1`} />
            </label>
            <label className={`${label} sm:col-span-full`}>
              Notes #2
              <textarea value={notes2} onChange={(e) => setNotes2(e.target.value)} rows={3} className={`${input} mt-1`} />
            </label>
            <label className={label}>
              Final inspection result
              <select value={result} onChange={(e) => setResult(e.target.value)} className={`${input} mt-1`}>
                <option value=""></option>
                {config.resultOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {config.defects.length > 0 && (
            <section className="space-y-4 rounded-lg border border-black/10 p-4 dark:border-white/10">
              <h2 className="text-lg font-bold">Defects</h2>
              <label className={`${label} block max-w-[12rem]`}>
                Sample size
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={sampleSize}
                  onChange={(e) => setSampleSize(e.target.value)}
                  className={`${input} mt-1`}
                />
              </label>
              <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
                {defectSection("serious", "Serious defects")}
                {defectSection("non_serious", "Non-serious defects")}
              </div>
              <div className="grid grid-cols-[1fr_5rem_4.5rem] items-center gap-2 border-t-2 border-black/30 pt-2 text-base font-bold dark:border-white/30">
                <span>Total defects</span>
                <span className="text-center">{totals.total}</span>
                <span className="text-right text-sm">{percentText(totals.total, size)}</span>
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {samples.map((sample, i) => (
            <section key={i} className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
              <h2 className="col-span-2 text-lg font-bold">Sample {i + 1}</h2>
              {config.sampleFields.map((f) => (
                <label key={f.key} className={label}>
                  {f.label}
                  {f.unit && <span className="ml-1 text-black/40 dark:text-white/40">({f.unit})</span>}
                  {f.type === "select" ? (
                    <select
                      value={sample[f.key] ?? ""}
                      onChange={(e) => setSamples((prev) => prev.map((s, j) => (j === i ? { ...s, [f.key]: e.target.value } : s)))}
                      className={`${input} mt-1`}
                    >
                      <option value=""></option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      inputMode={f.type === "number" ? "decimal" : undefined}
                      step={f.type === "number" ? "any" : undefined}
                      value={sample[f.key] ?? ""}
                      onChange={(e) => setSamples((prev) => prev.map((s, j) => (j === i ? { ...s, [f.key]: e.target.value } : s)))}
                      className={`${input} mt-1`}
                    />
                  )}
                </label>
              ))}
            </section>
          ))}
          </div>

          <section className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-lg font-bold">Photos</h2>
            <input ref={fileInput} type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} className="hidden" />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="w-full rounded-md border-2 border-dashed border-black/30 px-4 py-4 text-base font-semibold hover:bg-black/5 dark:border-white/30 dark:hover:bg-white/10"
            >
              + Take or add photos
            </button>
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
                {photos.map((p) => (
                  <div key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt="" className="aspect-square w-full rounded-md object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(p.id)}
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-black/50 dark:text-white/50">{photos.length} photo{photos.length === 1 ? "" : "s"}</p>
          </section>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-black/10 bg-white p-3 dark:border-white/10 dark:bg-neutral-900 lg:left-60">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-1 lg:px-8">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={another} onChange={(e) => setAnother(e.target.checked)} className="h-4 w-4" />
                Add new commodity (same PO and lot)
              </label>
              <button
                onClick={submit}
                disabled={busy}
                className="rounded-md bg-green-600 px-6 py-2.5 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {busy ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
