import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { APP_TIMEZONE, addDays, todayISO } from "@/lib/dates";
import { sendPushToTokens } from "@/lib/push";
import { SUPREME_EMAIL } from "@/lib/roles";
import type { Load } from "@/lib/types";
import {
  agentMailbox,
  graphConfigured,
  listAttachments,
  listInboxSince,
  markRead,
  sendEmail,
  type InboxMessage,
} from "./graph";
import { claudeConfigured, parseBuyersReply, parseReply, verifyPod } from "./parseReply";
import { currentSlot, inWindow } from "./slots";
import type {
  Agent,
  AgentReply,
  AgentThread,
  ProposedBuyerUpdate,
  ProposedLoadUpdate,
  ReplyAttachment,
} from "./types";
import type { BuyersListItem } from "@/lib/types";

// The HOPS Agents engine. Everything here takes the Supabase client as a
// parameter so the same code runs from the Agents page (the signed-in
// user's client) and from the scheduled tick (service-role client, no
// session).

export function serviceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function setupStatus() {
  return {
    outlook: graphConfigured(),
    claude: claudeConfigured(),
    scheduler: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.AGENT_CRON_SECRET),
    mailbox: process.env.HOPS_AGENT_MAILBOX ?? null,
  };
}

// Graph, Claude and the Vercel function all have time limits; a tick does
// a bounded amount of work and leaves the rest for the next one.
const MAX_NEW_THREADS_PER_RUN = 10;
const MAX_REPLIES_PER_POLL = 5;

// ---------------------------------------------------------------------------
// Helpers

async function logEvent(db: SupabaseClient, agentId: string | null, kind: string, message: string, threadId?: string) {
  await db.from("agent_events").insert({ agent_id: agentId, thread_id: threadId ?? null, kind, message });
}

async function notifyOwner(db: SupabaseClient, title: string, body: string) {
  const { data: owner } = await db.from("profiles").select("id").eq("email", SUPREME_EMAIL).maybeSingle();
  if (!owner) return;
  const { data: tokens } = await db.from("push_tokens").select("token").eq("user_id", owner.id);
  await sendPushToTokens(
    (tokens ?? []).map((t) => t.token as string),
    title,
    body,
    { pagePath: "/submanagement/agents" },
  );
}

