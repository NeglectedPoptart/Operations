"use client";

import { useMemo, useState } from "react";
import { formatTimestamp } from "@/lib/dates";
import { NOTIFY_BREAKDOWN } from "@/lib/notificationBreakdown";
import { ROLES, type Role } from "@/lib/roles";
import type { NotificationTargetType, Profile, SentNotification } from "@/lib/types";
import { sendNotification } from "./actions";

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

interface Composing {
  tabLabel: string;
  subtabLabel: string;
  pagePath: string;
  lastEditedAt: string | null;
}

export default function NotificationsClient({
  profiles,
  lastEditedMap,
  sent,
  currentUserEmail,
}: {
  profiles: Profile[];
  lastEditedMap: Record<string, string | null>;
  sent: SentNotification[];
  currentUserEmail: string | null;
}) {
  const [composing, setComposing] = useState<Composing | null>(null);
  const [targetType, setTargetType] = useState<NotificationTargetType>("user");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetRole, setTargetRole] = useState<Role>("admin");
  const [updatedBy, setUpdatedBy] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSentPath, setJustSentPath] = useState<string | null>(null);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  function openNotify(c: Composing) {
    setComposing(c);
    setTargetType("user");
    setTargetUserId(profiles[0]?.id ?? "");
    setTargetRole("admin");
    setUpdatedBy("");
    setNote("");
    setError(null);
  }

  async function handleSend() {
    if (!composing) return;
    setSending(true);
    setError(null);
    try {
      await sendNotification({
        tabLabel: composing.tabLabel,
        subtabLabel: composing.subtabLabel,
        pagePath: composing.pagePath,
        message: note.trim(),
        updatedBy: updatedBy.trim() || null,
        lastEditedAt: composing.lastEditedAt,
        targetType,
        targetUserId: targetType === "user" ? targetUserId || null : null,
        targetRole: targetType === "role" ? targetRole : null,
      });
      setJustSentPath(composing.pagePath);
      setComposing(null);
      setTimeout(() => setJustSentPath(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send notification.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <p className="text-sm text-black/50 dark:text-white/50">
        Pick a page below to see when it was last touched, and notify a person or a whole team about it. They&apos;ll
        get a pop-up they have to acknowledge, with a link straight to the page.
      </p>

      <div className="space-y-4">
        {NOTIFY_BREAKDOWN.map((tab) => (
          <div key={tab.tab} className="space-y-2 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
            <h2 className="text-lg font-bold text-green-700 dark:text-green-400">{tab.label}</h2>
            <div className="divide-y divide-black/10 dark:divide-white/10">
              {tab.subtabs.map((sub) => {
                const lastEdited = lastEditedMap[sub.href] ?? null;
                return (
                  <div key={sub.href} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">{sub.label}</p>
                      <p className="text-xs text-black/50 dark:text-white/50">
                        {lastEdited ? `Last edited ${formatTimestamp(lastEdited)}` : "No activity tracked"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {justSentPath === sub.href && <span className="text-xs font-medium text-green-600">Sent!</span>}
                      <button
                        onClick={() =>
                          openNotify({
                            tabLabel: tab.label,
                            subtabLabel: sub.label,
                            pagePath: sub.href,
                            lastEditedAt: lastEdited,
                          })
                        }
                        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                      >
                        Notify
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-black/10 p-4 shadow-sm dark:border-white/10">
        <h2 className="text-lg font-bold text-green-700 dark:text-green-400">Sent Notifications</h2>
        {sent.length === 0 ? (
          <p className="text-sm text-black/40 dark:text-white/40">Nothing sent yet.</p>
        ) : (
          <div className="space-y-3">
            {sent.map((n) => (
              <div key={n.id} className="rounded border border-black/10 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {n.tab_label} - {n.subtab_label}
                  </span>
                  <span className="text-xs text-black/40 dark:text-white/40">{formatTimestamp(n.created_at)}</span>
                </div>
                <p className="text-xs text-black/50 dark:text-white/50">
                  To: {n.target_type === "role" ? ROLES.find((r) => r.value === n.target_role)?.label ?? n.target_role : "person"}
                </p>
                {n.message && <p className="mt-1 text-sm">{n.message}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {n.notification_recipients.map((r) => {
                    const recipient = profileById.get(r.user_id);
                    return (
                      <span
                        key={r.id}
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          r.acknowledged_at
                            ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                        }`}
                      >
                        {recipient?.email ?? "Unknown"}
                        {r.acknowledged_at ? ` - acknowledged ${formatTimestamp(r.acknowledged_at)}` : " - pending"}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {composing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-lg bg-white p-5 dark:bg-neutral-900">
            <div>
              <h2 className="text-lg font-bold">
                Notify: {composing.tabLabel} - {composing.subtabLabel}
              </h2>
              <p className="text-xs text-black/50 dark:text-white/50">
                {composing.lastEditedAt ? `Last edited ${formatTimestamp(composing.lastEditedAt)}` : "No activity tracked yet"}
              </p>
            </div>

            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={targetType === "user"} onChange={() => setTargetType("user")} />
                Person
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={targetType === "role"} onChange={() => setTargetType("role")} />
                Group
              </label>
            </div>

            {targetType === "user" ? (
              <label className="block text-sm">
                Notify
                <select value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} className={`${field} mt-1`}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.email ?? p.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block text-sm">
                Notify group
                <select value={targetRole} onChange={(e) => setTargetRole(e.target.value as Role)} className={`${field} mt-1`}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-sm">
              Updated by (optional)
              <input
                value={updatedBy}
                onChange={(e) => setUpdatedBy(e.target.value)}
                placeholder="Who made the update"
                className={`${field} mt-1`}
              />
            </label>

            <label className="block text-sm">
              Note (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Anything extra to add"
                className={`${field} mt-1`}
              />
            </label>

            <div className="rounded-md bg-black/5 p-3 text-sm dark:bg-white/10">
              <p className="font-medium">Preview</p>
              <p>
                Attention {composing.tabLabel} - {composing.subtabLabel} sheet has been Updated
              </p>
              {composing.lastEditedAt && <p>Updated: {formatTimestamp(composing.lastEditedAt)}</p>}
              {updatedBy.trim() && <p>Updated by: {updatedBy.trim()}</p>}
              <p>Notified by: {currentUserEmail ?? "Admin"}</p>
              {note.trim() && <p>{note.trim()}</p>}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setComposing(null)}
                className="rounded-md border border-black/10 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
