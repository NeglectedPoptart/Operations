"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { currentWeekStart, formatWeekLabel, nextWeekStart, prevWeekStart, weekNumberOf } from "@/lib/dates";
import type { Employee, RoleSchedule, RoleScheduleAssignmentType } from "@/lib/types";
import { createRoleSchedule, deleteRoleSchedule, updateRoleSchedule, type NewRoleScheduleInput } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

// Even-numbered weeks (see weekNumberOf in lib/dates.ts) get Week B's
// pattern when one is set - odd weeks, or a schedule with no Week B at all,
// always read Week A. This is the entire "rotation" mechanic: no anchor
// date to configure, just whichever real week you're looking at.
function resolveHoursForWeek(schedule: RoleSchedule, isEvenWeek: boolean): { text: string; usingWeekB: boolean } {
  const usingWeekB = isEvenWeek && !!schedule.week_b_hours_text;
  return { text: (usingWeekB ? schedule.week_b_hours_text : schedule.week_a_hours_text) ?? "", usingWeekB };
}

interface ScheduleFormState {
  department: string;
  assignmentType: RoleScheduleAssignmentType;
  roleName: string;
  employeeId: string;
  weekAHoursText: string;
  weekBHoursText: string;
}

function emptyForm(department: string): ScheduleFormState {
  return { department, assignmentType: "role", roleName: "", employeeId: "", weekAHoursText: "", weekBHoursText: "" };
}

function ScheduleForm({
  state,
  setState,
  employees,
  departments,
}: {
  state: ScheduleFormState;
  setState: (updater: (prev: ScheduleFormState) => ScheduleFormState) => void;
  employees: Employee[];
  departments: string[];
}) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-black/60 dark:text-white/60">
        Department
        <input
          list="schedule-departments"
          value={state.department}
          onChange={(e) => setState((s) => ({ ...s, department: e.target.value }))}
          className={`${field} mt-0.5`}
        />
      </label>

      <div className="flex gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={state.assignmentType === "person"}
            onChange={() => setState((s) => ({ ...s, assignmentType: "person" }))}
          />
          Person
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={state.assignmentType === "role"}
            onChange={() => setState((s) => ({ ...s, assignmentType: "role" }))}
          />
          Role
        </label>
      </div>

      {state.assignmentType === "person" ? (
        <>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Employee
            <select
              value={state.employeeId}
              onChange={(e) => setState((s) => ({ ...s, employeeId: e.target.value }))}
              className={`${field} mt-0.5`}
            >
              <option value="">-- Select --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Shift Label (optional)
            <input
              value={state.roleName}
              onChange={(e) => setState((s) => ({ ...s, roleName: e.target.value }))}
              placeholder="e.g. 1st Shift - Morning"
              className={`${field} mt-0.5`}
            />
          </label>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Week A Hours
            <textarea
              value={state.weekAHoursText}
              onChange={(e) => setState((s) => ({ ...s, weekAHoursText: e.target.value }))}
              rows={4}
              placeholder="e.g. Mon-Fri 8:00 AM - 4:00 PM (40 hrs)"
              className={`${field} mt-0.5 font-mono text-xs`}
            />
          </label>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Week B Hours (optional - alternates in on even weeks)
            <textarea
              value={state.weekBHoursText}
              onChange={(e) => setState((s) => ({ ...s, weekBHoursText: e.target.value }))}
              rows={4}
              placeholder="Leave blank if this person works the same hours every week"
              className={`${field} mt-0.5 font-mono text-xs`}
            />
          </label>
        </>
      ) : (
        <>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Role
            <input
              value={state.roleName}
              onChange={(e) => setState((s) => ({ ...s, roleName: e.target.value }))}
              placeholder="e.g. Operations"
              className={`${field} mt-0.5`}
            />
          </label>
          <label className="block text-xs font-medium text-black/60 dark:text-white/60">
            Hours
            <textarea
              value={state.weekAHoursText}
              onChange={(e) => setState((s) => ({ ...s, weekAHoursText: e.target.value }))}
              rows={4}
              placeholder="e.g. Office hours 8:00 AM - 5:00 PM"
              className={`${field} mt-0.5 font-mono text-xs`}
            />
          </label>
        </>
      )}

      <datalist id="schedule-departments">
        {departments.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </div>
  );
}

