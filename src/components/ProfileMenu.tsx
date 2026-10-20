"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveMyName } from "@/app/profileActions";
import { NFL_CHANGE_EVENT } from "./NflTeamPrompt";

const item = "block w-full rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-sidebar-text hover:bg-sidebar-hover hover:text-white";

// The bottom of the menu: your name. Click it for your profile - change your
// name or password, pick your NFL team, sign out.
export default function ProfileMenu({
  name,
  email,
  roleLabel,
  onChangePassword,
  onSignOut,
}: {
  name: string | null;
  email: string | null;
  roleLabel: string | null;
  onChangePassword: () => void;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = name?.trim() || email || "Signed in";
  const initial = shown.slice(0, 1).toUpperCase();

  // Click anywhere else to close.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(null);
      }
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  async function saveName() {
    if (editing === null) return;
    setSaving(true);
    setError(null);
    const result = await saveMyName(editing);
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  return (
    <div ref={box} className="relative border-t border-sidebar-border p-3">
      {open && (
        <div className="absolute inset-x-3 bottom-full z-30 mb-1 rounded-lg border border-sidebar-border bg-sidebar p-2 shadow-xl">
          <div className="px-2.5 pb-2 pt-1">
            <p className="truncate text-sm font-semibold text-white">{shown}</p>
            {email && <p className="truncate text-[11px] text-sidebar-text-muted">{email}</p>}
            {roleLabel && <p className="text-[11px] text-sidebar-text-muted">{roleLabel}</p>}
          </div>

          {editing === null ? (
            <button
              onClick={() => {
                setEditing(name?.trim() ?? "");
                setError(null);
              }}
              className={item}
            >
              Change my name
            </button>
          ) : (
            <div className="px-1 pb-1">
              <input
                autoFocus
                value={editing}
                onChange={(e) => setEditing(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveName();
                  if (e.key === "Escape") setEditing(null);
                }}
                maxLength={60}
                placeholder="Your name"
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black"
              />
              <p className="mt-0.5 text-[10px] text-sidebar-text-muted">This is how HOPS shows you (e.g. &quot;sent by&quot;). Leave empty to go back to the default.</p>
              {error && <p className="mt-0.5 text-[11px] text-red-300">{error}</p>}
              <div className="mt-1 flex gap-1.5">
                <button onClick={() => void saveName()} disabled={saving} className="rounded bg-brand px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={() => setEditing(null)} className="rounded px-2.5 py-1 text-xs text-sidebar-text hover:bg-sidebar-hover">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => {
              setOpen(false);
              onChangePassword();
            }}
            className={item}
          >
            Change password
          </button>
          <button
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event(NFL_CHANGE_EVENT));
            }}
            className={item}
          >
            🏈 My NFL team
          </button>
          <button onClick={onSignOut} className={`${item} mt-1 border-t border-sidebar-border pt-2`}>
            Sign out
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Your profile"
        className="flex w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left hover:bg-sidebar-hover"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{initial}</div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-white">{shown}</p>
          {roleLabel && <p className="truncate text-[11px] text-sidebar-text-muted">{roleLabel}</p>}
        </div>
        <span className="text-xs text-sidebar-text-muted">{open ? "▾" : "▴"}</span>
      </button>
    </div>
  );
}
