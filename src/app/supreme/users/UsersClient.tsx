"use client";

import { useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatDate } from "@/lib/dates";
import { NAV } from "@/lib/navConfig";
import type { Role, Tab } from "@/lib/roles";
import type { RoleRow } from "@/lib/roleAccess";
import type { Broker, Profile } from "@/lib/types";
import {
  createRole,
  deleteRole,
  renameRole,
  setRoleHiddenPages,
  setRoleTabs,
  updateUserBrokerId,
  updateUserRole,
} from "./actions";

// The sections a role can be given, straight from the menu, so this list can
// never drift from what the sidebar actually shows.
const SECTIONS = NAV.filter((c) => c.tab && !c.supremeOnly).map((c) => ({
  tab: c.tab as Tab,
  label: c.label,
  pages: (c.items ?? []).map((i) => ({ href: i.href, label: i.label })),
}));

const selectClass = "w-full max-w-[12rem] rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black disabled:opacity-60";
const smallBtn = "rounded-md border border-black/20 px-2 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

function RoleCard({
  role,
  people,
  onChange,
  onRemoved,
  onError,
}: {
  role: RoleRow;
  people: number;
  onChange: (next: RoleRow) => void;
  onRemoved: () => void;
  onError: (message: string | null) => void;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [openSection, setOpenSection] = useState<Tab | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(role.label);
  const isBroker = role.key === "broker_carrier";

  async function run(previous: RoleRow, next: RoleRow, action: () => Promise<unknown>) {
    onChange(next);
    onError(null);
    try {
      await action();
    } catch (e) {
      onChange(previous);
      onError(e instanceof Error ? e.message : "That didn't save - try again.");
    }
  }

  function toggleTab(tab: Tab) {
    const tabs = role.tabs.includes(tab) ? role.tabs.filter((t) => t !== tab) : [...role.tabs, tab];
    void run(role, { ...role, tabs }, () => setRoleTabs(role.key, tabs));
  }

  function togglePage(href: string) {
    const hidden = role.hidden_pages.includes(href) ? role.hidden_pages.filter((h) => h !== href) : [...role.hidden_pages, href];
    void run(role, { ...role, hidden_pages: hidden }, () => setRoleHiddenPages(role.key, hidden));
  }

  async function saveName() {
    const label = name.trim();
    setRenaming(false);
    if (!label || label === role.label) {
      setName(role.label);
      return;
    }
    await run(role, { ...role, label }, () => renameRole(role.key, label));
  }

  async function handleDelete() {
    if (!(await confirm(`Delete the "${role.label}" role?`))) return;
    onError(null);
    try {
      await deleteRole(role.key);
      onRemoved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't delete that role.");
    }
  }

  const sectionCount = isBroker ? 0 : role.tabs.length;

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <span className="text-xs text-black/40 dark:text-white/40">{open ? "▼" : "▶"}</span>
          {renaming ? (
            <input
              autoFocus
              value={name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveName();
                if (e.key === "Escape") {
                  setName(role.label);
                  setRenaming(false);
                }
              }}
              className="rounded border border-gray-300 bg-white px-2 py-0.5 text-sm font-semibold text-black"
            />
          ) : (
            <span className="font-semibold">{role.label}</span>
          )}
          <span className="text-xs text-black/50 dark:text-white/50">
            {people} {people === 1 ? "person" : "people"}
            {isBroker ? " · one page only" : ` · ${sectionCount} section${sectionCount === 1 ? "" : "s"}`}
          </span>
        </button>
        {open && !renaming && (
          <div className="flex gap-2">
            <button className={smallBtn} onClick={() => setRenaming(true)}>
              Rename
            </button>
            {!role.is_builtin && (
              <button className={`${smallBtn} text-red-600`} onClick={handleDelete}>
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-black/10 px-3 py-3 dark:border-white/10">
          {isBroker ? (
            <p className="text-sm text-black/60 dark:text-white/60">
              Broker/Carrier logins only ever see the Broker Rate Entry page - nothing else, not even Home.
            </p>
          ) : (
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <p className="text-xs text-black/50 dark:text-white/50 sm:col-span-2">
                Tick what this role can open. Click a section&apos;s name to hide individual pages inside it.
                Changes save as you click.
              </p>
              {SECTIONS.map((s) => {
                const on = role.tabs.includes(s.tab);
                const expanded = openSection === s.tab;
                const hiddenCount = s.pages.filter((p) => role.hidden_pages.includes(p.href)).length;
                return (
                  <div key={s.tab} className="py-0.5">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={on} onChange={() => toggleTab(s.tab)} className="h-4 w-4" />
                      <button
                        onClick={() => setOpenSection(expanded ? null : s.tab)}
                        disabled={s.pages.length === 0}
                        className={`text-sm ${on ? "font-medium" : "text-black/50 dark:text-white/50"} ${s.pages.length > 0 ? "hover:underline" : "cursor-default"}`}
                      >
                        {s.label}
                      </button>
                      {on && hiddenCount > 0 && (
                        <span className="text-xs text-amber-600">{hiddenCount} page{hiddenCount === 1 ? "" : "s"} hidden</span>
                      )}
                    </div>
                    {expanded && (
                      <div className="ml-6 mt-1 space-y-0.5 border-l border-black/10 pl-3 dark:border-white/10">
                        {s.pages.map((p) => (
                          <label key={p.href} className={`flex items-center gap-2 text-xs ${on ? "" : "opacity-40"}`}>
                            <input
                              type="checkbox"
                              disabled={!on}
                              checked={!role.hidden_pages.includes(p.href)}
                              onChange={() => togglePage(p.href)}
                              className="h-3.5 w-3.5"
                            />
                            {p.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-black/40 dark:text-white/40 sm:col-span-2">
                Home is open to everyone. Some original roles also keep built-in extras (Sales, Buyer/Sales and
                Executive see the Logistics summary pages; Warehouse/QC only sees Mexico Arrivals and Orders; Admin and
                Executive get the CRM manager tools).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewRole({ roles, onCreated, onError }: { roles: RoleRow[]; onCreated: (r: RoleRow) => void; onError: (m: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    onError(null);
    try {
      const role = await createRole(name, copyFrom || null);
      onCreated(role as RoleRow);
      setName("");
      setCopyFrom("");
      setOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't create that role.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
      >
        + New role
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-green-600/40 p-3">
      <label className="text-xs">
        Role name
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && !busy && void create()}
          placeholder="e.g. Dispatcher"
          className="mt-0.5 block w-48 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black"
        />
      </label>
      <label className="text-xs">
        Start with the same access as
        <select
          value={copyFrom}
          onChange={(e) => setCopyFrom(e.target.value)}
          className="mt-0.5 block w-48 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black"
        >
          <option value="">Nothing - I&apos;ll tick sections</option>
          {roles
            .filter((r) => r.key !== "broker_carrier")
            .map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
        </select>
      </label>
      <button
        onClick={create}
        disabled={busy || !name.trim()}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy ? "Creating..." : "Create"}
      </button>
      <button onClick={() => setOpen(false)} className={smallBtn}>
        Cancel
      </button>
    </div>
  );
}

export default function UsersClient({
  initialRoles,
  initialProfiles,
  brokers,
  currentUserId,
}: {
  initialRoles: RoleRow[];
  initialProfiles: Profile[];
  brokers: Broker[];
  currentUserId: string | null;
}) {
  const [roles, setRoles] = useState(initialRoles);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const peopleByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of profiles) m.set(p.role, (m.get(p.role) ?? 0) + 1);
    return m;
  }, [profiles]);

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

  async function handleBrokerChange(id: string, brokerId: string) {
    const value = brokerId || null;
    const previous = profiles;
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, broker_id: value } : p)));
    setSavingId(id);
    setError(null);
    try {
      await updateUserBrokerId(id, value);
    } catch (e) {
      setProfiles(previous);
      setError(e instanceof Error ? e.message : "Failed to update broker.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">User Roles</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Pick a role for each person, and decide what each role can see. Changes apply right away. New sign-ups
          start as Sales until changed here.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

      <section className="space-y-2">
        <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">People</h2>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Broker/Carrier Company</th>
                <th className="px-3 py-2">Added</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => {
                const isSelf = profile.id === currentUserId;
                const isBrokerCarrier = profile.role === "broker_carrier";
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
                        onChange={(e) => handleRoleChange(profile.id, e.target.value)}
                        className={selectClass}
                      >
                        {roles.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                        {!roles.some((r) => r.key === profile.role) && <option value={profile.role}>{profile.role}</option>}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      {isBrokerCarrier ? (
                        <select
                          value={profile.broker_id ?? ""}
                          disabled={savingId === profile.id}
                          onChange={(e) => handleBrokerChange(profile.id, e.target.value)}
                          className={selectClass}
                        >
                          <option value="">-- select --</option>
                          {brokers.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-black/30 dark:text-white/30">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-black/60 dark:text-white/60">
                      {formatDate(profile.created_at.slice(0, 10))}
                    </td>
                  </tr>
                );
              })}
              {profiles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-green-600 pb-1">
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Roles</h2>
        </div>
        <div className="space-y-2">
          {roles.map((role) => (
            <RoleCard
              key={role.key}
              role={role}
              people={peopleByRole.get(role.key) ?? 0}
              onChange={(next) => setRoles((prev) => prev.map((r) => (r.key === next.key ? next : r)))}
              onRemoved={() => setRoles((prev) => prev.filter((r) => r.key !== role.key))}
              onError={setError}
            />
          ))}
        </div>
        <NewRole roles={roles} onCreated={(r) => setRoles((prev) => [...prev, r])} onError={setError} />
      </section>
    </div>
  );
}
