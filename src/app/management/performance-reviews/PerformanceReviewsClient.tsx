"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatQuarterLabel, quarterEnd, quarterStart } from "@/lib/dates";
import {
  MAJOR_ISSUE_TYPES,
  type Employee,
  type MajorIssueType,
  type PerformanceReviewImprovement,
  type PerformanceReviewMajorIssue,
  type PerformanceReviewQuickNote,
} from "@/lib/types";
import {
  addImprovement,
  addMajorIssue,
  addQuickNote,
  createEmployee,
  deleteImprovement,
  deleteMajorIssue,
  deleteQuickNote,
  updateImprovement,
  updateMajorIssue,
  updateQuickNote,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";
const QUARTERS = [1, 2, 3, 4];

interface CalloutTypeCount {
  type: string;
  count: number;
}

interface EmployeeQuarterData {
  calloutSummary: CalloutTypeCount[];
  quickNotes: PerformanceReviewQuickNote[];
  improvements: PerformanceReviewImprovement[];
  majorIssues: PerformanceReviewMajorIssue[];
}

function emptyData(): EmployeeQuarterData {
  return { calloutSummary: [], quickNotes: [], improvements: [], majorIssues: [] };
}

function cacheKey(employeeId: string, year: number, quarter: number): string {
  return `${employeeId}:${year}:${quarter}`;
}

// The Call Outs section has no table of its own - it's a live summary
// pulled straight from Callout Sheet's callout_entries, grouped by
// whatever call_out_type values actually exist (that column is free text,
// not a fixed enum, so this can't hardcode a type list).
async function loadEmployeeQuarterData(employeeName: string, year: number, quarter: number): Promise<EmployeeQuarterData> {
  const supabase = createClient();
  const start = quarterStart(year, quarter);
  const end = quarterEnd(year, quarter);

  const [calloutsRes, quickNotesRes, improvementsRes, majorIssuesRes] = await Promise.all([
    supabase.from("callout_entries").select("call_out_type").eq("employee_name", employeeName).gte("entry_date", start).lte("entry_date", end),
    supabase
      .from("performance_review_quick_notes")
      .select("*")
      .eq("employee_name", employeeName)
      .eq("year", year)
      .eq("quarter", quarter)
      .order("created_at", { ascending: true }),
    supabase
      .from("performance_review_improvements")
      .select("*")
      .eq("employee_name", employeeName)
      .eq("year", year)
      .eq("quarter", quarter)
      .order("created_at", { ascending: true }),
    supabase
      .from("performance_review_major_issues")
      .select("*")
      .eq("employee_name", employeeName)
      .eq("year", year)
      .eq("quarter", quarter)
      .order("created_at", { ascending: true }),
  ]);

  const counts = new Map<string, number>();
  for (const row of calloutsRes.data ?? []) {
    const type = (row.call_out_type as string) || "Unspecified";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const calloutSummary = Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    calloutSummary,
    quickNotes: (quickNotesRes.data ?? []) as PerformanceReviewQuickNote[],
    improvements: (improvementsRes.data ?? []) as PerformanceReviewImprovement[],
    majorIssues: (majorIssuesRes.data ?? []) as PerformanceReviewMajorIssue[],
  };
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PerformanceReviewsClient({
  initialEmployees,
  initialYear,
  initialQuarter,
}: {
  initialEmployees: Employee[];
  initialYear: number;
  initialQuarter: number;
}) {
  const confirm = useConfirm();
  const [employees, setEmployees] = useState(initialEmployees);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeTitle, setNewEmployeeTitle] = useState("");
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [year, setYear] = useState(initialYear);
  const [quarter, setQuarter] = useState(initialQuarter);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [cache, setCache] = useState<Record<string, EmployeeQuarterData>>({});
  // A note/entry stays in an editable form only while its id is in here - a
  // brand new row starts here so it opens ready to fill in, and "Submit"
  // removes it so it renders as a plain read-back entry instead (an "Edit"
  // link puts it back). Loaded-from-cache rows are never in here by default,
  // so past entries always come back read-only rather than sitting open in
  // editable boxes.
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());

  const yearOptions = Array.from({ length: 5 }, (_, i) => initialYear - 3 + i);

  function startEditing(id: string) {
    setDraftIds((prev) => new Set(prev).add(id));
  }

  function submitDraft(id: string) {
    setDraftIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function ensureLoaded(emp: Employee, targetYear: number, targetQuarter: number) {
    const key = cacheKey(emp.id, targetYear, targetQuarter);
    if (key in cache) return;
    loadEmployeeQuarterData(emp.name, targetYear, targetQuarter).then((data) => {
      setCache((prev) => ({ ...prev, [key]: data }));
    });
  }

  function toggleEmployee(emp: Employee) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(emp.id)) next.delete(emp.id);
      else next.add(emp.id);
      return next;
    });
    ensureLoaded(emp, year, quarter);
  }

  function handlePeriodChange(nextYear: number, nextQuarter: number) {
    setYear(nextYear);
    setQuarter(nextQuarter);
    for (const id of expandedIds) {
      const emp = employees.find((e) => e.id === id);
      if (emp) ensureLoaded(emp, nextYear, nextQuarter);
    }
  }

  async function handleAddEmployee() {
    const name = newEmployeeName.trim();
    if (!name) return;
    setAddingEmployee(true);
    try {
      const row = (await createEmployee(name, newEmployeeTitle.trim() || null)) as Employee;
      setEmployees((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      setNewEmployeeName("");
      setNewEmployeeTitle("");
    } catch {
      alert(`Couldn't add "${name}" - they may already be on the list.`);
    } finally {
      setAddingEmployee(false);
    }
  }

  function patchEmployeeData(emp: Employee, patch: Partial<EmployeeQuarterData>) {
    const key = cacheKey(emp.id, year, quarter);
    setCache((prev) => ({ ...prev, [key]: { ...(prev[key] ?? emptyData()), ...patch } }));
  }

  // Quick Notes -----------------------------------------------------------------

  async function handleAddQuickNote(emp: Employee) {
    const row = (await addQuickNote(emp.name, year, quarter)) as PerformanceReviewQuickNote;
    const current = cache[cacheKey(emp.id, year, quarter)] ?? emptyData();
    patchEmployeeData(emp, { quickNotes: [...current.quickNotes, row] });
    startEditing(row.id);
  }

  function handleQuickNoteSave(emp: Employee, id: string, patch: Partial<PerformanceReviewQuickNote>) {
    const current = cache[cacheKey(emp.id, year, quarter)] ?? emptyData();
    patchEmployeeData(emp, { quickNotes: current.quickNotes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
    updateQuickNote(id, patch).catch(() => {});
  }

  async function handleQuickNoteDelete(emp: Employee, id: string) {
    if (!(await confirm("Delete this note?"))) return;
    const current = cache[cacheKey(emp.id, year, quarter)] ?? emptyData();
    patchEmployeeData(emp, { quickNotes: current.quickNotes.filter((n) => n.id !== id) });
    await deleteQuickNote(id).catch(() => {});
  }

  // Improvements ------------------------------------------------------------------

  async function handleAddImprovement(emp: Employee) {
    const row = (await addImprovement(emp.name, year, quarter)) as PerformanceReviewImprovement;
    const current = cache[cacheKey(emp.id, year, quarter)] ?? emptyData();
    patchEmployeeData(emp, { improvements: [...current.improvements, row] });
    startEditing(row.id);
  }

  function handleImprovementSave(emp: Employee, id: string, patch: Partial<PerformanceReviewImprovement>) {
    const current = cache[cacheKey(emp.id, year, quarter)] ?? emptyData();
    patchEmployeeData(emp, { improvements: current.improvements.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
    updateImprovement(id, patch).catch(() => {});
  }

  async function handleImprovementDelete(emp: Employee, id: string) {
    if (!(await confirm("Delete this entry?"))) return;
    const current = cache[cacheKey(emp.id, year, quarter)] ?? emptyData();
    patchEmployeeData(emp, { improvements: current.improvements.filter((n) => n.id !== id) });
    await deleteImprovement(id).catch(() => {});
  }

  // Major Issues --------------------------------------------------------------

  async function handleAddMajorIssue(emp: Employee) {
    const row = (await addMajorIssue(emp.name, year, quarter)) as PerformanceReviewMajorIssue;
    const current = cache[cacheKey(emp.id, year, quarter)] ?? emptyData();
    patchEmployeeData(emp, { majorIssues: [...current.majorIssues, row] });
    startEditing(row.id);
  }

  function handleMajorIssueSave(emp: Employee, id: string, patch: Partial<PerformanceReviewMajorIssue>) {
    const current = cache[cacheKey(emp.id, year, quarter)] ?? emptyData();
    patchEmployeeData(emp, { majorIssues: current.majorIssues.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
    updateMajorIssue(id, patch).catch(() => {});
  }

  async function handleMajorIssueDelete(emp: Employee, id: string) {
    if (!(await confirm("Delete this record?"))) return;
    const current = cache[cacheKey(emp.id, year, quarter)] ?? emptyData();
    patchEmployeeData(emp, { majorIssues: current.majorIssues.filter((n) => n.id !== id) });
    await deleteMajorIssue(id).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Performance Reviews</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <label className="text-sm">
          Year
          <select
            value={year}
            onChange={(e) => handlePeriodChange(Number(e.target.value), quarter)}
            className={`${field} mt-1 w-28`}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Quarter
          <select
            value={quarter}
            onChange={(e) => handlePeriodChange(year, Number(e.target.value))}
            className={`${field} mt-1 w-24`}
          >
            {QUARTERS.map((q) => (
              <option key={q} value={q}>
                Q{q}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-1.5 text-sm font-medium text-black/60 dark:text-white/60">
          Viewing {formatQuarterLabel(year, quarter)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newEmployeeName}
          onChange={(e) => setNewEmployeeName(e.target.value)}
          placeholder="Employee name..."
          className={`${field} max-w-xs`}
        />
        <input
          value={newEmployeeTitle}
          onChange={(e) => setNewEmployeeTitle(e.target.value)}
          placeholder="Title (optional)..."
          className={`${field} max-w-xs`}
        />
        <button
          onClick={handleAddEmployee}
          disabled={addingEmployee || newEmployeeName.trim() === ""}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {addingEmployee ? "Adding..." : "+ Add Employee"}
        </button>
      </div>

      <div className="space-y-2">
        {employees.map((emp) => {
          const expanded = expandedIds.has(emp.id);
          const data = cache[cacheKey(emp.id, year, quarter)];
          const totalCallouts = data?.calloutSummary.reduce((s, c) => s + c.count, 0) ?? 0;

          return (
            <div key={emp.id} className="rounded-lg border border-black/10 dark:border-white/10">
              <button
                onClick={() => toggleEmployee(emp)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                <span className="flex items-center gap-2 font-medium">
                  <ChevronIcon expanded={expanded} />
                  {emp.name}
                  {emp.title && <span className="font-normal text-black/50 dark:text-white/50">- {emp.title}</span>}
                </span>
                {!expanded && data && totalCallouts > 0 && (
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/60 dark:bg-white/10 dark:text-white/60">
                    {totalCallouts} call out{totalCallouts === 1 ? "" : "s"} this quarter
                  </span>
                )}
              </button>

              {expanded && (
                <div className="space-y-6 border-t border-black/10 p-4 dark:border-white/10">
                  {!data ? (
                    <p className="text-sm text-black/40 dark:text-white/40">Loading...</p>
                  ) : (
                    <>
                      {/* Call Outs ------------------------------------------------ */}
                      <section className="space-y-2">
                        <h3 className="text-sm font-bold text-green-700 dark:text-green-400">
                          Call Outs - {formatQuarterLabel(year, quarter)}
                        </h3>
                        {data.calloutSummary.length === 0 ? (
                          <p className="text-sm text-black/40 dark:text-white/40">No call outs logged this quarter.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {data.calloutSummary.map((c) => (
                              <span
                                key={c.type}
                                className="rounded-full bg-black/5 px-3 py-1 text-sm dark:bg-white/10"
                              >
                                <span className="font-semibold">{c.count}</span> {c.type}
                              </span>
                            ))}
                            <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                              {totalCallouts} total
                            </span>
                          </div>
                        )}
                      </section>

                      {/* Quick Notes ---------------------------------------------- */}
                      <section className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-green-700 dark:text-green-400">Quick Notes</h3>
                          <button
                            onClick={() => handleAddQuickNote(emp)}
                            className="text-xs font-medium text-green-700 hover:underline dark:text-green-400"
                          >
                            + Add Note
                          </button>
                        </div>
                        <p className="text-xs text-black/50 dark:text-white/50">
                          Quick issues worth flagging - left early, missed a call, a long lunch, a small procedure
                          broken - with an optional date and a spot to follow up later.
                        </p>
                        <div className="space-y-2">
                          {data.quickNotes.map((n) =>
                            draftIds.has(n.id) ? (
                              <div key={n.id} className="grid grid-cols-1 gap-2 rounded-md bg-black/5 p-3 dark:bg-white/5 sm:grid-cols-2">
                                <label className="text-xs font-medium sm:col-span-2">
                                  Note
                                  <textarea
                                    defaultValue={n.note}
                                    onBlur={(e) => handleQuickNoteSave(emp, n.id, { note: e.target.value })}
                                    rows={2}
                                    className={`${field} mt-1`}
                                  />
                                </label>
                                <label className="text-xs font-medium">
                                  Date of Occurrence
                                  <input
                                    type="date"
                                    defaultValue={n.occurred_date ?? ""}
                                    onBlur={(e) => handleQuickNoteSave(emp, n.id, { occurred_date: e.target.value || null })}
                                    className={`${field} mt-1`}
                                  />
                                </label>
                                <label className="text-xs font-medium">
                                  Follow-Up Date
                                  <input
                                    type="date"
                                    defaultValue={n.follow_up_date ?? ""}
                                    onBlur={(e) => handleQuickNoteSave(emp, n.id, { follow_up_date: e.target.value || null })}
                                    className={`${field} mt-1`}
                                  />
                                </label>
                                <label className="text-xs font-medium sm:col-span-2">
                                  Follow-Up Notes
                                  <textarea
                                    defaultValue={n.follow_up_notes ?? ""}
                                    onBlur={(e) => handleQuickNoteSave(emp, n.id, { follow_up_notes: e.target.value })}
                                    rows={2}
                                    className={`${field} mt-1`}
                                  />
                                </label>
                                <div className="flex justify-end gap-3 sm:col-span-2">
                                  <button
                                    onClick={() => handleQuickNoteDelete(emp, n.id)}
                                    className="text-xs font-medium text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => submitDraft(n.id)}
                                    className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                                  >
                                    Submit
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div key={n.id} className="rounded-md border border-black/10 p-3 dark:border-white/10">
                                <p className="whitespace-pre-wrap text-sm">
                                  {n.note || <span className="text-black/40 dark:text-white/40">(no note)</span>}
                                </p>
                                {(n.occurred_date || n.follow_up_date) && (
                                  <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-black/50 dark:text-white/50">
                                    {n.occurred_date && <span>Occurred: {formatDate(n.occurred_date)}</span>}
                                    {n.follow_up_date && <span>Follow-up: {formatDate(n.follow_up_date)}</span>}
                                  </div>
                                )}
                                {n.follow_up_notes && (
                                  <p className="mt-1.5 whitespace-pre-wrap text-xs italic text-black/60 dark:text-white/60">
                                    Follow-up: {n.follow_up_notes}
                                  </p>
                                )}
                                <div className="mt-2 flex justify-end gap-3">
                                  <button
                                    onClick={() => startEditing(n.id)}
                                    className="text-xs font-medium text-green-700 hover:underline dark:text-green-400"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleQuickNoteDelete(emp, n.id)}
                                    className="text-xs font-medium text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ),
                          )}
                          {data.quickNotes.length === 0 && (
                            <p className="text-sm text-black/40 dark:text-white/40">No quick notes logged.</p>
                          )}
                        </div>
                      </section>

                      {/* Improvements / Excellence -------------------------------- */}
                      <section className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-green-700 dark:text-green-400">Improvements & Excellence</h3>
                          <button
                            onClick={() => handleAddImprovement(emp)}
                            className="text-xs font-medium text-green-700 hover:underline dark:text-green-400"
                          >
                            + Add Note
                          </button>
                        </div>
                        <div className="space-y-2">
                          {data.improvements.map((n) =>
                            draftIds.has(n.id) ? (
                              <div key={n.id} className="grid grid-cols-1 gap-2 rounded-md bg-black/5 p-3 dark:bg-white/5 sm:grid-cols-[1fr_auto]">
                                <label className="text-xs font-medium">
                                  Note
                                  <textarea
                                    defaultValue={n.note}
                                    onBlur={(e) => handleImprovementSave(emp, n.id, { note: e.target.value })}
                                    rows={2}
                                    className={`${field} mt-1`}
                                  />
                                </label>
                                <label className="text-xs font-medium">
                                  Date
                                  <input
                                    type="date"
                                    defaultValue={n.occurred_date ?? ""}
                                    onBlur={(e) => handleImprovementSave(emp, n.id, { occurred_date: e.target.value || null })}
                                    className={`${field} mt-1 sm:w-40`}
                                  />
                                </label>
                                <div className="flex justify-end gap-3 sm:col-span-2">
                                  <button
                                    onClick={() => handleImprovementDelete(emp, n.id)}
                                    className="text-xs font-medium text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => submitDraft(n.id)}
                                    className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                                  >
                                    Submit
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div key={n.id} className="rounded-md border border-black/10 p-3 dark:border-white/10">
                                <p className="whitespace-pre-wrap text-sm">
                                  {n.note || <span className="text-black/40 dark:text-white/40">(no note)</span>}
                                </p>
                                {n.occurred_date && (
                                  <p className="mt-1.5 text-xs text-black/50 dark:text-white/50">{formatDate(n.occurred_date)}</p>
                                )}
                                <div className="mt-2 flex justify-end gap-3">
                                  <button
                                    onClick={() => startEditing(n.id)}
                                    className="text-xs font-medium text-green-700 hover:underline dark:text-green-400"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleImprovementDelete(emp, n.id)}
                                    className="text-xs font-medium text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ),
                          )}
                          {data.improvements.length === 0 && (
                            <p className="text-sm text-black/40 dark:text-white/40">Nothing logged.</p>
                          )}
                        </div>
                      </section>

                      {/* Major Issues (Warnings) ---------------------------------- */}
                      <section className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-red-600 dark:text-red-400">Major Issues (Warnings)</h3>
                          <button
                            onClick={() => handleAddMajorIssue(emp)}
                            className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                          >
                            + Add Record
                          </button>
                        </div>
                        <div className="space-y-2">
                          {data.majorIssues.map((n) =>
                            draftIds.has(n.id) ? (
                              <div
                                key={n.id}
                                className="grid grid-cols-1 gap-2 rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20 sm:grid-cols-2"
                              >
                                <label className="text-xs font-medium">
                                  Date of Occurrence
                                  <input
                                    type="date"
                                    defaultValue={n.occurred_date ?? ""}
                                    onBlur={(e) => handleMajorIssueSave(emp, n.id, { occurred_date: e.target.value || null })}
                                    className={`${field} mt-1`}
                                  />
                                </label>
                                <label className="text-xs font-medium">
                                  Type
                                  <select
                                    value={n.issue_type ?? ""}
                                    onChange={(e) =>
                                      handleMajorIssueSave(emp, n.id, { issue_type: (e.target.value || null) as MajorIssueType | null })
                                    }
                                    className={`${field} mt-1`}
                                  >
                                    <option value="">--</option>
                                    {MAJOR_ISSUE_TYPES.map((t) => (
                                      <option key={t.value} value={t.value}>
                                        {t.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="text-xs font-medium sm:col-span-2">
                                  Issue Detail
                                  <textarea
                                    defaultValue={n.description ?? ""}
                                    onBlur={(e) => handleMajorIssueSave(emp, n.id, { description: e.target.value })}
                                    rows={2}
                                    className={`${field} mt-1`}
                                  />
                                </label>
                                <label className="text-xs font-medium sm:col-span-2">
                                  Actions Taken / Plan Moving Forward
                                  <textarea
                                    defaultValue={n.action_plan ?? ""}
                                    onBlur={(e) => handleMajorIssueSave(emp, n.id, { action_plan: e.target.value })}
                                    rows={2}
                                    className={`${field} mt-1`}
                                  />
                                </label>
                                <label className="text-xs font-medium">
                                  Review Date (is the plan working?)
                                  <input
                                    type="date"
                                    defaultValue={n.review_date ?? ""}
                                    onBlur={(e) => handleMajorIssueSave(emp, n.id, { review_date: e.target.value || null })}
                                    className={`${field} mt-1`}
                                  />
                                </label>
                                <div className="flex items-end justify-end gap-3">
                                  <button
                                    onClick={() => handleMajorIssueDelete(emp, n.id)}
                                    className="text-xs font-medium text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => submitDraft(n.id)}
                                    className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                                  >
                                    Submit
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                key={n.id}
                                className="rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20"
                              >
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  {n.issue_type && (
                                    <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                      {MAJOR_ISSUE_TYPES.find((t) => t.value === n.issue_type)?.label}
                                    </span>
                                  )}
                                  {n.occurred_date && <span className="text-black/50 dark:text-white/50">{formatDate(n.occurred_date)}</span>}
                                </div>
                                {n.description && <p className="mt-1.5 whitespace-pre-wrap text-sm">{n.description}</p>}
                                {n.action_plan && (
                                  <p className="mt-1.5 whitespace-pre-wrap text-xs text-black/70 dark:text-white/70">
                                    <span className="font-medium">Action plan:</span> {n.action_plan}
                                  </p>
                                )}
                                {n.review_date && (
                                  <p className="mt-1.5 text-xs text-black/50 dark:text-white/50">
                                    Review by {formatDate(n.review_date)}
                                  </p>
                                )}
                                <div className="mt-2 flex justify-end gap-3">
                                  <button
                                    onClick={() => startEditing(n.id)}
                                    className="text-xs font-medium text-green-700 hover:underline dark:text-green-400"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleMajorIssueDelete(emp, n.id)}
                                    className="text-xs font-medium text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ),
                          )}
                          {data.majorIssues.length === 0 && (
                            <p className="text-sm text-black/40 dark:text-white/40">No major issues on record.</p>
                          )}
                        </div>
                      </section>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {employees.length === 0 && (
          <p className="px-1 text-sm text-black/40 dark:text-white/40">No employees yet - add one above.</p>
        )}
      </div>
    </div>
  );
}
