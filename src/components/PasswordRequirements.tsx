"use client";

import { passwordRules } from "@/lib/passwordRules";

// The rules, each ticking off as the password typed so far meets it.
export default function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="space-y-0.5 text-xs">
      {passwordRules(password).map((r) => (
        <li key={r.key} className={r.ok ? "text-green-600 dark:text-green-400" : "text-black/50 dark:text-white/50"}>
          {r.ok ? "✓" : "○"} {r.label}
        </li>
      ))}
    </ul>
  );
}
