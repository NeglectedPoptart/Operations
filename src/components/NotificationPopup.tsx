"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeNotification, getPendingNotifications, type PendingNotification } from "@/app/actions";
import { formatTimestamp } from "@/lib/dates";

const POLL_MS = 20000;

export default function NotificationPopup() {
  const [queue, setQueue] = useState<PendingNotification[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const knownIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const pending = await getPendingNotifications().catch(() => []);
      if (cancelled) return;
      const fresh = pending.filter((p) => !knownIds.current.has(p.recipientId));
      if (fresh.length === 0) return;
      fresh.forEach((p) => knownIds.current.add(p.recipientId));
      setQueue((prev) => [...prev, ...fresh]);
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (queue.length === 0) return null;
  const current = queue[0];

  async function respond(navigateTo?: string) {
    setBusy(true);
    setQueue((prev) => prev.slice(1));
    await acknowledgeNotification(current.recipientId).catch(() => {});
    setBusy(false);
    if (navigateTo) router.push(navigateTo);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-3 rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-900">
        <div>
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Attention {current.tabLabel}</h2>
          <p className="text-sm font-medium">{current.subtabLabel} sheet has been Updated</p>
        </div>
        <div className="space-y-1 text-sm text-black/70 dark:text-white/70">
          {current.lastEditedAt && <p>Updated: {formatTimestamp(current.lastEditedAt)}</p>}
          {current.updatedBy && <p>Updated by: {current.updatedBy}</p>}
          <p>Notified by: {current.senderEmail ?? "Admin"}</p>
        </div>
        {current.message && (
          <p className="rounded-md bg-black/5 p-2 text-sm dark:bg-white/10">{current.message}</p>
        )}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => respond()}
            disabled={busy}
            className="flex-1 rounded-md border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
          >
            Dismiss
          </button>
          <button
            onClick={() => respond(current.pagePath)}
            disabled={busy}
            className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Go to {current.subtabLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
