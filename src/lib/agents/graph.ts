// Microsoft Graph (Outlook / Microsoft 365) access for the HOPS Agents
// shared mailbox. App-only auth (client credentials) against an Entra ID
// app registration with Mail.Send + Mail.ReadWrite application permissions,
// ideally scoped to just the agent mailbox with an Exchange
// ApplicationAccessPolicy. Plain fetch - two endpoints don't justify the
// Graph SDK.

const GRAPH = "https://graph.microsoft.com/v1.0";

export function graphConfigured(): boolean {
  return Boolean(
    process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.HOPS_AGENT_MAILBOX,
  );
}

export function agentMailbox(): string {
  const mailbox = process.env.HOPS_AGENT_MAILBOX;
  if (!mailbox) throw new Error("HOPS_AGENT_MAILBOX is not set.");
  return mailbox;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  if (!graphConfigured()) throw new Error("Outlook connection isn't set up (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET).");

  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Microsoft sign-in failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

async function graph(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.body-content-type="text"',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Outlook request failed (${res.status}): ${await res.text()}`);
  return res;
}

// Created as a draft first (rather than a single sendMail call) because
// that's the only way Graph hands back the conversationId replies will
// carry - the key used to match a reply back to its thread.
export interface EmailAttachment {
  name: string;
  contentType: string;
  data: Uint8Array;
}

// Small files go in one request; bigger ones (a report with 30 photos can be
// several MB) use Graph's upload session, sent in chunks.
const INLINE_ATTACHMENT_LIMIT = 3 * 1024 * 1024;
const UPLOAD_CHUNK = 320 * 1024 * 10; // Graph wants multiples of 320 KiB

async function addAttachment(mailbox: string, messageId: string, file: EmailAttachment): Promise<void> {
  if (file.data.length <= INLINE_ATTACHMENT_LIMIT) {
    await graph(`/users/${mailbox}/messages/${messageId}/attachments`, {
      method: "POST",
      body: JSON.stringify({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: file.name,
        contentType: file.contentType,
        contentBytes: Buffer.from(file.data).toString("base64"),
      }),
    });
    return;
  }

  const sessionRes = await graph(`/users/${mailbox}/messages/${messageId}/attachments/createUploadSession`, {
    method: "POST",
    body: JSON.stringify({ AttachmentItem: { attachmentType: "file", name: file.name, size: file.data.length, contentType: file.contentType } }),
  });
  const { uploadUrl } = (await sessionRes.json()) as { uploadUrl: string };
  for (let start = 0; start < file.data.length; start += UPLOAD_CHUNK) {
    const end = Math.min(start + UPLOAD_CHUNK, file.data.length);
    // The upload URL is pre-authorised - no bearer token on these requests.
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(end - start),
        "Content-Range": `bytes ${start}-${end - 1}/${file.data.length}`,
      },
      body: Buffer.from(file.data.subarray(start, end)),
    });
    if (!res.ok) throw new Error(`Attachment upload failed (${res.status}): ${await res.text()}`);
  }
}

export async function sendEmail(input: {
  to: string[];
  replyTo?: string[];
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
}): Promise<{ messageId: string; conversationId: string }> {
  const mailbox = encodeURIComponent(agentMailbox());
  const draftRes = await graph(`/users/${mailbox}/messages`, {
    method: "POST",
    body: JSON.stringify({
      subject: input.subject,
      body: { contentType: "Text", content: input.body },
      toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
      ...(input.replyTo?.length ? { replyTo: input.replyTo.map((address) => ({ emailAddress: { address } })) } : {}),
    }),
  });
  const draft = (await draftRes.json()) as { id: string; conversationId: string };
  for (const file of input.attachments ?? []) await addAttachment(mailbox, draft.id, file);
  await graph(`/users/${mailbox}/messages/${draft.id}/send`, { method: "POST" });
  return { messageId: draft.id, conversationId: draft.conversationId };
}

export interface InboxMessage {
  id: string;
  subject: string;
  fromEmail: string;
  receivedAt: string;
  conversationId: string;
  // Just the new part of a reply (Graph's uniqueBody), falling back to the
  // full body when Outlook can't separate it.
  text: string;
  hasAttachments: boolean;
}

export async function listInboxSince(sinceISO: string, limit: number): Promise<InboxMessage[]> {
  const mailbox = encodeURIComponent(agentMailbox());
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${sinceISO}`,
    $orderby: "receivedDateTime asc",
    $top: String(limit),
    $select: "id,subject,from,receivedDateTime,conversationId,uniqueBody,body,hasAttachments",
  });
  const res = await graph(`/users/${mailbox}/mailFolders/inbox/messages?${params}`);
  const json = (await res.json()) as {
    value: {
      id: string;
      subject: string | null;
      from?: { emailAddress?: { address?: string } };
      receivedDateTime: string;
      conversationId: string;
      uniqueBody?: { content?: string };
      body?: { content?: string };
      hasAttachments?: boolean;
    }[];
  };
  return json.value.map((m) => ({
    id: m.id,
    subject: m.subject ?? "",
    fromEmail: (m.from?.emailAddress?.address ?? "").toLowerCase(),
    receivedAt: m.receivedDateTime,
    conversationId: m.conversationId,
    text: (m.uniqueBody?.content || m.body?.content || "").trim(),
    hasAttachments: m.hasAttachments === true,
  }));
}

export interface MailAttachment {
  fileName: string;
  contentType: string;
  data: Buffer;
}

// Files only (no forwarded emails or links). Capped - a signed POD is a
// scan or a photo, and anything bigger than this isn't one. Inline images
// (signature logos) are skipped for the same reason.
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

export async function listAttachments(messageId: string): Promise<MailAttachment[]> {
  const mailbox = encodeURIComponent(agentMailbox());
  const res = await graph(
    `/users/${mailbox}/messages/${messageId}/attachments?$select=id,name,contentType,size,isInline`,
  );
  const json = (await res.json()) as {
    value: { "@odata.type"?: string; id: string; name?: string; contentType?: string; size?: number; isInline?: boolean }[];
  };

  const out: MailAttachment[] = [];
  for (const a of json.value) {
    if (out.length >= MAX_ATTACHMENTS) break;
    if (a["@odata.type"] !== "#microsoft.graph.fileAttachment" || a.isInline) continue;
    if ((a.size ?? 0) > MAX_ATTACHMENT_BYTES || (a.size ?? 0) < 2_000) continue;
    const contentType = a.contentType ?? "application/octet-stream";
    if (!/^(application\/pdf|image\/(jpeg|png|webp|gif))$/i.test(contentType)) continue;

    // $value streams the raw file, so large attachments don't have to fit in
    // a base64 JSON field.
    const fileRes = await graph(`/users/${mailbox}/messages/${messageId}/attachments/${a.id}/$value`, {
      headers: { "Content-Type": "application/octet-stream" },
    });
    out.push({
      fileName: a.name ?? "attachment",
      contentType: contentType.toLowerCase(),
      data: Buffer.from(await fileRes.arrayBuffer()),
    });
  }
  return out;
}

export async function markRead(messageId: string): Promise<void> {
  const mailbox = encodeURIComponent(agentMailbox());
  await graph(`/users/${mailbox}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ isRead: true }),
  });
}