function newTag(): string {
  return `HOPS-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function currentHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()),
  );
}

function withinActiveHours(agent: Agent): boolean {
  const hour = currentHour();
  return hour >= agent.active_start_hour && hour < agent.active_end_hour;
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function shortDate(iso: string | null): string {
  if (!iso) return "no date";
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function splitEmails(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

function stopLines(load: Load): string[] {
  return [...(load.load_stops ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const place = [s.client_name, [s.destination_city, s.destination_state].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" - ");
      const refs = [s.po_number && `PO ${s.po_number}`, s.order_number && `Order ${s.order_number}`].filter(Boolean).join(", ");
      const when = [s.delivery_date && `deliver ${shortDate(s.delivery_date)}`, s.delivery_time, s.appointment && `appt ${s.appointment}`]
        .filter(Boolean)
        .join(" ");
      return [place || "Stop", refs && `(${refs})`, when].filter(Boolean).join(" ");
    });
}

function loadHeadline(load: Load): string {
  const first = [...(load.load_stops ?? [])].sort((a, b) => a.position - b.position)[0];
  const dest = first ? [first.client_name, first.destination_city, first.destination_state].filter(Boolean).join(" ") : "";
  const po = first?.po_number ? `PO ${first.po_number}` : "";
  return [po, dest].filter(Boolean).join(" / ") || `Load loading ${shortDate(load.loading_date)}`;
}

// ---------------------------------------------------------------------------
// Email content. Templates rather than Claude-written: the ask is always
// the same, and a fixed format keeps replies predictable to read back.

// Whether confident replies are applied to HOPS without a person reviewing them.
function appliesRepliesAutomatically(agent: Agent): boolean {
  return agent.config.auto_apply_replies ?? agent.mode === "auto";
}

function readsReplies(agent: Agent): boolean {
  return agent.config.read_replies !== false;
}

function carrierUpdateEmail(
  carrier: string,
  loads: Load[],
  tag: string,
  readReplies: boolean,
): { subject: string; body: string } {
  const lines = [
    `Hi ${carrier},`,
    "",
    loads.length === 1
      ? "Can you send us a current location and ETA for this load? If it has already been delivered, please say so and attach the signed proof of delivery (POD)."
      : "Can you send us a current location and ETA for each load below? If one has already been delivered, please say so and attach the signed proof of delivery (POD).",
    "",
    ...loads.flatMap((load, i) => [
      `${i + 1}) Loaded ${shortDate(load.loading_date)}${load.source ? ` from ${load.source}` : ""}`,
      ...stopLines(load).map((l, j) => `     Stop ${j + 1}: ${l}`),
      ...(load.pod_pending
        ? ["     ** You told us this one is delivered - we still need the signed POD. Please attach it. **"]
        : []),
    ]),
    "",
    readReplies
      ? loads.length === 1
        ? "Just reply to this email - your answer goes straight into our system."
        : 'Just reply to this email, by number - e.g. "1 - Amarillo, ETA tomorrow 6am. 2 - delivered, POD attached." Your answer goes straight into our system.'
      : "Just reply to this email with an update.",
    "",
    "Thanks,",
    "Harvest Best Logistics",
  ];
  const subject =
    loads.length === 1 ? `ETA update - ${loadHeadline(loads[0])} [${tag}]` : `ETA update - ${loads.length} loads [${tag}]`;
  return { subject, body: lines.join("\n") };
}

function pendingDigestEmail(loads: Load[], tag: string, readReplies: boolean): { subject: string; body: string } {
  const lines = [
    "Status check on loads still Pending to Load in HOPS:",
    "",
    ...loads.flatMap((load, i) => [
      `${i + 1}) Loading ${shortDate(load.loading_date)}${load.source ? ` from ${load.source}` : ""}` +
        ` - carrier: ${load.brokers?.name ?? "none assigned"} - ${load.ready_to_load ? "marked READY" : "not marked ready"}`,
      ...stopLines(load).map((l) => `     ${l}`),
      load.notes ? `     Notes: ${load.notes.replace(/\s+/g, " ").slice(0, 160)}` : "",
    ]).filter((l) => l !== ""),
    "",
    readReplies
      ? 'Reply with an update on any of these by number, e.g. "2 - loading at 3pm" or "1 left the dock". HOPS will be updated from your reply.'
      : "Please update these loads in HOPS, or reply with an update by number.",
    "",
    "- HOPS Agent",
  ];
  return {
    subject: `Pending to Load check - ${loads.length} load${loads.length === 1 ? "" : "s"} [${tag}]`,
    body: lines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Outgoing

export async function sendThread(db: SupabaseClient, threadId: string): Promise<void> {
  const { data: thread, error } = await db.from("agent_threads").select("*").eq("id", threadId).single<AgentThread>();
  if (error || !thread) throw new Error(error?.message ?? "Thread not found.");
  if (thread.status !== "draft" && thread.status !== "failed") return;
  const { data: agent } = await db
    .from("agents")
    .select("key, config")
    .eq("id", thread.agent_id)
    .single<Pick<Agent, "key" | "config">>();

  // Hard rule for carrier emails: nothing goes out overnight, whether a
  // person approves it late or a retry fires.
  if (agent?.key === "load_eta" && !inWindow(new Date(), agent.config)) {
    const start = agent.config.window_start ?? "05:00";
    const end = agent.config.window_end ?? "21:30";
    await db
      .from("agent_threads")
      .update({ status: "failed", error: `Carrier emails only go out between ${start} and ${end} Central - retry then.` })
      .eq("id", thread.id);
    return;
  }

  try {
    const sent = await sendEmail({
      to: thread.to_emails,
      replyTo: agent?.config.reply_to,
      subject: thread.subject,
      body: thread.body,
    });
    await db
      .from("agent_threads")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        graph_message_id: sent.messageId,
        conversation_id: sent.conversationId,
        error: null,
      })
      .eq("id", thread.id);
    await logEvent(db, thread.agent_id, "sent", `Sent "${thread.subject}" to ${thread.to_emails.join(", ")}`, thread.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("agent_threads").update({ status: "failed", error: message }).eq("id", thread.id);
    await logEvent(db, thread.agent_id, "error", `Send failed for "${thread.subject}": ${message}`, thread.id);
  }
}

async function createThread(
  db: SupabaseClient,
  agent: Agent,
  input: { tag: string; recordIds: string[]; to: string[]; subject: string; body: string },
): Promise<AgentThread> {
  const { data, error } = await db
    .from("agent_threads")
    .insert({
      agent_id: agent.id,
      tag: input.tag,
      record_ids: input.recordIds,
      to_emails: input.to,
      subject: input.subject,
      body: input.body,
      status: "draft",
    })
    .select()
    .single<AgentThread>();
  if (error || !data) throw new Error(error?.message ?? "Failed to create thread.");
  return data;
}

async function recentThreads(db: SupabaseClient, agentId: string): Promise<AgentThread[]> {
  const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const { data } = await db
    .from("agent_threads")
    .select("*")
    .eq("agent_id", agentId)
    .in("status", ["draft", "sent", "replied", "no_reply"])
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  return (data ?? []) as AgentThread[];
}

// One email per carrier per send slot, covering all of that carrier's On the
// Road loads, numbered so a reply can answer by number. force (Run now)
// ignores the clock and the slot, but never stacks a second draft.
async function runLoadEta(db: SupabaseClient, agent: Agent, force: boolean): Promise<number> {
  const slot = force ? null : currentSlot(new Date(), agent.config);
  if (!force && !slot) return 0;

  const { data: loads, error } = await db
    .from("loads")
    .select("*, brokers(*), load_stops(*)")
    .eq("status", "on_the_road")
    .order("loading_date", { ascending: true });
  if (error) throw new Error(error.message);

  type CarrierLoad = Load & { brokers: (Load["brokers"] & { followup_email?: string | null }) | null };
  const byCarrier = new Map<string, CarrierLoad[]>();
  for (const load of (loads ?? []) as CarrierLoad[]) {
    // Someone updated the load by hand this slot - no need to ask. A load
    // waiting on its POD is always asked.
    if (slot && !load.pod_pending && new Date(load.updated_at) >= slot) continue;
    const key = load.broker_id ?? "none";
    byCarrier.set(key, [...(byCarrier.get(key) ?? []), load]);
  }

  const threads = await recentThreads(db, agent.id);
  const missingEmail = new Set<string>();
  let created = 0;

  for (const carrierLoads of byCarrier.values()) {
    if (created >= MAX_NEW_THREADS_PER_RUN) break;
    const carrier = carrierLoads[0].brokers;
    const to = splitEmails(carrier?.followup_email);
    if (to.length === 0) {
      missingEmail.add(carrier?.name ?? "No carrier assigned");
      continue;
    }

    const mine = threads.filter((t) => t.to_emails.join(",") === to.join(","));
    // Already emailed (or drafted) this slot.
    if (slot && mine.some((t) => new Date(t.created_at) >= slot)) continue;
    const draft = mine.find((t) => t.status === "draft");
    if (draft) {
      if (force) continue;
      // A draft nobody approved before the next slot is stale - the new
      // email replaces it.
      await db.from("agent_threads").update({ status: "discarded" }).eq("id", draft.id);
      await logEvent(db, agent.id, "discarded", `Replaced unsent draft "${draft.subject}" with the new slot's email`, draft.id);
    }
    for (const t of mine) {
      if (t.status === "sent") await db.from("agent_threads").update({ status: "no_reply" }).eq("id", t.id);
    }

    const tag = newTag();
    const email = carrierUpdateEmail(carrier?.name ?? "team", carrierLoads, tag, readsReplies(agent));
    const thread = await createThread(db, agent, { tag, recordIds: carrierLoads.map((l) => l.id), to, ...email });
    created++;
    if (agent.mode === "auto") await sendThread(db, thread.id);
    else await draftCreated(db, agent, thread);
  }

  if (missingEmail.size > 0) {
    // Every 15-minute tick of the slot would otherwise repeat this.
    const message = `No follow-up email on file for: ${[...missingEmail].join(", ")}. Add one under Carrier Emails.`;
    const since = new Date(Date.now() - 6 * 3_600_000).toISOString();
    const { data: already } = await db
      .from("agent_events")
      .select("id")
      .eq("agent_id", agent.id)
      .eq("kind", "skipped")
      .eq("message", message)
      .gte("created_at", since)
      .limit(1);
    if (!already || already.length === 0) await logEvent(db, agent.id, "skipped", message);
  }
  return created;
}

