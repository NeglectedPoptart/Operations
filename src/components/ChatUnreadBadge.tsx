"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// The red unread count next to "Messages" in the menu. Quietly shows nothing if Messages isn't set up yet.
export default function ChatUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      const { data, error } = await supabase.rpc("chat_unread");
      if (!alive || error) return;
      setCount(((data ?? []) as { unread: number | string }[]).reduce((sum, r) => sum + Number(r.unread), 0));
    }
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 400);
    };

    void load();
    // Each copy of the badge (the desktop menu and the phone drawer) needs its own channel name - attaching to
    // one that is already running throws and takes the whole page down.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`hops-unread-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, soon)
        .subscribe();
    } catch {
      // live updates are a bonus - the count still refreshes on every page load
    }
    window.addEventListener("hops-chat-read", soon);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("hops-chat-read", soon);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  if (count <= 0) return null;
  return <span className="ml-auto rounded-full bg-red-600 px-1.5 py-px text-[11px] font-bold leading-4 text-white">{count > 99 ? "99+" : count}</span>;
}
