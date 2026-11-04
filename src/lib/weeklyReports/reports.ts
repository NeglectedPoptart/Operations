import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayISO } from "../dates";
import { MX_ARRIVAL_DAYS, type MxArrival } from "../types";
import {
  GREEN,
  centralParts,
  clock,
  dayMd,
  empty,
  esc,
  heading,
  md,
  money,
  note,
  pill,
  stamp,
  stats,
  table,
  tally,
} from "./html";

// The Supreme > Weekly Reports page. Each report reads HOPS data for a date range and returns HTML
// (page preview and email use the same HTML) plus a one-line summary for its card.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface ReportRange {
  start: string; // YYYY-MM-DD, inclusive
  end: string;
}

export interface BuiltReport {
  id: string;
  title: string;
  summary: string;
  html: string;
}

// The default range: the 5 days ending on the given day (opened Friday = Mon-Fri, Thursday = Sun-Thu).
export function defaultRange(end: string = todayISO()): ReportRange {
  return { start: addDays(end, -4), end };
}

export function rangeLabel(r: ReportRange): string {
  return `${dayMd(r.start)} - ${dayMd(r.end)}`;
}

const inRange = (date: string | null | undefined, r: ReportRange) => !!date && date >= r.start && date <= r.end;
const words = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const tallyLine = (pairs: [string, number][]) => pairs.map(([k, n]) => `${k}: ${n}`).join("  ·  ");

// ---------------------------------------------------------------------------
// Call-outs + performance notes

async function calloutsReport(db: Db, r: ReportRange): Promise<BuiltReport> {
  const [callouts, quick, major] = await Promise.all([
    db.from("callout_entries").select("*").gte("entry_date", r.start).lte("entry_date", r.end).order("entry_date"),
    db
      .from("performance_review_quick_notes")
      .select("*")
      .or(`and(occurred_date.gte.${r.start},occurred_date.lte.${r.end}),and(occurred_date.is.null,created_at.gte.${r.start}T00:00:00,created_at.lte.${r.end}T23:59:59)`)
      .order("occurred_date"),
    db
      .from("performance_review_major_issues")
      .select("*")
      .or(`and(occurred_date.gte.${r.start},occurred_date.lte.${r.end}),and(occurred_date.is.null,created_at.gte.${r.start}T00:00:00,created_at.lte.${r.end}T23:59:59)`)
      .order("occurred_date"),
  ]);
  const err = callouts.error ?? quick.error ?? major.error;
  if (err) throw new Error(err.message);

  const co = callouts.data ?? [];
  const qn = quick.data ?? [];
  const mi = major.data ?? [];
  const ISSUE: Record<string, string> = { formal_warning: "Formal warning", informal_warning: "Informal warning", major_issue_resolved: "Major issue (resolved)" };

  const html = [
    stats([
      ["Call-outs", co.length],
      ["Quick notes", qn.length],
      ["Major issues", mi.length],
    ]),
    heading("Call-outs"),
    co.length > 0 ? note(tallyLine(tally(co.map((c) => c.call_out_type)))) : "",
    table(
      ["Date", "Employee", "Type", "Reason", "Notified", "Approved", "Return"],
      co.map((c) => [dayMd(c.entry_date), c.employee_name, c.call_out_type, c.reason, c.notified_at, c.approved ? words(c.approved) : "", md(c.return_date)]),
    ) || empty("No call-outs this period."),
    heading("Quick notes (performance reviews)"),
    table(
      ["Date", "Employee", "Note", "Follow-up"],
      qn.map((q) => [dayMd(q.occurred_date ?? String(q.created_at).slice(0, 10)), q.employee_name, q.note, [q.follow_up_notes, q.follow_up_date && `by ${md(q.follow_up_date)}`].filter(Boolean).join(" ")]),
    ) || empty("No quick notes this period."),
    heading("Major issues (performance reviews)"),
    table(
      ["Date", "Employee", "Type", "What happened", "Action plan"],
      mi.map((m) => [dayMd(m.occurred_date ?? String(m.created_at).slice(0, 10)), m.employee_name, ISSUE[m.issue_type as string] ?? words(m.issue_type), m.description, m.action_plan]),
    ) || empty("No major issues this period."),
  ].join("");

  return { id: "callouts", title: "Call-outs and performance notes", summary: `${co.length} call-outs, ${qn.length} quick notes, ${mi.length} major issues`, html };
}

