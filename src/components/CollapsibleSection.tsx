"use client";

import { useEffect, useState, type ReactNode } from "react";

// A section whose header can be clicked to fold it away. Open/closed is
// remembered per browser (per `id`), as a convenience only - it never needs
// to work for the page to render.
export default function CollapsibleSection({
  id,
  title,
  note,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  // Small text beside the title, shown whether open or closed (e.g. a count).
  note?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const storageKey = `collapsible:${id}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      // Restoring a saved choice after mount (the server render can't know it).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "open" || saved === "closed") setOpen(saved === "open");
    } catch {
      // storage blocked - keep the default
    }
  }, [storageKey]);

  function toggle() {
    setOpen((o) => {
      try {
        window.localStorage.setItem(storageKey, o ? "closed" : "open");
      } catch {
        // storage blocked
      }
      return !o;
    });
  }

  return (
    <section className="space-y-3">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-b-2 border-green-600 pb-1 text-left"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`h-4 w-4 shrink-0 text-green-700 transition-transform dark:text-green-400 ${open ? "rotate-90" : ""}`}
        >
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-lg font-bold text-green-700 dark:text-green-400">{title}</span>
        {note && <span className="text-xs font-normal text-black/50 dark:text-white/50">{note}</span>}
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </section>
  );
}
