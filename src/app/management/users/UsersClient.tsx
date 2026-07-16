"use client";

import { useState } from "react";
import { formatDate } from "@/lib/dates";
import { ROLES, type Role } from "@/lib/roles";
import type { Profile } from "@/lib/types";
import { updateUserRole } from "./actions";

export default function UsersClient({
  initialProfiles,
  currentUserId,
}: {
  initialProfiles: Profile[];
  currentUserId: string | null;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRoleChange(id: string, role: Role) {
    const previous = profiles;
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)));
    setSavingId(id);
    setError(null);
    try {
      await updateUserRole(id, role);
    } catch (e) {
      setProfiles(previous);
      setError(e instanceof Error ? e.message : "Failed to update role.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">User Roles</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Controls what each signed-in user can see - see the role table on the Management tab for what each
          level opens. New sign-ups start as Sales until changed here.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Added</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const isSelf = profile.id === currentUserId;
              return (
                <tr key={profile.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    {profile.email || "(no email)"}
                    {isSelf && <span className="ml-1 text-xs text-black/40 dark:text-white/40">(you)</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={profile.role}
                      disabled={isSelf || savingId === profile.id}
                      title={isSelf ? "You can't change your own role - ask another admin." : undefined}
                      onChange={(e) => handleRoleChange(profile.id, e.target.value as Role)}
                      className="w-full max-w-[10rem] rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black disabled:opacity-60"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-black/60 dark:text-white/60">
                    {formatDate(profile.created_at.slice(0, 10))}
                  </td>
                </tr>
              );
            })}
            {profiles.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
