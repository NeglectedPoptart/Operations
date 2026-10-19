"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { noteLabel, sortNotes, type UserNote } from "@/lib/notes";
import { createNote, deleteNote, listNotes, updateNote } from "./actions";

const SAVE_DELAY_MS = 800;

const smallBtn = "rounded border border-black/20 px-2 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10";
const field = "rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black placeholder:text-black/40";

// Your personal notes: pick one, type, and it saves itself. Used three ways -
// the pad that floats on every page, the Dashboard widget (compact), and the
// pop-out Notes window - all reading the same notes.
export default function NotesPad({ compact = false }: { compact?: boolean }) {
  const confirm = useConfirm();
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const pending = useRef(new Map<string, { title?: string; body?: string }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const result = await listNotes();
    if ("error" in result) {
      setError(result.error);
    } else {
      setError(null);
      setNotes(result.notes);
    }
    setLoaded(true);
  }, []);

  // Write any typing that hasn't been saved yet.
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const entries = [...pending.current.entries()];
    if (entries.length === 0) return;
    pending.current.clear();
    setStatus("saving");
    for (const [id, patch] of entries) {
      const result = await updateNote(id, patch);
      if ("error" in result) {
        setError(result.error);
        setStatus("idle");
        return;
      }
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, updated_at: result.updated_at } : n)));
    }
    setError(null);
    setStatus("saved");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Save on the way out, and pick up changes made in another Notes window when you come back.
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const back = () => {
      if (pending.current.size === 0 && !timer.current) void load();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", back);
      void flush();
    };
  }, [flush, load]);

  const sorted = sortNotes(notes);
  const current = notes.find((n) => n.id === selectedId) ?? sorted[0] ?? null;
  const term = search.trim().toLowerCase();
  const visible = term ? sorted.filter((n) => `${n.title}\n${n.body}`.toLowerCase().includes(term)) : sorted;

  function edit(id: string, patch: { title?: string; body?: string }) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    pending.current.set(id, { ...pending.current.get(id), ...patch });
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  async function add() {
    await flush();
    const result = await createNote();
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setNotes((prev) => [result.note, ...prev]);
    setSelectedId(result.note.id);
    setSearch("");
  }

  async function togglePin(n: UserNote) {
    await flush();
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, pinned: !n.pinned } : x)));
    const result = await updateNote(n.id, { pinned: !n.pinned });
    if ("error" in result) setError(result.error);
  }

  async function remove(n: UserNote) {
    if (!(await confirm(`Delete the note "${noteLabel(n)}"?`))) return;
    pending.current.delete(n.id);
    const result = await deleteNote(n.id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setNotes((prev) => prev.filter((x) => x.id !== n.id));
    setSelectedId(null);
  }

  if (error && notes.length === 0) {
    return <p className="p-2 text-xs text-amber-600">{error}</p>;
  }
  if (!loaded) return <p className="p-2 text-xs text-black/40 dark:text-white/40">Loading...</p>;

  const editor = current ? (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          value={current.title}
          onChange={(e) => edit(current.id, { title: e.target.value })}
          onBlur={() => void flush()}
          placeholder="Title"
          className={`${field} min-w-0 flex-1 font-semibold`}
        />
        <button className={smallBtn} onClick={() => void togglePin(current)} title={current.pinned ? "Unpin" : "Pin to the top"}>
          {current.pinned ? "Unpin" : "Pin"}
        </button>
        <button className={`${smallBtn} text-red-600`} onClick={() => void remove(current)} title="Delete this note">
          Delete
        </button>
      </div>
      <textarea
        value={current.body}
        onChange={(e) => edit(current.id, { body: e.target.value })}
        onBlur={() => void flush()}
        placeholder="Type here - it saves itself."
        className={`${field} min-h-[5rem] flex-1 resize-none`}
      />
      <p className="text-[11px] text-black/50 dark:text-white/50">
        {error ? <span className="text-amber-600">{error}</span> : status === "saving" ? "Saving..." : status === "saved" ? "Saved" : " "}
      </p>
    </div>
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-black/50 dark:text-white/50">
      <p>No notes yet.</p>
      <button className={smallBtn} onClick={() => void add()}>
        + New note
      </button>
    </div>
  );

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-1.5">
        <div className="flex gap-1.5">
          <select value={current?.id ?? ""} onChange={(e) => setSelectedId(e.target.value)} className={`${field} min-w-0 flex-1 py-0.5 text-xs`} disabled={sorted.length === 0}>
            {sorted.length === 0 && <option value="">No notes</option>}
            {sorted.map((n) => (
              <option key={n.id} value={n.id}>
                {n.pinned ? "★ " : ""}
                {noteLabel(n)}
              </option>
            ))}
          </select>
          <button className={smallBtn} onClick={() => void add()} title="New note">
            +
          </button>
        </div>
        {current ? (
          <>
            <textarea
              value={current.body}
              onChange={(e) => edit(current.id, { body: e.target.value })}
              onBlur={() => void flush()}
              placeholder="Type here - it saves itself."
              className={`${field} min-h-0 flex-1 resize-none text-xs`}
            />
            {error && <p className="text-[11px] text-amber-600">{error}</p>}
          </>
        ) : (
          <p className="text-xs text-black/50 dark:text-white/50">No notes yet - press + to start one.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="flex w-40 shrink-0 flex-col gap-1.5 sm:w-52">
        <div className="flex gap-1.5">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className={`${field} min-w-0 flex-1 py-0.5 text-xs`} />
          <button className={smallBtn} onClick={() => void add()} title="New note">
            +
          </button>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {visible.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => {
                  void flush();
                  setSelectedId(n.id);
                }}
                className={`block w-full rounded px-2 py-1 text-left text-xs ${current?.id === n.id ? "bg-green-100 font-semibold text-black dark:bg-green-900/40 dark:text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
              >
                <span className="block truncate">
                  {n.pinned ? "★ " : ""}
                  {noteLabel(n)}
                </span>
                <span className="block truncate text-[10px] font-normal text-black/50 dark:text-white/50">{n.body.trim().split("\n")[n.title.trim() ? 0 : 1]?.slice(0, 40) ?? ""}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 && term && <li className="px-2 py-1 text-xs text-black/50 dark:text-white/50">No matches.</li>}
        </ul>
      </div>
      {editor}
    </div>
  );
}