function ScheduleTile({
  schedule,
  employees,
  departments,
  isEvenWeek,
  onSave,
  onDelete,
}: {
  schedule: RoleSchedule;
  employees: Employee[];
  departments: string[];
  isEvenWeek: boolean;
  onSave: (id: string, patch: NewRoleScheduleInput) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<ScheduleFormState>(() => ({
    department: schedule.department,
    assignmentType: schedule.assignment_type,
    roleName: schedule.role_name,
    employeeId: schedule.employee_id ?? "",
    weekAHoursText: schedule.week_a_hours_text ?? "",
    weekBHoursText: schedule.week_b_hours_text ?? "",
  }));

  function startEdit() {
    setState({
      department: schedule.department,
      assignmentType: schedule.assignment_type,
      roleName: schedule.role_name,
      employeeId: schedule.employee_id ?? "",
      weekAHoursText: schedule.week_a_hours_text ?? "",
      weekBHoursText: schedule.week_b_hours_text ?? "",
    });
    setEditing(true);
  }

  function save() {
    if (!state.department.trim()) return;
    if (state.assignmentType === "person" && !state.employeeId) return;
    if (state.assignmentType === "role" && !state.roleName.trim()) return;
    onSave(schedule.id, {
      department: state.department.trim(),
      assignmentType: state.assignmentType,
      roleName: state.roleName.trim(),
      employeeId: state.assignmentType === "person" ? state.employeeId || null : null,
      weekAHoursText: state.weekAHoursText,
      weekBHoursText: state.assignmentType === "person" ? state.weekBHoursText : "",
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-lg border-2 border-green-600 p-3 shadow-sm">
        <ScheduleForm state={state} setState={setState} employees={employees} departments={departments} />
        <div className="flex gap-2">
          <button onClick={save} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
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
      </div>
    );
  }

  const employee = employees.find((e) => e.id === schedule.employee_id);
  const { text: hoursText, usingWeekB } = resolveHoursForWeek(schedule, isEvenWeek);
  const isPerson = schedule.assignment_type === "person";

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 shadow-sm dark:border-white/10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-green-700 dark:text-green-400">
            {isPerson ? (employee?.name ?? "Unassigned") : schedule.role_name}
          </h3>
          {isPerson && schedule.role_name && (
            <p className="text-xs text-black/50 dark:text-white/50">{schedule.role_name}</p>
          )}
        </div>
        <button onClick={startEdit} className="shrink-0 text-xs font-medium text-black/50 hover:underline dark:text-white/50">
          Edit
        </button>
      </div>
      {isPerson && schedule.week_b_hours_text && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
          {usingWeekB ? "Week B pattern" : "Week A pattern"}
        </p>
      )}
      <p className="whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">
        {hoursText || <span className="text-black/40 dark:text-white/40">No hours set yet.</span>}
      </p>
    </div>
  );
}

