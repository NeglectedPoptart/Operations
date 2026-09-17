"use client";

import { useEffect, useState } from "react";
import { getPageStatus, markPageUpToDate } from "@/app/actions";
import { formatTimestamp, isoDateOf, todayISO } from "@/lib/dates";

// Self-contained - fetches and owns its own status, so dropping this into
// any page's Client component is the only wiring needed (no page.tsx
// changes, no props to thread through). "Up to date" means marked today in
// the business timezone - still clickable once green, to bump the
// timestamp again later the same day.
export default function UpdateStatusButton({
  pageKey,
  canEdit = true,
  readOnly = false,
  onMarked,
  idleLabel = "Mark as Up to Date",
  activeLabel = "Up to Date",
}: {
  pageKey: string;
  // Some pages restrict who's allowed to confirm up-to-date (e.g. FOB Pharr
  // is Admin-only) - everyone still sees the current status, but only a
  // role that passes this can click to change it.
  canEdit?: boolean;
  // The three Delivered pricing pages derive entirely from FOB Pharr's own
  // data, so they just mirror its status (pageKey="fob-pharr") rather than
  // tracking their own - readOnly renders that as a plain non-interactive
  // display instead of a button, since marking only ever happens on the
  // source page.
  readOnly?: boolean;
  // Fired (fire-and-forget) right after a successful mark - e.g. Arrivals
  // uses this to fan out a notification to everyone with Mexico access,
  // without baking that page-specific behavior into this shared component.
  onMarked?: () => void;
  // Overrides the generic "Mark as Up to Date" / "Up to Date" wording for
  // pages where that phrasing doesn't fit (e.g. Arrivals reads as "report an
  // update" rather than "confirm nothing changed"). The re-clickable/notify
  // mechanics are identical either way - this only changes the label.
  idleLabel?: string;
  activeLabel?: string;
}) {
  const [markedAt, setMarkedAt] = useState<string | null>(null);
  const [markedByEmail, setMarkedByEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPageStatus(pageKey)
      .then((status) => {
        if (cancelled) return;
        setMarkedAt(status.markedAt);
        setMarkedByEmail(status.markedByEmail);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageKey]);

  async function handleClick() {
    setSaving(true);
    try {
      const result = await markPageUpToDate([pageKey]);
      setMarkedAt(result.markedAt);
      setMarkedByEmail(result.markedByEmail);
      onMarked?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't mark this page up to date - try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  const isUpToDateToday = markedAt !== null && isoDateOf(markedAt) === todayISO();
  const sharedClass = `mb-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-center text-base font-bold shadow-md ${
    isUpToDateToday ? "bg-green-600 text-white" : "bg-amber-500 text-black"
  }`;

  if (readOnly) {
    return (
      <div className={sharedClass}>
        {isUpToDateToday ? (
          <>
            ✓ FOB Pharr Confirmed{markedByEmail ? ` — ${markedByEmail}` : ""} · {formatTimestamp(markedAt)}
          </>
        ) : (
          <>⚠ FOB Pharr Not Yet Confirmed</>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={saving || !canEdit}
      title={canEdit ? undefined : "Only an Admin can confirm this page is up to date."}
      className={`${sharedClass} transition disabled:opacity-70 ${canEdit ? "" : "disabled:cursor-not-allowed"} ${
        isUpToDateToday ? "hover:bg-green-700" : "hover:bg-amber-400"
      }`}
    >
      {isUpToDateToday ? (
        <>
          ✓ {activeLabel}{markedByEmail ? ` — ${markedByEmail}` : ""} · {formatTimestamp(markedAt)}
        </>
      ) : (
        <>⚠ {idleLabel}</>
      )}
    </button>
  );
}
