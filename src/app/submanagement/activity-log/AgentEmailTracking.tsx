"use client";

import { useMemo, useState } from "react";
import CollapsibleSection from "@/components/CollapsibleSection";
import { APP_TIMEZONE } from "@/lib/dates";
import { formatTimestampIn } from "@/lib/timezones";

export interface AgentEmailRow {
  id: string;
  sentAt: string; // when it went out (or was tried, for a failed one)
  agentName: string;
  subject: string;
  to: { email: string; name: string | null }[];
  failed: boolean;
  // First reply from each person who answered.
  responders: { email: string; name: string | null; at: string | null }[];
  replyCount: number;
}

const select = "rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";

function who(p: { email: string; name: string | null }): string {
  return p.name ? p.name : p.email;
}

export default function AgentEmailTracking({ rows }: { rows: AgentEmailRow[] }) {
  const [agent, setAgent] = useState("");
  const [days, setDays] = useState(14);
  const [onlyNoReply, setOnlyNoReply] = useState(false);
  // Computed once on load - the page is dynamic, so this is "now" enough for a day filter.
  const [cutoffBase] = useState(() => Date.now());

  const agents = useMemo(() => [...new Set(rows.map((r) => r.agentName))].sort(), [rows]);

  const visible = useMemo(() => {
    const cutoff = cutoffBase - days * 86_400_000;
    return rows.filter(
      (r) => (!agent || r.agentName === agent) && new Date(r.sentAt).getTime() >= cutoff && (!onlyNoReply || (!r.failed && r.replyCount === 0)),
    );
  }, [rows, agent, days, onlyNoReply, cutoffBase]);

  // Per-agent totals for the filtered window.
  const totals = useMemo(() => {
    const map = new Map<string, { sent: number; answered: number }>();
    for (const r of visible) {
      if (r.failed) continue;
      const t = map.get(r.agentName) ?? { sent: 0, answered: 0 };
      t.sent++;
      if (r.replyCount > 0) t.answered++;
      map.set(r.agentName, t);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  return (
    <CollapsibleSection id="activity-agent-emails" title="Agent Email Responses" note={`${visible.length} email${visible.length === 1 ? "" : "s"}`}>
      <p className="text-sm text-black/60 dark:text-white/60">
        Every email the HOPS Agents send, who it went to, and who answered. The replies themselves aren&apos;t shown here.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <select value={agent} onChange={(e) => setAgent(e.target.value)} className={select}>
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={select}>
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={onlyNoReply} onChange={(e) => setOnlyNoReply(e.target.checked)} />
          Only emails nobody answered
        </label>
      </div>

      {totals.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {totals.map(([name, t]) => (
            <span key={name} className="rounded-md bg-black/5 px-2.5 py-1 text-sm dark:bg-white/10">
              {name}: <span className="font-bold">{t.sent}</span> sent, <span className="font-bold">{t.answered}</span> answered
              {t.sent > 0 && <span className="text-black/50 dark:text-white/50"> ({Math.round((t.answered / t.sent) * 100)}%)</span>}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left dark:bg-white/10">
            <tr>
              <th className="px-3 py-2">Sent</th>
              <th className="px-3 py-2">Agent</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Sent to</th>
              <th className="px-3 py-2">Responded</th>
              <th className="px-3 py-2">No response yet</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-black/50 dark:text-white/50">
                  No emails in this range.
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const answered = new Set(r.responders.map((p) => p.email.toLowerCase()));
              const silent = r.to.filter((p) => !answered.has(p.email.toLowerCase()));
              return (
                <tr key={r.id} className="border-t border-black/10 align-top dark:border-white/10">
                  <td className="whitespace-nowrap px-3 py-2">{formatTimestampIn(r.sentAt, APP_TIMEZONE)}</td>
                  <td className="px-3 py-2">{r.agentName}</td>
                  <td className="max-w-[20rem] px-3 py-2">
                    {r.subject}
                    {r.failed && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">failed to send</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.to.map(who).join(", ")}</td>
                  <td className="px-3 py-2">
                    {r.responders.length === 0 ? (
                      <span className="text-black/40 dark:text-white/40">{r.failed ? "" : "—"}</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.responders.map((p) => (
                          <li key={p.email} className="text-green-700 dark:text-green-400">
                            {who(p)}
                            {p.at && <span className="ml-1 text-xs text-black/50 dark:text-white/50">{formatTimestampIn(p.at, APP_TIMEZONE)}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.failed ? "" : silent.length === 0 ? <span className="text-black/40 dark:text-white/40">everyone answered</span> : <span className="text-amber-600">{silent.map(who).join(", ")}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