// ---------------------------------------------------------------------------
// QC inspections

async function qcReport(db: Db, r: ReportRange): Promise<BuiltReport> {
  const { data, error } = await db.from("qc_inspections").select("*").gte("entry_date", r.start).lte("entry_date", r.end).order("entry_date").order("position");
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const html = [
    stats([
      ["Inspections", rows.length],
      ["Report sent", rows.filter((x) => x.report).length],
      ["Mailed", rows.filter((x) => x.mail).length],
    ]),
    rows.length > 0 ? note(`By inspector - ${tallyLine(tally(rows.map((x) => x.qc)))}`) : "",
    rows.length > 0 ? note(`By result - ${tallyLine(tally(rows.map((x) => x.result)))}`) : "",
    table(
      ["Date", "PO", "Lot", "Product", "QC", "Status", "Result", "Notes"],
      rows.map((x) => [dayMd(x.entry_date), x.po, x.lot, x.product, x.qc, x.status, x.result, x.notes]),
      { max: 100 },
    ) || empty("No QC inspections logged this period."),
  ].join("");

  return { id: "qc", title: "QC inspections", summary: `${rows.length} inspections`, html };
}

// ---------------------------------------------------------------------------
// Logistics loads

type LoadRow = {
  id: string;
  loading_date: string | null;
  source: string | null;
  status: string;
  rate: number | null;
  eta_note: string | null;
  updated_at: string;
  brokers: { name: string } | null;
  load_stops: { position: number; client_name: string | null; destination_city: string | null; destination_state: string | null; order_number: string | null; po_number: string | null; delivery_date: string | null; appointment: string | null }[];
};

async function logisticsReport(db: Db, r: ReportRange): Promise<BuiltReport> {
  const select = "id, loading_date, source, status, rate, eta_note, updated_at, brokers(name), load_stops(position, client_name, destination_city, destination_state, order_number, po_number, delivery_date, appointment)";
  const [pending, road, done] = await Promise.all([
    db.from("loads").select(select).eq("status", "pending_to_load").order("loading_date"),
    db.from("loads").select(select).eq("status", "on_the_road").order("loading_date"),
    // delivered loads from a window around the range; trimmed to the range below
    db.from("loads").select(select).eq("status", "complete").gte("updated_at", `${addDays(r.start, -30)}T00:00:00`).order("loading_date"),
  ]);
  const err = pending.error ?? road.error ?? done.error;
  if (err) throw new Error(err.message);

  const sortedStops = (l: LoadRow) => [...l.load_stops].sort((a, b) => a.position - b.position);
  const deliveredIn = (l: LoadRow) => {
    const dates = l.load_stops.map((s) => s.delivery_date).filter((d): d is string => !!d);
    if (dates.length > 0) return dates.some((d) => inRange(d, r));
    return inRange(centralParts(l.updated_at).date, r);
  };
  const pend = (pending.data ?? []) as unknown as LoadRow[];
  const onRoad = (road.data ?? []) as unknown as LoadRow[];
  const delivered = ((done.data ?? []) as unknown as LoadRow[]).filter(deliveredIn);

  const toRow = (l: LoadRow, eta: boolean): (string | number | null)[] => {
    const stops = sortedStops(l);
    return [
      md(l.loading_date),
      l.source,
      stops.map((s) => [s.client_name, [s.destination_city, s.destination_state].filter(Boolean).join(", ")].filter(Boolean).join(" - ")).join(" / "),
      stops.map((s) => [s.order_number && `#${s.order_number}`, s.po_number && `PO ${s.po_number}`].filter(Boolean).join(" ")).filter(Boolean).join(", "),
      l.brokers?.name ?? "",
      stops.map((s) => (s.delivery_date ? `${md(s.delivery_date)}${s.appointment ? ` ${s.appointment}` : ""}` : "")).filter(Boolean).join(", "),
      l.rate !== null ? money(Number(l.rate)) : "",
      eta ? l.eta_note : "",
    ];
  };
  const headers = ["Loaded", "From", "To", "Order / PO", "Carrier", "Delivery", "Freight", "ETA"];
  const freight = (list: LoadRow[]) => list.reduce((s, l) => s + (l.rate !== null ? Number(l.rate) : 0), 0);

  const html = [
    stats([
      ["Pending to load", pend.length],
      ["On the road", onRoad.length],
      ["Delivered", delivered.length],
      ["Delivered freight", money(freight(delivered))],
    ]),
    heading(`Pending to load (${pend.length})`),
    table(headers, pend.map((l) => toRow(l, false))) || empty("Nothing pending to load."),
    heading(`On the road (${onRoad.length})`),
    table(headers, onRoad.map((l) => toRow(l, true))) || empty("Nothing on the road."),
    heading(`Delivered ${md(r.start)} - ${md(r.end)} (${delivered.length})`),
    table(headers, delivered.map((l) => toRow(l, false))) || empty("No loads delivered in this period."),
  ].join("");

  return { id: "logistics", title: "Logistics loads", summary: `${pend.length} pending, ${onRoad.length} on the road, ${delivered.length} delivered`, html };
}

