"use client";

import { useState } from "react";
import { formatDate } from "@/lib/dates";
import type { CrmDailyGoal } from "@/lib/types";
import { adjustDailyGoalProgress, deleteDailyGoal, setDailyGoal } from "./goalsActions";

export interface GoalUser {
  id: string;
  email: string | null;
}

const SLOTS = [1, 2, 3] as const;

function displayNameForEmail(email: string | null): string {
  if (!email) return "Unknown";
  const local = email.split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function editKey(userId: string, slot: number): string {
  return `${userId}:${slot}`;
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
  const [goals, setGoals] = useState(initialGoals);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftTarget, setDraftTarget] = useState("");
  const [saving, setSaving] = useState(false);

  const goalByUserSlot = new Map(goals.map((g) => [editKey(g.user_id, g.slot), g]));
  const orderedUsers = [...users].sort((a, b) => displayNameForEmail(a.email).localeCompare(displayNameForEmail(b.email)));

  function startEdit(userId: string, slot: number) {
    const existing = goalByUserSlot.get(editKey(userId, slot));
    setEditingKey(editKey(userId, slot));
    setDraftText(existing?.goal_text ?? "");
    setDraftTarget(existing ? String(existing.target_count) : "");
  }

  function cancelEdit() {
    setEditingKey(null);
  }

  async function saveEdit(userId: string, slot: number) {
    const text = draftText.trim();
    if (!text) return;
    const target = Math.max(0, parseInt(draftTarget, 10) || 0);
    setSaving(true);
    try {
      const saved = (await setDailyGoal(userId, todayIso, slot, text, target)) as CrmDailyGoal;
      const existing = goalByUserSlot.get(editKey(userId, slot));
      if (existing) {
        setGoals((prev) => prev.map((g) => (g.id === existing.id ? saved : g)));
      } else {
        setGoals((prev) => [...prev, saved]);
      }
      setEditingKey(null);
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

  async function handleClear(goal: CrmDailyGoal) {
    setGoals((prev) => prev.filter((g) => g.id !== goal.id));
    await deleteDailyGoal(goal.id, goal.user_id).catch(() => {});
  }

  return (
    <div className="mb-4 rounded-lg border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-green-700 dark:text-green-400">Today&apos;s Goals</h3>
        <p className="text-xs text-black/40 dark:text-white/40">{formatDate(todayIso)}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {orderedUsers.map((u) => {
          const canEdit = isAdminOrExec || u.id === currentUserId;

          return (
            <div
              key={u.id}
              className="min-w-[240px] flex-1 rounded-md border border-black/10 p-2.5 text-sm dark:border-white/10"
            >
              <span className="font-medium">{displayNameForEmail(u.email)}</span>

              <div className="mt-1.5 space-y-1.5">
                {SLOTS.map((slot) => {
                  const goal = goalByUserSlot.get(editKey(u.id, slot));
                  const editing = editingKey === editKey(u.id, slot);
                  const pct = goal && goal.target_count > 0 ? Math.min(100, Math.round((goal.current_count / goal.target_count) * 100)) : 0;
                  const met = goal ? goal.target_count > 0 && goal.current_count >= goal.target_count : false;

                  return (
                    <div key={slot} className="border-t border-black/5 pt-1.5 first:border-t-0 first:pt-0 dark:border-white/5">
                      {editing ? (
                        <div className="space-y-1.5">
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
                              onClick={() => saveEdit(u.id, slot)}
                              disabled={saving || draftText.trim() === ""}
                              className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button onClick={cancelEdit} className="rounded-md px-2 py-1 text-xs font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10">
                              Cancel
                            </button>
                            {goal && (
                              <button onClick={() => handleClear(goal)} className="ml-auto text-xs font-medium text-red-600 hover:underline">
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      ) : goal ? (
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-black/70 dark:text-white/70">{goal.goal_text}</p>
                            {canEdit && (
                              <button onClick={() => startEdit(u.id, slot)} className="shrink-0 text-xs font-medium text-green-700 hover:underline dark:text-green-400">
                                Edit
                              </button>
                            )}
                          </div>
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
                      ) : canEdit ? (
                        <button onClick={() => startEdit(u.id, slot)} className="text-xs font-medium text-green-700 hover:underline dark:text-green-400">
                          + Add goal
                        </button>
                      ) : (
                        <p className="text-xs text-black/30 dark:text-white/30">—</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
