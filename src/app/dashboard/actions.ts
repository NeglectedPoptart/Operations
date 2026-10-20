"use server";

import { createClient } from "@/lib/supabase/server";
import { AR_AGING_BUCKETS, arAgingBucket } from "@/lib/arAging";
import { addDays, currentWeekStart, isoDateOf, todayISO } from "@/lib/dates";
import type { DashboardData, SavedLayout, WorkspaceConfig } from "@/lib/dashboardTypes";
import { canOpenPage } from "@/lib/pageAccess";

type Db = Awaited<ReturnType<typeof createClient>>;

async function guard(): Promise<{ supabase: Db; userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await canOpenPage(supabase, user, "/dashboard"))) return null;
  return { supabase, userId: user.id };
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function classify(result: string | null): "pass" | "caution" | "fail" | "other" {
  const r = (result ?? "").toLowerCase();
  if (r.includes("fail") || r.includes("urgent")) return "fail";
  if (r.includes("caution")) return "caution";
  if (r.includes("pass")) return "pass";
  return "other";
}

async function section<T>(work: () => Promise<T>): Promise<T | undefined> {
  try {
    return await work();
  } catch {
    return undefined;
  }
}

// Everything the widgets need, in one trip.
export async function getDashboardData(): Promise<DashboardData | null> {
  const ctx = await guard();
  if (!ctx) return null;
  const { supabase } = ctx;
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const since = new Date(Date.now() - 15 * 86_400_000).toISOString();

  const [orders, loads, arrivals, qcRows, ar, cold, buyers, agents, out, devices] = await Promise.all([
    section(async () => {
      const [{ data: rows, error }, { data: legend }] = await Promise.all([
        supabase.from("pending_orders").select("ship_date, moved_to, greyed, legend_id"),
        supabase.from("order_legend").select("id, name, color, opacity").order("position", { ascending: true }),
      ]);
      if (error) throw new Error(error.message);
      const pending = (rows ?? []).filter((o) => !o.greyed);
      const dueOn = (o: { ship_date: string | null; moved_to: string | null }) =>
        o.moved_to && o.moved_to > today ? o.moved_to : o.ship_date && o.ship_date > today ? o.ship_date : today;
      const known = new Set((legend ?? []).map((l) => l.id as string));
      return {
        today: pending.filter((o) => dueOn(o) === today).length,
        tomorrow: pending.filter((o) => dueOn(o) === tomorrow).length,
        later: pending.filter((o) => dueOn(o) > tomorrow).length,
        all: pending.length,
        labels: (legend ?? []).map((l) => ({
          name: l.name as string,
          color: l.color as string,
          opacity: Number(l.opacity),
          count: pending.filter((o) => o.legend_id === l.id).length,
        })),
        noLabel: pending.filter((o) => !o.legend_id || !known.has(o.legend_id as string)).length,
      };
    }),
    section(async () => {
      const { data, error } = await supabase
        .from("loads")
        .select("id, eta_note, pod_pending, load_stops(position, client_name, destination_city, destination_state)")
        .eq("status", "on_the_road")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      return {
        onRoad: rows.length,
        podPending: rows.filter((l) => l.pod_pending).length,
        list: rows.slice(0, 6).map((l) => {
          const stops = (l.load_stops ?? []) as { position: number; client_name: string | null; destination_city: string | null; destination_state: string | null }[];
          const stop = [...stops].sort((a, b) => a.position - b.position)[0];
          const place = stop ? [stop.client_name, [stop.destination_city, stop.destination_state].filter(Boolean).join(", ")].filter(Boolean).join(" - ") : "";
          return { id: l.id as string, label: place || "Load", eta: (l.eta_note as string | null) ?? null, podPending: !!l.pod_pending };
        }),
      };
    }),
    section(async () => {
      const day = DAY_NAMES[new Date(`${today}T12:00:00Z`).getUTCDay()];
      const [{ data: rows, error }, { data: growers }, { data: commodities }] = await Promise.all([
        supabase.from("mx_arrivals").select("grower_id, commodity_1_id, arrived").eq("week_start_date", currentWeekStart()).eq("arrival_day", day),
        supabase.from("mx_growers").select("id, name"),
        supabase.from("mx_commodities").select("id, name"),
      ]);
      if (error) throw new Error(error.message);
      const g = new Map((growers ?? []).map((x) => [x.id as string, x.name as string]));
      const c = new Map((commodities ?? []).map((x) => [x.id as string, x.name as string]));
      const list = (rows ?? []).map((r) => ({
        grower: g.get(r.grower_id as string) ?? "Grower?",
        commodity: c.get(r.commodity_1_id as string) ?? "",
        arrived: !!r.arrived,
      }));
      return { total: list.length, arrived: list.filter((x) => x.arrived).length, list: list.slice(0, 8) };
    }),
    section(async () => {
      const { data, error } = await supabase
        .from("qc_lot_inspections")
        .select("inspection_time, result, lot_number, product_label, commodity, defects, sample_size")
        .gte("inspection_time", since)
        .order("inspection_time", { ascending: false })
        .limit(2500);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
    section(async () => {
      const { data, error } = await supabase.from("ar_invoices").select("invoice_date, due_date, balance, highlight, trouble_status");
      if (error) throw new Error(error.message);
      const invoices = (data ?? []).filter((i) => i.trouble_status !== "pending");
      const totals = new Map(AR_AGING_BUCKETS.map((b) => [b.key, 0]));
      for (const inv of invoices) {
        const k = arAgingBucket({ invoice_date: inv.invoice_date as string | null, due_date: inv.due_date as string | null });
        totals.set(k, (totals.get(k) ?? 0) + Number(inv.balance));
      }
      return {
        total: invoices.reduce((s, i) => s + Number(i.balance), 0),
        escalated: invoices.filter((i) => i.highlight === "red").length,
        buckets: AR_AGING_BUCKETS.map((b) => ({ label: b.label, value: totals.get(b.key) ?? 0 })),
      };
    }),
    section(async () => {
      const { data, error } = await supabase.from("cold_inventory_items").select("status, qty");
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      return {
        items: rows.length,
        issues: rows.filter((r) => r.status === "issue").length,
        dumps: rows.filter((r) => r.status === "dump").length,
        cases: rows.reduce((s, r) => s + Number(r.qty ?? 0), 0),
      };
    }),
    section(async () => {
      const { data, error } = await supabase.from("buyers_list_items").select("comm, variety, size, qty_needed").order("qty_needed", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      return {
        count: rows.length,
        top: rows.slice(0, 5).map((r) => ({
          name: [r.comm, r.variety, r.size].filter(Boolean).join(" "),
          qty: Number(r.qty_needed),
        })),
      };
    }),
    section(async () => {
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
      const [drafts, replies, answered] = await Promise.all([
        supabase.from("agent_threads").select("id", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("agent_replies").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
        supabase.from("agent_replies").select("from_email").gte("created_at", dayAgo),
      ]);
      return {
        drafts: drafts.count ?? 0,
        replies: replies.count ?? 0,
        answeredToday: new Set((answered.data ?? []).map((r) => (r.from_email as string | null) ?? "")).size,
      };
    }),
    section(async () => {
      const [pto, callouts, soon] = await Promise.all([
        supabase.from("pto_requests").select("employee_name, notes").lte("start_date", today).gte("end_date", today),
        supabase.from("callout_entries").select("employee_name, call_out_type, reason").eq("entry_date", today),
        supabase.from("pto_requests").select("id", { count: "exact", head: true }).gt("start_date", today).lte("start_date", addDays(today, 7)),
      ]);
      return {
        today: [
          ...(pto.data ?? []).map((p) => ({ name: p.employee_name as string, kind: "PTO", note: (p.notes as string | null) ?? null })),
          ...(callouts.data ?? []).map((c) => ({ name: c.employee_name as string, kind: (c.call_out_type as string) || "Called out", note: (c.reason as string | null) ?? null })),
        ],
        startingThisWeek: soon.count ?? 0,
      };
    }),
    section(async () => {
      const { data, error } = await supabase.from("devices").select("has_issue, assigned_to");
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      return { total: rows.length, flagged: rows.filter((d) => d.has_issue).length, unassigned: rows.filter((d) => !d.assigned_to).length };
    }),
  ]);

  // QC: today's split and worst lots, and the average defect rate by day.
  let qc: DashboardData["qc"];
  let trend: DashboardData["trend"];
  if (qcRows) {
    const todays = qcRows.filter((r) => isoDateOf(r.inspection_time as string) === today);
    const split = { pass: 0, caution: 0, fail: 0, other: 0 };
    for (const r of todays) split[classify(r.result as string | null)]++;
    qc = {
      total: todays.length,
      ...split,
      worst: todays
        .filter((r) => classify(r.result as string | null) === "fail")
        .slice(0, 4)
        .map((r) => ({ lot: (r.lot_number as string | null) ?? "", product: [r.commodity, r.product_label].filter(Boolean).join(" "), result: (r.result as string | null) ?? "" })),
    };
    const byDay = new Map<string, number[]>();
    for (const r of qcRows) {
      const size = Number(r.sample_size);
      if (!size) continue;
      const count = ((r.defects ?? []) as { count: number }[]).reduce((s, d) => s + (d.count || 0), 0);
      const day = isoDateOf(r.inspection_time as string);
      byDay.set(day, [...(byDay.get(day) ?? []), (count / size) * 100]);
    }
    trend = {
      points: [...byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({ date, value: Number((v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)) })),
    };
  }

  return { fetchedAt: new Date().toISOString(), today, orders, loads, arrivals, qc, trend, ar, cold, buyers, agents, out, devices };
}

// Saved layouts (each person's own) ---------------------------------------------

export async function listLayouts(): Promise<SavedLayout[]> {
  const ctx = await guard();
  if (!ctx) return [];
  const { data } = await ctx.supabase.from("dashboard_layouts").select("id, name, config, is_default").eq("user_id", ctx.userId).order("name", { ascending: true });
  return (data ?? []) as SavedLayout[];
}

export async function saveLayout(name: string, config: WorkspaceConfig, makeDefault: boolean): Promise<{ error: string } | { layout: SavedLayout }> {
  const ctx = await guard();
  if (!ctx) return { error: "Not allowed." };
  const clean = name.trim();
  if (!clean) return { error: "Give the layout a name." };
  const { supabase, userId } = ctx;

  const { data: mine } = await supabase.from("dashboard_layouts").select("id, name").eq("user_id", userId);
  const existing = (mine ?? []).find((l) => (l.name as string).toLowerCase() === clean.toLowerCase());
  if (makeDefault) await supabase.from("dashboard_layouts").update({ is_default: false }).eq("user_id", userId);

  const row = { name: clean, config, is_default: makeDefault, updated_at: new Date().toISOString() };
  const query = existing
    ? supabase.from("dashboard_layouts").update(makeDefault ? row : { name: clean, config, updated_at: row.updated_at }).eq("id", existing.id).select("id, name, config, is_default").single()
    : supabase.from("dashboard_layouts").insert({ ...row, user_id: userId }).select("id, name, config, is_default").single();
  const { data, error } = await query;
  if (error || !data) return { error: error?.message ?? "Couldn't save the layout." };
  return { layout: data as SavedLayout };
}

export async function deleteLayout(id: string): Promise<{ error: string } | { ok: true }> {
  const ctx = await guard();
  if (!ctx) return { error: "Not allowed." };
  const { error } = await ctx.supabase.from("dashboard_layouts").delete().eq("id", id).eq("user_id", ctx.userId);
  return error ? { error: error.message } : { ok: true };
}

export async function setDefaultLayout(id: string): Promise<{ error: string } | { ok: true }> {
  const ctx = await guard();
  if (!ctx) return { error: "Not allowed." };
  await ctx.supabase.from("dashboard_layouts").update({ is_default: false }).eq("user_id", ctx.userId);
  const { error } = await ctx.supabase.from("dashboard_layouts").update({ is_default: true }).eq("id", id).eq("user_id", ctx.userId);
  return error ? { error: error.message } : { ok: true };
}
