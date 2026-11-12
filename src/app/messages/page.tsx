import { createClient } from "@/lib/supabase/server";
import { personName } from "@/lib/displayName";
import type { ChatConversation, ChatPerson } from "@/lib/chat";
import MessagesClient from "./MessagesClient";

export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Every channel, plus the direct messages this person is in (row-level security does the filtering).
  const { data: conversations, error } = await supabase.from("chat_conversations").select("*").order("last_message_at", { ascending: false });
  if (error) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-red-600">
          {/chat_|does not exist|schema cache/i.test(error.message) ? "Messages isn't set up yet - ask the admin to run migration 166." : `Couldn't load Messages: ${error.message}`}
        </p>
      </div>
    );
  }
  const list = (conversations ?? []) as ChatConversation[];

  const [{ data: myMembers }, { data: directory }, { data: unread }] = await Promise.all([
    supabase.from("chat_members").select("conversation_id, last_read_at, muted").eq("user_id", user.id),
    supabase.rpc("chat_directory"),
    supabase.rpc("chat_unread"),
  ]);

  // Who the other person is in each direct message.
  const dmIds = list.filter((x) => x.kind === "dm").map((x) => x.id);
  const partners: Record<string, string> = {};
  if (dmIds.length > 0) {
    const { data: dmMembers } = await supabase.from("chat_members").select("conversation_id, user_id").in("conversation_id", dmIds);
    for (const m of dmMembers ?? []) if (m.user_id !== user.id) partners[m.conversation_id as string] = m.user_id as string;
  }

  const unreadCounts: Record<string, number> = {};
  for (const u of (unread ?? []) as { conversation_id: string; unread: number | string }[]) unreadCounts[u.conversation_id] = Number(u.unread);

  return (
    <MessagesClient
      me={{ id: user.id, name: await personName(supabase, user) }}
      initialConversations={list}
      joined={(myMembers ?? []).map((m) => m.conversation_id as string)}
      mutedIds={(myMembers ?? []).filter((m) => m.muted).map((m) => m.conversation_id as string)}
      directory={(directory ?? []) as ChatPerson[]}
      dmPartners={partners}
      initialUnread={unreadCounts}
      initialConversationId={c ?? null}
    />
  );
}
