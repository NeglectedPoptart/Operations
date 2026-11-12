// Shared bits of the Messages page (migration 166).

export interface ChatConversation {
  id: string;
  kind: "channel" | "dm";
  name: string | null;
  topic: string | null;
  created_by: string | null;
  created_at: string;
  last_message_at: string;
}

export interface ChatAttachment {
  path: string;
  name: string;
  type: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  user_id: string | null;
  body: string;
  attachments: ChatAttachment[];
  mentions: string[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface ChatPerson {
  id: string;
  name: string;
  email: string;
}

export const CHAT_BUCKET = "chat-files";
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// "Pricing Q&A!" -> "pricing-q-a" - channel names are lower case letters, numbers and dashes.
export function channelSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
}

export function isImageType(type: string): boolean {
  return /^image\/(png|jpe?g|gif|webp)$/i.test(type);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
