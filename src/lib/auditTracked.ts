// Shared (client + server safe) half of the activity log - kept free of any
// server-only imports so the Management page can use the same list.

// Whose activity gets recorded - matched against the part of their login
// email before the "@". Everyone else is ignored entirely (nothing is stored
// for them). Edit this list to add or drop someone.
export const TRACKED_HANDLES = ["ecullers", "bturner", "rhalim", "emota", "nhalim", "tsulay"];

export type AuditEventType = "login" | "ar_open" | "ar_upload" | "ar_change";

export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  login: "Login",
  ar_open: "Opened AR",
  ar_upload: "AR upload",
  ar_change: "AR change",
};

export function isTrackedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return TRACKED_HANDLES.includes(email.split("@")[0].toLowerCase());
}

export interface AuditLogRow {
  id: string;
  created_at: string;
  user_id: string | null;
  user_email: string;
  event_type: AuditEventType;
  summary: string;
  details: Record<string, unknown> | null;
  // Their own time zone when it happened (null on older entries).
  user_timezone?: string | null;
}
