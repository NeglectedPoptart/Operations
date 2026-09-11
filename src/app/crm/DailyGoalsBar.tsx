"use client";

import { useState } from "react";
import { formatDate } from "@/lib/dates";
import type { CrmDailyGoal } from "@/lib/types";
import { adjustDailyGoalProgress, deleteDailyGoal, setDailyGoal } from "./goalsActions";

export interface GoalUser {
  id: string;
  email: string | null;
}

function displayNameForEmail(email: string | null): string {
  if (!email) return "Unknown";
  const local = email.split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

export default function DailyGoalsBar({
  users,
  initialGoals,
  todayIso,
  currentUserId,
  isAdminOrExec,
}: {
  users: GoalUser[];
  initialGoals: CrmDailyGoal[];
  todayIso: string;
  currentUserId: string;
  isAdminOrExec: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [goals, setGoals] = useState(initialGoals);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftTarget, setDraftTarget] = useState("");
  const [saving, setSaving] = useState(false);

  const goalByUserId = new Map(goals.map((g) => [g.user_id, g]));
  const orderedUsers = [...users].sort((a, b) => displayNameForEmail(a.email).localeCompare(displayNameForEmail(b.email)));

  function startEdit(userId: string) {
    const existing = goalByUserId.get(userId);
    setEditingUserId(userId);
    setDraftText(existing?.goal_text ?? "");
    setDraftTarget(existing ? String(existing.target_count) : "");
  }

  function cancelEdit() {
    setEditingUserId(null);
  }

  async function saveEdit(userId: string) {
    const text = draftText.trim();
    if (!text) return;
    const target = Math.max(0, parseInt(draftTarget, 10) || 0);
    setSaving(true);
    try {
      const saved = (await setDailyGoal(userId, todayIso, text, target)) as CrmDailyGoal;
      const existing = goalByUserId.get(userId);
      if (existing) {
        setGoals((prev) => prev.map((g) => (g.id === existing.id ? saved : g)));
      } else {
        setGoals((prev) => [...prev, saved]);
      }
      setEditingUserId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust(goal: CrmDailyGoal, delta: number) {
    const nextCount = Math.max(0, goal.current_count + delta);
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, current_count: nextCount } : g)));
    try {
      await adjustDailyGoalProgress(goal.id, goal.user_id, delta);
    } catch {
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, current_count: goal.current_count } : g)));
    }
  }

  async function handleClear(goal: GoalUser & { goalId: string }) {
    setGoals((prev) => prev.filter((g) => g.id !== goal.goalId));
    await deleteDailyGoal(goal.goalId, goal.id).catch(() => {});
  }

  return (
    <div className="fixed right-0 top-24 z-40 flex items-start">
      {open && (
        <div className="max-h-[70vh] w-72 max-w-[calc(100vw-3rem)] overflow-y-auto rounded-l-lg border border-r-0 border-black/10 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-neutral-900">
          <h3 className="text-sm font-bold text-green-700 dark:text-green-400">Today&apos;s Goals</h3>
          <p className="text-xs text-black/40 dark:text-white/40">{formatDate(todayIso)}</p>

          <div className="mt-3 space-y-3">
            {orderedUsers.map((u) => {
              const goal = goalByUserId.get(u.id);
              const canEdit = isAdminOrExec || u.id === currentUserId;
              const editing = editingUserId === u.id;
              const pct = goal && goal.target_count > 0 ? Math.min(100, Math.round((goal.current_count / goal.target_count) * 100)) : 0;
              const met = goal ? goal.target_count > 0 && goal.current_count >= goal.target_count : false;

              return (
                <div key={u.id} className="border-b border-black/5 pb-2 text-sm last:border-b-0 dark:border-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{displayNameForEmail(u.email)}</span>
                    {canEdit && !editing && (
                      <button onClick={() => startEdit(u.id)} className="text-xs font-medium text-green-700 hover:underline dark:text-green-400">
                        {goal ? "Edit" : "Set"}
                      </button>
                    )}
                  </div>

                  {editing ? (
                    <div className="mt-1 space-y-1.5">
                      <input
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        placeholder="e.g. Call new leads"
                        className={`${field} text-xs`}
                      />
                      <input
                        type="number"
                        min={0}
                        value={draftTarget}
                        onChange={(e) => setDraftTarget(e.target.value)}
                        placeholder="Target (e.g. 20)"
                        className={`${field} text-xs`}
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => saveEdit(u.id)}
                          disabled={saving || draftText.trim() === ""}
                          className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button onClick={cancelEdit} className="rounded-md px-2 py-1 text-xs font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10">
                          Cancel
                        </button>
                        {goal && (
                          <button
                            onClick={() => handleClear({ ...u, goalId: goal.id })}
                            className="ml-auto text-xs font-medium text-red-600 hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  ) : goal ? (
                    <div className="mt-1">
                      <p className="text-black/70 dark:text-white/70">{goal.goal_text}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                          <div
                            className={`h-full ${met ? "bg-green-600" : "bg-amber-500"}`}
                            style={{ width: `${goal.target_count > 0 ? pct : 0}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs text-black/60 dark:text-white/60">
                          {goal.current_count}/{goal.target_count}
                        </span>
                        {canEdit && (
                          <span className="flex shrink-0 gap-1">
                            <button
                              onClick={() => handleAdjust(goal, -1)}
                              className="h-5 w-5 rounded border border-black/20 text-xs leading-none hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                            >
                              −
                            </button>
                            <button
                              onClick={() => handleAdjust(goal, 1)}
                              className="h-5 w-5 rounded border border-black/20 text-xs leading-none hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                            >
                              +
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-black/40 dark:text-white/40">No goal set yet.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-6 rounded-l-md border border-r-0 border-black/10 bg-green-600 px-2 py-3 text-xs font-semibold tracking-wide text-white shadow-md hover:bg-green-700 dark:border-white/10"
        style={{ writingMode: "vertical-rl" }}
      >
        {open ? "Close ▸" : "◂ Goals"}
      </button>
    </div>
  );
}
