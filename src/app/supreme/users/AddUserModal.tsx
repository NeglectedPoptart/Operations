"use client";

import { useState } from "react";
import PasswordRequirements from "@/components/PasswordRequirements";
import { generatePassword, passwordProblem } from "@/lib/passwordRules";
import type { RoleRow } from "@/lib/roleAccess";
import type { Broker, Profile } from "@/lib/types";
import { createUserAccount } from "./actions";

const input = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";

// Add a login directly: email, a role and a password you choose (or generate).
// Nothing is emailed to them - pass the login on yourself.
export default function AddUserModal({
  roles,
  brokers,
  defaultRole,
  onClose,
  onCreated,
}: {
  roles: RoleRow[];
  brokers: Broker[];
  defaultRole: string;
  onClose: () => void;
  onCreated: (profile: Profile) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(defaultRole);
  const [brokerId, setBrokerId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await createUserAccount({ email, password, role, brokerId: role === "broker_carrier" ? brokerId || null : null });
      if ("error" in result) setError(result.error);
      else {
        onCreated(result.profile as unknown as Profile);
        setCreated({ email: email.trim().toLowerCase(), password });
      }
    } catch {
      setError("Couldn't add the user - try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked - the login is still on screen
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 text-black shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Add user</h2>
          <button onClick={onClose} aria-label="Close" className="text-black/50 hover:text-black">
            ✕
          </button>
        </div>

        {created ? (
          <div className="space-y-3">
            <p className="text-sm text-green-700">
              Login created. Nothing was emailed to them - give them this now; the password won&apos;t be shown again after you close this.
            </p>
            <div className="space-y-1 rounded-md bg-black/5 p-3 font-mono text-sm">
              <p>Email: {created.email}</p>
              <p>Password: {created.password}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={copy} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                {copied ? "Copied!" : "Copy login"}
              </button>
              <button onClick={onClose} className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium hover:bg-black/5">
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="block text-sm">
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@harvestbestinc.com"
                autoComplete="off"
                className={`${input} mt-1`}
              />
            </label>
            <label className="block text-sm">
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)} className={`${input} mt-1`}>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            {role === "broker_carrier" && (
              <label className="block text-sm">
                Carrier / broker company
                <select value={brokerId} onChange={(e) => setBrokerId(e.target.value)} className={`${input} mt-1`}>
                  <option value="">- choose -</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="space-y-1">
              <span className="text-sm">Password</span>
              <div className="flex gap-2">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="off"
                  className={`${input} font-mono`}
                />
                <button
                  onClick={() => setPassword(generatePassword())}
                  className="shrink-0 rounded-md border border-black/20 px-2.5 py-1.5 text-sm font-medium hover:bg-black/5"
                >
                  Generate
                </button>
              </div>
            </div>
            <PasswordRequirements password={password} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/5">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy || !email.trim() || passwordProblem(password) !== null}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {busy ? "Adding..." : "Add user"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