// The Buyers List, numbered, to the buyers. One email per send slot.
function buyersListEmail(
  items: BuyersListItem[],
  tag: string,
  readReplies: boolean,
): { subject: string; body: string } {
  const lines = [
    "Here is the current Buyers List - these are the lines we still need to buy.",
    "",
    ...items.map((item, i) => {
      const what = [item.comm, item.variety, item.pstyle, item.size, item.label].filter(Boolean).join(" - ");
      const extra = [
        `need ${item.qty_needed.toLocaleString()}`,
        item.whse && `whse ${item.whse}`,
        item.notes && `notes: ${item.notes.replace(/\s+/g, " ").slice(0, 120)}`,
      ]
        .filter(Boolean)
        .join(" | ");
      return `${i + 1}) ${what}  (${extra})`;
    }),
    "",
    readReplies
      ? 'Please reply with an update on each line by number, e.g. "1 - quote pending from Rio Farms, call Thurs. 2 - purchased. 3 - bought half, still need 200." HOPS reads your reply: your update goes into that line\'s notes, and a line you say is purchased is taken off the list.'
      : "Please reply with an update on each line by number.",
    "",
    "- HOPS Agent",
  ];
  return {
    subject: `Buyers List update - ${items.length} line${items.length === 1 ? "" : "s"} [${tag}]`,
    body: lines.join("\n"),
  };
}

