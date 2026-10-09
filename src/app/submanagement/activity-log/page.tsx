import { createClient } from "@/lib/supabase/server";
import { isSupremeUser } from "@/lib/roles";
import type { AuditLogRow } from "@/lib/auditTracked";
import ActivityLogClient from "./ActivityLogClient";
import QcByInspector, { type QcCountRow } from "./QcByInspector";
import AgentEmailTracking, { type AgentEmailRow } from "./AgentEmailTracking";

export const dynamic = "force-dynamic";

// Wall-clock read isolated here: the page is force-dynamic so it is evaluated
// per request, and calling Date.now() inline in the component trips the
// react-hooks purity rule.
function currentTimeMs(): number {
  return Date.now();
}

async function loadAgentEmails(supabase: Awaited<ReturnType<typeof createClient>>, nowMs: number): Promise<AgentEmailRow[]> {
  const since = new Date(nowMs - 90 * 86_400_000).toISOString();
  const [threadsRes, repliesRes, profilesRes, employeesRes] = await Promise.all([
    supabase
      .from("agent_threads")
      .select("id, subject, to_emails, status, sent_at, created_at, agents(name)")
      .in("status", ["sent", "replied", "no_reply", "failed"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(600),
    supabase
      .from("agent_replies")
      .select("thread_id, from_email, received_at")
      .gte("created_at", since)
      .order("received_at", { ascending: true })
      .limit(5000),
    supabase.from("profiles").select("id, email"),
    supabase.from("employees").select("name, linked_user_id"),
  ]);
  if (threadsRes.error) throw new Error(threadsRes.error.message);

  // email -> the person's name, where their login is linked to an employee.
  const idByEmail = new Map<string, string>();
  for (const p of profilesRes.data ?? []) if (p.email) idByEmail.set((p.email as string).toLowerCase(), p.id as string);
  const nameByUserId = new Map<string, string>();
  for (const e of employeesRes.data ?? []) if (e.linked_user_id && e.name) nameByUserId.set(e.linked_user_id as string, e.name as string);
  const nameOf = (email: string): string | null => {
    const id = idByEmail.get(email.toLowerCase());
    return id ? nameByUserId.get(id) ?? null : null;
  };

  const repliesByThread = new Map<string, { from_email: string | null; received_at: string | null }[]>();
  for (const r of repliesRes.data ?? []) {
    const list = repliesByThread.get(r.thread_id as string) ?? [];
    list.push({ from_email: r.from_email as string | null, received_at: r.received_at as string | null });
    repliesByThread.set(r.thread_id as string, list);
  }

  return (threadsRes.data ?? []).map((t) => {
    const replies = repliesByThread.get(t.id as string) ?? [];
    const first = new Map<string, { email: string; name: string | null; at: string | null }>();
    for (const r of replies) {
      const email = (r.from_email ?? "").trim();
      if (!email || first.has(email.toLowerCase())) continue;
      first.set(email.toLowerCase(), { email, name: nameOf(email), at: r.received_at });
    }
    const agents = t.agents as unknown as { name: string } | { name: string }[] | null;
    const agentName = (Array.isArray(agents) ? agents[0]?.name : agents?.name) ?? "Agent";
    return {
      id: t.id as string,
      sentAt: ((t.sent_at as string | null) ?? (t.created_at as string)),
      agentName,
      subject: (t.subject as string).replace(/\s*\[HOPS-[0-9A-F]{6}\]\s*$/i, ""),
      to: ((t.to_emails as string[]) ?? []).map((email) => ({ email, name: nameOf(email) })),
      failed: t.status === "failed",
      responders: [...first.values()],
      replyCount: replies.length,
    };
  });
}

export default async function ActivityLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The log itself is also locked down by RLS (only the Supreme account can
  // read it) - this is just so anyone else lands on a clear message instead
  // of an empty page.
  if (!isSupremeUser(user?.email ?? null)) {
    return <p className="text-sm text-black/60 dark:text-white/60">You do not have access to the Activity Log.</p>;
  }

  const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(2000);
  if (error) {
    return <p className="text-red-600">Failed to load Activity Log: {error.message}</p>;
  }

  // Each person's own time zone (null where not detected yet, or if the
  // time zone columns haven't been added).
  const { data: tzRows } = await supabase.from("profiles").select("email, timezone");
  const timezoneByEmail: Record<string, string> = {};
  for (const p of tzRows ?? []) {
    if (p.email && p.timezone) timezoneByEmail[(p.email as string).toLowerCase()] = p.timezone as string;
  }

  // Every QC inspection's date + initials. Read in pages because a single
  // request stops at 1,000 rows.
  const qcRows: QcCountRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error: qcError } = await supabase
      .from("qc_inspections")
      .select("entry_date, qc")
      .order("entry_date", { ascending: true })
      .order("position", { ascending: true })
      .range(from, from + 999);
    if (qcError || !page) break;
    qcRows.push(...(page as QcCountRow[]));
    if (page.length < 1000) break;
  }

  // Emails the HOPS Agents sent over the last 90 days, and who answered each.
  // Failing to read these must never take the rest of the Activity Log down.
  const agentEmails = await loadAgentEmails(supabase, currentTimeMs()).catch(() => [] as AgentEmailRow[]);

  return (
    <div className="space-y-10">
      <ActivityLogClient rows={(data ?? []) as AuditLogRow[]} nowMs={currentTimeMs()} timezoneByEmail={timezoneByEmail} />
      <AgentEmailTracking rows={agentEmails} />
      <QcByInspector rows={qcRows} />
    </div>
  );
}
