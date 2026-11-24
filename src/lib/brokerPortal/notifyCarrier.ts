import { graphConfigured, sendEmail } from "@/lib/agents/graph";
import { appBaseUrl } from "@/lib/carrierRates/token";
import { adminClient } from "@/lib/supabase/admin";

// Tells a carrier when staff add something under their company: a load booked with them, or a charge
// put on one of their loads. The mirror of notifyStaff (which tells the owner when a carrier does
// something). Goes to the carrier's follow-up email(s) (HOPS Agents > Carrier Emails) and to their
// portal logins. Never throws - an email failing must not undo what staff just saved.

type Row = Record<string, unknown>;

function splitEmails(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

function money(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

interface CarrierLoad {
  load: Row;
  brokerName: string;
  to: string[];
  ref: string;
  stops: Row[];
  pickups: Row[];
}

async function carrierLoad(loadId: string): Promise<CarrierLoad | null> {
  const db = adminClient();
  const { data } = await db.from("loads").select("*, brokers(name, followup_email), load_stops(*), load_pickups(*)").eq("id", loadId).maybeSingle();
  const load = data as Row | null;
  if (!load || !load.broker_id) return null;
  const broker = load.brokers as { name?: string; followup_email?: string | null } | null;
  const { data: logins } = await db.from("profiles").select("email").eq("broker_id", load.broker_id as string).eq("role", "broker_carrier");
  const to = [...new Set([...splitEmails(broker?.followup_email), ...((logins ?? []) as Row[]).flatMap((p) => splitEmails(p.email as string | null))].map((e) => e.toLowerCase()))];
  if (to.length === 0) return null;
  const byPosition = (a: Row, b: Row) => (a.position as number) - (b.position as number);
  const stops = [...((load.load_stops as Row[]) ?? [])].sort(byPosition);
  const pickups = [...((load.load_pickups as Row[]) ?? [])].sort(byPosition);
  const orders = stops.map((s) => (s.order_number ? `#${s.order_number}` : null)).filter(Boolean);
  const pos = stops.map((s) => s.po_number).filter(Boolean);
  const ref = `${orders.join(", ") || "load"}${pos.length ? ` (PO ${pos.join(", ")})` : ""}`;
  return { load, brokerName: broker?.name ?? "there", to, ref, stops, pickups };
}

function dropLines(stops: Row[]): string[] {
  return stops.map((s, i) => {
    const where = [s.destination_city, s.destination_state].filter(Boolean).join(", ");
    const when = [dateLabel(s.delivery_date as string | null), s.delivery_time as string | null, s.appointment ? `appt ${s.appointment}` : ""].filter(Boolean).join(" ");
    const ids = [s.order_number ? `Order #${s.order_number}` : "", s.po_number ? `PO ${s.po_number}` : ""].filter(Boolean).join(", ");
    return `  ${stops.length > 1 ? `${i + 1}) ` : ""}${[s.client_name, where].filter(Boolean).join(" - ") || "Delivery"}${when ? ` - ${when}` : ""}${ids ? ` (${ids})` : ""}`;
  });
}

async function send(c: CarrierLoad, subject: string, lines: string[]): Promise<void> {
  const body = [`Hi ${c.brokerName},`, "", ...lines, "", `You can see everything on your loads in HOPS: ${appBaseUrl()}/logistics/broker-pending`, "", "Thank you,", "Harvest Best Inc."].join("\n");
  await sendEmail({ to: c.to, subject, body });
}

// A load was booked under this carrier (created with them, or reassigned to them).
export async function notifyCarrierNewLoad(loadId: string): Promise<void> {
  try {
    if (!graphConfigured()) return;
    const c = await carrierLoad(loadId);
    if (!c) return;
    const l = c.load;
    const pickup = [l.source as string | null, ...c.pickups.map((p) => [p.vendor, p.location].filter(Boolean).join(" - ") || null)].filter(Boolean);
    const lines = [
      "We've booked a new load with you.",
      "",
      ...(l.loading_date ? [`Loading: ${dateLabel(l.loading_date as string)}`] : []),
      ...(pickup.length > 0 ? [`Pickup: ${pickup.join(" / ")}`] : []),
      ...(l.rate !== null && l.rate !== undefined ? [`Rate: ${money(Number(l.rate))}`] : []),
      ...(c.stops.length > 0 ? [c.stops.length > 1 ? "Deliveries:" : "Delivery:", ...dropLines(c.stops)] : []),
      "",
      "Your rate confirmation will show on your list once it's ready for you to sign.",
    ];
    await send(c, `New load booked with Harvest Best - ${c.ref}`, lines);
  } catch {
    // the load is saved either way
  }
}

// A charge was added to one of this carrier's loads.
export async function notifyCarrierCharge(loadId: string, charge: { kind: string; amount: number; note: string | null }): Promise<void> {
  try {
    if (!graphConfigured()) return;
    const c = await carrierLoad(loadId);
    if (!c) return;
    const credit = charge.amount < 0;
    const lines = [
      credit ? `We've added a credit to your load ${c.ref}.` : `We've added a charge to your load ${c.ref}.`,
      "",
      `${credit ? "Credit" : "Charge"}: ${charge.kind} - ${money(charge.amount)}`,
      ...(charge.note ? [`Note: ${charge.note}`] : []),
      ...(c.stops.length > 0 ? ["", c.stops.length > 1 ? "Deliveries:" : "Delivery:", ...dropLines(c.stops)] : []),
      "",
      "If this doesn't look right, reply to this email.",
    ];
    await send(c, `${credit ? "Credit" : "Charge"} added to your load - ${c.ref}`, lines);
  } catch {
    // the charge is saved either way
  }
}
