"use server";

import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { personName } from "@/lib/displayName";
import { sendPushToTokens } from "@/lib/push";
import { channelSlug, MAX_MESSAGE_LENGTH, type ChatAttachment, type ChatConversation } from "@/lib/chat";

const SETUP = "Messages isn't set up yet - run migration 166.";

function explain(message: string): string {
  return /chat_|relation .* does not exist|schema cache/i.test(message) ? SETUP : message;
}

// Sends a message as the signed-in person (row-level security checks they may post there), then pushes a
// phone alert to the other person in a DM, and to anyone @mentioned in a channel.
export async function sendMessage(input: {
  conversationId: string;
  body: string;
  attachments: ChatAttachment[];
  mentions: string[];
}): Promise<{ ok: true } | { error: string }> {
  const body = input.body.trim();
  if (!body && input.attachments.length === 0) return { error: "Type a message or attach a file." };
  if (body.length > MAX_MESSAGE_LENGTH) return { error: `That message is too long (limit ${MAX_MESSAGE_LENGTH} characters).` };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const mentions = [...new Set(input.mentions)].filter((id) => id !== user.id);
  const { error } = await supabase.from("chat_messages").insert({
    conversation_id: input.conversationId,
    user_id: user.id,
    body,
    attachments: input.attachments,
    mentions,
  });
  if (error) return { error: explain(error.message) };

  // Alerts are a bonus - never let one turn a sent message into an error.
  try {
    await notifyOthers(supabase, user, input.conversationId, body, input.attachments.length > 0, mentions);
  } catch (e) {
    console.error("chat push failed", e);
  }
  return { ok: true };
}

async function notifyOthers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string | null },
  conversationId: string,
  body: string,
  hasFiles: boolean,
  mentions: string[],
) {
  const { data: conv } = await supabase.from("chat_conversations").select("kind, name").eq("id", conversationId).maybeSingle();
  if (!conv) return;
  const admin = adminClient();
  let recipients: string[] = [];
  if (conv.kind === "dm") {
    const { data: members } = await admin.from("chat_members").select("user_id, muted").eq("conversation_id", conversationId);
    recipients = (members ?? []).filter((m) => m.user_id !== user.id && !m.muted).map((m) => m.user_id as string);
  } else {
    recipients = mentions;
  }
  if (recipients.length === 0) return;
  const { data: tokens } = await admin.from("push_tokens").select("token").in("user_id", recipients);
  const who = await personName(supabase, user);
  const title = conv.kind === "dm" ? who : `${who} in #${conv.name}`;
  const text = body ? (body.length > 120 ? `${body.slice(0, 117)}...` : body) : hasFiles ? "Sent a file" : "";
  await sendPushToTokens(
    (tokens ?? []).map((t) => t.token as string),
    title,
    text,
    { pagePath: `/messages?c=${conversationId}` },
  );
}

export async function editMessage(id: string, body: string): Promise<{ ok: true } | { error: string }> {
  const text = body.trim();
  if (!text) return { error: "A message can't be empty - delete it instead." };
  if (text.length > MAX_MESSAGE_LENGTH) return { error: `That message is too long (limit ${MAX_MESSAGE_LENGTH} characters).` };
  const supabase = await createClient();
  const { error } = await supabase.from("chat_messages").update({ body: text, edited_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  return error ? { error: explain(error.message) } : { ok: true };
}

// Deleting keeps a "message deleted" placeholder so the conversation still reads in order.
export async function deleteMessage(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("chat_messages").update({ body: "", attachments: [], mentions: [], deleted_at: new Date().toISOString() }).eq("id", id);
  return error ? { error: explain(error.message) } : { ok: true };
}

export async function createChannel(rawName: string, topic: string): Promise<{ id: string } | { error: string }> {
  const name = channelSlug(rawName);
  if (name.length < 2) return { error: "Give the channel a name (letters and numbers)." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data, error } = await supabase
    .from("chat_conversations")
    .insert({ kind: "channel", name, topic: topic.trim().slice(0, 200) || null, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) {
    if (error && /duplicate|unique/i.test(error.message)) return { error: `There is already a channel called #${name}.` };
    return { error: explain(error?.message ?? "Couldn't create the channel.") };
  }
  await supabase.from("chat_members").insert({ conversation_id: data.id, user_id: user.id });
  return { id: data.id as string };
}

export async function openDm(otherUserId: string): Promise<{ conversation: ChatConversation } | { error: string }> {
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("chat_open_dm", { other: otherUserId });
  if (error || !id) return { error: explain(error?.message ?? "Couldn't open that conversation.") };
  const { data: conversation, error: readError } = await supabase.from("chat_conversations").select("*").eq("id", id).single();
  if (readError || !conversation) return { error: explain(readError?.message ?? "Couldn't open that conversation.") };
  return { conversation: conversation as ChatConversation };
}

export async function setChannelTopic(id: string, topic: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("chat_conversations").update({ topic: topic.trim().slice(0, 200) || null }).eq("id", id).eq("kind", "channel");
  return error ? { error: explain(error.message) } : { ok: true };
}
