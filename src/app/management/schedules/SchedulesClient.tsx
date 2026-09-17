"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  addDays,
  currentWeekStart,
  formatWeekLabel,
  formatWeekRangeMonToSat,
  nextWeekStart,
  prevWeekStart,
  weekNumberOf,
} from "@/lib/dates";
import { copyOrDownloadPng, renderPriceSheetPng, type CanvasBlock } from "@/lib/fobPricing";
import {
  SCHEDULE_DAY_KEYS,
  SCHEDULE_DAY_LABELS,
  type Employee,
  type RoleSchedule,
  type RoleScheduleAssignmentType,
  type ScheduleDayHours,
  type ScheduleDayKey,
} from "@/lib/types";
import { createRoleSchedule, deleteRoleSchedule, updateRoleSchedule, type NewRoleScheduleInput } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";
const DEFAULT_WEEKS_OUT = 6;

function emptyDayGrid(): Record<ScheduleDayKey, string> {
  return { mon: "", tue: "", wed: "", thu: "", fri: "", sat: "" };
}

// Drops empty days before saving, so the stored JSON only ever has the days
// that are actually worked.
function cleanDays(days: Record<ScheduleDayKey, string>): ScheduleDayHours {
  const cleaned: ScheduleDayHours = {};
  for (const day of SCHEDULE_DAY_KEYS) {
    const value = days[day]?.trim();
    if (value) cleaned[day] = value;
  }
  return cleaned;
}

function hasAnyDay(days: ScheduleDayHours | null | undefined): boolean {
  return !!days && SCHEDULE_DAY_KEYS.some((d) => !!days[d]);
}

// Even-numbered weeks (see weekNumberOf in lib/dates.ts) get Week B's
// pattern when one is set - odd weeks, or a schedule with no Week B at all,
// always read Week A. This is the entire "rotation" mechanic: no anchor
// date to configure, just whichever real week you're looking at.
function resolveHoursForWeek(schedule: RoleSchedule, isEvenWeek: boolean): { text: string; usingWeekB: boolean } {
  const usingWeekB = isEvenWeek && !!schedule.week_b_hours_text;
  return { text: (usingWeekB ? schedule.week_b_hours_text : schedule.week_a_hours_text) ?? "", usingWeekB };
}

function resolveDaysForWeek(schedule: RoleSchedule, isEvenWeek: boolean): { days: ScheduleDayHours; usingWeekB: boolean } {
  const usingWeekB = isEvenWeek && hasAnyDay(schedule.week_b_days);
  return { days: (usingWeekB ? schedule.week_b_days : schedule.week_a_days) ?? {}, usingWeekB };
}

// Condenses a day grid into a short line like "Mon-Fri: 8:00 AM - 4:00 PM,
// Sat: 8:00 AM - 3:00 PM" - consecutive days with the identical value
// collapse into one range instead of listing each day separately.
function summarizeDays(days: ScheduleDayHours): string {
  const groups: string[] = [];
  let i = 0;
  while (i < SCHEDULE_DAY_KEYS.length) {
    const value = days[SCHEDULE_DAY_KEYS[i]]?.trim();
    if (!value) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < SCHEDULE_DAY_KEYS.length && days[SCHEDULE_DAY_KEYS[j + 1]]?.trim() === value) j++;
    const startLabel = SCHEDULE_DAY_LABELS[SCHEDULE_DAY_KEYS[i]].slice(0, 3);
    const endLabel = SCHEDULE_DAY_LABELS[SCHEDULE_DAY_KEYS[j]].slice(0, 3);
    groups.push(`${i === j ? startLabel : `${startLabel}-${endLabel}`}: ${value}`);
    i = j + 1;
  }
  return groups.join(", ");
}

// Single line describing whichever week is selected, regardless of
// assignment type - used by the collapsed row and Copy as Image.
function scheduleSummaryForWeek(schedule: RoleSchedule, isEvenWeek: boolean): { text: string; usingWeekB: boolean } {
  if (schedule.assignment_type === "person") {
    const { days, usingWeekB } = resolveDaysForWeek(schedule, isEvenWeek);
    return { text: summarizeDays(days), usingWeekB };
  }
  return resolveHoursForWeek(schedule, isEvenWeek);
}

interface ScheduleFormState {
  department: string;
  assignmentType: RoleScheduleAssignmentType;
  roleName: string;
  employeeId: string;
  weekAHoursText: string;
  weekBHoursText: string;
  weekADays: Record<ScheduleDayKey, string>;
  weekBDays: Record<ScheduleDayKey, string>;
  hasWeekB: boolean;
}

function emptyForm(department: string): ScheduleFormState {
  return {
    department,
    assignmentType: "role",
    roleName: "",
    employeeId: "",
    weekAHoursText: "",
    weekBHoursText: "",
    weekADays: emptyDayGrid(),
    weekBDays: emptyDayGrid(),
    hasWeekB: false,
  };
}

