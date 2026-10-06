"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSupremeUser } from "@/lib/roles";
import { applyBuyersReply, applyReply, pollInbox, runAgents, sendThread } from "@/lib/agents/run";
import type { AgentMode, ProposedBuyerUpdate, ProposedLoadUpdate, ReplyAttachment } from "@/lib/agents/types";

// middleware.ts already locks /supreme to the owner account; checked again
// here since these actions can send email on the company's behalf.
async function ownerClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isSupremeUser(user?.email ?? null)) throw new Error("Not allowed.");
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
    read_replies?: boolean;
    reply_to?: string[];
    send_times?: string[];
    window_start?: string;
    window_end?: string;
  },
) {
  const supabase = await ownerClient();
  const { recipients, read_replies, reply_to, send_times, window_start, window_end, ...columns } = patch;
  const update: Record<string, unknown> = { ...columns };
  const configPatch = Object.fromEntries(
    Object.entries({ recipients, read_replies, reply_to, send_times, window_start, window_end }).filter(
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
  const result = await pollInbox(supabase);
  revalidateAll();
  return result;
}

export async function approveDraft(threadId: string, edits: { to: string[]; subject: string; body: string }) {
  const supabase = await ownerClient();
  const { error } = await supabase
    .from("agent_threads")
    .update({ to_emails: edits.to, subject: edits.subject, body: edits.body })
    .eq("id", threadId);
  if (error) throw new Error(error.message);
  await sendThread(supabase, threadId);
  revalidateAll();
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

export async function saveCarrierEmail(brokerId: string, email: string) {
  const supabase = await ownerClient();
  const { error } = await supabase
    .from("brokers")
    .update({ followup_email: email.trim() === "" ? null : email.trim() })
    .eq("id", brokerId);
  if (error) throw new Error(error.message);
  revalidatePath("/submanagement/agents");
}
