import { createClient } from "@/lib/supabase/server";
import { setupStatus } from "@/lib/agents/run";
import type { Agent, AgentEvent, AgentReply, AgentThread } from "@/lib/agents/types";
import AgentsClient, { type CarrierRow, type ReviewItem } from "./AgentsClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const supabase = await createClient();

  const [agentsRes, draftsRes, repliesRes, eventsRes, brokersRes] = await Promise.all([
    supabase.from("agents").select("*").order("created_at"),
    supabase.from("agent_threads").select("*").in("status", ["draft", "failed"]).order("created_at"),
    supabase
      .from("agent_replies")
      .select("*, agent_threads(subject, record_ids, body)")
      .eq("status", "pending_review")
      .order("created_at"),
    supabase.from("agent_events").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("brokers").select("id, name, followup_email, active").order("name"),
  ]);

  const firstError = [agentsRes, draftsRes, repliesRes, eventsRes, brokersRes].find((r) => r.error)?.error;
  if (firstError) {
    return (
      <p className="text-red-600">
        Failed to load Agents: {firstError.message}. If this is the first time, run migration 115 in Supabase.
      </p>
    );
  }

  const replies = (repliesRes.data ?? []) as (AgentReply & {
    agent_threads: { subject: string; record_ids: string[]; body: string } | null;
  })[];

  // Friendly labels for each load a reply proposes to change.
  const loadIds = [...new Set(replies.flatMap((r) => r.agent_threads?.record_ids ?? []))];
  const labels: Record<string, string> = {};
  if (loadIds.length > 0) {
    const { data: loads } = await supabase
      .from("loads")
      .select("id, loading_date, source, status, load_stops(position, client_name, destination_city, destination_state, po_number)")
      .in("id", loadIds);
    for (const l of loads ?? []) {
      const stop = [...(l.load_stops ?? [])].sort((a, b) => a.position - b.position)[0];
      labels[l.id] = [
        l.loading_date,
        l.source,
        stop && [stop.client_name, stop.destination_city, stop.destination_state].filter(Boolean).join(" "),
        stop?.po_number && `PO ${stop.po_number}`,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }

  const attachmentUrls: Record<string, string> = {};
  const paths = [...new Set(replies.flatMap((r) => (r.attachments ?? []).map((a) => a.storage_path)).filter(Boolean))];
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from("load-documents").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) attachmentUrls[s.path] = s.signedUrl;
  }

  const reviewItems: ReviewItem[] = replies.map((r) => ({
    reply: r,
    subject: r.agent_threads?.subject ?? "",
    loadLabels: Object.fromEntries((r.agent_threads?.record_ids ?? []).map((id) => [id, labels[id] ?? id])),
    loadIds: r.agent_threads?.record_ids ?? [],
    attachmentUrls,
  }));

  return (
    <AgentsClient
      status={setupStatus()}
      agents={(agentsRes.data ?? []) as Agent[]}
      drafts={(draftsRes.data ?? []) as AgentThread[]}
      reviewItems={reviewItems}
      events={(eventsRes.data ?? []) as AgentEvent[]}
      carriers={(brokersRes.data ?? []) as CarrierRow[]}
    />
  );
}