// ---------------------------------------------------------------------------
// CRM activity

async function crmReport(db: Db, r: ReportRange): Promise<BuiltReport> {
  const [acts, newCos] = await Promise.all([
    db.from("crm_activities").select("*, crm_companies(name)").gte("activity_date", r.start).lte("activity_date", r.end).order("activity_date"),
    db.from("crm_companies").select("id").gte("created_at", `${r.start}T00:00:00`).lte("created_at", `${r.end}T23:59:59`),
  ]);
  const err = acts.error ?? newCos.error;
  if (err) throw new Error(err.message);
  const rows = (acts.data ?? []) as unknown as (Record<string, string | null> & { crm_companies: { name: string } | null })[];

  const html = [
    stats([
      ["Activities", rows.length],
      ["Companies touched", new Set(rows.map((x) => x.company_id)).size],
      ["New prospects", (newCos.data ?? []).length],
    ]),
    rows.length > 0 ? note(`By type - ${tallyLine(tally(rows.map((x) => words(x.activity_type))))}`) : "",
    rows.length > 0 ? note(`By outcome - ${tallyLine(tally(rows.map((x) => words(x.outcome))))}`) : "",
    rows.length > 0 ? note(`By owner - ${tallyLine(tally(rows.map((x) => x.owner)))}`) : "",
    table(
      ["Date", "Company", "Contact", "Type", "Outcome", "Notes", "Next step"],
      rows.map((x) => [dayMd(x.activity_date), x.crm_companies?.name ?? "", x.contact_person, words(x.activity_type), words(x.outcome), x.notes, [x.next_action, x.next_follow_up && `by ${md(x.next_follow_up)}`].filter(Boolean).join(" ")]),
      { max: 100 },
    ) || empty("No CRM activity logged this period."),
  ].join("");

  return { id: "crm", title: "CRM activity", summary: `${rows.length} activities, ${(newCos.data ?? []).length} new prospects`, html };
}

// ---------------------------------------------------------------------------
// Vendor catalog: price sheet uploads

