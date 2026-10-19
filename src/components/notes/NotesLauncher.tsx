"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import NotesPad from "./NotesPad";

const STORAGE_KEY = "hops-notes-pad";
const DEFAULT_SIZE = { w: 380, h: 440 };
const MIN = { w: 280, h: 240 };

type Stored = { open: boolean; x: number | null; y: number | null; w: number; h: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// The Notes button that sits in the corner of every page. It opens your notes in
// a small window you can drag around and resize - and pop out into a real
// browser window of its own.
export default function NotesLauncher() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Stored;
      /* eslint-disable react-hooks/set-state-in-effect */
      setOpen(!!s.open);
      if (typeof s.x === "number" && typeof s.y === "number") setPos({ x: s.x, y: s.y });
      if (s.w >= MIN.w && s.h >= MIN.h) setSize({ w: s.w, h: s.h });
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // nothing stored or storage blocked
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ open, x: pos?.x ?? null, y: pos?.y ?? null, w: size.w, h: size.h } satisfies Stored));
    } catch {
      // storage blocked
    }
  }, [open, pos, size]);

  // Follow the window's own resize handle (bottom-right corner).
  useEffect(() => {
    const el = panelRef.current;
    if (!open || !el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Where the panel sits: where it was left, kept on screen, else the bottom-right corner.
  const width = Math.min(size.w, typeof window === "undefined" ? size.w : window.innerWidth - 16);
  const height = Math.min(size.h, typeof window === "undefined" ? size.h : window.innerHeight - 16);
  const place = pos
    ? { x: clamp(pos.x, 0, Math.max(0, (typeof window === "undefined" ? 4000 : window.innerWidth) - width)), y: clamp(pos.y, 0, Math.max(0, (typeof window === "undefined" ? 4000 : window.innerHeight) - 40)) }
    : null;

  function openPad() {
    if (!pos) setPos({ x: Math.max(8, window.innerWidth - size.w - 16), y: Math.max(8, window.innerHeight - size.h - 64) });
    setOpen(true);
  }

  function startMove(e: ReactPointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const move = (ev: PointerEvent) =>
      setPos({ x: clamp(ev.clientX - dx, 0, window.innerWidth - rect.width), y: clamp(ev.clientY - dy, 0, window.innerHeight - 40) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function popOut() {
    const w = 460;
    const h = 560;
    const win = window.open("/notes", "hops-popout:notes", `popup=yes,width=${w},height=${h},left=${window.screenX + 80},top=${window.screenY + 80}`);
    if (!win) {
      alert("Your browser blocked the new window - allow pop-ups for this site and try again.");
      return;
    }
    setOpen(false);
  }

  return (
    <>
      {!open && (
        <button
          onClick={openPad}
          title="Open your notes"
          className="fixed bottom-4 right-4 z-40 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-green-700 print:hidden"
        >
          Notes
        </button>
      )}
      {open && (
        <div
          ref={panelRef}
          style={{ left: place?.x ?? 8, top: place?.y ?? 8, width, height, resize: "both", minWidth: MIN.w, minHeight: MIN.h, maxWidth: "calc(100vw - 8px)", maxHeight: "calc(100vh - 8px)" }}
          className="fixed z-40 flex flex-col overflow-hidden rounded-lg border border-green-600 bg-white text-black shadow-xl print:hidden dark:bg-neutral-900 dark:text-white"
        >
          <div onPointerDown={startMove} className="flex shrink-0 cursor-move select-none items-center gap-2 bg-green-600 px-3 py-1.5 text-white">
            <span className="flex-1 text-sm font-semibold">Notes</span>
            <button onClick={popOut} title="Open in its own browser window" className="rounded px-1.5 py-0.5 text-xs hover:bg-white/20">
              Pop out
            </button>
            <button onClick={() => setOpen(false)} title="Close" className="rounded px-1.5 py-0.5 text-sm leading-none hover:bg-white/20">
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 p-2.5">
            <NotesPad />
          </div>
        </div>
      )}
    </>
  );
}