function AddRoleForm({
  defaultDepartment,
  employees,
  departments,
  onAdd,
}: {
  defaultDepartment: string;
  employees: Employee[];
  departments: string[];
  onAdd: (input: NewRoleScheduleInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ScheduleFormState>(() => emptyForm(defaultDepartment));

  if (!open) {
    return (
      <button
        onClick={() => {
          setState(emptyForm(defaultDepartment));
          setOpen(true);
        }}
        className="text-sm font-medium text-green-600 hover:underline"
      >
        + Add Role
      </button>
    );
  }

  function submit() {
    if (!state.department.trim()) return;
    if (state.assignmentType === "person" && !state.employeeId) return;
    if (state.assignmentType === "role" && !state.roleName.trim()) return;
    onAdd({
      department: state.department.trim(),
      assignmentType: state.assignmentType,
      roleName: state.roleName.trim(),
      employeeId: state.assignmentType === "person" ? state.employeeId : null,
      weekAHoursText: state.weekAHoursText,
      weekBHoursText: state.assignmentType === "person" ? state.weekBHoursText : "",
    });
    setState(emptyForm(defaultDepartment));
    setOpen(false);
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-black/20 p-3 dark:border-white/20">
      <ScheduleForm state={state} setState={setState} employees={employees} departments={departments} />
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
    </div>
  );
}

export default function SchedulesClient({
  initialSchedules,
  employees,
}: {
  initialSchedules: RoleSchedule[];
  employees: Employee[];
}) {
  const confirm = useConfirm();
  const [schedules, setSchedules] = useState(initialSchedules);
  const [showNewDept, setShowNewDept] = useState(false);
  const [newDeptState, setNewDeptState] = useState<ScheduleFormState>(() => emptyForm(""));
  const [weekStart, setWeekStart] = useState(() => currentWeekStart());

  const weekNumber = weekNumberOf(weekStart);
  const isEvenWeek = weekNumber % 2 === 0;
  const isCurrentWeek = weekStart === currentWeekStart();

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

  async function handleAdd(input: NewRoleScheduleInput) {
    const row = await createRoleSchedule(input);
    if (row) setSchedules((prev) => [...prev, row]);
  }

  function handleSave(id: string, input: NewRoleScheduleInput) {
    setSchedules((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              department: input.department,
              assignment_type: input.assignmentType,
              role_name: input.roleName,
              employee_id: input.employeeId,
              week_a_hours_text: input.weekAHoursText,
              week_b_hours_text: input.weekBHoursText || null,
            }
          : s,
      ),
    );
    updateRoleSchedule(id, {
      department: input.department,
      assignment_type: input.assignmentType,
      role_name: input.roleName,
      employee_id: input.employeeId,
      week_a_hours_text: input.weekAHoursText,
      week_b_hours_text: input.weekBHoursText || null,
    }).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this schedule tile?"))) return;
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    deleteRoleSchedule(id).catch(() => {});
  }

  async function handleAddNewDept() {
    if (!newDeptState.department.trim()) return;
    if (newDeptState.assignmentType === "person" && !newDeptState.employeeId) return;
    if (newDeptState.assignmentType === "role" && !newDeptState.roleName.trim()) return;
    await handleAdd({
      department: newDeptState.department.trim(),
      assignmentType: newDeptState.assignmentType,
      roleName: newDeptState.roleName.trim(),
      employeeId: newDeptState.assignmentType === "person" ? newDeptState.employeeId : null,
      weekAHoursText: newDeptState.weekAHoursText,
      weekBHoursText: newDeptState.assignmentType === "person" ? newDeptState.weekBHoursText : "",
    });
    setNewDeptState(emptyForm(""));
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setWeekStart((w) => prevWeekStart(w))}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          ← Prev Week
        </button>
        <span className="text-sm font-medium">
          Week {weekNumber} ({formatWeekLabel(weekStart)}) {isCurrentWeek && <span className="text-green-600">(this week)</span>}
        </span>
        <button
          onClick={() => setWeekStart((w) => nextWeekStart(w))}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Next Week →
        </button>
        {!isCurrentWeek && (
          <button
            onClick={() => setWeekStart(currentWeekStart())}
            className="text-sm font-medium text-green-600 hover:underline"
          >
            Back to this week
          </button>
        )}
      </div>

      {showNewDept && (
        <div className="space-y-2 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
          <ScheduleForm state={newDeptState} setState={setNewDeptState} employees={employees} departments={departments} />
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
              <ScheduleTile
                key={s.id}
                schedule={s}
                employees={employees}
                departments={departments}
                isEvenWeek={isEvenWeek}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <AddRoleForm defaultDepartment={dept} employees={employees} departments={departments} onAdd={handleAdd} />
        </section>
      ))}
    </div>
  );
}