async function vendorsReport(db: Db, r: ReportRange): Promise<BuiltReport> {
  const since = `${addDays(r.start, -1)}T00:00:00`;
  const log = await db.from("price_sheet_uploads").select("vendor_name, item_count, uploaded_at").gte("uploaded_at", since).order("uploaded_at");
  let uploads: { vendor: string; at: string; items: number | null }[] = [];
  let estimated = false;
  if (!log.error) uploads = (log.data ?? []).map((u) => ({ vendor: (u.vendor_name as string) ?? "?", at: u.uploaded_at as string, items: u.item_count as number }));

  // Before the upload log existed (or while it is empty) the best available record is each vendor's
  // latest upload, taken from the vendor row itself.
  if (uploads.length === 0) {
    const vendors = await db.from("vendors").select("name, updated_at").gte("updated_at", since);
    if (vendors.error) throw new Error(vendors.error.message);
    uploads = (vendors.data ?? []).map((v) => ({ vendor: v.name as string, at: v.updated_at as string, items: null }));
    estimated = true;
  }

  const parts = uploads.map((u) => ({ ...u, ...centralParts(u.at) })).filter((u) => inRange(u.date, r));
  const days: string[] = [];
  for (let d = r.start; d <= r.end; d = addDays(d, 1)) days.push(d);
  const avg = (list: { minutes: number }[]) => (list.length > 0 ? list.reduce((s, x) => s + x.minutes, 0) / list.length : null);

  const dayRows = days.map((d) => {
    const list = parts.filter((p) => p.date === d);
    const a = avg(list);
    return [
      dayMd(d),
      list.length,
      new Set(list.map((p) => p.vendor)).size,
      a !== null ? clock(a) : "",
      list.length > 0 ? clock(Math.min(...list.map((p) => p.minutes))) : "",
      list.length > 0 ? clock(Math.max(...list.map((p) => p.minutes))) : "",
    ];
  });
  const overall = avg(parts);
  const byVendor = tally(parts.map((p) => p.vendor));

  const html = [
    stats([
      ["Uploads", parts.length],
      ["Vendors", new Set(parts.map((p) => p.vendor)).size],
      ["Avg upload time", overall !== null ? clock(overall) : "-"],
    ]),
    table(["Day", "Uploads", "Vendors", "Average time", "Earliest", "Latest"], dayRows),
    heading("Uploads by vendor"),
    table(["Vendor", "Uploads"], byVendor.map(([v, n]) => [v, n])) || empty("No uploads in this period."),
    estimated
      ? note("Upload logging started with this report. Until it has history, each vendor is counted once, at its most recent upload - so earlier days may read low.")
      : "",
  ].join("");

  return { id: "vendors", title: "Vendor catalog uploads", summary: `${parts.length} price sheet uploads${overall !== null ? `, average ${clock(overall)}` : ""}`, html };
}

// ---------------------------------------------------------------------------
// Compliance: PAS files

