"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import {
  CHAT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  MAX_MESSAGE_LENGTH,
  formatBytes,
  isImageType,
  safeFileName,
  type ChatAttachment,
  type ChatConversation,
  type ChatMessage,
  type ChatPerson,
} from "@/lib/chat";
import { createChannel, deleteMessage, editMessage, openDm, sendMessage } from "./actions";

const PAGE_SIZE = 50;
const field = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-black";
const AVATAR_COLORS = ["bg-green-600", "bg-blue-600", "bg-purple-600", "bg-amber-600", "bg-rose-600", "bg-teal-600", "bg-indigo-600", "bg-orange-600"];

interface Pending {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string | null;
  failed: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function colorFor(id: string | null): string {
  let h = 0;
  for (const ch of id ?? "x") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ id, name, size = "h-9 w-9" }: { id: string | null; name: string; size?: string }) {
  return <span className={`flex ${size} shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${colorFor(id)}`}>{initials(name)}</span>;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Message text with links clickable and @names highlighted.
function renderBody(body: string, names: string[], mine: boolean): ReactNode[] {
  const nameAlt = [...names].sort((a, b) => b.length - a.length).map((n) => escapeRegex(n)).join("|");
  const re = new RegExp(`(https?:\\/\\/[^\\s<>"']+)${nameAlt ? `|(@(?:${nameAlt}))` : ""}`, "g");
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    if (m[1]) {
      const url = m[1].replace(/[.,;:!?)]+$/, "");
      out.push(
        <a key={m.index} href={url} target="_blank" rel="noreferrer" className="text-blue-600 underline dark:text-blue-400">
          {url}
        </a>,
      );
      re.lastIndex = m.index + url.length;
    } else {
      out.push(
        <span key={m.index} className={`rounded px-1 font-semibold ${mine ? "bg-amber-200 text-amber-900" : "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"}`}>
          {m[2]}
        </span>,
      );
    }
    last = re.lastIndex;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export default function MessagesClient({
  me,
  initialConversations,
  joined,
  mutedIds,
  directory,
  dmPartners,
  initialUnread,
  initialConversationId,
}: {
  me: { id: string; name: string };
  initialConversations: ChatConversation[];
  joined: string[];
  mutedIds: string[];
  directory: ChatPerson[];
  dmPartners: Record<string, string>;
  initialUnread: Record<string, number>;
  initialConversationId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const confirm = useConfirm();

  const [conversations, setConversations] = useState(initialConversations);
  const [joinedIds, setJoinedIds] = useState(() => new Set(joined));
  const [muted, setMuted] = useState(() => new Set(mutedIds));
  const [partners, setPartners] = useState(dmPartners);
  const [unread, setUnread] = useState(initialUnread);
  const [activeId, setActiveId] = useState<string | null>(() => {
    const wanted = initialConversations.find((c) => c.id === initialConversationId);
    return (wanted ?? initialConversations.find((c) => c.kind === "channel" && c.name === "general") ?? initialConversations[0])?.id ?? null;
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [caret, setCaret] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [sending, setSending] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modal, setModal] = useState<null | "channel" | "dm" | "browse">(null);

  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  // Latest values for the live-update handler, which is set up once.
  const activeRef = useRef(activeId);
  const joinedRef = useRef(joinedIds);
  const mutedRef = useRef(muted);
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    activeRef.current = activeId;
    joinedRef.current = joinedIds;
    mutedRef.current = muted;
    conversationsRef.current = conversations;
  });

  const people = useMemo(() => {
    const map = new Map(directory.map((p) => [p.id, p]));
    if (!map.has(me.id)) map.set(me.id, { id: me.id, name: me.name, email: "" });
    return map;
  }, [directory, me]);
  const nameOf = useCallback((id: string | null) => (id ? (people.get(id)?.name ?? "Former teammate") : "Former teammate"), [people]);
  const names = useMemo(() => [...people.values()].map((p) => p.name).filter((n) => n.length > 1), [people]);

  const titleOf = useCallback((c: ChatConversation) => (c.kind === "channel" ? `# ${c.name}` : nameOf(partners[c.id] ?? null)), [nameOf, partners]);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const channels = conversations.filter((c) => c.kind === "channel").sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const myChannels = channels.filter((c) => joinedIds.has(c.id));
  const otherChannels = channels.filter((c) => !joinedIds.has(c.id));
  const dms = conversations.filter((c) => c.kind === "dm").sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));

  // ---- reading --------------------------------------------------------------------------------

  const markRead = useCallback(
    async (id: string) => {
      setUnread((u) => (u[id] ? { ...u, [id]: 0 } : u));
      await supabase.from("chat_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", id).eq("user_id", me.id);
      window.dispatchEvent(new Event("hops-chat-read"));
    },
    [supabase, me.id],
  );

  // Opening a conversation: load its latest messages, join it if it is a channel, mark it read.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setMessages([]);
    stickToBottom.current = true;
    (async () => {
      const conv = conversationsRef.current.find((c) => c.id === activeId);
      if (conv?.kind === "channel" && !joinedRef.current.has(activeId)) {
        const { error: joinError } = await supabase.from("chat_members").insert({ conversation_id: activeId, user_id: me.id });
        if (!joinError) setJoinedIds((s) => new Set(s).add(activeId));
      }
      const { data, error: loadError } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", activeId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (cancelled) return;
      if (loadError) setError(loadError.message);
      else {
        setMessages(((data ?? []) as ChatMessage[]).reverse());
        setHasMore((data ?? []).length === PAGE_SIZE);
      }
      setLoading(false);
      void markRead(activeId);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, supabase, me.id, markRead]);

  async function loadEarlier() {
    if (!activeId || messages.length === 0) return;
    const el = scroller.current;
    const before = el ? el.scrollHeight : 0;
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", activeId)
      .lt("created_at", messages[0].created_at)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    const older = ((data ?? []) as ChatMessage[]).reverse();
    stickToBottom.current = false;
    setMessages((prev) => [...older, ...prev]);
    setHasMore((data ?? []).length === PAGE_SIZE);
    // Keep the view where it was instead of jumping to the top.
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  }

  // A fresh read of the newest messages - after sending, so the message shows even if live updates are down.
  const refreshLatest = useCallback(async () => {
    const id = activeRef.current;
    if (!id) return;
    const { data } = await supabase.from("chat_messages").select("*").eq("conversation_id", id).order("created_at", { ascending: false }).limit(PAGE_SIZE);
    const latest = ((data ?? []) as ChatMessage[]).reverse();
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of latest) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, [supabase]);

  // ---- live updates ---------------------------------------------------------------------------

  const learnConversation = useCallback(
    async (id: string) => {
      const { data: conv } = await supabase.from("chat_conversations").select("*").eq("id", id).maybeSingle();
      if (!conv) return null;
      setConversations((prev) => (prev.some((c) => c.id === id) ? prev : [conv as ChatConversation, ...prev]));
      if (conv.kind === "dm") {
        const { data: members } = await supabase.from("chat_members").select("user_id").eq("conversation_id", id);
        const other = (members ?? []).find((m) => m.user_id !== me.id);
        if (other) setPartners((p) => ({ ...p, [id]: other.user_id as string }));
        setJoinedIds((s) => new Set(s).add(id));
      }
      return conv.kind as "channel" | "dm";
    },
    [supabase, me.id],
  );

  useEffect(() => {
    const channel = supabase
      .channel(`hops-messages-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const m = payload.new as ChatMessage;
        const known = conversationsRef.current.some((c) => c.id === m.conversation_id);
        // A first message in a brand-new direct message: learn the conversation, then count it as unread.
        if (!known) {
          void learnConversation(m.conversation_id).then((kind) => {
            if (kind === "dm" && m.user_id !== me.id && m.conversation_id !== activeRef.current) setUnread((u) => ({ ...u, [m.conversation_id]: (u[m.conversation_id] ?? 0) + 1 }));
          });
        }
        setConversations((prev) => prev.map((c) => (c.id === m.conversation_id ? { ...c, last_message_at: m.created_at } : c)));
        if (m.conversation_id === activeRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.user_id !== me.id) {
            if (document.visibilityState === "visible") void markRead(m.conversation_id);
            else setUnread((u) => ({ ...u, [m.conversation_id]: (u[m.conversation_id] ?? 0) + 1 }));
          }
        } else if (m.user_id !== me.id && joinedRef.current.has(m.conversation_id) && !mutedRef.current.has(m.conversation_id)) {
          setUnread((u) => ({ ...u, [m.conversation_id]: (u[m.conversation_id] ?? 0) + 1 }));
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, (payload) => {
        const m = payload.new as ChatMessage;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_conversations" }, (payload) => {
        const c = payload.new as ChatConversation;
        if (c.kind === "channel") setConversations((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
      })
      .subscribe();

    function onVisible() {
      if (document.visibilityState === "visible" && activeRef.current) void markRead(activeRef.current);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, me.id, markRead, learnConversation]);

  // Links to attached files are short-lived, so they are fetched as messages appear.
  useEffect(() => {
    const need = [...new Set(messages.flatMap((m) => m.attachments.map((a) => a.path)))].filter((p) => !urls[p]);
    if (need.length === 0) return;
    let cancelled = false;
    supabase.storage
      .from(CHAT_BUCKET)
      .createSignedUrls(need, 3600)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setUrls((prev) => {
          const next = { ...prev };
          for (const s of data) if (s.path && s.signedUrl) next[s.path] = s.signedUrl;
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [messages, supabase, urls]);

  // Stay at the bottom while new messages arrive, unless the reader scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // ---- composing ------------------------------------------------------------------------------

  const mentionMatch = /(^|\s)@([\w.'-]*)$/.exec(text.slice(0, caret));
  const mentionOptions = useMemo(() => {
    if (!mentionMatch) return [];
    const q = mentionMatch[2].toLowerCase();
    return [...people.values()]
      .filter((p) => p.id !== me.id && p.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionMatch?.[2], people, me.id]);

  function pickMention(p: ChatPerson) {
    if (!mentionMatch) return;
    const start = caret - mentionMatch[2].length - 1;
    const next = `${text.slice(0, start)}@${p.name} ${text.slice(caret)}`;
    setText(next);
    setPicks((prev) => ({ ...prev, [p.id]: p.name }));
    setMentionIndex(0);
    const pos = start + p.name.length + 2;
    requestAnimationFrame(() => {
      composer.current?.focus();
      composer.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  async function addFiles(files: File[]) {
    if (!activeId) return;
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name} is bigger than ${formatBytes(MAX_ATTACHMENT_BYTES)}.`);
        continue;
      }
      const id = crypto.randomUUID();
      setPending((p) => [...p, { id, name: file.name || "pasted-image.png", type: file.type || "application/octet-stream", size: file.size, path: null, failed: false }]);
      const path = `${activeId}/${id}-${safeFileName(file.name || "pasted-image.png")}`;
      const { error: uploadError } = await supabase.storage.from(CHAT_BUCKET).upload(path, file, { contentType: file.type || undefined });
      setPending((p) => p.map((x) => (x.id === id ? { ...x, path: uploadError ? null : path, failed: !!uploadError } : x)));
      if (uploadError) setError(`Couldn't upload ${file.name}: ${uploadError.message}`);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  async function send() {
    if (!activeId || sending) return;
    const ready = pending.filter((p) => p.path);
    if (pending.some((p) => !p.path && !p.failed)) return; // still uploading
    const body = text.trim();
    if (!body && ready.length === 0) return;
    setSending(true);
    setError(null);
    const attachments: ChatAttachment[] = ready.map((p) => ({ path: p.path!, name: p.name, type: p.type, size: p.size }));
    const mentions = Object.entries(picks)
      .filter(([, name]) => body.includes(`@${name}`))
      .map(([id]) => id);
    const result = await sendMessage({ conversationId: activeId, body, attachments, mentions });
    setSending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setText("");
    setPending([]);
    setPicks({});
    stickToBottom.current = true;
    void refreshLatest();
    composer.current?.focus();
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionOptions.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + mentionOptions.length) % mentionOptions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(mentionOptions[Math.min(mentionIndex, mentionOptions.length - 1)]);
        return;
      }
    }
    // Enter sends; Shift+Enter is a new line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  // ---- editing and deleting ---------------------------------------------------------------------

  async function saveEdit(id: string) {
    const result = await editMessage(id, editText);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body: editText.trim(), edited_at: new Date().toISOString() } : m)));
    setEditingId(null);
  }

  async function removeMessage(id: string) {
    if (!(await confirm("Delete this message? Everyone will see that it was deleted."))) return;
    const result = await deleteMessage(id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body: "", attachments: [], mentions: [], deleted_at: new Date().toISOString() } : m)));
  }

  // ---- conversations --------------------------------------------------------------------------

  function open(id: string) {
    setActiveId(id);
    setSidebarOpen(false);
    setModal(null);
    setText("");
    setPending([]);
    setPicks({});
    setEditingId(null);
    window.history.replaceState(null, "", `/messages?c=${id}`);
  }

  async function toggleMute() {
    if (!active) return;
    const next = !muted.has(active.id);
    await supabase.from("chat_members").update({ muted: next }).eq("conversation_id", active.id).eq("user_id", me.id);
    setMuted((s) => {
      const copy = new Set(s);
      if (next) copy.add(active.id);
      else copy.delete(active.id);
      return copy;
    });
  }

  async function leaveChannel() {
    if (!active || active.kind !== "channel") return;
    if (!(await confirm(`Leave #${active.name}? It stays open - you can join again from Browse channels.`))) return;
    await supabase.from("chat_members").delete().eq("conversation_id", active.id).eq("user_id", me.id);
    setJoinedIds((s) => {
      const copy = new Set(s);
      copy.delete(active.id);
      return copy;
    });
    const general = conversations.find((c) => c.kind === "channel" && c.name === "general" && c.id !== active.id);
    const fallback = general ?? myChannels.find((c) => c.id !== active.id) ?? dms[0];
    if (fallback) open(fallback.id);
  }

  // ---- render ---------------------------------------------------------------------------------

  const unreadTotal = Object.entries(unread).reduce((s, [id, n]) => s + (muted.has(id) ? 0 : n), 0);
  const uploading = pending.some((p) => !p.path && !p.failed);

  const row = (c: ChatConversation) => {
    const n = unread[c.id] ?? 0;
    const on = c.id === activeId;
    return (
      <button
        key={c.id}
        onClick={() => open(c.id)}
        className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${on ? "bg-green-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/10"} ${n > 0 && !on ? "font-bold" : ""}`}
      >
        <span className="truncate">
          {titleOf(c)}
          {muted.has(c.id) && <span className="ml-1 text-xs opacity-60">🔕</span>}
        </span>
        {n > 0 && !on && <span className="shrink-0 rounded-full bg-red-600 px-1.5 py-px text-[11px] font-bold text-white">{n > 99 ? "99+" : n}</span>}
      </button>
    );
  };

  const sidebar = (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-black/50 dark:text-white/50">Channels</p>
          <button onClick={() => setModal("channel")} title="Create a channel" className="rounded px-1.5 text-lg leading-none text-black/60 hover:bg-black/10 dark:text-white/60 dark:hover:bg-white/10">
            +
          </button>
        </div>
        <div className="space-y-0.5">{myChannels.map(row)}</div>
        {otherChannels.length > 0 && (
          <button onClick={() => setModal("browse")} className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs font-medium text-green-700 hover:bg-black/5 dark:text-green-400 dark:hover:bg-white/10">
            Browse {otherChannels.length} more channel{otherChannels.length === 1 ? "" : "s"}
          </button>
        )}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-black/50 dark:text-white/50">Direct messages</p>
          <button onClick={() => setModal("dm")} title="Message someone" className="rounded px-1.5 text-lg leading-none text-black/60 hover:bg-black/10 dark:text-white/60 dark:hover:bg-white/10">
            +
          </button>
        </div>
        <div className="space-y-0.5">{dms.map(row)}</div>
        {dms.length === 0 && <p className="px-2 text-xs text-black/50 dark:text-white/50">Click + to message someone.</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Messages
          {unreadTotal > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 align-middle text-xs font-bold text-white">{unreadTotal} unread</span>}
        </h1>
      </div>

      <div className="relative flex h-[calc(100dvh-11rem)] min-h-[26rem] overflow-hidden rounded-xl border border-black/15 bg-white text-black dark:border-white/15 dark:bg-neutral-900 dark:text-white">
        {/* Sidebar: always visible on wide screens, a drawer on phones */}
        <aside className="hidden w-64 shrink-0 border-r border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.03] md:block">{sidebar}</aside>
        {sidebarOpen && (
          <div className="absolute inset-0 z-30 flex md:hidden" onClick={() => setSidebarOpen(false)}>
            <aside className="w-72 max-w-[85%] border-r border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
              {sidebar}
            </aside>
            <div className="flex-1 bg-black/40" />
          </div>
        )}

        <section className="flex min-w-0 flex-1 flex-col">
          {!active ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-black/50 dark:text-white/50">
              <div>
                <p className="font-semibold">No conversations yet.</p>
                <p>Create a channel or message someone with the + buttons.</p>
                <button onClick={() => setSidebarOpen(true)} className="mt-3 rounded-md border border-black/20 px-3 py-1.5 md:hidden">
                  Open the list
                </button>
              </div>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10">
                <button onClick={() => setSidebarOpen(true)} className="rounded-md border border-black/20 px-2 py-1 text-sm md:hidden" aria-label="Open the list of conversations">
                  ☰
                  {unreadTotal > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unreadTotal}</span>}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{titleOf(active)}</p>
                  {active.kind === "channel" && active.topic && <p className="truncate text-xs text-black/55 dark:text-white/55">{active.topic}</p>}
                </div>
                <button onClick={() => void toggleMute()} title={muted.has(active.id) ? "Turn alerts back on" : "Mute: no unread count or phone alerts"} className="rounded-md px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/10">
                  {muted.has(active.id) ? "🔕" : "🔔"}
                </button>
                {active.kind === "channel" && active.name !== "general" && (
                  <button onClick={() => void leaveChannel()} className="rounded-md px-2 py-1 text-xs text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10">
                    Leave
                  </button>
                )}
              </header>

              <div
                ref={scroller}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
                className="flex-1 overflow-y-auto px-3 py-3"
              >
                {hasMore && (
                  <div className="mb-3 text-center">
                    <button onClick={() => void loadEarlier()} className="rounded-full border border-black/20 px-3 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                      Load earlier messages
                    </button>
                  </div>
                )}
                {loading && <p className="py-6 text-center text-sm text-black/50 dark:text-white/50">Loading...</p>}
                {!loading && messages.length === 0 && (
                  <p className="py-10 text-center text-sm text-black/50 dark:text-white/50">
                    {active.kind === "channel" ? `This is the start of #${active.name}. Say hello!` : `This is the start of your conversation with ${titleOf(active)}.`}
                  </p>
                )}
                {messages.map((m, i) => {
                  const prev = messages[i - 1];
                  const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                  const grouped = !newDay && prev && prev.user_id === m.user_id && !prev.deleted_at && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
                  const mine = m.user_id === me.id;
                  const author = nameOf(m.user_id);
                  return (
                    <div key={m.id}>
                      {newDay && (
                        <div className="my-3 flex items-center gap-3 text-xs font-semibold text-black/50 dark:text-white/50">
                          <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                          {dayLabel(m.created_at)}
                          <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                        </div>
                      )}
                      <div className={`group relative flex gap-2.5 rounded-md px-1.5 py-0.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] ${grouped ? "" : "mt-2"}`}>
                        <div className="w-9 shrink-0">{!grouped && <Avatar id={m.user_id} name={author} />}</div>
                        <div className="min-w-0 flex-1">
                          {!grouped && (
                            <p className="text-sm">
                              <b>{author}</b> <span className="text-xs text-black/45 dark:text-white/45">{timeOf(m.created_at)}</span>
                            </p>
                          )}
                          {m.deleted_at ? (
                            <p className="text-sm italic text-black/40 dark:text-white/40">This message was deleted.</p>
                          ) : editingId === m.id ? (
                            <div className="space-y-1">
                              <textarea
                                autoFocus
                                className={field}
                                rows={2}
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    void saveEdit(m.id);
                                  }
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                              />
                              <p className="text-xs text-black/50 dark:text-white/50">
                                Enter to save · Esc to cancel
                              </p>
                            </div>
                          ) : (
                            <>
                              {m.body && (
                                <p className="whitespace-pre-wrap break-words text-sm">
                                  {renderBody(m.body, names, mine)}
                                  {m.edited_at && <span className="ml-1 text-[11px] text-black/40 dark:text-white/40">(edited)</span>}
                                </p>
                              )}
                              {m.attachments.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {m.attachments.map((a) =>
                                    isImageType(a.type) ? (
                                      urls[a.path] ? (
                                        <a key={a.path} href={urls[a.path]} target="_blank" rel="noreferrer">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={urls[a.path]} alt={a.name} className="max-h-64 max-w-full rounded-lg border border-black/10 object-contain dark:border-white/10" />
                                        </a>
                                      ) : (
                                        <span key={a.path} className="rounded border border-dashed border-black/20 px-3 py-6 text-xs text-black/50">
                                          Loading {a.name}...
                                        </span>
                                      )
                                    ) : (
                                      <a
                                        key={a.path}
                                        href={urls[a.path]}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-2 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black hover:bg-black/5 dark:border-white/20 dark:bg-white/10 dark:text-white"
                                      >
                                        <span className="text-lg">📄</span>
                                        <span>
                                          <span className="block font-medium">{a.name}</span>
                                          <span className="block text-xs text-black/50 dark:text-white/50">{formatBytes(a.size)}</span>
                                        </span>
                                      </a>
                                    ),
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        {mine && !m.deleted_at && editingId !== m.id && (
                          <div className="absolute -top-3 right-2 hidden gap-1 rounded-md border border-black/15 bg-white px-1 py-0.5 text-xs shadow-sm group-hover:flex dark:border-white/20 dark:bg-neutral-800">
                            {m.body && (
                              <button
                                onClick={() => {
                                  setEditingId(m.id);
                                  setEditText(m.body);
                                }}
                                className="rounded px-1.5 py-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                              >
                                Edit
                              </button>
                            )}
                            <button onClick={() => void removeMessage(m.id)} className="rounded px-1.5 py-0.5 text-red-600 hover:bg-black/10 dark:hover:bg-white/10">
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {error && (
                <p className="mx-3 mb-1 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {error}{" "}
                  <button onClick={() => setError(null)} className="font-semibold underline">
                    Dismiss
                  </button>
                </p>
              )}

              <footer className="relative border-t border-black/10 p-3 dark:border-white/10">
                {mentionOptions.length > 0 && (
                  <ul className="absolute bottom-full left-3 z-20 mb-1 w-64 overflow-hidden rounded-lg border border-black/15 bg-white text-sm text-black shadow-lg dark:border-white/20">
                    {mentionOptions.map((p, i) => (
                      <li key={p.id}>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pickMention(p);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${i === mentionIndex ? "bg-green-100" : "hover:bg-black/5"}`}
                        >
                          <Avatar id={p.id} name={p.name} size="h-6 w-6" />
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {pending.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {pending.map((p) => (
                      <span key={p.id} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${p.failed ? "border-red-400 text-red-700" : "border-black/20"}`}>
                        {p.type.startsWith("image/") ? "🖼" : "📄"} {p.name} <span className="text-black/40">({formatBytes(p.size)})</span>
                        {!p.path && !p.failed && <span className="text-black/50">uploading...</span>}
                        <button onClick={() => setPending((prev) => prev.filter((x) => x.id !== p.id))} className="font-bold text-black/50 hover:text-black" aria-label={`Remove ${p.name}`}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      void addFiles(files);
                    }}
                  />
                  <button onClick={() => fileInput.current?.click()} title="Attach a file or photo" className="rounded-md border border-black/20 px-2.5 py-2 text-lg leading-none hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                    📎
                  </button>
                  <textarea
                    ref={composer}
                    value={text}
                    rows={1}
                    maxLength={MAX_MESSAGE_LENGTH}
                    onChange={(e) => {
                      setText(e.target.value);
                      setCaret(e.target.selectionStart);
                      setMentionIndex(0);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                    }}
                    onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
                    onKeyDown={onComposerKey}
                    onPaste={onPaste}
                    placeholder={`Message ${titleOf(active)} - @ to mention someone, Enter to send`}
                    className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-black placeholder:text-black/40"
                  />
                  <button
                    onClick={() => void send()}
                    disabled={sending || uploading || (!text.trim() && !pending.some((p) => p.path))}
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      {modal === "channel" && (
        <NewChannelModal
          onClose={() => setModal(null)}
          onCreated={async (id) => {
            const { data } = await supabase.from("chat_conversations").select("*").eq("id", id).single();
            if (data) setConversations((prev) => (prev.some((c) => c.id === id) ? prev : [data as ChatConversation, ...prev]));
            setJoinedIds((s) => new Set(s).add(id));
            open(id);
          }}
        />
      )}
      {modal === "dm" && (
        <PeopleModal
          title="Message someone"
          people={[...people.values()].filter((p) => p.id !== me.id)}
          onClose={() => setModal(null)}
          onPick={async (p) => {
            const result = await openDm(p.id);
            if ("error" in result) {
              setError(result.error);
              setModal(null);
              return;
            }
            setConversations((prev) => (prev.some((c) => c.id === result.conversation.id) ? prev : [result.conversation, ...prev]));
            setPartners((prev) => ({ ...prev, [result.conversation.id]: p.id }));
            setJoinedIds((s) => new Set(s).add(result.conversation.id));
            open(result.conversation.id);
          }}
        />
      )}
      {modal === "browse" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModal(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 text-black shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-lg font-bold">Browse channels</h2>
            <ul className="space-y-1">
              {otherChannels.map((c) => (
                <li key={c.id}>
                  <button onClick={() => open(c.id)} className="w-full rounded-md px-3 py-2 text-left hover:bg-black/5">
                    <span className="font-semibold"># {c.name}</span>
                    {c.topic && <span className="block text-xs text-black/55">{c.topic}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-right">
              <button onClick={() => setModal(null)} className="rounded-md border border-black/20 px-3 py-1.5 text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-4 text-black shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">Create a channel</h2>
        <p className="text-xs text-black/60">A channel is a shared room for a topic - everyone at Harvest Best can see it and join. Use direct messages for private chats.</p>
        <label className="block text-sm font-medium">
          Name
          <input autoFocus className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. logistics, pricing, warehouse-floor" />
          {name.trim() && <span className="text-xs text-black/50">Will be called #{name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}</span>}
        </label>
        <label className="block text-sm font-medium">
          What is it for? (optional)
          <input className={`${field} mt-1`} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-black/20 px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              const result = await createChannel(name, topic);
              setBusy(false);
              if ("error" in result) setError(result.error);
              else await onCreated(result.id);
            }}
            className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function PeopleModal({ title, people, onClose, onPick }: { title: string; people: ChatPerson[]; onClose: () => void; onPick: (p: ChatPerson) => void | Promise<void> }) {
  const [q, setQ] = useState("");
  const shown = people.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-white p-4 text-black shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-2 text-lg font-bold">{title}</h2>
        <input autoFocus className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" />
        <ul className="mt-2 flex-1 space-y-0.5 overflow-y-auto">
          {shown.map((p) => (
            <li key={p.id}>
              <button onClick={() => void onPick(p)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-black/5">
                <Avatar id={p.id} name={p.name} size="h-8 w-8" />
                <span>
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-black/50">{p.email}</span>
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-4 text-center text-sm text-black/50">Nobody found.</li>}
        </ul>
        <div className="mt-3 text-right">
          <button onClick={onClose} className="rounded-md border border-black/20 px-3 py-1.5 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
