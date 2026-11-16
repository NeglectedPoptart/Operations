"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendScare } from "@/app/scare/actions";
import { formatTimestamp } from "@/lib/dates";

export interface ScarePerson {
  id: string;
  label: string;
}
export interface ScareRow {
  id: string;
  who: string;
  createdAt: string;
  shownAt: string | null;
}

export default function ScareClient({ people, recent, notSetUp }: { people: ScarePerson[]; recent: ScareRow[]; notSetUp: boolean }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function scare() {
    const who = people.find((p) => p.id === userId)?.label ?? "them";
    startTransition(async () => {
      const res = await sendScare(userId);
      if ("error" in res) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setMsg({ ok: true, text: `Sent. ${who} gets it within a few seconds if they have HOPS open.` });
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Scare</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Pick someone and a huge jump scare (with a screech) lands on their screen while they&apos;re using HOPS. It shows once, goes away by itself after a few
          seconds, and they can tap it or press Esc to close it. If they don&apos;t have HOPS open it is dropped after 15 minutes.
        </p>
      </div>

      {notSetUp && <p className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">Scare isn&apos;t set up yet - run migration 170 in the Supabase SQL Editor.</p>}

      <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <label className="block text-sm font-medium">
          Who gets scared?
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setMsg(null);
            }}
            className="mt-1 block w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-neutral-900"
          >
            <option value="">Select a person…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={scare}
          disabled={!userId || pending || notSetUp}
          className="w-full rounded-lg bg-red-600 px-4 py-4 text-xl font-black tracking-wide text-white shadow hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Sending…" : "😱 SCARE THEM"}
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{msg.text}</p>}
      </div>

      {recent.length > 0 && (
        <div>
          <h2 className="mb-1 text-sm font-semibold">Recent scares</h2>
          <ul className="divide-y divide-black/10 rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/10">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{r.who}</span>
                <span className="shrink-0 text-xs text-black/60 dark:text-white/60">
                  {formatTimestamp(r.createdAt)} · {r.shownAt ? "✅ seen" : "⏳ not seen yet"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
