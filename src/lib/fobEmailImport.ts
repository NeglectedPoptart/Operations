import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_TIMEZONE, todayISO } from "./dates";
import { matchFobPriceLines, parseFobPriceEmail } from "./fobEmailParse";
import { ensureTodayFobItems } from "./fobDaily";
import { SUPREME_EMAIL } from "./roles";
import type { FobItem } from "./types";

// The morning Availability email from Jacob Romero (an Outlook rule redirects it to the HOPS
// mailbox), read by the HOPS inbox reader and applied to today's FOB Pharr sheet with the same
// parser FOB Pharr's "Paste from Email" uses. Nothing is sent - the prices are just filled in.

// Only these senders count: Jacob, and the owner (forwarding an old email to test it).
export const FOB_EMAIL_SENDERS = ["jromero@harvestbestinc.com", SUPREME_EMAIL.toLowerCase()];

// An email that arrives outside these hours is recorded but not applied on its own - FOB Pharr
// shows it with an "Apply now" button. Central time, minutes after midnight.
export const FOB_EMAIL_WINDOW = { startMinutes: 5 * 60, endMinutes: 10 * 60, label: "5am-10am" };

export function isAvailabilityEmail(msg: { fromEmail: string; subject: string }): boolean {
  return FOB_EMAIL_SENDERS.includes(msg.fromEmail.toLowerCase()) && /availab/i.test(msg.subject);
}

export function withinFobEmailWindow(receivedAtISO: string): boolean {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", minute: "numeric", hourCycle: "h23" });
  const parts = f.formatToParts(new Date(receivedAtISO));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const minutes = get("hour") * 60 + get("minute");
  return minutes >= FOB_EMAIL_WINDOW.startMinutes && minutes <= FOB_EMAIL_WINDOW.endMinutes;
}

export interface FobEmailResult {
  pricesFound: number;
  itemsUpdated: number;
  unmatched: { category: string; label: string; price: number }[];
}

// Parses the email text and writes each matched price onto today's FOB sheet (created from the
// previous day's items first if nobody has opened FOB Pharr yet today).
export async function applyFobEmailText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  text: string,
): Promise<FobEmailResult> {
  const parsed = parseFobPriceEmail(text);
  if (parsed.length === 0) return { pricesFound: 0, itemsUpdated: 0, unmatched: [] };

  const items: FobItem[] = await ensureTodayFobItems(db as unknown as Parameters<typeof ensureTodayFobItems>[0], todayISO());
  const matches = matchFobPriceLines(parsed, items);

  // An item named by two lines keeps the last price, same as the paste flow.
  const priceByItem = new Map<string, number>();
  for (const line of matches) for (const item of line.matches) priceByItem.set(item.id, line.price);
  for (const [id, fob] of priceByItem) {
    const { error } = await db.from("fob_items").update({ fob }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  return {
    pricesFound: parsed.length,
    itemsUpdated: priceByItem.size,
    unmatched: matches.filter((m) => m.matches.length === 0).map((m) => ({ category: m.category, label: m.label, price: m.price })),
  };
}

// Handles one Availability email from the inbox. Returns false when this message was already
// handled (the inbox reader re-reads the newest message each poll).
export async function importFobEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  msg: { id: string; fromEmail: string; subject: string; receivedAt: string; fullText: string },
): Promise<boolean> {
  const { data: existing, error: lookupError } = await db.from("fob_email_imports").select("id").eq("graph_message_id", msg.id).maybeSingle();
  // Table missing (migration 159 not run): do nothing, or the prices would be re-applied every poll.
  if (lookupError || existing) return false;

  const base = {
    graph_message_id: msg.id,
    received_at: msg.receivedAt,
    from_email: msg.fromEmail,
    subject: msg.subject,
    body_text: msg.fullText,
    entry_date: todayISO(),
  };

  if (!withinFobEmailWindow(msg.receivedAt)) {
    await db.from("fob_email_imports").insert({
      ...base,
      status: "skipped",
      note: `Arrived outside the ${FOB_EMAIL_WINDOW.label} window, so it was not applied automatically.`,
    });
    return true;
  }

  try {
    const result = await applyFobEmailText(db, msg.fullText);
    await db.from("fob_email_imports").insert({
      ...base,
      status: result.pricesFound === 0 ? "nothing_found" : "applied",
      prices_found: result.pricesFound,
      items_updated: result.itemsUpdated,
      unmatched: result.unmatched,
      note: result.pricesFound === 0 ? "No price lines were found in this email." : null,
    });
  } catch (err) {
    await db.from("fob_email_imports").insert({
      ...base,
      status: "error",
      note: err instanceof Error ? err.message : String(err),
    });
  }
  return true;
}
