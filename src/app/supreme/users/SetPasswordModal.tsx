"use client";

import { useState } from "react";
import PasswordRequirements from "@/components/PasswordRequirements";
import { generatePassword, passwordProblem } from "@/lib/passwordRules";
import { setUserPassword } from "./actions";

const field = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 font-mono text-sm text-black";

// Set a new password for someone. Their current one can't be shown (it is
// stored as a one-way hash), so this sets a new one - typed or generated - and
// keeps it on screen after saving so it can be passed on to them.
export default function SetPasswordModal({
  email,
  userId,
  onClose,
  onSaved,
}: {
  email: string;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await setUserPassword(userId, password);
      if ("error" in result) setError(result.error);
      else {
        setSaved(true);
        onSaved();
      }
    } catch {
      setError("Couldn't set the password - try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked - the password is still on screen
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm space-y-3 rounded-lg bg-white p-5 text-black shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Set password</h2>
          <button onClick={onClose} aria-label="Close" className="text-black/50 hover:text-black">
            ✕
          </button>
        </div>
        <p className="text-sm text-black/60">
          For <span className="font-medium text-black">{email}</span>. Their current password can&apos;t be shown - it&apos;s
          stored scrambled - so this sets a new one for you to pass on.
        </p>

        {saved ? (
          <div className="space-y-3">
            <p className="text-sm text-green-700">Password set. Give it to them now - it won&apos;t be shown again after you close this.</p>
            <input readOnly value={password} className={field} onFocus={(e) => e.target.select()} />
            <div className="flex gap-2">
              <button onClick={copy} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                {copied ? "Copied!" : "Copy"}
              </button>
              <button onClick={onClose} className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5">
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                autoComplete="off"
                className={field}
              />
              <button
                onClick={() => setPassword(generatePassword())}
                className="shrink-0 rounded-md border border-black/20 px-2.5 py-1.5 text-sm font-medium hover:bg-black/5"
              >
                Generate
              </button>
            </div>
            <PasswordRequirements password={password} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy || passwordProblem(password) !== null}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {busy ? "Saving..." : "Set password"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
