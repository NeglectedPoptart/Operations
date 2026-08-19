"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import type { RoleSchedule } from "@/lib/types";
import { createRoleSchedule, deleteRoleSchedule, updateRoleSchedule } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function ScheduleTile({
  schedule,
  departments,
  onSave,
  onDelete,
}: {
  schedule: RoleSchedule;
  departments: string[];
  onSave: (id: string, patch: { department: string; role_name: string; hours_text: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [department, setDepartment] = useState(schedule.department);
  const [roleName, setRoleName] = useState(schedule.role_name);
  const [hoursText, setHoursText] = useState(schedule.hours_text);

  function startEdit() {
    setDepartment(schedule.department);
    setRoleName(schedule.role_name);
    setHoursText(schedule.hours_text);
    setEditing(true);
  }

  function save() {
    if (!department.trim() || !roleName.trim()) return;
    onSave(schedule.id, { department: department.trim(), role_name: roleName.trim(), hours_text: hoursText });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg border-2 border-green-600 p-3 shadow-sm">
        <label className="block text-xs font-medium text-black/60 dark:text-white/60">
          Department
          <input
            list="schedule-departments"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className={`${field} mt-0.5`}
          />
        </label>
        <label className="block text-xs font-medium text-black/60 dark:text-white/60">
          Role
          <input value={roleName} onChange={(e) => setRoleName(e.target.value)} className={`${field} mt-0.5`} />
        </label>
        <label className="block text-xs font-medium text-black/60 dark:text-white/60">
          Hours
          <textarea
            value={hoursText}
            onChange={(e) => setHoursText(e.target.value)}
            rows={5}
            className={`${field} mt-0.5 font-mono text-xs`}
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={save}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={() => onDelete(schedule.id)}
            className="ml-auto rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
          >
            Delete
          </button>
        </div>
        <datalist id="schedule-departments">
          {departments.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 shadow-sm dark:border-white/10">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-green-700 dark:text-green-400">{schedule.role_name}</h3>
        <button onClick={startEdit} className="shrink-0 text-xs font-medium text-black/50 hover:underline dark:text-white/50">
          Edit
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">
        {schedule.hours_text || <span className="text-black/40 dark:text-white/40">No hours set yet.</span>}
      </p>
    </div>
  );
}

function AddRoleForm({
  defaultDepartment,
  departments,
  onAdd,
}: {
  defaultDepartment: string;
  departments: string[];
  onAdd: (department: string, roleName: string, hoursText: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [department, setDepartment] = useState(defaultDepartment);
  const [roleName, setRoleName] = useState("");
  const [hoursText, setHoursText] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => {
          setDepartment(defaultDepartment);
          setOpen(true);
        }}
        className="text-sm font-medium text-green-600 hover:underline"
      >
        + Add Role
      </button>
    );
  }

  function submit() {
    if (!department.trim() || !roleName.trim()) return;
    onAdd(department.trim(), roleName.trim(), hoursText);
    setRoleName("");
    setHoursText("");
    setOpen(false);
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-black/20 p-3 dark:border-white/20">
      <label className="block text-xs font-medium text-black/60 dark:text-white/60">
        Department
        <input
          list="schedule-departments"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className={`${field} mt-0.5`}
        />
      </label>
      <label className="block text-xs font-medium text-black/60 dark:text-white/60">
        Role
        <input
          autoFocus
          value={roleName}
          onChange={(e) => setRoleName(e.target.value)}
          placeholder="e.g. 1st Shift - Morning"
          className={`${field} mt-0.5`}
        />
      </label>
      <label className="block text-xs font-medium text-black/60 dark:text-white/60">
        Hours
        <textarea
          value={hoursText}
          onChange={(e) => setHoursText(e.target.value)}
          rows={5}
          placeholder="e.g. Mon-Fri 8:00 AM - 4:00 PM (40 hrs)"
          className={`${field} mt-0.5 font-mono text-xs`}
        />
      </label>
      <div className="flex gap-2">
        <button onClick={submit} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
          Add
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
      <datalist id="schedule-departments">
        {departments.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </div>
  );
}

export default function SchedulesClient({ initialSchedules }: { initialSchedules: RoleSchedule[] }) {
  const confirm = useConfirm();
  const [schedules, setSchedules] = useState(initialSchedules);
  const [showNewDept, setShowNewDept] = useState(false);
  const [newDept, setNewDept] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newHours, setNewHours] = useState("");

  const departments = useMemo(() => {
    const set = new Set(schedules.map((s) => s.department));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [schedules]);

  const byDepartment = useMemo(() => {
    const map = new Map<string, RoleSchedule[]>();
    for (const dept of departments) map.set(dept, []);
    for (const s of schedules) map.get(s.department)?.push(s);
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [schedules, departments]);

  async function handleAdd(department: string, roleName: string, hoursText: string) {
    const row = await createRoleSchedule(department, roleName, hoursText);
    if (row) setSchedules((prev) => [...prev, row as RoleSchedule]);
  }

  function handleSave(id: string, patch: { department: string; role_name: string; hours_text: string }) {
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    updateRoleSchedule(id, patch).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this schedule tile?"))) return;
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    deleteRoleSchedule(id).catch(() => {});
  }

  async function handleAddNewDept() {
    if (!newDept.trim() || !newRole.trim()) return;
    await handleAdd(newDept.trim(), newRole.trim(), newHours);
    setNewDept("");
    setNewRole("");
    setNewHours("");
    setShowNewDept(false);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Schedules</h1>
        <button
          onClick={() => setShowNewDept((s) => !s)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          {showNewDept ? "Cancel" : "+ Add Department"}
        </button>
      </div>

      {showNewDept && (
        <div className="space-y-2 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Department
            <input
              autoFocus
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              placeholder="e.g. Warehouse"
              className={`${field} mt-0.5`}
            />
          </label>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Role
            <input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="e.g. Forklift Operator"
              className={`${field} mt-0.5`}
            />
          </label>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Hours
            <textarea
              value={newHours}
              onChange={(e) => setNewHours(e.target.value)}
              rows={5}
              placeholder="e.g. Mon-Fri 8:00 AM - 4:00 PM (40 hrs)"
              className={`${field} mt-0.5 font-mono text-xs`}
            />
          </label>
          <button
            onClick={handleAddNewDept}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            Add Department
          </button>
        </div>
      )}

      {departments.length === 0 && !showNewDept && (
        <p className="text-sm text-black/40 dark:text-white/40">
          No schedules yet. Click &quot;+ Add Department&quot; to add the first one.
        </p>
      )}

      {departments.map((dept) => (
        <section key={dept} className="space-y-3">
          <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
            {dept}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(byDepartment.get(dept) ?? []).map((s) => (
              <ScheduleTile key={s.id} schedule={s} departments={departments} onSave={handleSave} onDelete={handleDelete} />
            ))}
          </div>
          <AddRoleForm defaultDepartment={dept} departments={departments} onAdd={handleAdd} />
        </section>
      ))}
    </div>
  );
}
