"use client";

import { useState, useTransition } from "react";
import type { Agent, AgentEvent, AgentReply, AgentThread, ProposedLoadUpdate, ReplyAttachment } from "@/lib/agents/types";
import {
  applyReplyUpdates,
  approveDraft,
  checkInboxNow,
  discardDraft,
  dismissReply,
  runAgentNow,
  saveCarrierEmail,
  updateAgent,
} from "./actions";

export interface CarrierRow {
  id: string;
  name: string;
  followup_email: string | null;
  active: boolean;
}

export interface ReviewItem {
  reply: AgentReply;
  subject: string;
  loadLabels: Record<string, string>;
  // The thread's loads in the order they are numbered in the email.
  loadIds: string[];
  attachmentUrls: Record<string, string>;
}

const field = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-black";
const btn = "rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50";
const primary = `${btn} bg-green-600 text-white hover:bg-green-700`;
const secondary = `${btn} border border-black/20 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10`;

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="border-b-2 border-green-600 pb-1 text-lg font-bold text-green-700 dark:text-green-400">
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{count}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

function splitList(value: string): string[] {
  return value.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes("@"));
}

function when(iso: string | null) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function SetupChecklist({ status }: { status: { outlook: boolean; claude: boolean; scheduler: boolean; mailbox: string | null } }) {
  const items = [
    { ok: status.outlook, label: `Outlook mailbox${status.mailbox ? ` (${status.mailbox})` : ""}`, hint: "MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, HOPS_AGENT_MAILBOX" },
    { ok: status.claude, label: "Claude (reads replies - skip if every agent is notify-only)", hint: "ANTHROPIC_API_KEY" },
    { ok: status.scheduler, label: "Scheduler (every 15 min)", hint: "SUPABASE_SERVICE_ROLE_KEY, AGENT_CRON_SECRET + pg_cron job" },
  ];
  if (items.every((i) => i.ok)) return null;
  return (
    <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="mb-1 font-semibold">Setup</p>
      <ul className="space-y-0.5">
        {items.map((i) => (
          <li key={i.label}>
            {i.ok ? "✅" : "⬜"} {i.label}
            {!i.ok && <span className="ml-1 text-xs opacity-70">- Vercel env: {i.hint}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [recipients, setRecipients] = useState((agent.config.recipients ?? []).join(", "));
  const [replyTo, setReplyTo] = useState((agent.config.reply_to ?? []).join(", "));
  const readReplies = agent.config.read_replies !== false;
  const [sendTimes, setSendTimes] = useState((agent.config.send_times ?? []).join(", "));
  const isSlotAgent = agent.key === "load_eta";

  const save = (patch: Parameters<typeof updateAgent>[1]) => start(() => updateAgent(agent.id, patch));

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{agent.name}</p>
          <p className="text-xs text-black/60 dark:text-white/60">{agent.description}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={agent.enabled} disabled={pending} onChange={(e) => save({ enabled: e.target.checked })} />
          {agent.enabled ? "On" : "Off"}
        </label>
      </div>

      {isSlotAgent && (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <label className="space-y-0.5">
            <span className="block text-black/60 dark:text-white/60">Mode</span>
            <select className={field} value={agent.mode} disabled={pending} onChange={(e) => save({ mode: e.target.value as Agent["mode"] })}>
              <option value="approve">I approve each email</option>
              <option value="auto">Send on its own</option>
            </select>
          </label>
          <label className="col-span-2 space-y-0.5 sm:col-span-2">
            <span className="block text-black/60 dark:text-white/60">Send at (24h, Central, comma-separated)</span>
            <input
              className={field}
              value={sendTimes}
              placeholder="05:00, 09:00, 13:00, 17:00, 21:00"
              onChange={(e) => setSendTimes(e.target.value)}
              onBlur={() => {
                const times = sendTimes
                  .split(/[,;\s]+/)
                  .map((t) => t.trim())
                  .filter((t) => /^\d{1,2}:\d{2}$/.test(t));
                if (times.length > 0) save({ send_times: times });
              }}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-0.5">
              <span className="block text-black/60 dark:text-white/60">Never before</span>
              <input
                type="time"
                className={field}
                defaultValue={agent.config.window_start ?? "05:00"}
                onBlur={(e) => e.target.value && save({ window_start: e.target.value })}
              />
            </label>
            <label className="space-y-0.5">
              <span className="block text-black/60 dark:text-white/60">Never after</span>
              <input
                type="time"
                className={field}
                defaultValue={agent.config.window_end ?? "21:30"}
                onBlur={(e) => e.target.value && save({ window_end: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}

      {!isSlotAgent && (
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <label className="space-y-0.5">
          <span className="block text-black/60 dark:text-white/60">Mode</span>
          <select className={field} value={agent.mode} disabled={pending} onChange={(e) => save({ mode: e.target.value as Agent["mode"] })}>
            <option value="approve">I approve each email</option>
            <option value="auto">Send on its own</option>
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="block text-black/60 dark:text-white/60">Every (hours)</span>
          <input
            type="number"
            min={1}
            className={field}
            defaultValue={agent.interval_hours}
            onBlur={(e) => Number(e.target.value) > 0 && save({ interval_hours: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-black/60 dark:text-white/60">From hour</span>
          <input
            type="number"
            min={0}
            max={23}
            className={field}
            defaultValue={agent.active_start_hour}
            onBlur={(e) => save({ active_start_hour: Number(e.target.value) })}
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-black/60 dark:text-white/60">Until hour</span>
          <input
            type="number"
            min={1}
            max={24}
            className={field}
            defaultValue={agent.active_end_hour}
            onBlur={(e) => save({ active_end_hour: Number(e.target.value) })}
          />
        </label>
      </div>
      )}

      <div className="space-y-1 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={readReplies}
            disabled={pending}
            onChange={(e) => save({ read_replies: e.target.checked })}
          />
          Read replies and update HOPS
          {!readReplies && <span className="text-black/50 dark:text-white/50">(notify only - no Claude needed)</span>}
        </label>
        <label className="block space-y-0.5">
          <span className="block text-black/60 dark:text-white/60">
            Replies go to (leave blank for the HOP@ mailbox{readReplies ? ", which the agent reads" : ""})
          </span>
          <input
            className={field}
            value={replyTo}
            placeholder="you@harvestbestinc.com"
            onChange={(e) => setReplyTo(e.target.value)}
            onBlur={() => save({ reply_to: splitList(replyTo) })}
          />
        </label>
        {readReplies && replyTo.trim() !== "" && (
          <p className="text-amber-600">Replies going to someone else won&apos;t reach the agent, so HOPS won&apos;t be updated from them.</p>
        )}
      </div>

      {agent.key === "load_pending" && (
        <label className="block space-y-0.5 text-xs">
          <span className="block text-black/60 dark:text-white/60">
            Send to (leave blank for every Operations login)
          </span>
          <input
            className={field}
            value={recipients}
            placeholder="ops1@harvestbestinc.com, ops2@harvestbestinc.com"
            onChange={(e) => setRecipients(e.target.value)}
            onBlur={() => save({ recipients: splitList(recipients) })}
          />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          className={secondary}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await runAgentNow(agent.id);
              setMessage(r.created > 0 ? `${r.created} email${r.created === 1 ? "" : "s"} created.` : "Nothing needed a follow-up right now.");
            })
          }
        >
          {pending ? "Working..." : "Run now"}
        </button>
        <span className="text-black/50 dark:text-white/50">Last run: {when(agent.last_run_at)}</span>
        {message && <span className="text-green-700 dark:text-green-400">{message}</span>}
      </div>
    </div>
  );
}

function DraftCard({ draft }: { draft: AgentThread }) {
  const [pending, start] = useTransition();
  const [to, setTo] = useState(draft.to_emails.join(", "));
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
      {draft.status === "failed" && <p className="text-xs text-red-600">Send failed: {draft.error}</p>}
      <input className={field} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
      <textarea className={`${field} font-mono text-xs`} rows={Math.min(14, body.split("\n").length + 1)} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        <button
          className={primary}
          disabled={pending}
          onClick={() =>
            start(() =>
              approveDraft(draft.id, {
                to: splitList(to),
                subject,
                body,
              }),
            )
          }
        >
          {pending ? "Sending..." : draft.status === "failed" ? "Retry send" : "Approve & send"}
        </button>
        <button className={secondary} disabled={pending} onClick={() => start(() => discardDraft(draft.id))}>
          Discard
        </button>
      </div>
    </div>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const [pending, start] = useTransition();
  const [updates, setUpdates] = useState<ProposedLoadUpdate[]>(item.reply.proposed);
  const [files, setFiles] = useState<ReplyAttachment[]>(item.reply.attachments ?? []);
  const set = (i: number, patch: Partial<ProposedLoadUpdate>) =>
    setUpdates((prev) => prev.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  const setFile = (i: number, patch: Partial<ReplyAttachment>) =>
    setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const completing = new Set(files.filter((f) => f.is_pod && f.load_id && f.storage_path).map((f) => f.load_id));

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
      <div className="text-xs text-black/60 dark:text-white/60">
        {item.reply.from_email} · {when(item.reply.received_at)} · re: {item.subject}
      </div>
      <blockquote className="max-h-40 overflow-y-auto whitespace-pre-wrap border-l-4 border-green-600 bg-black/5 px-2 py-1 text-xs dark:bg-white/5">
        {item.reply.body_text}
      </blockquote>
      {item.reply.summary && <p className="font-medium">{item.reply.summary}</p>}
      {item.reply.error && <p className="text-xs text-red-600">{item.reply.error}</p>}

      {files.map((f, i) => (
        <div key={i} className={`space-y-1 rounded border p-2 text-xs ${f.is_pod && !f.confident ? "border-amber-400" : "border-black/10 dark:border-white/10"}`}>
          <p className="font-semibold">
            {f.storage_path && item.attachmentUrls[f.storage_path] ? (
              <a href={item.attachmentUrls[f.storage_path]} target="_blank" rel="noreferrer" className="text-green-700 hover:underline dark:text-green-400">
                📄 {f.file_name}
              </a>
            ) : (
              <>📄 {f.file_name}</>
            )}
          </p>
          {f.note && <p className="text-black/60 dark:text-white/60">Claude: {f.note}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={f.is_pod} onChange={(e) => setFile(i, { is_pod: e.target.checked })} />
              This is the signed POD
            </label>
            {f.is_pod && (
              <label className="flex items-center gap-1">
                for load
                <select
                  className="rounded border border-gray-300 bg-white px-1 text-black"
                  value={f.load_id ?? ""}
                  onChange={(e) => {
                    const idx = item.loadIds.indexOf(e.target.value);
                    setFile(i, { load_id: e.target.value || null, load_number: idx >= 0 ? idx + 1 : null, confident: true });
                  }}
                >
                  <option value="">pick one</option>
                  {item.loadIds.map((id, n) => (
                    <option key={id} value={id}>
                      #{n + 1} {item.loadLabels[id] ?? ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {f.is_pod && f.load_id && <span className="font-medium text-green-700 dark:text-green-400">Load goes Complete</span>}
          </div>
        </div>
      ))}

      {updates.map((u, i) => (
        <div key={i} className={`space-y-1 rounded border p-2 text-xs ${u.confident ? "border-black/10 dark:border-white/10" : "border-amber-400"}`}>
          <p className="font-semibold">
            Load #{u.load_number}: {item.loadLabels[u.load_id] ?? "unknown load - pick it on the Board instead"}
            {!u.confident && <span className="ml-2 text-amber-600">check this one</span>}
          </p>
          <label className="block">
            ETA note
            <input className={field} value={u.eta_note ?? ""} onChange={(e) => set(i, { eta_note: e.target.value || null })} />
          </label>
          <label className="block">
            Add to notes
            <input className={field} value={u.append_note ?? ""} onChange={(e) => set(i, { append_note: e.target.value || null })} />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={u.delivered === true || completing.has(u.load_id)}
                disabled={completing.has(u.load_id)}
                onChange={(e) => set(i, { delivered: e.target.checked ? true : null })}
              />
              Delivered{completing.has(u.load_id) ? " (POD attached)" : " - Pending POD until the POD arrives"}
            </label>
            <label className="flex items-center gap-1">
              Ready
              <select
                className="rounded border border-gray-300 bg-white px-1 text-black"
                value={u.ready_to_load === null ? "" : String(u.ready_to_load)}
                onChange={(e) => set(i, { ready_to_load: e.target.value === "" ? null : e.target.value === "true" })}
              >
                <option value="">no change</option>
                <option value="true">ready</option>
                <option value="false">not ready</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              Status
              <select
                className="rounded border border-gray-300 bg-white px-1 text-black"
                value={u.new_status ?? ""}
                onChange={(e) => set(i, { new_status: (e.target.value || null) as ProposedLoadUpdate["new_status"] })}
              >
                <option value="">no change</option>
                <option value="on_the_road">On the Road</option>
                <option value="complete">Complete</option>
              </select>
            </label>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button className={primary} disabled={pending || (updates.length === 0 && completing.size === 0)} onClick={() => start(() => applyReplyUpdates(item.reply.id, updates, files))}>
          {pending ? "Applying..." : "Apply to HOPS"}
        </button>
        <button className={secondary} disabled={pending} onClick={() => start(() => dismissReply(item.reply.id))}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function CarrierEmails({ carriers }: { carriers: CarrierRow[] }) {
  const [showInactive, setShowInactive] = useState(false);
  const rows = carriers.filter((c) => showInactive || c.active);
  const missing = carriers.filter((c) => c.active && !c.followup_email).length;

  return (
    <div className="space-y-2">
      <p className="text-xs text-black/60 dark:text-white/60">
        Where ETA follow-ups go for each carrier. Separate more than one with commas.
        {missing > 0 && <span className="ml-1 text-amber-600">{missing} active carrier{missing === 1 ? "" : "s"} missing an email.</span>}
      </p>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-black/10 first:border-t-0 dark:border-white/10">
                <td className={`w-1/3 px-2 py-1 ${c.active ? "" : "text-black/40 dark:text-white/40"}`}>{c.name}</td>
                <td className="px-2 py-1">
                  <input
                    className={field}
                    defaultValue={c.followup_email ?? ""}
                    placeholder="dispatch@carrier.com"
                    onBlur={(e) => e.target.value !== (c.followup_email ?? "") && saveCarrierEmail(c.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive carriers
      </label>
    </div>
  );
}

export default function AgentsClient({
  status,
  agents,
  drafts,
  reviewItems,
  events,
  carriers,
}: {
  status: { outlook: boolean; claude: boolean; scheduler: boolean; mailbox: string | null };
  agents: Agent[];
  drafts: AgentThread[];
  reviewItems: ReviewItem[];
  events: AgentEvent[];
  carriers: CarrierRow[];
}) {
  const [pending, start] = useTransition();
  const [inboxMsg, setInboxMsg] = useState<string | null>(null);
  const agentName = Object.fromEntries(agents.map((a) => [a.id, a.name]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">HOPS Agents</h1>
        <div className="flex items-center gap-2 text-xs">
          {inboxMsg && <span className="text-green-700 dark:text-green-400">{inboxMsg}</span>}
          <button
            className={secondary}
            disabled={pending || !status.outlook}
            onClick={() =>
              start(async () => {
                const r = await checkInboxNow();
                setInboxMsg(r.processed > 0 ? `${r.processed} repl${r.processed === 1 ? "y" : "ies"} read.` : "No new replies.");
              })
            }
          >
            {pending ? "Checking..." : "Check inbox now"}
          </button>
        </div>
      </div>

      <SetupChecklist status={status} />

      <Section title="Replies to review" count={reviewItems.length}>
        {reviewItems.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">Nothing waiting.</p>
        ) : (
          reviewItems.map((item) => <ReviewCard key={item.reply.id} item={item} />)
        )}
      </Section>

      <Section title="Emails to approve" count={drafts.length}>
        {drafts.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">Nothing waiting.</p>
        ) : (
          drafts.map((d) => <DraftCard key={d.id} draft={d} />)
        )}
      </Section>

      <Section title="Agents">
        <div className="space-y-3">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      </Section>

      <Section title="Carrier emails">
        <CarrierEmails carriers={carriers} />
      </Section>

      <Section title="Activity">
        {events.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">No activity yet.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="w-24 shrink-0 text-black/50 dark:text-white/50">{when(e.created_at)}</span>
                <span className={e.kind === "error" ? "text-red-600" : ""}>
                  {e.agent_id && <span className="font-medium">{agentName[e.agent_id] ?? "Agent"}: </span>}
                  {e.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
