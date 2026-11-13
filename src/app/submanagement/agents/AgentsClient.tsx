"use client";

import { useState, useTransition } from "react";
import type {
  Agent,
  AgentEvent,
  AgentReply,
  AgentThread,
  ProposedBuyerUpdate,
  ProposedLoadUpdate,
  ProposedOrderUpdate,
  ReplyAttachment,
} from "@/lib/agents/types";
import AgentOffice from "./AgentOffice";
import {
  applyBuyerReplyUpdates,
  applyOrderReplyUpdates,
  applyReplyUpdates,
  approveDraft,
  checkInboxNow,
  discardDraft,
  dismissReply,
  runAgentNow,
  saveCarrierEmail,
  saveCustomerEmail,
  updateAgent,
} from "./actions";

export interface CarrierRow {
  id: string;
  name: string;
  followup_email: string | null;
  active: boolean;
}

export interface CustomerRow {
  name: string;
  to: string;
  cc: string;
}

export interface RoleOption {
  key: string;
  label: string;
}

export interface PersonOption {
  email: string;
  role: string;
}

export interface OrderLabelOption {
  id: string;
  name: string;
  color: string;
  opacity: number;
}

export interface ReviewItem {
  reply: AgentReply;
  subject: string;
  loadLabels: Record<string, string>;
  // The thread's loads in the order they are numbered in the email.
  loadIds: string[];
  agentKey: string;
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

// How each agent looks on its card.
const AGENT_ICON: Record<string, string> = {
  load_eta: "🚚",
  customer_eta: "📬",
  buyers_list: "🛒",
  orders_pending: "📋",
  delivered_sheets: "🏷️",
};

// "17:00" -> "5:00 PM"
function fmtTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

function hourText(h: number): string {
  return fmtTime(`${h % 24}:00`);
}

function Chip({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/5 px-2.5 py-1 dark:bg-white/10">
      <span>{icon}</span>
      <span className="text-black/50 dark:text-white/50">{label}</span>
      <span className="font-semibold">{children}</span>
    </span>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-wide text-green-700 dark:text-green-400">{children}</p>;
}

function AgentCard({ agent, roleOptions, people, orderLabels }: { agent: Agent; roleOptions: RoleOption[]; people: PersonOption[]; orderLabels: OrderLabelOption[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [recipients, setRecipients] = useState(() => {
    const list = agent.config.recipients ?? [];
    // The Orders agent ticks HOPS users above, so the box only holds the extras.
    if (agent.key !== "orders_pending") return list.join(", ");
    const known = new Set(people.map((p) => p.email.toLowerCase()));
    return list.filter((e) => !known.has(e.toLowerCase())).join(", ");
  });
  const [replyTo, setReplyTo] = useState((agent.config.reply_to ?? []).join(", "));
  const readReplies = agent.config.read_replies !== false;
  const [sendTimes, setSendTimes] = useState((agent.config.send_times ?? []).join(", "));
  const isSlotAgent = agent.key === "load_eta" || agent.key === "customer_eta" || agent.key === "buyers_list" || agent.key === "orders_pending";

  const save = (patch: Parameters<typeof updateAgent>[1]) => start(() => updateAgent(agent.id, patch));

  const [open, setOpen] = useState(false);
  const autoApply = agent.key === "load_eta" || (agent.config.auto_apply_replies ?? agent.mode === "auto");
  const isSheets = agent.key === "delivered_sheets";
  const sheetLanes = agent.config.lanes?.length ? agent.config.lanes : ["houston", "dallas", "east-coast"];
  const [testTo, setTestTo] = useState((agent.config.test_to ?? []).join(", "));
  const scheduleText = isSheets
    ? "As soon as today's FOB prices are applied"
    : isSlotAgent
    ? `${(agent.config.send_times ?? []).map(fmtTime).join(", ") || "set times"}`
    : `Every ${agent.interval_hours}h`;
  const noHours = agent.key === "load_eta" || agent.key === "customer_eta" || isSheets;
  const windowText = noHours
    ? ""
    : isSlotAgent
    ? `${fmtTime(agent.config.window_start ?? "05:00")} - ${fmtTime(agent.config.window_end ?? "21:30")}`
    : `${hourText(agent.active_start_hour)} - ${hourText(agent.active_end_hour)}`;
  const recipientCount = (agent.config.recipients ?? []).length;
  const roleCount = (agent.config.recipient_roles ?? []).length;
  const toText =
    agent.key === "load_eta"
      ? "Each carrier"
      : agent.key === "customer_eta"
        ? "Each customer"
        : isSheets
          ? ((agent.config.test_to ?? []).length > 0 ? "TEST ADDRESS ONLY" : "Each sheet's customer list")
          : recipientCount + roleCount === 0
          ? "Every Operations login"
          : [roleCount > 0 && `${roleCount} role${roleCount === 1 ? "" : "s"}`, recipientCount > 0 && `${recipientCount} address${recipientCount === 1 ? "" : "es"}`].filter(Boolean).join(" + ");

  return (
    <div
      className={`overflow-hidden rounded-xl border shadow-sm ${
        agent.enabled ? "border-green-400 dark:border-green-700" : "border-black/10 dark:border-white/10"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${
            agent.enabled ? "bg-green-100 dark:bg-green-900/40" : "bg-black/5 grayscale dark:bg-white/10"
          }`}
        >
          {AGENT_ICON[agent.key] ?? "🤖"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-bold">{agent.name}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                agent.enabled ? "bg-green-600 text-white" : "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60"
              }`}
            >
              {agent.enabled ? "ON" : "OFF"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">{agent.description}</p>
        </div>
        <button
          role="switch"
          aria-checked={agent.enabled}
          aria-label={`${agent.name} ${agent.enabled ? "on" : "off"}`}
          disabled={pending}
          onClick={() => save({ enabled: !agent.enabled })}
          className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            agent.enabled ? "bg-green-600" : "bg-black/25 dark:bg-white/25"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${agent.enabled ? "left-[1.375rem]" : "left-0.5"}`}
          />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-3 text-xs">
        <Chip icon="🕒" label="Sends">
          {scheduleText}
          {agent.key === "customer_eta" && agent.config.on_carrier_reply !== false && " + when a carrier replies"}{" "}
          {windowText && <span className="font-normal text-black/50 dark:text-white/50">({windowText})</span>}
        </Chip>
        <Chip icon={agent.mode === "approve" ? "✋" : "⚡"} label="Mode">
          {agent.mode === "approve" ? "You approve each email" : "Sends on its own"}
        </Chip>
        {!isSheets && (
          <Chip icon="📬" label="Replies">
            {!readReplies ? "Notify only" : autoApply ? "Read and applied to HOPS" : "Read, you review"}
          </Chip>
        )}
        <Chip icon="👥" label="To">
          {toText}
        </Chip>
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-t border-black/10 px-4 py-2 text-xs font-semibold text-black/70 hover:bg-black/5 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
      >
        <span>{open ? "Hide settings" : "Edit settings"}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
      <div className="space-y-4 border-t border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <GroupLabel>Schedule and sending</GroupLabel>

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
          {agent.key !== "load_eta" && agent.key !== "customer_eta" && (
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
          )}
        </div>
      )}

      {!isSlotAgent && !isSheets && (
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

      {agent.key === "customer_eta" && (
        <label className="flex items-start gap-2 rounded-lg border border-black/10 bg-white/60 p-2.5 text-xs dark:border-white/10 dark:bg-white/5">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={agent.config.on_carrier_reply !== false}
            disabled={pending}
            onChange={(e) => save({ on_carrier_reply: e.target.checked })}
          />
          <span>
            <b>Also send as soon as a carrier replies with an ETA</b>
            <span className="block text-black/60 dark:text-white/60">
              When a carrier&apos;s ETA answer is added to a load, that load&apos;s customer gets their update right away instead of waiting for the next
              time above, at any hour.
            </span>
          </span>
        </label>
      )}
      {isSheets && (
        <div className="space-y-3 text-xs">
          <p className="text-black/60 dark:text-white/60">
            Once the morning Availability email (or Apply now on FOB Pharr) has filled in today&apos;s FOB prices, each ticked sheet is emailed to its own customer
            list - the same picture and email as Email to customers on its Delivered page. Each sheet goes out once a day, and one already emailed by hand
            today is left alone. Set the lists with Recipients on each Delivered page.
          </p>
          <div>
            <p className="font-medium">Sheets to send</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {[
                ["houston", "Houston"],
                ["dallas", "Dallas"],
                ["east-coast", "East Coast"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={sheetLanes.includes(key)}
                    disabled={pending}
                    onChange={(e) => save({ lanes: e.target.checked ? [...sheetLanes, key] : sheetLanes.filter((k) => k !== key) })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <label className="block space-y-0.5">
            <span className="block text-black/60 dark:text-white/60">Test address (leave blank to send to customers)</span>
            <input
              className={field}
              value={testTo}
              placeholder="you@harvestbestinc.com"
              onChange={(e) => setTestTo(e.target.value)}
              onBlur={() => save({ test_to: splitList(testTo) })}
            />
          </label>
          {testTo.trim() !== "" && <p className="text-amber-600">Test mode: the sheets go ONLY to this address (subject starts with [TEST]), once a day, and never to customers. Clear it to go live.</p>}
        </div>
      )}

      {!isSheets && <GroupLabel>Replies</GroupLabel>}
      {!isSheets && (
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
        {readReplies && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={agent.config.auto_apply_replies ?? agent.mode === "auto"}
              disabled={pending}
              onChange={(e) => save({ auto_apply_replies: e.target.checked })}
            />
            Apply replies to HOPS automatically
            <span className="text-black/50 dark:text-white/50">(anything unclear still waits for you)</span>
          </label>
        )}
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
      )}

      {agent.key === "orders_pending" && (
        <div className="space-y-1 text-xs">
          <p className="font-medium">Include orders with these labels</p>
          <p className="text-black/60 dark:text-white/60">Only orders with a ticked label go in the email. Tick them all to send every pending order.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {[...orderLabels.map((l) => ({ key: l.id, name: l.name, color: l.color, opacity: l.opacity })), { key: "none", name: "No label", color: "", opacity: 0 }].map((l) => {
              const allKeys = [...orderLabels.map((x) => x.id), "none"];
              const current = agent.config.order_labels ?? allKeys;
              const on = current.includes(l.key);
              return (
                <label key={l.key} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={pending}
                    onChange={(e) => save({ order_labels: e.target.checked ? [...current, l.key] : current.filter((k) => k !== l.key) })}
                  />
                  {l.color && (
                    <span
                      className="inline-block h-3.5 w-6 rounded border border-black/30"
                      style={{ backgroundColor: `rgba(${parseInt(l.color.slice(1, 3), 16)}, ${parseInt(l.color.slice(3, 5), 16)}, ${parseInt(l.color.slice(5, 7), 16)}, ${l.opacity})` }}
                    />
                  )}
                  {l.name}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {agent.key === "orders_pending" && (
        <div className="space-y-2 text-xs">
          <p className="font-medium">Send to</p>
          <div>
            <span className="block text-black/60 dark:text-white/60">Everyone with these roles</span>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {roleOptions.map((r) => {
                const on = (agent.config.recipient_roles ?? []).includes(r.key);
                return (
                  <label key={r.key} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={pending}
                      onChange={(e) => {
                        const current = agent.config.recipient_roles ?? [];
                        save({ recipient_roles: e.target.checked ? [...current, r.key] : current.filter((k) => k !== r.key) });
                      }}
                    />
                    {r.label}
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <span className="block text-black/60 dark:text-white/60">And these people</span>
            <div className="mt-1 flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
              {people.map((p) => {
                const on = (agent.config.recipients ?? []).map((e) => e.toLowerCase()).includes(p.email.toLowerCase());
                return (
                  <label key={p.email} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={pending}
                      onChange={(e) => {
                        const current = agent.config.recipients ?? [];
                        save({
                          recipients: e.target.checked ? [...current, p.email] : current.filter((x) => x.toLowerCase() !== p.email.toLowerCase()),
                        });
                      }}
                    />
                    {p.email}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="block space-y-0.5">
            <span className="block text-black/60 dark:text-white/60">Other email addresses (not HOPS users)</span>
            <input
              className={field}
              value={recipients}
              placeholder="someone@example.com"
              onChange={(e) => setRecipients(e.target.value)}
              onBlur={() => {
                // Keep the ticked HOPS users; replace only the typed-in extras.
                const known = new Set(people.map((p) => p.email.toLowerCase()));
                const ticked = (agent.config.recipients ?? []).filter((e) => known.has(e.toLowerCase()));
                save({ recipients: [...ticked, ...splitList(recipients).filter((e) => !known.has(e.toLowerCase()))] });
              }}
            />
          </label>
          {(agent.config.recipient_roles ?? []).length === 0 && (agent.config.recipients ?? []).length === 0 && (
            <p className="text-amber-600">Nobody chosen - it will go to every Operations login.</p>
          )}
        </div>
      )}

      {agent.key === "buyers_list" && (
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

      </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-black/10 px-4 py-2.5 text-xs dark:border-white/10">
        <button
          className={primary}
          disabled={pending}
          onClick={() =>
            start(async () => {
              if (isSheets) {
                const test = (agent.config.test_to ?? []).length > 0;
                const ok = window.confirm(
                  test
                    ? "Email today's Delivered price sheets now? Test mode is on, so they go only to the test address."
                    : "Email today's Delivered price sheets to the customer lists now? This sends them even if the FOB prices haven't been applied by email yet.",
                );
                if (!ok) return;
              }
              const r = await runAgentNow(agent.id);
              setMessage(
                isSheets
                  ? r.created > 0
                    ? `${r.created} price sheet${r.created === 1 ? "" : "s"} emailed.`
                    : r.skipped.length > 0
                      ? r.skipped.join(" ")
                      : "Nothing to send - each sheet goes out once a day, and today's may already have been sent (see Activity)."
                  : r.created > 0
                    ? `${r.created} email${r.created === 1 ? "" : "s"} created - check Emails to approve.`
                    : r.skipped.length > 0
                      ? r.skipped.join(" ")
                      : "Nothing needed a follow-up right now.",
              );
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
  const [sendError, setSendError] = useState<string | null>(null);

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
      {draft.status === "failed" && <p className="text-xs text-red-600">Send failed: {draft.error}</p>}
      {sendError && <p className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">Not sent: {sendError}</p>}
      <input className={field} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />
      <textarea className={`${field} font-mono text-xs`} rows={Math.min(14, body.split("\n").length + 1)} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        <button
          className={primary}
          disabled={pending}
          onClick={() =>
            start(async () => {
              setSendError(null);
              const result = await approveDraft(draft.id, {
                to: splitList(to),
                subject,
                body,
              });
              if (result.error) setSendError(result.error);
            })
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

// Buyers List replies: a note, a new quantity, or "purchased" (removes the line).
function BuyerReviewCard({ item }: { item: ReviewItem }) {
  const [pending, start] = useTransition();
  // agent_replies.proposed holds whichever update shape the agent produces.
  const [updates, setUpdates] = useState<ProposedBuyerUpdate[]>(item.reply.proposed as unknown as ProposedBuyerUpdate[]);
  const set = (i: number, patch: Partial<ProposedBuyerUpdate>) =>
    setUpdates((prev) => prev.map((u, j) => (j === i ? { ...u, ...patch } : u)));

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

      {updates.map((u, i) => (
        <div key={i} className={`space-y-1 rounded border p-2 text-xs ${u.confident ? "border-black/10 dark:border-white/10" : "border-amber-400"}`}>
          <p className="font-semibold">
            #{u.item_number}: {item.loadLabels[u.item_id] ?? "that line is no longer on the list"}
            {!u.confident && <span className="ml-2 text-amber-600">check this one</span>}
          </p>
          <label className="block">
            Add to the line&apos;s notes
            <input className={field} value={u.note ?? ""} onChange={(e) => set(i, { note: e.target.value || null })} />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1">
              New qty needed
              <input
                type="number"
                className="w-24 rounded border border-gray-300 bg-white px-1 text-black"
                value={u.qty_needed ?? ""}
                onChange={(e) => set(i, { qty_needed: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </label>
            <label className={`flex items-center gap-1 font-medium ${u.purchased ? "text-red-600" : ""}`}>
              <input type="checkbox" checked={u.purchased === true} onChange={(e) => set(i, { purchased: e.target.checked ? true : null })} />
              Purchased - remove from list
            </label>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button className={primary} disabled={pending || updates.length === 0} onClick={() => start(() => applyBuyerReplyUpdates(item.reply.id, updates))}>
          {pending ? "Applying..." : "Apply to Buyers List"}
        </button>
        <button className={secondary} disabled={pending} onClick={() => start(() => dismissReply(item.reply.id))}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Orders follow-up replies: a note, "shipped" (greys the order out) or "moving to tomorrow".
function OrderReviewCard({ item }: { item: ReviewItem }) {
  const [pending, start] = useTransition();
  const [updates, setUpdates] = useState<ProposedOrderUpdate[]>(item.reply.proposed as unknown as ProposedOrderUpdate[]);
  const set = (i: number, patch: Partial<ProposedOrderUpdate>) =>
    setUpdates((prev) => prev.map((u, j) => (j === i ? { ...u, ...patch } : u)));

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

      {updates.map((u, i) => (
        <div key={i} className={`space-y-1 rounded border p-2 text-xs ${u.confident ? "border-black/10 dark:border-white/10" : "border-amber-400"}`}>
          <p className="font-semibold">
            #{u.order_number}: {item.loadLabels[u.order_id] ?? "that order is no longer on the list"}
            {!u.confident && <span className="ml-2 text-amber-600">check this one</span>}
          </p>
          <label className="block">
            Add to the order&apos;s notes
            <input className={field} value={u.note ?? ""} onChange={(e) => set(i, { note: e.target.value || null })} />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <label className={`flex items-center gap-1 font-medium ${u.shipped ? "text-red-600" : ""}`}>
              <input type="checkbox" checked={u.shipped === true} onChange={(e) => set(i, { shipped: e.target.checked ? true : null })} />
              Shipped - grey it out
            </label>
            <label className="flex items-center gap-1 font-medium">
              <input
                type="checkbox"
                checked={u.move_to_tomorrow === true}
                onChange={(e) => set(i, { move_to_tomorrow: e.target.checked ? true : null })}
              />
              Move to tomorrow
            </label>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button className={primary} disabled={pending || updates.length === 0} onClick={() => start(() => applyOrderReplyUpdates(item.reply.id, updates))}>
          {pending ? "Applying..." : "Apply to Orders"}
        </button>
        <button className={secondary} disabled={pending} onClick={() => start(() => dismissReply(item.reply.id))}>
          Dismiss
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

function CustomerEmailRow({ customer }: { customer: CustomerRow }) {
  const [to, setTo] = useState(customer.to);
  const [cc, setCc] = useState(customer.cc);
  const save = () => {
    if (to !== customer.to || cc !== customer.cc) void saveCustomerEmail(customer.name, to, cc);
  };
  return (
    <tr className="border-t border-black/10 first:border-t-0 dark:border-white/10">
      <td className="w-1/4 px-2 py-1 align-top">{customer.name}</td>
      <td className="px-2 py-1">
        <input className={field} value={to} placeholder="receiving@customer.com" onChange={(e) => setTo(e.target.value)} onBlur={save} />
      </td>
      <td className="px-2 py-1">
        <input className={field} value={cc} placeholder="optional CC" onChange={(e) => setCc(e.target.value)} onBlur={save} />
      </td>
    </tr>
  );
}

function CustomerEmails({ customers }: { customers: CustomerRow[] }) {
  const missing = customers.filter((c) => !c.to.trim()).length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-black/60 dark:text-white/60">
        Where each customer&apos;s ETA emails go (the Customer ETA Updates agent). Separate more than one address with commas. Customers come from
        the loads that are pending or on the road.
        {missing > 0 && <span className="ml-1 text-amber-600">{missing} customer{missing === 1 ? "" : "s"} with no email yet - they get nothing.</span>}
      </p>
      {customers.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50">No customers yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 text-left text-xs dark:bg-white/5">
              <tr>
                <th className="px-2 py-1">Customer</th>
                <th className="px-2 py-1">To</th>
                <th className="px-2 py-1">CC</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <CustomerEmailRow key={c.name} customer={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AgentsClient({
  customers,
  status,
  agents,
  drafts,
  reviewItems,
  events,
  carriers,
  roleOptions,
  people,
  orderLabels,
}: {
  status: { outlook: boolean; claude: boolean; scheduler: boolean; mailbox: string | null };
  customers: CustomerRow[];
  agents: Agent[];
  drafts: AgentThread[];
  reviewItems: ReviewItem[];
  events: AgentEvent[];
  carriers: CarrierRow[];
  roleOptions: RoleOption[];
  people: PersonOption[];
  orderLabels: OrderLabelOption[];
}) {
  const [pending, start] = useTransition();
  const [inboxMsg, setInboxMsg] = useState<string | null>(null);
  const agentName = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const [showList, setShowList] = useState(false);
  // Emails to approve and replies to review, counted per agent for the office.
  const waiting: Record<string, number> = {};
  for (const a of agents) waiting[a.id] = drafts.filter((d) => d.agent_id === a.id).length + reviewItems.filter((r) => r.agentKey === a.key).length;

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
          reviewItems.map((item) =>
            item.agentKey === "buyers_list" ? (
              <BuyerReviewCard key={item.reply.id} item={item} />
            ) : item.agentKey === "orders_pending" ? (
              <OrderReviewCard key={item.reply.id} item={item} />
            ) : (
              <ReviewCard key={item.reply.id} item={item} />
            ),
          )
        )}
      </Section>

      <Section title="Emails to approve" count={drafts.length}>
        <p className="text-xs text-black/50 dark:text-white/50">
          Each draft is also emailed to you - reply APPROVE to send it or SKIP to discard it.
        </p>
        {drafts.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">Nothing waiting.</p>
        ) : (
          drafts.map((d) => <DraftCard key={d.id} draft={d} />)
        )}
      </Section>

      <Section title="The office">
        <p className="text-xs text-black/50 dark:text-white/50">
          Your agents at work. Click one to talk to them - ask how they are, what they have been doing, run them, switch them on or off, or open their settings.
        </p>
        <AgentOffice
          agents={agents}
          events={events}
          waiting={waiting}
          renderSettings={(a) => <AgentCard agent={a} roleOptions={roleOptions} people={people} orderLabels={orderLabels} />}
        />
        <button className={secondary} onClick={() => setShowList((v) => !v)}>
          {showList ? "Hide the settings list" : "Show all agents as a settings list"}
        </button>
        {showList && (
          <div className="space-y-3">
            {agents.map((a) => (
              <AgentCard key={a.id} agent={a} roleOptions={roleOptions} people={people} orderLabels={orderLabels} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Carrier emails">
        <CarrierEmails carriers={carriers} />
      </Section>

      <Section title="Customer emails">
        <CustomerEmails customers={customers} />
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
