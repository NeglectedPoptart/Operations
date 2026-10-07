"use client";

import { useMemo, useState } from "react";
import { AUDIT_EVENT_LABELS, TRACKED_HANDLES, type AuditEventType, type AuditLogRow } from "@/lib/auditTracked";
import { APP_TIMEZONE } from "@/lib/dates";
import { formatTimestampIn, timeZoneLabel } from "@/lib/timezones";

const field = "rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

const EVENT_BADGE: Record<AuditEventType, string> = {
  login: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ar_open: "bg-gray-200 text-gray-800 dark:bg-white/10 dark:text-white/80",
  ar_upload: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  ar_change: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

function handleOf(email: string): string {
  return email.split("@")[0].toLowerCase();
}

// Your time (Central) first, then the person's own clock underneath when
// they are somewhere else.
function When({ ts, theirZone }: { ts: string | null; theirZone?: string | null }) {
  if (!ts) return <span className="text-black/30 dark:text-white/30">never</span>;
  const showTheirs = theirZone && theirZone !== APP_TIMEZONE;
  return (
    <>
      <span>{formatTimestampIn(ts, APP_TIMEZONE)}</span>
      {showTheirs && (
        <span className="block text-[11px] text-black/50 dark:text-white/50" title={timeZoneLabel(theirZone)}>
          Theirs: {formatTimestampIn(ts, theirZone)}
        </span>
      )}
    </>
  );
}

// nowMs comes from the server render: Date.now() directly in a client render
// is flagged as impure.
export default function ActivityLogClient({
  rows,
  nowMs,
  timezoneByEmail,
}: {
  rows: AuditLogRow[];
  nowMs: number;
  timezoneByEmail: Record<string, string>;
}) {
  // The zone an event happened in: recorded on the event itself, else the
  // person's current zone (older entries).
  const zoneFor = (r: AuditLogRow) => r.user_timezone ?? timezoneByEmail[r.user_email.toLowerCase()] ?? null;
  const [person, setPerson] = useState("");
  const [eventType, setEventType] = useState("");

  // Rows arrive newest first, so the first match per person/event is the
  // latest one.
  const summary = useMemo(() => {
    const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
    return TRACKED_HANDLES.map((handle) => {
      const mine = rows.filter((r) => handleOf(r.user_email) === handle);
      const latest = (type: AuditEventType) => mine.find((r) => r.event_type === type)?.created_at ?? null;
      return {
        handle,
        zone: mine[0]?.user_timezone ?? timezoneByEmail[`${handle}@harvestbestinc.com`] ?? null,
        lastLogin: latest("login"),
        lastArOpen: latest("ar_open"),
        lastUpload: latest("ar_upload"),
        lastChange: latest("ar_change"),
        changesThisWeek: mine.filter((r) => r.event_type === "ar_change" && new Date(r.created_at).getTime() >= weekAgo).length,
      };
    });
  }, [rows, nowMs, timezoneByEmail]);

  const visible = useMemo(
    () => rows.filter((r) => (!person || handleOf(r.user_email) === person) && (!eventType || r.event_type === eventType)),
    [rows, person, eventType],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Logins, Accounts Receivable opens, AR report uploads, and AR edits for the people below. Records actions only
          - not keystrokes.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/5">
            <tr>
              <th className="px-2 py-2">Person</th>
              <th className="px-2 py-2">Last Login</th>
              <th className="px-2 py-2">Last Opened AR</th>
              <th className="px-2 py-2">Last AR Upload</th>
              <th className="px-2 py-2">Last AR Change</th>
              <th className="px-2 py-2 text-right">Changes (7 days)</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.handle} className="border-t border-black/10 dark:border-white/10">
                <td className="px-2 py-1.5 font-medium">{s.handle}</td>
                <td className="px-2 py-1.5">
                  <When ts={s.lastLogin} theirZone={s.zone} />
                </td>
                <td className="px-2 py-1.5">
                  <When ts={s.lastArOpen} theirZone={s.zone} />
                </td>
                <td className="px-2 py-1.5">
                  <When ts={s.lastUpload} theirZone={s.zone} />
                </td>
                <td className="px-2 py-1.5">
                  <When ts={s.lastChange} theirZone={s.zone} />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{s.changesThisWeek}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-green-700 dark:text-green-400">All Activity</h2>
          <select value={person} onChange={(e) => setPerson(e.target.value)} className={field}>
            <option value="">Everyone</option>
            {TRACKED_HANDLES.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} className={field}>
            <option value="">All events</option>
            {(Object.keys(AUDIT_EVENT_LABELS) as AuditEventType[]).map((t) => (
              <option key={t} value={t}>
                {AUDIT_EVENT_LABELS[t]}
              </option>
            ))}
          </select>
          <span className="text-xs text-black/40 dark:text-white/40">
            {visible.length} event{visible.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left dark:bg-white/5">
              <tr>
                <th className="whitespace-nowrap px-2 py-2">When (your time - Central)</th>
                <th className="px-2 py-2">Person</th>
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-black/10 align-top dark:border-white/10">
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <When ts={r.created_at} theirZone={zoneFor(r)} />
                    {!zoneFor(r) && handleOf(r.user_email) !== "tcamph" && (
                      <span className="block text-[11px] text-black/30 dark:text-white/30">their zone not detected yet</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-medium">{handleOf(r.user_email)}</td>
                  <td className="px-2 py-1.5">
                    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${EVENT_BADGE[r.event_type] ?? ""}`}>
                      {AUDIT_EVENT_LABELS[r.event_type] ?? r.event_type}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">{r.summary}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-black/40 dark:text-white/40">
                    Nothing recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