function scheduleToFormState(schedule: RoleSchedule): ScheduleFormState {
  return {
    department: schedule.department,
    assignmentType: schedule.assignment_type,
    roleName: schedule.role_name,
    employeeId: schedule.employee_id ?? "",
    weekAHoursText: schedule.week_a_hours_text ?? "",
    weekBHoursText: schedule.week_b_hours_text ?? "",
    weekADays: { ...emptyDayGrid(), ...(schedule.week_a_days ?? {}) },
    weekBDays: { ...emptyDayGrid(), ...(schedule.week_b_days ?? {}) },
    hasWeekB: hasAnyDay(schedule.week_b_days),
  };
}

function inputFromState(state: ScheduleFormState): NewRoleScheduleInput {
  return {
    department: state.department.trim(),
    assignmentType: state.assignmentType,
    roleName: state.roleName.trim(),
    employeeId: state.assignmentType === "person" ? state.employeeId || null : null,
    weekAHoursText: state.weekAHoursText,
    weekBHoursText: state.assignmentType === "person" ? "" : state.weekBHoursText,
    weekADays: state.assignmentType === "person" ? cleanDays(state.weekADays) : {},
    weekBDays: state.assignmentType === "person" && state.hasWeekB ? cleanDays(state.weekBDays) : null,
  };
}

function formIsValid(state: ScheduleFormState): boolean {
  if (!state.department.trim()) return false;
  if (state.assignmentType === "person") return !!state.employeeId;
  return !!state.roleName.trim();
}

