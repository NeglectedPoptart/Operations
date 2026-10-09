import { createClient } from "@/lib/supabase/server";
import { isSupremeUser } from "@/lib/roles";
import { setupStatus } from "@/lib/agents/run";
import { loadRoles } from "@/lib/roleAccess";
import type { Agent, AgentEvent, AgentReply, AgentThread } from "@/lib/agents/types";
import AgentsClient, { type CarrierRow, type ReviewItem } from "./AgentsClient";

export const dynamic = "force-dynamic";
// Approving a draft sends email through Outlook from a server action on this
// page - give it more than the 10s default so a slow send is not cut off.
export const maxDuration = 60;

export default async function AgentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isSupremeUser(user?.email ?? null)) {
    return <p className="text-sm text-black/60 dark:text-white/60">You do not have access to Agents.</p>;
  }

  const [agentsRes, draftsRes, repliesRes, eventsRes, brokersRes] = await Promise.all([
    supabase.from("agents").select("*").order("created_at"),
    supabase.from("agent_threads").select("*").in("status", ["draft", "failed"]).order("created_at"),
    supabase
      .from("agent_replies")
      .select("*, agent_threads(subject, record_ids, body, agents(key))")
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
    agent_threads: { subject: string; record_ids: string[]; body: string; agents: { key: string } | null } | null;
  })[];

  // Friendly labels for each load a reply proposes to change.
  const isBuyers = (r: (typeof replies)[number]) => r.agent_threads?.agents?.key === "buyers_list";
  const isOrders = (r: (typeof replies)[number]) => r.agent_threads?.agents?.key === "orders_pending";
  const loadIds = [...new Set(replies.filter((r) => !isBuyers(r) && !isOrders(r)).flatMap((r) => r.agent_threads?.record_ids ?? []))];
  const labels: Record<string, string> = {};

  // Buyers List lines get a label too (their ids are buyers_list_items).
  const itemIds = [...new Set(replies.filter(isBuyers).flatMap((r) => r.agent_threads?.record_ids ?? []))];
  if (itemIds.length > 0) {
    const { data: items } = await supabase
      .from("buyers_list_items")
      .select("id, comm, variety, pstyle, size, label, qty_needed")
      .in("id", itemIds);
    for (const i of items ?? []) {
      labels[i.id] = [[i.comm, i.variety, i.pstyle, i.size, i.label].filter(Boolean).join(" - "), `need ${i.qty_needed}`].join(" · ");
    }
  }

  // Orders follow-up lines (their ids are pending_orders).
  const orderIds = [...new Set(replies.filter(isOrders).flatMap((r) => r.agent_threads?.record_ids ?? []))];
  if (orderIds.length > 0) {
    const { data: orders } = await supabase
      .from("pending_orders")
      .select("id, order_no, customer_code, customer_name, ship_date, ordered")
      .in("id", orderIds);
    for (const o of orders ?? []) {
      labels[o.id] = [`Order ${o.order_no}`, [o.customer_code, o.customer_name].filter(Boolean).join(" - "), o.ship_date && `ship ${o.ship_date}`]
        .filter(Boolean)
        .join(" · ");
    }
  }

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
    agentKey: r.agent_threads?.agents?.key ?? "",
    attachmentUrls,
  }));

  // Who the Orders email can go to: whole roles, or individual people.
  const [roleRows, profileRows] = await Promise.all([
    loadRoles(supabase),
    supabase.from("profiles").select("email, role").order("email", { ascending: true }),
  ]);
  const roleOptions = roleRows.map((r) => ({ key: r.key, label: r.label }));
  const people = ((profileRows.data ?? []) as { email: string | null; role: string }[])
    .filter((p) => (p.email ?? "").includes("@"))
    .map((p) => ({ email: p.email as string, role: p.role }));

  // The Orders legend labels the Orders email can be limited to.
  const { data: legendRows } = await supabase.from("order_legend").select("id, name, color, opacity").order("position", { ascending: true }).order("created_at", { ascending: true });
  const orderLabels = (legendRows ?? []) as { id: string; name: string; color: string; opacity: number }[];

  return (
    <AgentsClient
      orderLabels={orderLabels}
      roleOptions={roleOptions}
      people={people}
      status={setupStatus()}
      agents={(agentsRes.data ?? []) as Agent[]}
      drafts={(draftsRes.data ?? []) as AgentThread[]}
      reviewItems={reviewItems}
      events={(eventsRes.data ?? []) as AgentEvent[]}
      carriers={(brokersRes.data ?? []) as CarrierRow[]}
    />
  );
}
