"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(signIn, null);

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 p-6 shadow-sm dark:border-white/10"
      >
        <h1 className="text-xl font-semibold">Sign in</h1>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black/20"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-black/20"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-60"
        >
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