function DayGridInputs({
  label,
  days,
  onChange,
}: {
  label: string;
  days: Record<ScheduleDayKey, string>;
  onChange: (day: ScheduleDayKey, value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-black/60 dark:text-white/60">{label}</p>
      <div className="mt-1 grid grid-cols-6 gap-1">
        {SCHEDULE_DAY_KEYS.map((day) => (
          <label key={day} className="text-[10px] font-medium text-black/50 dark:text-white/50">
            {SCHEDULE_DAY_LABELS[day].slice(0, 3)}
            <input
              value={days[day] ?? ""}
              onChange={(e) => onChange(day, e.target.value)}
              placeholder="off"
              className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1 py-1 text-[11px] text-black"
            />
          </label>
        ))}
      </div>
    </div>
  );
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
          <DayGridInputs
            label="Week A"
            days={state.weekADays}
            onChange={(day, value) => setState((s) => ({ ...s, weekADays: { ...s.weekADays, [day]: value } }))}
          />
          <label className="flex items-center gap-1.5 text-xs font-medium text-black/60 dark:text-white/60">
            <input
              type="checkbox"
              checked={state.hasWeekB}
              onChange={(e) => setState((s) => ({ ...s, hasWeekB: e.target.checked }))}
            />
            Alternates with a different pattern every other week
          </label>
          {state.hasWeekB && (
            <DayGridInputs
              label="Week B"
              days={state.weekBDays}
              onChange={(day, value) => setState((s) => ({ ...s, weekBDays: { ...s.weekBDays, [day]: value } }))}
            />
          )}
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

// The "generate N weeks out" calendar - one row per week starting this
// week, columns Monday-Saturday, each cell resolved from Week A/B the same
// way the collapsed row summary is.
function GeneratedCalendar({ schedule }: { schedule: RoleSchedule }) {
  const [weeksOut, setWeeksOut] = useState(DEFAULT_WEEKS_OUT);

  const weeks = useMemo(() => {
    const start = currentWeekStart();
    return Array.from({ length: weeksOut }, (_, i) => addDays(start, i * 7));
  }, [weeksOut]);

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-black/60 dark:text-white/60">
        Generate
        <input
          type="number"
          min={1}
          max={26}
          value={weeksOut}
          onChange={(e) => setWeeksOut(Math.max(1, Math.min(26, Number(e.target.value) || 1)))}
          className="mx-2 w-16 rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-black"
        />
        weeks out
      </label>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-1.5" />
              {SCHEDULE_DAY_KEYS.map((d) => (
                <th key={d} className="px-2 py-1.5">
                  {SCHEDULE_DAY_LABELS[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((weekStart) => {
              const isEven = weekNumberOf(weekStart) % 2 === 0;
              const { days } = resolveDaysForWeek(schedule, isEven);
              return (
                <tr key={weekStart} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-2 py-1.5 font-medium text-green-700 dark:text-green-400">
                    {formatWeekRangeMonToSat(weekStart)}
                  </td>
                  {SCHEDULE_DAY_KEYS.map((d) => (
                    <td key={d} className="px-2 py-1.5">
                      {days[d] || ""}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScheduleRow({
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
  const [showCalendar, setShowCalendar] = useState(false);
  const [state, setState] = useState<ScheduleFormState>(() => scheduleToFormState(schedule));

  function startEdit() {
    setState(scheduleToFormState(schedule));
    setEditing(true);
  }

  function save() {
    if (!formIsValid(state)) return;
    onSave(schedule.id, inputFromState(state));
    setEditing(false);
  }

  if (editing) {
    return (
      <tr className="border-t border-black/10 dark:border-white/10">
        <td colSpan={3} className="p-3">
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
        </td>
      </tr>
    );
  }

  const employee = employees.find((e) => e.id === schedule.employee_id);
  const { text: hoursText, usingWeekB } = scheduleSummaryForWeek(schedule, isEvenWeek);
  const isPerson = schedule.assignment_type === "person";
  const isRotating = isPerson ? hasAnyDay(schedule.week_b_days) : !!schedule.week_b_hours_text;

  return (
    <>
      <tr className="border-t border-black/10 align-top dark:border-white/10">
        <td className="px-3 py-2">
          <p className="font-bold text-green-700 dark:text-green-400">
            {isPerson ? (employee?.name ?? "Unassigned") : schedule.role_name}
          </p>
          {isPerson && schedule.role_name && <p className="text-xs text-black/50 dark:text-white/50">{schedule.role_name}</p>}
        </td>
        <td className="px-3 py-2">
          {isRotating && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
              {usingWeekB ? "Week B pattern" : "Week A pattern"}
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">
            {hoursText || <span className="text-black/40 dark:text-white/40">No hours set yet.</span>}
          </p>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {isPerson && (
            <button
              onClick={() => setShowCalendar((v) => !v)}
              className="mr-3 text-xs font-medium text-green-600 hover:underline"
            >
              {showCalendar ? "Hide Schedule" : "View Schedule"}
            </button>
          )}
          <button onClick={startEdit} className="text-xs font-medium text-black/50 hover:underline dark:text-white/50">
            Edit
          </button>
        </td>
      </tr>
      {showCalendar && (
        <tr className="border-t border-black/10 dark:border-white/10">
          <td colSpan={3} className="bg-black/[0.02] p-3 dark:bg-white/[0.02]">
            <GeneratedCalendar schedule={schedule} />
          </td>
        </tr>
      )}
    </>
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
    if (!formIsValid(state)) return;
    onAdd(inputFromState(state));
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
  const [imageStatus, setImageStatus] = useState<string | null>(null);

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
              week_a_days: input.weekADays,
              week_b_days: input.weekBDays,
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
      week_a_days: input.weekADays,
      week_b_days: input.weekBDays,
    }).catch(() => {});
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this schedule tile?"))) return;
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    deleteRoleSchedule(id).catch(() => {});
  }

  async function handleAddNewDept() {
    if (!formIsValid(newDeptState)) return;
    await handleAdd(inputFromState(newDeptState));
    setNewDeptState(emptyForm(""));
    setShowNewDept(false);
  }

  async function handleCopyImage() {
    try {
      const blocks: CanvasBlock[] = departments.map((dept) => ({
        title: dept,
        headerColor: "#8DC63F",
        columnHeaders: ["Name / Role", "Hours"],
        rows: (byDepartment.get(dept) ?? []).map((s) => {
          const employee = employees.find((e) => e.id === s.employee_id);
          const isPerson = s.assignment_type === "person";
          const name = isPerson ? (employee?.name ?? "Unassigned") : s.role_name;
          const nameCell = isPerson && s.role_name ? `${name} (${s.role_name})` : name;
          const { text: hoursText } = scheduleSummaryForWeek(s, isEvenWeek);
          return { cells: [nameCell, hoursText || "-"] };
        }),
      }));
      const title = `Schedules - Week ${weekNumber} (${formatWeekLabel(weekStart)})`;
      const blob = await renderPriceSheetPng({ title, message: "", blocks, direction: "column" });
      const result = await copyOrDownloadPng(blob, `schedules-week-${weekNumber}.png`);
      setImageStatus(result === "copied" ? "Image copied!" : "Image downloaded!");
      setTimeout(() => setImageStatus(null), 2500);
    } catch {
      alert("Could not create the image - try again.");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Schedules</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyImage}
            className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            {imageStatus ?? "Copy as Image"}
          </button>
          <button
            onClick={() => setShowNewDept((s) => !s)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            {showNewDept ? "Cancel" : "+ Add Department"}
          </button>
        </div>
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
          <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-black/5 text-left dark:bg-white/5">
                <tr>
                  <th className="px-3 py-2">Name / Role</th>
                  <th className="px-3 py-2">Hours</th>
                  <th className="w-16 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {(byDepartment.get(dept) ?? []).map((s) => (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    employees={employees}
                    departments={departments}
                    isEvenWeek={isEvenWeek}
                    onSave={handleSave}
                    onDelete={handleDelete}
                  />
                ))}
                {(byDepartment.get(dept) ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                      No roles in this department yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <AddRoleForm defaultDepartment={dept} employees={employees} departments={departments} onAdd={handleAdd} />
        </section>
      ))}
    </div>
  );
}