async function runBuyersList(db: SupabaseClient, agent: Agent, force: boolean): Promise<number> {
  const slot = force ? null : currentSlot(new Date(), agent.config);
  if (!force && !slot) return 0;

  const { data: items, error } = await db.from("buyers_list_items").select("*").order("position", { ascending: true });
  if (error) throw new Error(error.message);
  if (!items || items.length === 0) return 0;

  const to = await operationsRecipients(db, agent);
  if (to.length === 0) {
    await logEvent(db, agent.id, "skipped", "No recipients set for the Buyers List agent.");
    return 0;
  }

  const threads = await recentThreads(db, agent.id);
  if (slot && threads.some((t) => new Date(t.created_at) >= slot)) return 0; // already this slot
  const draft = threads.find((t) => t.status === "draft");
  if (draft) {
    if (force) return 0;
    await db.from("agent_threads").update({ status: "discarded" }).eq("id", draft.id);
    await logEvent(db, agent.id, "discarded", `Replaced unsent draft "${draft.subject}" with the new slot's email`, draft.id);
  }
  for (const t of threads) {
    if (t.status === "sent") await db.from("agent_threads").update({ status: "no_reply" }).eq("id", t.id);
  }

  const tag = newTag();
  const email = buyersListEmail(items as BuyersListItem[], tag, readsReplies(agent));
  const thread = await createThread(db, agent, { tag, recordIds: (items as BuyersListItem[]).map((i) => i.id), to, ...email });
  if (agent.mode === "auto") await sendThread(db, thread.id);
  else await draftCreated(db, agent, thread);
  return 1;
}

// ---------------------------------------------------------------------------
// Approve by email. A draft waiting for approval is also emailed to the
// owner; replying APPROVE sends it, SKIP throws it away (see
// handleApprovalReply). The Agents page keeps working as the fallback.

async function draftCreated(db: SupabaseClient, agent: Agent, thread: AgentThread): Promise<void> {
  await logEvent(db, agent.id, "draft", `Drafted "${thread.subject}" - waiting for approval`, thread.id);
  if (!graphConfigured()) return;
  try {
    await sendEmail({
      to: [SUPREME_EMAIL],
      // Carries the draft's [HOPS-XXXXXX] tag, which is how the reply is matched back to it.
      subject: `Approve? ${thread.subject}`,
      body: [
        "This email is ready to go out. Nothing is sent until you reply.",
        "",
        "Reply APPROVE to send it as written, or SKIP to throw it away.",
        "",
        `To: ${thread.to_emails.join(", ")}`,
        `Subject: ${thread.subject}`,
        "----------------------------------------",
        thread.body,
      ].join("\n"),
    });
  } catch (err) {
    await logEvent(db, agent.id, "error", `Couldn't email the approval request: ${err instanceof Error ? err.message : String(err)}`, thread.id);
  }
}

async function operationsRecipients(db: SupabaseClient, agent: Agent): Promise<string[]> {
  if (agent.config.recipients && agent.config.recipients.length > 0) return agent.config.recipients;
  const { data } = await db.from("profiles").select("email").eq("role", "operations");
  return (data ?? []).map((p) => (p.email as string | null) ?? "").filter((e) => e.includes("@"));
}

async function runLoadPending(db: SupabaseClient, agent: Agent): Promise<number> {
  const threads = await recentThreads(db, agent.id);
  const last = threads[0];
  if (last?.status === "draft") return 0;
  if (last && hoursSince(last.created_at) < agent.interval_hours) return 0;

  const through = addDays(todayISO(), agent.config.days_ahead ?? 1);
  const { data: loads, error } = await db
    .from("loads")
    .select("*, brokers(*), load_stops(*)")
    .eq("status", "pending_to_load")
    .or(`loading_date.is.null,loading_date.lte.${through}`)
    .order("loading_date", { ascending: true });
  if (error) throw new Error(error.message);
  if (!loads || loads.length === 0) return 0;

  const to = await operationsRecipients(db, agent);
  if (to.length === 0) {
    await logEvent(db, agent.id, "skipped", "No Operations recipients - no Operations-role logins have an email, and none are set on the agent.");
    return 0;
  }

  if (last?.status === "sent") await db.from("agent_threads").update({ status: "no_reply" }).eq("id", last.id);

  const tag = newTag();
  const email = pendingDigestEmail(loads as Load[], tag, readsReplies(agent));
  const thread = await createThread(db, agent, { tag, recordIds: (loads as Load[]).map((l) => l.id), to, ...email });
  if (agent.mode === "auto") await sendThread(db, thread.id);
  else await draftCreated(db, agent, thread);
  return 1;
}

