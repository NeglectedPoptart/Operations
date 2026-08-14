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
  linkedKeys = [],
  canEdit = true,
}: {
  pageKey: string;
  linkedKeys?: string[];
  // Some pages restrict who's allowed to confirm up-to-date (e.g. FOB Pharr
  // is Admin-only) - everyone still sees the current status, but only a
  // role that passes this can click to change it.
  canEdit?: boolean;
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
      const result = await markPageUpToDate([pageKey, ...linkedKeys]);
      setMarkedAt(result.markedAt);
      setMarkedByEmail(result.markedByEmail);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't mark this page up to date - try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  const isUpToDateToday = markedAt !== null && isoDateOf(markedAt) === todayISO();

  return (
    <button
      onClick={handleClick}
      disabled={saving || !canEdit}
      title={canEdit ? undefined : "Only an Admin can confirm this page is up to date."}
      className={`mb-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-center text-base font-bold shadow-md transition disabled:opacity-70 ${
        canEdit ? "" : "disabled:cursor-not-allowed"
      } ${isUpToDateToday ? "bg-green-600 text-white hover:bg-green-700" : "bg-amber-500 text-black hover:bg-amber-400"}`}
    >
      {isUpToDateToday ? (
        <>
          ✓ Up to Date{markedByEmail ? ` — ${markedByEmail}` : ""} · {formatTimestamp(markedAt)}
        </>
      ) : (
        <>⚠ Mark as Up to Date</>
      )}
    </button>
  );
}
