export type AgentKey = "load_eta" | "load_pending";
export type AgentMode = "approve" | "auto";

export interface Agent {
  id: string;
  key: AgentKey;
  name: string;
  description: string | null;
  enabled: boolean;
  mode: AgentMode;
  interval_hours: number;
  active_start_hour: number;
  active_end_hour: number;
  config: {
    recipients?: string[];
    days_ahead?: number;
    // false = notify-only: emails still go out, but replies are never read
    // or applied (no Claude needed). Unset means true.
    read_replies?: boolean;
    // Where replies should go instead of the HOP@ mailbox, e.g. the person
    // who'll act on them. Most useful with read_replies off.
    reply_to?: string[];
    // load_eta: fixed daily send times ("HH:MM", APP_TIMEZONE) and the hard
    // window nothing is sent outside of.
    send_times?: string[];
    window_start?: string;
    window_end?: string;
  };
  last_run_at: string | null;
  created_at: string;
}

export type ThreadStatus = "draft" | "sent" | "replied" | "no_reply" | "discarded" | "failed";

export interface AgentThread {
  id: string;
  agent_id: string;
  tag: string;
  record_ids: string[];
  status: ThreadStatus;
  to_emails: string[];
  subject: string;
  body: string;
  graph_message_id: string | null;
  conversation_id: string | null;
  error: string | null;
  sent_at: string | null;
  last_reply_at: string | null;
  created_at: string;
}

export interface ProposedLoadUpdate {
  load_id: string;
  load_number: number;
  eta_note: string | null;
  append_note: string | null;
  ready_to_load: boolean | null;
  new_status: "on_the_road" | "complete" | null;
  // Carrier says this load has been delivered. Without a verified POD it
  // only raises the Pending POD flag; the load stays On the Road.
  delivered: boolean | null;
  confident: boolean;
}

// A file the carrier attached to a reply, stored in the load-documents
// bucket, and Claude's verdict on whether it is a signed POD.
export interface ReplyAttachment {
  file_name: string;
  storage_path: string;
  content_type: string;
  size_bytes: number;
  is_pod: boolean;
  // Which numbered load the POD is for (index into the thread's loads).
  load_number: number | null;
  load_id: string | null;
  confident: boolean;
  note: string | null;
}

export type ReplyStatus = "pending_review" | "applied" | "auto_applied" | "dismissed" | "no_update";

export interface AgentReply {
  id: string;
  thread_id: string;
  graph_message_id: string;
  from_email: string | null;
  received_at: string | null;
  body_text: string | null;
  summary: string | null;
  proposed: ProposedLoadUpdate[];
  attachments: ReplyAttachment[];
  status: ReplyStatus;
  error: string | null;
  applied_at: string | null;
  created_at: string;
}

export interface AgentEvent {
  id: string;
  agent_id: string | null;
  thread_id: string | null;
  kind: string;
  message: string;
  created_at: string;
}
