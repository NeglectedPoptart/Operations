"use server";

import { revalidatePath } from "next/cache";
import { customerKey } from "@/lib/agents/customerKey";
import { createClient } from "@/lib/supabase/server";
import { canOpenPage } from "@/lib/pageAccess";
import { TICK_STATUS_KEY, trackedPass, type TickStatus } from "@/lib/agents/status";
import { applyBuyersReply, applyOrdersReply, applyReply, pollInbox, runAgents, sendThread } from "@/lib/agents/run";
import type { AgentMode, ProposedBuyerUpdate, ProposedLoadUpdate, ProposedOrderUpdate, ReplyAttachment } from "@/lib/agents/types";

// middleware.ts already locks /supreme to the owner account; checked again
// here since these actions can send email on the company's behalf.
async function ownerClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await canOpenPage(supabase, user, "/submanagement/agents"))) throw new Error("Not allowed.");
  return supabase;
}

function revalidateAll() {
  revalidatePath("/submanagement/agents");
  revalidatePath("/logistics/board");
  revalidatePath("/logistics");
}

export async function updateAgent(
  id: string,
  patch: {
    enabled?: boolean;
    mode?: AgentMode;
    interval_hours?: number;
    active_start_hour?: number;
    active_end_hour?: number;
    recipients?: string[];
    recipient_roles?: string[];
    order_labels?: string[];
    read_replies?: boolean;
    auto_apply_replies?: boolean;
    reply_to?: string[];
    send_times?: string[];
    window_start?: string;
    window_end?: string;
    on_carrier_reply?: boolean;
    delivered_emails?: boolean;
    lanes?: string[];
    test_to?: string[];
    repeat_minutes?: number;
  },
) {
  const supabase = await ownerClient();
  const { recipients, recipient_roles, order_labels, read_replies, auto_apply_replies, reply_to, send_times, window_start, window_end, on_carrier_reply, delivered_emails, lanes, test_to, repeat_minutes, ...columns } = patch;
  const update: Record<string, unknown> = { ...columns };
  const configPatch = Object.fromEntries(
    Object.entries({ recipients, recipient_roles, order_labels, read_replies, auto_apply_replies, reply_to, send_times, window_start, window_end, on_carrier_reply, delivered_emails, lanes, test_to, repeat_minutes }).filter(
      ([, v]) => v !== undefined,
    ),
  );
  if (Object.keys(configPatch).length > 0) {
    const { data: agent } = await supabase.from("agents").select("config").eq("id", id).single();
    update.config = { ...(agent?.config ?? {}), ...configPatch };
  }
  const { error } = await supabase.from("agents").update(update).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function runAgentNow(id: string) {
  const supabase = await ownerClient();
  const result = await runAgents(supabase, { agentId: id, ignoreHours: true });
  revalidateAll();
  return result;
}

export async function checkInboxNow() {
  const supabase = await ownerClient();
  const result = await trackedPass(supabase, "button", (step) => pollInbox(supabase, step));
  revalidateAll();
  return result;
}

// "Check now": the same pass the 15-minute timer does (read the HOP@ inbox, then run whichever scheduled agents are
// due), started on demand. Shows on the live status card like any other pass.
export async function forceCheckNow(): Promise<{ ok: true; seen: number; handled: number; left: number; created: number } | { error: string }> {
  const supabase = await ownerClient();
  const { data: row } = await supabase.from("agent_state").select("value").eq("key", TICK_STATUS_KEY).maybeSingle();
  try {
    const current = row?.value ? (JSON.parse(row.value as string) as TickStatus) : null;
    if (current?.state === "running" && Date.now() - new Date(current.startedAt).getTime() < 90_000) return { error: "A check is already running - watch it on the card." };
  } catch {
    // an unreadable status is treated as not running
  }
  try {
    const result = await trackedPass(supabase, "button", async (step) => {
      const inbox = await pollInbox(supabase, step);
      await step("Running the scheduled agents (ETA follow-ups, price sheets, statements)");
      const run = await runAgents(supabase);
      return { processed: inbox.processed, seen: inbox.seen, left: inbox.left, created: run.created };
    });
    revalidateAll();
    return { ok: true, seen: result.seen, handled: result.processed, left: result.left, created: result.created };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The check failed." };
  }
}

export async function approveDraft(threadId: string, edits: { to: string[]; subject: string; body: string }) {
  const supabase = await ownerClient();
  const { error } = await supabase
    .from("agent_threads")
    .update({ to_emails: edits.to, subject: edits.subject, body: edits.body })
    .eq("id", threadId);
  if (error) throw new Error(error.message);
  await sendThread(supabase, threadId);
  // sendThread records a refused or failed send on the thread rather than throwing - report it.
  const { data: after } = await supabase.from("agent_threads").select("status, error").eq("id", threadId).maybeSingle();
  revalidateAll();
  if (after?.status === "failed") return { error: (after.error as string | null) ?? "The email could not be sent." };
  return { sent: true as const };
}

export async function discardDraft(threadId: string) {
  const supabase = await ownerClient();
  const { error } = await supabase.from("agent_threads").update({ status: "discarded" }).eq("id", threadId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

export async function applyReplyUpdates(replyId: string, updates: ProposedLoadUpdate[], attachments: ReplyAttachment[]) {
  const supabase = await ownerClient();
  await applyReply(supabase, replyId, updates, "applied", attachments);
  revalidateAll();
}

export async function applyBuyerReplyUpdates(replyId: string, updates: ProposedBuyerUpdate[]) {
  const supabase = await ownerClient();
  await applyBuyersReply(supabase, replyId, updates, "applied");
  revalidateAll();
  revalidatePath("/buyers/buyers-list");
}

export async function dismissReply(replyId: string) {
  const supabase = await ownerClient();
  const { error } = await supabase.from("agent_replies").update({ status: "dismissed" }).eq("id", replyId);
  if (error) throw new Error(error.message);
  revalidateAll();
}

// Where a customer's ETA emails go (To / CC, comma-separated). Customers are matched to loads by name.
export async function saveCustomerEmail(name: string, toEmails: string, ccEmails: string) {
  const supabase = await ownerClient();
  const key = customerKey(name);
  if (!key) throw new Error("Customer name is missing.");
  const { error } = await supabase.from("customer_emails").upsert(
    { name, name_key: key, to_emails: toEmails.trim() || null, cc_emails: ccEmails.trim() || null, updated_at: new Date().toISOString() },
    { onConflict: "name_key" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/submanagement/agents");
}

export async function saveCarrierEmail(brokerId: string, email: string) {
  const supabase = await ownerClient();
  const { error } = await supabase
    .from("brokers")
    .update({ followup_email: email.trim() === "" ? null : email.trim() })
    .eq("id", brokerId);
  if (error) throw new Error(error.message);
  revalidatePath("/submanagement/agents");
}

export async function applyOrderReplyUpdates(replyId: string, updates: ProposedOrderUpdate[]) {
  const supabase = await ownerClient();
  await applyOrdersReply(supabase, replyId, updates, "applied");
  revalidateAll();
  revalidatePath("/warehouse/orders");
}
