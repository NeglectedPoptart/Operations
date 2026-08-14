"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { WORKFLOW_SECTIONS, type WorkflowSection, type WorkflowStatus, type WorkflowTask } from "@/lib/types";
import {
  createWorkflowTask,
  deleteWorkflowTask,
  resetWorkflowDay,
  updateWorkflowTaskNotes,
  updateWorkflowTaskPosition,
  updateWorkflowTaskStatus,
} from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function AddTaskRow({ onAdd }: { onAdd: (name: string, isPermanent: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPermanent, setIsPermanent] = useState(true);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-green-600 hover:underline print:hidden"
      >
        + Add Task
      </button>
    );
  }

  function submit() {
    if (!name.trim()) return;
    onAdd(name.trim(), isPermanent);
    setName("");
    setIsPermanent(true);
    setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-black/10 p-2 print:hidden dark:border-white/10">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Task name"
        className={`${field} max-w-xs`}
      />
      <label className="flex items-center gap-1 text-xs">
        <input
          type="radio"
          checked={isPermanent}
          onChange={() => setIsPermanent(true)}
        />
        Permanent
      </label>
      <label className="flex items-center gap-1 text-xs">
        <input
          type="radio"
          checked={!isPermanent}
          onChange={() => setIsPermanent(false)}
        />
        Just today
      </label>
      <button
        onClick={submit}
        className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700"
      >
        Add
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-xs font-medium text-black/50 hover:underline dark:text-white/50"
      >
        Cancel
      </button>
    </div>
  );
}

function SectionTable({
  label,
  tasks,
  onToggleStatus,
  onSaveNotes,
  onDelete,
  onAdd,
  onMove,
}: {
  label: string;
  tasks: WorkflowTask[];
  onToggleStatus: (id: string, status: WorkflowStatus) => void;
  onSaveNotes: (id: string, notes: string) => void;
  onDelete: (id: string) => void;
  onAdd: (name: string, isPermanent: boolean) => void;
  onMove: (task: WorkflowTask, direction: "up" | "down") => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
        {label}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 print:border-black">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5 print:bg-transparent">
            <tr>
              <th className="w-10 px-2 py-2">#</th>
              <th className="px-2 py-2">Task</th>
              <th className="w-24 px-2 py-2">Status</th>
              <th className="px-2 py-2">Notes / Follow-up</th>
              <th className="w-16 px-2 py-2 print:hidden" />
              <th className="w-16 px-2 py-2 print:hidden" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, i) => (
              <tr key={task.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-2 py-1.5 text-black/50 dark:text-white/50">{i + 1}</td>
                <td className="px-2 py-1.5">
                  {task.name}
                  {!task.is_permanent && (
                    <span className="ml-1 rounded bg-black/10 px-1 text-xs text-black/50 dark:bg-white/10 dark:text-white/50">
                      today only
                    </span>
                  )}
                </td>
                <td className="px-1 py-1">
                  <button
                    onClick={() => onToggleStatus(task.id, task.status === "done" ? "pending" : "done")}
                    className={`w-full rounded px-2 py-1 text-xs font-medium ${
                      task.status === "done"
                        ? "bg-green-600 text-white"
                        : "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60"
                    }`}
                  >
                    {task.status === "done" ? "Done" : "Pending"}
                  </button>
                </td>
                <td className="px-1 py-1">
                  <input
                    defaultValue={task.notes ?? ""}
                    onBlur={(e) => onSaveNotes(task.id, e.target.value)}
                    className={field}
                  />
                </td>
                <td className="whitespace-nowrap px-1 py-1.5 text-center print:hidden">
                  <button
                    type="button"
                    onClick={() => onMove(task, "up")}
                    disabled={i === 0}
                    title="Move up"
                    className="px-1 text-black/40 hover:text-black disabled:opacity-30 dark:text-white/40 dark:hover:text-white"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(task, "down")}
                    disabled={i === tasks.length - 1}
                    title="Move down"
                    className="px-1 text-black/40 hover:text-black disabled:opacity-30 dark:text-white/40 dark:hover:text-white"
                  >
                    ▼
                  </button>
                </td>
                <td className="px-2 py-1.5 print:hidden">
                  <button
                    onClick={() => onDelete(task.id)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No tasks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <AddTaskRow onAdd={onAdd} />
    </section>
  );
}

export default function WorkflowClient({ initialTasks }: { initialTasks: WorkflowTask[] }) {
  const confirm = useConfirm();
  const [tasks, setTasks] = useState(initialTasks);
  const [resetting, setResetting] = useState(false);

  const bySection = useMemo(() => {
    const map = new Map<WorkflowSection, WorkflowTask[]>();
    for (const section of WORKFLOW_SECTIONS) map.set(section.value, []);
    for (const task of tasks) {
      map.get(task.section)?.push(task);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [tasks]);

  function updateLocal(id: string, patch: Partial<WorkflowTask>) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function handleToggleStatus(id: string, status: WorkflowStatus) {
    updateLocal(id, { status });
    updateWorkflowTaskStatus(id, status).catch(() => {});
  }

  function handleSaveNotes(id: string, notes: string) {
    updateWorkflowTaskNotes(id, notes).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this task?"))) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    deleteWorkflowTask(id).catch(() => {});
  }

  async function handleAdd(section: WorkflowSection, name: string, isPermanent: boolean) {
    const row = await createWorkflowTask(section, name, isPermanent);
    if (row) setTasks((prev) => [...prev, row as WorkflowTask]);
  }

  function handleMove(task: WorkflowTask, direction: "up" | "down") {
    const siblings = (bySection.get(task.section) ?? []).slice().sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex((t) => t.id === task.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    updateLocal(task.id, { position: other.position });
    updateLocal(other.id, { position: task.position });
    updateWorkflowTaskPosition(task.id, other.position).catch(() => {});
    updateWorkflowTaskPosition(other.id, task.position).catch(() => {});
  }

  async function handleResetDay() {
    if (!(await confirm("Reset all tasks back to Pending and clear notes? Today-only tasks will be removed."))) return;
    setResetting(true);
    try {
      await resetWorkflowDay();
      setTasks((prev) =>
        prev.filter((t) => t.is_permanent).map((t) => ({ ...t, status: "pending" as const, notes: null })),
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-2xl font-bold">Workflow</h1>
        <div className="flex gap-2">
          <button
            onClick={handleResetDay}
            disabled={resetting}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-60 dark:border-white/20 dark:hover:bg-white/10"
          >
            {resetting ? "Resetting..." : "Reset Day"}
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Print
          </button>
        </div>
      </div>

      {WORKFLOW_SECTIONS.map((section) => (
        <SectionTable
          key={section.value}
          label={section.label}
          tasks={bySection.get(section.value) ?? []}
          onToggleStatus={handleToggleStatus}
          onSaveNotes={handleSaveNotes}
          onDelete={handleDelete}
          onAdd={(name, isPermanent) => handleAdd(section.value, name, isPermanent)}
          onMove={handleMove}
        />
      ))}
    </div>
  );
}
