"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ConfirmFn = (message: string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Drop-in async replacement for window.confirm() - native confirm() blocks
// the main thread while open, which shows up as a long "blocked UI" event
// handler in performance profiling (INP) even though nothing is actually
// slow. This renders a normal React modal instead, so callers just need
// `if (!(await confirm("..."))) return;` in an async handler.
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((msg) => {
    setMessage(msg);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setMessage(null);
  }, []);

  useEffect(() => {
    if (message === null) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") settle(false);
      if (e.key === "Enter") settle(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [message, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {message !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => settle(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-5 shadow-lg dark:border-white/10 dark:bg-neutral-900"
          >
            <p className="text-sm text-black dark:text-white">{message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => settle(false)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => settle(true)}
                autoFocus
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