async function complianceReport(db: Db, r: ReportRange): Promise<BuiltReport> {
  const since = `${addDays(r.start, -1)}T00:00:00`;
  const [files, log] = await Promise.all([
    db.from("pas_files").select("*").neq("order_no", "").order("ship_date", { ascending: true, nullsFirst: false }),
    db.from("pas_file_log").select("*").gte("created_at", since).order("created_at", { ascending: false }),
  ]);
  if (files.error) throw new Error(files.error.message);
  const logMissing = !!log.error;
  const changes = ((log.data ?? []) as { pas_file_id: string; order_no: string | null; po: string | null; customer: string | null; action: string; changed_fields: string[]; changed_by: string | null; created_at: string }[]).filter((c) =>
    inRange(centralParts(c.created_at).date, r),
  );
  const distinct = (action: string) => new Set(changes.filter((c) => c.action === action).map((c) => c.pas_file_id)).size;
  const rows = files.data ?? [];
  const today = todayISO();
  const days = (ship: string | null) => (ship ? Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${ship}T00:00:00Z`).getTime()) / 86_400_000) : "");

  const html = [
    stats([
      ["PAS files open", rows.length],
      ["Added", distinct("added")],
      ["Changed", distinct("changed")],
      ["Removed", distinct("removed")],
    ]),
    logMissing ? note("The PAS change log isn't set up yet, so added / changed / removed can't be shown.") : note("Added, changed and removed count distinct files in this period."),
    heading("Changes this period"),
    table(
      ["When", "What", "Order", "PO", "Customer", "Fields changed", "By"],
      changes.map((c) => [stamp(c.created_at), { html: pill(words(c.action), c.action === "removed" ? "#c62828" : c.action === "added" ? GREEN : "#ef6c00") }, c.order_no, c.po, c.customer, (c.changed_fields ?? []).map(words).join(", "), c.changed_by]),
      { max: 60 },
    ) || empty("No PAS file changes logged this period."),
    heading("All PAS files"),
    table(
      ["Order", "PO", "Customer", "Ship date", "Days", "Status", "Update notes", "Notes", "Last contact"],
      rows.map((p) => [p.order_no, p.po, p.customer, md(p.ship_date), days(p.ship_date), p.status, p.update_notes, p.notes, p.last_contact]),
      { max: 150 },
    ) || empty("No PAS files."),
  ].join("");

  return { id: "compliance", title: "Compliance - PAS files", summary: `${rows.length} open, ${distinct("added")} added, ${distinct("changed")} changed, ${distinct("removed")} removed`, html };
}

// ---------------------------------------------------------------------------
// Mexico arrivals

async function mexicoReport(db: Db, r: ReportRange): Promise<BuiltReport> {
  const [growers, labels, commodities, arrivedRes, pendingRes] = await Promise.all([
    db.from("mx_growers").select("id, name, origin"),
    db.from("mx_grower_labels").select("id, name"),
    db.from("mx_commodities").select("id, name"),
    db.from("mx_arrivals").select("*").eq("arrived", true).gte("updated_at", `${addDays(r.start, -1)}T00:00:00`),
    db.from("mx_arrivals").select("*").eq("arrived", false).gte("week_start_date", addDays(r.start, -7)),
  ]);
  const err = growers.error ?? labels.error ?? commodities.error ?? arrivedRes.error ?? pendingRes.error;
  if (err) throw new Error(err.message);

  const growerName = new Map((growers.data ?? []).map((g) => [g.id as string, g]));
  const labelName = new Map((labels.data ?? []).map((l) => [l.id as string, l.name as string]));
  const commName = new Map((commodities.data ?? []).map((c) => [c.id as string, c.name as string]));
  const what = (a: MxArrival) =>
    [a.commodity_1_id, a.commodity_2_id, a.commodity_3_id, a.commodity_4_id].map((id) => (id ? commName.get(id) : "")).filter(Boolean).join(" / ");
  const dayIndex = new Map(MX_ARRIVAL_DAYS.map((d, i) => [d.value, i]));
  const estDate = (a: MxArrival) => (a.arrival_day ? addDays(a.week_start_date, dayIndex.get(a.arrival_day) ?? 0) : null);

  // Arrived in the range: the tick's own timestamp where it was recorded, otherwise the row's last edit.
  const arrived = ((arrivedRes.data ?? []) as MxArrival[])
    .map((a) => ({ a, at: a.arrived_at ?? a.updated_at }))
    .filter(({ at }) => inRange(centralParts(at).date, r))
    .sort((x, y) => x.at.localeCompare(y.at));
  const byGrower = new Map<string, typeof arrived>();
  for (const x of arrived) {
    const key = x.a.grower_id ?? "none";
    byGrower.set(key, [...(byGrower.get(key) ?? []), x]);
  }
  const growerSections = [...byGrower.entries()]
    .sort((a, b) => (growerName.get(a[0])?.name ?? "~").localeCompare(growerName.get(b[0])?.name ?? "~"))
    .map(([id, list]) => {
      const g = growerName.get(id);
      return (
        heading(`${g?.name ?? "No grower set"}${g?.origin ? ` (${g.origin})` : ""} - ${list.length} load${list.length === 1 ? "" : "s"}`) +
        table(
          ["Arrived", "Commodity", "Label", "Boxes", "Manifesto", "Notes"],
          list.map(({ a, at }) => [stamp(at), what(a), a.label_id ? labelName.get(a.label_id) : "", a.boxes_approx, a.manifesto, a.notes]),
        )
      );
    });

  // Not arrived yet: everything still expected, in arrival order.
  const pending = ((pendingRes.data ?? []) as MxArrival[])
    .map((a) => ({ a, est: estDate(a) }))
    .filter(({ est }) => est === null || est >= r.start)
    .sort((x, y) => (x.est ?? "9999").localeCompare(y.est ?? "9999"));
  const today = todayISO();

  const html = [
    stats([
      ["Arrived", arrived.length],
      ["Growers", byGrower.size],
      ["Still to arrive", pending.length],
    ]),
    heading(`Arrived ${md(r.start)} - ${md(r.end)}, by grower`),
    growerSections.join("") || empty("No loads were marked arrived in this period."),
    heading(`Pending to arrive (${pending.length})`),
    table(
      ["Est. arrival", "Grower", "Commodity", "Label", "Boxes", "Manifesto", "ETA / notes"],
      pending.map(({ a, est }) => [
        { html: `${esc(est ? dayMd(est) : "No day set")}${est && est < today ? " " + pill("overdue", "#c62828") : ""}` },
        growerName.get(a.grower_id ?? "")?.name ?? "",
        what(a),
        a.label_id ? labelName.get(a.label_id) : "",
        a.boxes_approx,
        a.manifesto,
        [a.eta, a.notes].filter(Boolean).join(" - "),
      ]),
      { max: 100 },
    ) || empty("Nothing pending to arrive."),
  ].join("");

  return { id: "mexico", title: "Mexico arrivals", summary: `${arrived.length} arrived, ${pending.length} still to arrive`, html };
}

// ---------------------------------------------------------------------------

export const REPORTS: { id: string; title: string; build: (db: Db, r: ReportRange) => Promise<BuiltReport> }[] = [
  { id: "callouts", title: "Call-outs and performance notes", build: calloutsReport },
  { id: "qc", title: "QC inspections", build: qcReport },
  { id: "logistics", title: "Logistics loads", build: logisticsReport },
  { id: "crm", title: "CRM activity", build: crmReport },
  { id: "vendors", title: "Vendor catalog uploads", build: vendorsReport },
  { id: "compliance", title: "Compliance - PAS files", build: complianceReport },
  { id: "mexico", title: "Mexico arrivals", build: mexicoReport },
];

// Builds the chosen reports (all of them by default). One failing report does not stop the others -
// it comes back as a short error section.
export async function buildReports(db: Db, r: ReportRange, ids?: string[]): Promise<BuiltReport[]> {
  const chosen = REPORTS.filter((x) => !ids || ids.includes(x.id));
  return Promise.all(
    chosen.map(async (x) => {
      try {
        return await x.build(db, r);
      } catch (e) {
        return {
          id: x.id,
          title: x.title,
          summary: "Could not load",
          html: empty(`This report could not be built: ${e instanceof Error ? e.message : String(e)}`),
        };
      }
    }),
  );
}

// The email: a header, then each report as a section.
export function reportsEmailHtml(reports: BuiltReport[], r: ReportRange): string {
  const sections = reports
    .map(
      (rep) =>
        `<div style="margin:0 0 22px;"><div style="background:${GREEN};color:#fff;padding:8px 12px;font-size:15px;font-weight:bold;font-family:Arial,Helvetica,sans-serif;">${esc(rep.title)}</div>` +
        `<div style="padding:6px 4px;">${rep.html}</div></div>`,
    )
    .join("");
  return (
    `<div style="max-width:900px;font-family:Arial,Helvetica,sans-serif;color:#222;">` +
    `<h2 style="margin:0 0 2px;color:${GREEN};">Harvest Best - Weekly Report</h2>` +
    `<p style="margin:0 0 16px;color:#555;font-size:13px;">${esc(rangeLabel(r))}</p>` +
    sections +
    `<p style="font-size:11px;color:#999;">Generated from HOPS.</p></div>`
  );
}
