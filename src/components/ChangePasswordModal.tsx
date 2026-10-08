"use client";

import { useState } from "react";
import { changeOwnPassword } from "@/app/passwordActions";
import PasswordRequirements from "@/components/PasswordRequirements";
import { passwordProblem } from "@/lib/passwordRules";

const field = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm !== "" && confirm !== next;
  const ready = current !== "" && passwordProblem(next) === null && next === confirm && !busy;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await changeOwnPassword(current, next);
      if ("error" in result) setError(result.error);
      else setDone(true);
    } catch {
      setError("Couldn't change the password - try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm space-y-3 rounded-lg bg-white p-5 text-black shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Change password</h2>
          <button onClick={onClose} aria-label="Close" className="text-black/50 hover:text-black">
            ✕
          </button>
        </div>

        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-green-700">Your password was changed.</p>
            <button onClick={onClose} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
              Done
            </button>
          </div>
        ) : (
          <>
            <label className="block text-sm">
              Current password
              <input type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={`${field} mt-1`} />
            </label>
            <label className="block text-sm">
              New password
              <input type={show ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className={`${field} mt-1`} />
            </label>
            <PasswordRequirements password={next} />
            <label className="block text-sm">
              Confirm new password
              <input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={`${field} mt-1`} />
            </label>
            {mismatch && <p className="text-xs text-red-600">The two new passwords don&apos;t match.</p>}
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
              Show passwords
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!ready}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {busy ? "Saving..." : "Change password"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
