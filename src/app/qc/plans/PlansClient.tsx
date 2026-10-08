"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  emptyPlanConfig,
  keyFromLabel,
  type DefectSeverity,
  type PlanConfig,
  type PlanDefect,
  type PlanFieldType,
  type PlanHeaderField,
  type PlanSampleField,
  type QcPlan,
  type SampleFieldType,
} from "@/lib/qcPlans";
import { deletePlan, duplicatePlan, savePlan } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";
const smallBtn =
  "rounded-md border border-black/20 px-2 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";
const primaryBtn = "rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50";

function move<T>(list: T[], index: number, dir: -1 | 1, sameGroup: (a: T, b: T) => boolean = () => true): T[] {
  let j = index + dir;
  while (j >= 0 && j < list.length && !sameGroup(list[index], list[j])) j += dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div>
        <h3 className="text-sm font-bold text-green-700 dark:text-green-400">{title}</h3>
        {hint && <p className="text-xs text-black/50 dark:text-white/50">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Arrows({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" onClick={onUp} className={smallBtn} aria-label="Move up">
        ↑
      </button>
      <button type="button" onClick={onDown} className={smallBtn} aria-label="Move down">
        ↓
      </button>
      <button type="button" onClick={onRemove} className={`${smallBtn} text-red-600`} aria-label="Remove">
        ✕
      </button>
    </div>
  );
}

function PlanEditor({
  plan,
  onSaved,
  onDuplicated,
  onDeleted,
}: {
  plan: QcPlan | null;
  onSaved: (plan: QcPlan) => void;
  onDuplicated: (plan: QcPlan) => void;
  onDeleted: (id: string) => void;
}) {
  const confirm = useConfirm();
  const [name, setName] = useState(plan?.name ?? "");
  const [commodity, setCommodity] = useState(plan?.commodity ?? "");
  const [controlPoint, setControlPoint] = useState(plan?.control_point ?? "");
  const [active, setActive] = useState(plan?.active ?? true);
  const [config, setConfig] = useState<PlanConfig>(() =>
    plan ? (JSON.parse(JSON.stringify(plan.config)) as PlanConfig) : emptyPlanConfig(),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [bulk, setBulk] = useState<{ serious: string; non_serious: string }>({ serious: "", non_serious: "" });

  const patch = (p: Partial<PlanConfig>) => setConfig((c) => ({ ...c, ...p }));

  // ---- header fields
  function setHeader(i: number, p: Partial<PlanHeaderField>) {
    patch({ headerFields: config.headerFields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  }
  function addHeader() {
    const keys = new Set(config.headerFields.map((f) => f.key));
    patch({ headerFields: [...config.headerFields, { key: keyFromLabel("New field", keys), label: "", type: "text" }] });
  }

  // ---- defects
  function setDefect(i: number, p: Partial<PlanDefect>) {
    patch({ defects: config.defects.map((d, j) => (j === i ? { ...d, ...p } : d)) });
  }
  function addDefects(severity: DefectSeverity, names: string[]) {
    const keys = new Set(config.defects.map((d) => d.key));
    const added: PlanDefect[] = names
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const key = keyFromLabel(n, keys);
        keys.add(key);
        return { key, name: n, severity };
      });
    patch({ defects: [...config.defects, ...added] });
  }

  // ---- sample fields
  function setSampleField(i: number, p: Partial<PlanSampleField>) {
    patch({ sampleFields: config.sampleFields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  }
  function addSampleField() {
    const keys = new Set(config.sampleFields.map((f) => f.key));
    patch({ sampleFields: [...config.sampleFields, { key: keyFromLabel("New field", keys), label: "", type: "number" }] });
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await savePlan(plan?.id ?? null, { name, commodity, control_point: controlPoint, active, config });
      onSaved(saved);
      setMessage({ kind: "ok", text: "Saved." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Couldn't save - try again." });
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    if (!plan) return;
    setBusy(true);
    try {
      onDuplicated(await duplicatePlan(plan.id));
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Couldn't duplicate." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!plan) return;
    if (!(await confirm(`Delete the "${plan.name}" plan? Inspections already done keep their own copy.`))) return;
    try {
      await deletePlan(plan.id);
      onDeleted(plan.id);
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Couldn't delete." });
    }
  }

  const defectList = (severity: DefectSeverity, title: string) => (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold">{title}</p>
      {config.defects.map((d, i) =>
        d.severity !== severity ? null : (
          <div key={d.key} className="flex items-center gap-2">
            <input
              value={d.name}
              onChange={(e) => setDefect(i, { name: e.target.value })}
              placeholder="Defect name (e.g. Decay/Pudrición)"
              className={field}
            />
            <Arrows
              onUp={() => patch({ defects: move(config.defects, i, -1, (a, b) => a.severity === b.severity) })}
              onDown={() => patch({ defects: move(config.defects, i, 1, (a, b) => a.severity === b.severity) })}
              onRemove={() => patch({ defects: config.defects.filter((_, j) => j !== i) })}
            />
          </div>
        ),
      )}
      <div className="flex gap-2">
        <textarea
          value={bulk[severity]}
          onChange={(e) => setBulk((b) => ({ ...b, [severity]: e.target.value }))}
          rows={2}
          placeholder="Add several at once - one per line"
          className={field}
        />
        <button
          type="button"
          onClick={() => {
            addDefects(severity, bulk[severity].split("\n"));
            setBulk((b) => ({ ...b, [severity]: "" }));
          }}
          disabled={bulk[severity].trim() === ""}
          className={`${smallBtn} shrink-0 self-start disabled:opacity-40`}
        >
          Add
        </button>
        <button type="button" onClick={() => addDefects(severity, ["New defect"])} className={`${smallBtn} shrink-0 self-start`}>
          + One
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm">
          Plan name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lettuce Receiving" className={`${field} mt-1`} />
        </label>
        <label className="text-sm">
          Commodity
          <input value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="Lettuce" className={`${field} mt-1`} />
        </label>
        <label className="text-sm">
          Control point
          <input value={controlPoint} onChange={(e) => setControlPoint(e.target.value)} placeholder="Receiving" className={`${field} mt-1`} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (inactive plans are hidden from the New Inspection list)
      </label>

      <Section title="Header fields" hint="What gets filled in at the top of an inspection. Notes #1, Notes #2 and the Final inspection result are always there.">
        {config.headerFields.map((f, i) => (
          <div key={f.key} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_7rem_1fr_auto_auto]">
            <input value={f.label} onChange={(e) => setHeader(i, { label: e.target.value })} placeholder="Label (e.g. Grower)" className={field} />
            <select value={f.type} onChange={(e) => setHeader(i, { type: e.target.value as PlanFieldType })} className={field}>
              <option value="text">Text</option>
              <option value="date">Date</option>
              <option value="select">Choice list</option>
            </select>
            {f.type === "select" ? (
              <input
                key={`${f.key}-opts`}
                defaultValue={(f.options ?? []).join(", ")}
                onBlur={(e) => setHeader(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                placeholder="Choices, separated by commas"
                className={field}
              />
            ) : (
              <span />
            )}
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={!!f.required} onChange={(e) => setHeader(i, { required: e.target.checked })} />
              Required
            </label>
            <Arrows
              onUp={() => patch({ headerFields: move(config.headerFields, i, -1) })}
              onDown={() => patch({ headerFields: move(config.headerFields, i, 1) })}
              onRemove={() => patch({ headerFields: config.headerFields.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        <button type="button" onClick={addHeader} className={smallBtn}>
          + Add header field
        </button>
        <p className="text-xs text-black/50 dark:text-white/50">
          Keep a field named &quot;Lot number&quot; - it&apos;s what the inspection is logged and searched by.
        </p>
      </Section>

      <Section title="Defects" hint="Each count is shown as a percent of the sample size, with totals for serious, non-serious and all.">
        <label className="block max-w-[14rem] text-sm">
          Usual sample size (pieces checked)
          <input
            type="number"
            min={1}
            value={config.defaultSampleSize ?? ""}
            onChange={(e) => patch({ defaultSampleSize: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="e.g. 50"
            className={`${field} mt-1`}
          />
        </label>
        <div className="grid gap-4 lg:grid-cols-2">
          {defectList("serious", "Serious defects")}
          {defectList("non_serious", "Non-serious defects")}
        </div>
      </Section>

      <Section title="Samples" hint="Numbered samples (Sample 1, Sample 2...), each with the same set of measurements.">
        <label className="block max-w-[10rem] text-sm">
          Number of samples
          <input
            type="number"
            min={0}
            max={50}
            value={config.sampleCount}
            onChange={(e) => patch({ sampleCount: Number(e.target.value) })}
            className={`${field} mt-1`}
          />
        </label>
        {config.sampleFields.map((f, i) => (
          <div key={f.key} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_7rem_6rem_1fr_auto]">
            <input value={f.label} onChange={(e) => setSampleField(i, { label: e.target.value })} placeholder="Label (e.g. Box Weight)" className={field} />
            <select value={f.type} onChange={(e) => setSampleField(i, { type: e.target.value as SampleFieldType })} className={field}>
              <option value="number">Number</option>
              <option value="text">Text</option>
              <option value="select">Choice list</option>
            </select>
            <input value={f.unit ?? ""} onChange={(e) => setSampleField(i, { unit: e.target.value })} placeholder="Unit" className={field} />
            {f.type === "select" ? (
              <input
                key={`${f.key}-opts`}
                defaultValue={(f.options ?? []).join(", ")}
                onBlur={(e) => setSampleField(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
                placeholder="Choices, separated by commas"
                className={field}
              />
            ) : (
              <span />
            )}
            <Arrows
              onUp={() => patch({ sampleFields: move(config.sampleFields, i, -1) })}
              onDown={() => patch({ sampleFields: move(config.sampleFields, i, 1) })}
              onRemove={() => patch({ sampleFields: config.sampleFields.filter((_, j) => j !== i) })}
            />
          </div>
        ))}
        <button type="button" onClick={addSampleField} className={smallBtn}>
          + Add measurement
        </button>
      </Section>

      <Section title="Final inspection result choices" hint="Comma-separated, best first. Pass / Slight caution / Caution / Urgent / Fail feed the Weekly Company Call quality score.">
        <input
          key={plan?.id ?? "new"}
          defaultValue={config.resultOptions.join(", ")}
          onBlur={(e) => patch({ resultOptions: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
          className={field}
        />
      </Section>

      {message && <p className={`text-sm ${message.kind === "ok" ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{message.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={busy} className={primaryBtn}>
          {busy ? "Saving..." : plan ? "Save plan" : "Create plan"}
        </button>
        {plan && (
          <>
            <button onClick={duplicate} disabled={busy} className={smallBtn}>
              Duplicate
            </button>
            <button onClick={remove} disabled={busy} className={`${smallBtn} text-red-600`}>
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PlansClient({ initialPlans }: { initialPlans: QcPlan[] }) {
  const [plans, setPlans] = useState(initialPlans);
  // A plan id, or "new" for a blank one.
  const [selected, setSelected] = useState<string | null>(initialPlans[0]?.id ?? null);

  const upsert = (plan: QcPlan) =>
    setPlans((prev) => (prev.some((p) => p.id === plan.id) ? prev.map((p) => (p.id === plan.id ? plan : p)) : [...prev, plan]));

  const current = selected && selected !== "new" ? (plans.find((p) => p.id === selected) ?? null) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Inspection Plans</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          A plan says what gets recorded when a commodity is inspected: header fields, defect lists, samples and result
          choices. Only the Quality Control Manager can change these. Inspections already done keep the plan as it was.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="space-y-2">
          <button
            onClick={() => setSelected("new")}
            className={`${primaryBtn} w-full`}
          >
            + New plan
          </button>
          <div className="space-y-1">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  selected === p.id
                    ? "border-green-600 bg-green-50 dark:bg-green-900/20"
                    : "border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                }`}
              >
                <span className="block font-medium">{p.name}</span>
                <span className="block text-xs text-black/50 dark:text-white/50">
                  {[p.commodity, p.control_point].filter(Boolean).join(" · ")}
                  {!p.active && " · inactive"}
                </span>
              </button>
            ))}
            {plans.length === 0 && <p className="text-sm text-black/40 dark:text-white/40">No plans yet.</p>}
          </div>
        </div>

        <div>
          {selected === "new" || current ? (
            <PlanEditor
              key={selected ?? "none"}
              plan={current}
              onSaved={(p) => {
                upsert(p);
                setSelected(p.id);
              }}
              onDuplicated={(p) => {
                upsert(p);
                setSelected(p.id);
              }}
              onDeleted={(id) => {
                setPlans((prev) => prev.filter((p) => p.id !== id));
                setSelected(null);
              }}
            />
          ) : (
            <p className="text-sm text-black/50 dark:text-white/50">Pick a plan on the left, or create a new one.</p>
          )}
        </div>
      </div>
    </div>
  );
}