export async function runAgents(
  db: SupabaseClient,
  opts: { agentId?: string; ignoreHours?: boolean } = {},
): Promise<{ created: number; skipped: string[] }> {
  let query = db.from("agents").select("*");
  query = opts.agentId ? query.eq("id", opts.agentId) : query.eq("enabled", true);
  const { data: agents, error } = await query;
  if (error) throw new Error(error.message);

  let created = 0;
  const skipped: string[] = [];
  for (const agent of (agents ?? []) as Agent[]) {
    if (agent.key !== "load_eta" && agent.key !== "buyers_list" && !opts.ignoreHours && !withinActiveHours(agent)) {
      skipped.push(`${agent.name}: outside ${agent.active_start_hour}:00-${agent.active_end_hour}:00`);
      continue;
    }
    try {
      if (agent.key === "load_eta") created += await runLoadEta(db, agent, opts.ignoreHours === true);
      else if (agent.key === "load_pending") created += await runLoadPending(db, agent);
      else if (agent.key === "buyers_list") created += await runBuyersList(db, agent, opts.ignoreHours === true);
      await db.from("agents").update({ last_run_at: new Date().toISOString() }).eq("id", agent.id);
    } catch (err) {
      await logEvent(db, agent.id, "error", `Run failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (created > 0 && (agents ?? []).some((a) => (a as Agent).mode === "approve")) {
    await notifyOwner(db, "HOPS Agents", `${created} follow-up email${created === 1 ? "" : "s"} ready to review.`);
  }
  return { created, skipped };
}

// ---------------------------------------------------------------------------
// Incoming

const TAG_RE = /\[(HOPS-[0-9A-F]{6})\]/i;

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
}

async function storeAttachments(db: SupabaseClient, messageId: string, thread: AgentThread): Promise<ReplyAttachment[]> {
  const files = await listAttachments(messageId);
  if (files.length === 0) return [];

  const { data: loads } = await db.from("loads").select("*, load_stops(*)").in("id", thread.record_ids);
  const byId = new Map(((loads ?? []) as Load[]).map((l) => [l.id, l]));
  const numbered = thread.record_ids.map((id, i) => {
    const load = byId.get(id);
    return {
      number: i + 1,
      description: load ? [loadHeadline(load), ...stopLines(load)].join(" | ") : "unknown load",
    };
  });

  const out: ReplyAttachment[] = [];
  for (const file of files) {
    const base = {
      file_name: file.fileName,
      storage_path: `email/${thread.id}/${crypto.randomUUID()}-${safeFileName(file.fileName)}`,
      content_type: file.contentType,
      size_bytes: file.data.length,
    };
    const { error: uploadError } = await db.storage
      .from("load-documents")
      .upload(base.storage_path, file.data, { contentType: file.contentType });
    if (uploadError) {
      out.push({ ...base, storage_path: "", is_pod: false, load_number: null, load_id: null, confident: false, note: `Could not save the file: ${uploadError.message}` });
      continue;
    }

    if (!claudeConfigured()) {
      out.push({ ...base, is_pod: false, load_number: null, load_id: null, confident: false, note: "Claude isn't set up - check this file by hand." });
      continue;
    }
    try {
      const verdict = await verifyPod({ data: file.data, contentType: file.contentType, loads: numbered });
      const loadId = verdict.load_number ? (thread.record_ids[verdict.load_number - 1] ?? null) : null;
      out.push({
        ...base,
        is_pod: verdict.is_pod,
        load_number: loadId ? verdict.load_number : null,
        load_id: loadId,
        // A file that isn't a POD needs no review; one that is must be matched.
        confident: verdict.is_pod ? verdict.confident && loadId !== null : true,
        note: verdict.note,
      });
    } catch (err) {
      out.push({
        ...base,
        is_pod: false,
        load_number: null,
        load_id: null,
        confident: false,
        note: `Could not read this file: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return out;
}

// A POD proves delivery even when the email text never says "delivered" (or
// has no text at all), so every matched POD gets an update of its own.
function withPodUpdates(proposed: ProposedLoadUpdate[], attachments: ReplyAttachment[]): ProposedLoadUpdate[] {
  const out = proposed.map((u) => ({ ...u }));
  for (const a of attachments) {
    if (!a.is_pod || !a.load_id || !a.load_number) continue;
    const existing = out.find((u) => u.load_id === a.load_id);
    if (existing) {
      existing.delivered = true;
    } else {
      out.push({
        load_id: a.load_id,
        load_number: a.load_number,
        eta_note: null,
        append_note: null,
        ready_to_load: null,
        new_status: null,
        delivered: true,
        confident: a.confident,
      });
    }
  }
  return out;
}

export async function pollInbox(db: SupabaseClient): Promise<{ processed: number }> {
  if (!graphConfigured()) return { processed: 0 };
  const started = Date.now();

  const { data: state } = await db.from("agent_state").select("value").eq("key", "inbox_cursor").maybeSingle();
  const since = (state?.value as string | null) ?? new Date(Date.now() - 24 * 3_600_000).toISOString();
  const mailbox = agentMailbox().toLowerCase();

  const messages = await listInboxSince(since, 25);
  let cursor = since;
  let processed = 0;

  for (const msg of messages) {
    if (processed >= MAX_REPLIES_PER_POLL || Date.now() - started > 40_000) break;
    cursor = msg.receivedAt;
    if (msg.fromEmail === mailbox) continue;

    const { data: existing } = await db.from("agent_replies").select("id").eq("graph_message_id", msg.id).maybeSingle();
    if (existing) continue;

    let { data: thread } = await db
      .from("agent_threads")
      .select("*")
      .eq("conversation_id", msg.conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<AgentThread>();
    if (!thread) {
      const tag = msg.subject.match(TAG_RE)?.[1]?.toUpperCase();
      if (tag) ({ data: thread } = await db.from("agent_threads").select("*").eq("tag", tag).maybeSingle<AgentThread>());
    }
    if (!thread) continue; // not a reply to an agent email - left unread for a person

    // The owner answering an "Approve?" email - never a carrier/buyer reply.
    if (msg.fromEmail === SUPREME_EMAIL.toLowerCase() && /approve\?/i.test(msg.subject)) {
      processed++;
      await handleApprovalReply(db, thread, msg).catch(async (err) => {
        await logEvent(db, thread!.agent_id, "error", `Approval reply failed: ${err instanceof Error ? err.message : String(err)}`, thread!.id);
      });
      await markRead(msg.id).catch(() => {});
      continue;
    }

    const { data: agent } = await db.from("agents").select("*").eq("id", thread.agent_id).single<Agent>();
    // Notify-only agent - the reply stays unread in the mailbox for a person.
    if (agent && !readsReplies(agent)) continue;
    processed++;

    if (agent?.key === "buyers_list") {
      await handleBuyersReply(db, agent, thread, msg);
      continue;
    }

    let summary: string | null = null;
    let proposed: ProposedLoadUpdate[] = [];
    let parseError: string | null = null;
    if (!claudeConfigured()) {
      parseError = "Claude isn't set up (ANTHROPIC_API_KEY) - read and apply this one by hand.";
    } else {
      try {
        const result = await parseReply({
          agentKey: agent?.key ?? "",
          originalBody: thread.body,
          replyText: msg.text,
          loadCount: thread.record_ids.length,
        });
        summary = result.summary;
        proposed = result.updates.map((u) => {
          const loadId = thread!.record_ids[u.load_number - 1] ?? "";
          return { ...u, load_id: loadId, confident: u.confident && loadId !== "" };
        });
      } catch (err) {
        parseError = err instanceof Error ? err.message : String(err);
      }
    }

    // Carrier files (the signed POD): stored on the load, each one read by
    // Claude to see whether it really is a POD and which load it belongs to.
    let attachments: ReplyAttachment[] = [];
    if (msg.hasAttachments && agent?.key === "load_eta") {
      try {
        attachments = await storeAttachments(db, msg.id, thread);
        proposed = withPodUpdates(proposed, attachments);
      } catch (err) {
        parseError = parseError ?? `Could not read the attachments: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const { data: reply, error: insertError } = await db
      .from("agent_replies")
      .insert({
        thread_id: thread.id,
        graph_message_id: msg.id,
        from_email: msg.fromEmail,
        received_at: msg.receivedAt,
        body_text: msg.text,
        summary,
        proposed,
        attachments,
        error: parseError,
        status: !parseError && proposed.length === 0 ? "no_update" : "pending_review",
      })
      .select()
      .single<AgentReply>();
    if (insertError || !reply) continue;

    await db.from("agent_threads").update({ status: "replied", last_reply_at: msg.receivedAt }).eq("id", thread.id);
    await markRead(msg.id).catch(() => {});

    const podsOk = attachments.every((a) => !a.is_pod || (a.confident && a.load_id !== null));
    const autoOk =
      !!agent &&
      appliesRepliesAutomatically(agent) &&
      !parseError &&
      proposed.length > 0 &&
      podsOk &&
      proposed.every((u) => u.confident && !u.new_status);
    if (autoOk) {
      await applyReply(db, reply.id, proposed, "auto_applied");
    } else if (reply.status === "pending_review") {
      await logEvent(db, thread.agent_id, "reply", `Reply from ${msg.fromEmail} needs review: ${summary ?? parseError}`, thread.id);
      await notifyOwner(db, "HOPS Agents", `Reply to review: ${summary ?? msg.subject}`);
    } else {
      await logEvent(db, thread.agent_id, "reply", `Reply from ${msg.fromEmail} had no load updates: ${summary ?? ""}`, thread.id);
    }
  }

  if (messages.length > 0) {
    await db.from("agent_state").upsert({ key: "inbox_cursor", value: cursor, updated_at: new Date().toISOString() });
  }
  return { processed };
}

// Writes a reply's updates to the loads. A load only goes Complete when a POD
// is attached to it (attachments with is_pod + a load_id - in auto mode only
// ones Claude was confident about, in Review whatever the owner left ticked).
// "Delivered" with no POD raises the Pending POD flag instead and the load
// stays On the Road.
async function tellOwner(subject: string, body: string): Promise<void> {
  // No [HOPS-...] tag in these, so a reply to one is never mistaken for a carrier reply.
  await sendEmail({ to: [SUPREME_EMAIL], subject, body }).catch(() => {});
}

async function handleApprovalReply(db: SupabaseClient, thread: AgentThread, msg: InboxMessage): Promise<void> {
  const plainSubject = thread.subject.replace(TAG_RE, "").trim();
  const answer = msg.text.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 100);
  const approve = /^(approve|approved|yes|y|ok|okay|send|go)\b/.test(answer);
  const skip = /^(skip|no|n|cancel|discard|reject|stop)\b/.test(answer);

  if (thread.status !== "draft" && thread.status !== "failed") {
    await tellOwner(
      `Already handled: ${plainSubject}`,
      `That email is already ${thread.status === "discarded" ? "discarded" : "sent"} - nothing more was done.`,
    );
    return;
  }
  if (!approve && !skip) {
    await tellOwner(
      `Couldn't read your answer: ${plainSubject}`,
      "Reply to the approval email with APPROVE to send it or SKIP to discard it. Nothing was sent.",
    );
    return;
  }

  if (skip) {
    await db.from("agent_threads").update({ status: "discarded" }).eq("id", thread.id);
    await logEvent(db, thread.agent_id, "discarded", `Discarded "${thread.subject}" by email`, thread.id);
    await tellOwner(`Discarded: ${plainSubject}`, "Okay - that email was thrown away and not sent.");
    return;
  }

  await sendThread(db, thread.id);
  const { data: after } = await db.from("agent_threads").select("status, error").eq("id", thread.id).single();
  if (after?.status === "sent") {
    await logEvent(db, thread.agent_id, "approved", `Approved by email: "${thread.subject}"`, thread.id);
    await tellOwner(`Sent: ${plainSubject}`, `Sent to ${thread.to_emails.join(", ")}.`);
  } else {
    await tellOwner(
      `Couldn't send: ${plainSubject}`,
      `It wasn't sent: ${after?.error ?? "unknown error"}\n\nReply APPROVE again to retry.`,
    );
  }
}

// Buyers List replies: Claude proposes a note / new quantity / "purchased"
// per numbered line. Same Approve vs Auto rules as the carrier agent, except
// there is nothing to verify - a confident "purchased" removes the line.
async function handleBuyersReply(db: SupabaseClient, agent: Agent, thread: AgentThread, msg: InboxMessage) {
  let summary: string | null = null;
  let proposed: ProposedBuyerUpdate[] = [];
  let parseError: string | null = null;
  if (!claudeConfigured()) {
    parseError = "Claude isn't set up (ANTHROPIC_API_KEY) - read and apply this one by hand.";
  } else {
    try {
      const result = await parseBuyersReply({ originalBody: thread.body, replyText: msg.text });
      summary = result.summary;
      proposed = result.updates.map((u) => {
        const itemId = thread.record_ids[u.item_number - 1] ?? "";
        return { ...u, item_id: itemId, confident: u.confident && itemId !== "" };
      });
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  }

  const { data: reply, error: insertError } = await db
    .from("agent_replies")
    .insert({
      thread_id: thread.id,
      graph_message_id: msg.id,
      from_email: msg.fromEmail,
      received_at: msg.receivedAt,
      body_text: msg.text,
      summary,
      proposed,
      error: parseError,
      status: !parseError && proposed.length === 0 ? "no_update" : "pending_review",
    })
    .select()
    .single<AgentReply>();
  if (insertError || !reply) return;

  // Stays "sent" (not "replied") so the second and third person's replies
  // to the same email are read too.
  await db.from("agent_threads").update({ last_reply_at: msg.receivedAt }).eq("id", thread.id);
  await markRead(msg.id).catch(() => {});

  const autoOk = appliesRepliesAutomatically(agent) && !parseError && proposed.length > 0 && proposed.every((u) => u.confident);
  if (autoOk) {
    await applyBuyersReply(db, reply.id, proposed, "auto_applied");
  } else if (reply.status === "pending_review") {
    await logEvent(db, agent.id, "reply", `Reply from ${msg.fromEmail} needs review: ${summary ?? parseError}`, thread.id);
    await notifyOwner(db, "HOPS Agents", `Buyers List reply to review: ${summary ?? msg.subject}`);
  } else {
    await logEvent(db, agent.id, "reply", `Reply from ${msg.fromEmail} had no list updates: ${summary ?? ""}`, thread.id);
  }
}

export async function applyBuyersReply(
  db: SupabaseClient,
  replyId: string,
  updates: ProposedBuyerUpdate[],
  status: "applied" | "auto_applied" = "applied",
): Promise<void> {
  const { data: reply, error } = await db
    .from("agent_replies")
    .select("*, agent_threads(agent_id)")
    .eq("id", replyId)
    .single<AgentReply & { agent_threads: { agent_id: string } | null }>();
  if (error || !reply) throw new Error(error?.message ?? "Reply not found.");

  const stamp = shortDate(todayISO());
  const applied: string[] = [];
  for (const u of updates) {
    if (!u.item_id) continue;
    const { data: item } = await db.from("buyers_list_items").select("*").eq("id", u.item_id).maybeSingle<BuyersListItem>();
    if (!item) continue; // already removed (or the list was cleared)
    const name = [item.comm, item.variety].filter(Boolean).join(" ") || `line ${u.item_number}`;

    if (u.purchased === true) {
      const { error: deleteError } = await db.from("buyers_list_items").delete().eq("id", u.item_id);
      if (deleteError) throw new Error(deleteError.message);
      applied.push(`${name}: purchased, removed`);
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (u.note) patch.notes = [item.notes, `[Agent ${stamp}] ${u.note}`].filter(Boolean).join("\n");
    if (u.qty_needed !== null && Number.isFinite(u.qty_needed)) patch.qty_needed = u.qty_needed;
    if (Object.keys(patch).length === 0) continue;
    const { error: updateError } = await db.from("buyers_list_items").update(patch).eq("id", u.item_id);
    if (updateError) throw new Error(updateError.message);
    applied.push(`${name}: ${Object.keys(patch).map((k) => (k === "notes" ? "note" : "qty")).join(" + ")}`);
  }

  await db
    .from("agent_replies")
    .update({ status, proposed: updates, applied_at: new Date().toISOString() })
    .eq("id", replyId);
  await logEvent(
    db,
    reply.agent_threads?.agent_id ?? null,
    status,
    `${status === "auto_applied" ? "Auto-applied" : "Applied"} reply from ${reply.from_email}: ${applied.join("; ") || "nothing to change"}`,
    reply.thread_id,
  );
}

export async function applyReply(
  db: SupabaseClient,
  replyId: string,
  updates: ProposedLoadUpdate[],
  status: "applied" | "auto_applied" = "applied",
  attachmentsOverride?: ReplyAttachment[],
): Promise<void> {
  const { data: reply, error } = await db
    .from("agent_replies")
    .select("*, agent_threads(agent_id)")
    .eq("id", replyId)
    .single<AgentReply & { agent_threads: { agent_id: string } | null }>();
  if (error || !reply) throw new Error(error?.message ?? "Reply not found.");

  const attachments = attachmentsOverride ?? reply.attachments ?? [];
  const pods = attachments.filter((a) => a.is_pod && a.load_id && a.storage_path);

  // A POD for a load the reply otherwise says nothing about still counts.
  const work = [...updates];
  for (const a of pods) {
    if (!work.some((u) => u.load_id === a.load_id)) {
      work.push({
        load_id: a.load_id!,
        load_number: a.load_number ?? 0,
        eta_note: null,
        append_note: null,
        ready_to_load: null,
        new_status: null,
        delivered: true,
        confident: true,
      });
    }
  }

  const stamp = shortDate(todayISO());
  const applied: string[] = [];
  for (const u of work) {
    if (!u.load_id) continue;
    const { data: load } = await db.from("loads").select("notes, status").eq("id", u.load_id).single();
    const loadPods = pods.filter((a) => a.load_id === u.load_id);
    const patch: Record<string, unknown> = {};
    if (u.eta_note) patch.eta_note = u.eta_note;
    if (u.append_note) patch.notes = [load?.notes, `[Agent ${stamp}] ${u.append_note}`].filter(Boolean).join("\n");
    if (u.ready_to_load !== null) patch.ready_to_load = u.ready_to_load;
    if (u.new_status) patch.status = u.new_status;

    if (loadPods.length > 0) {
      patch.status = "complete";
      patch.pod_pending = false;
      const { data: have } = await db.from("load_documents").select("storage_path").eq("load_id", u.load_id);
      const haveSet = new Set((have ?? []).map((d) => d.storage_path as string));
      const fresh = loadPods.filter((a) => !haveSet.has(a.storage_path));
      if (fresh.length > 0) {
        const { error: docError } = await db.from("load_documents").insert(
          fresh.map((a) => ({
            load_id: u.load_id,
            kind: "pod",
            file_name: a.file_name,
            storage_path: a.storage_path,
            content_type: a.content_type,
            size_bytes: a.size_bytes,
            source: "email",
          })),
        );
        if (docError) throw new Error(docError.message);
      }
      patch.notes = [patch.notes ?? load?.notes, `[Agent ${stamp}] POD received by email - delivered.`]
        .filter(Boolean)
        .join("\n");
    } else if (u.delivered === true && load?.status !== "complete") {
      patch.pod_pending = true;
      patch.notes = [patch.notes ?? load?.notes, `[Agent ${stamp}] Carrier says delivered - waiting on POD.`]
        .filter(Boolean)
        .join("\n");
    } else if (patch.status === "complete") {
      patch.pod_pending = false;
    }

    if (Object.keys(patch).length === 0) continue;
    const { error: updateError } = await db.from("loads").update(patch).eq("id", u.load_id);
    if (updateError) throw new Error(updateError.message);
    const changes = Object.keys(patch).filter((k) => k !== "notes" || u.append_note);
    applied.push(`load #${u.load_number}: ${loadPods.length > 0 ? "POD received, Complete" : changes.join(", ")}`);
  }

  await db
    .from("agent_replies")
    .update({ status, proposed: updates, attachments, applied_at: new Date().toISOString() })
    .eq("id", replyId);
  await logEvent(
    db,
    reply.agent_threads?.agent_id ?? null,
    status,
    `${status === "auto_applied" ? "Auto-applied" : "Applied"} reply from ${reply.from_email}: ${applied.join("; ") || "nothing to change"}`,
    reply.thread_id,
  );
}
