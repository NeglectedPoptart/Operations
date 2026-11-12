import type { SupabaseClient } from "@supabase/supabase-js";
import { isoDateOf, todayISO } from "../dates";
import { ensureTodayFobItems } from "../fobDaily";
import { DEFAULT_DELIVERED_MESSAGE, DELIVERED_DESTINATION, DELIVERED_LANES, EAST_COAST_LANES, eastCoastSheet, houstonDallasSheet } from "../deliveredSheetSpec";
import { renderDeliveredSheetImage } from "../deliveredSheetsServer";
import type { FobFreightRate, FobItem } from "../types";
import { sendEmail } from "./graph";
import type { Agent } from "./types";

// The Delivered price sheet agent: once today's FOB Pharr prices have been filled in (by the morning
// Availability email, or "Apply now" on FOB Pharr), emails each Delivered price sheet - Houston, Dallas and
// East Coast - to that lane's To / Cc / Bcc list, the same picture and the same email as the
// "Email to customers" button on each Delivered page. One send per lane per day: it never sends a lane
// twice, and skips a lane someone already emailed by hand today.

// Replies go to Sales, same as the button.
const REPLY_TO = "sales@harvestbestinc.com";

export interface DeliveredSheetsContext {
  // Run now from the Agents page: don't wait for the FOB prices to be applied by email.
  force: boolean;
  log: (kind: string, message: string) => Promise<void>;
  notify: (title: string, body: string) => Promise<void>;
  notes: string[];
}

// A test run (test_to set) keeps its own record so it never counts as the real send, and also goes out only once a day.
const sentKey = (today: string, lane: string, test = false) => `delivered_sheet:${today}:${lane}${test ? ":test" : ""}`;

function parseList(value: unknown): string[] {
  return Array.isArray(value) ? (value as unknown[]).filter((v): v is string => typeof v === "string" && v.includes("@")) : [];
}

export async function runDeliveredSheets(db: SupabaseClient, agent: Agent, ctx: DeliveredSheetsContext): Promise<number> {
  const today = todayISO();

  if (!ctx.force) {
    const { data: applied, error } = await db.from("fob_email_imports").select("id").eq("entry_date", today).eq("status", "applied").limit(1);
    // Table missing (migration 159) or no applied Availability email yet today: nothing to do.
    if (error || !applied || applied.length === 0) return 0;
  }

  const lanes = (agent.config.lanes?.length ? agent.config.lanes : [...DELIVERED_LANES]).filter((l) => DELIVERED_DESTINATION[l]);
  const testTo = (agent.config.test_to ?? []).filter((e) => e.includes("@"));

  // Which lanes still need sending today?
  const due: string[] = [];
  for (const lane of lanes) {
    const { data: done } = await db.from("agent_state").select("key").eq("key", sentKey(today, lane, testTo.length > 0)).maybeSingle();
    if (!done) due.push(lane);
  }
  if (due.length === 0) return 0;

  const items: FobItem[] = await ensureTodayFobItems(db as unknown as Parameters<typeof ensureTodayFobItems>[0], today);
  if (!items.some((i) => i.fob !== null)) {
    const why = "No FOB prices are filled in for today yet - nothing to send.";
    if (ctx.force) ctx.notes.push(why);
    return 0;
  }

  let sent = 0;
  const sentNames: string[] = [];
  for (const lane of due) {
    try {
      if (await sendLane(db, ctx, { lane, today, items, testTo })) {
        sent++;
        sentNames.push(DELIVERED_DESTINATION[lane].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.log("error", `${DELIVERED_DESTINATION[lane]} Delivered price sheet could not be sent: ${message}`);
      if (ctx.force) ctx.notes.push(`${DELIVERED_DESTINATION[lane]}: ${message}`);
      // Tell the owner once per lane per day, not on every 15-minute run while it keeps failing.
      const failKey = `${sentKey(today, lane)}:failed`;
      const { data: told } = await db.from("agent_state").select("key").eq("key", failKey).maybeSingle();
      if (!told) {
        await db.from("agent_state").upsert({ key: failKey, value: message.slice(0, 500), updated_at: new Date().toISOString() });
        await ctx.notify("HOPS Agents", `The ${DELIVERED_DESTINATION[lane]} Delivered price sheet could not be sent: ${message}`);
      }
    }
  }
  if (sent > 0) await ctx.notify("HOPS Agents", `${testTo.length > 0 ? "TEST - " : ""}Delivered price sheets emailed: ${sentNames.join(", ")}.`);
  return sent;
}

// Returns true when the lane's email went out.
async function sendLane(
  db: SupabaseClient,
  ctx: DeliveredSheetsContext,
  input: { lane: string; today: string; items: FobItem[]; testTo: string[] },
): Promise<boolean> {
  const { lane, today, items, testTo } = input;
  const destination = DELIVERED_DESTINATION[lane];
  const markDone = (value: string, test = false) => db.from("agent_state").upsert({ key: sentKey(today, lane, test), value, updated_at: new Date().toISOString() });

  const { data: listRow, error: listError } = await db.from("delivered_email_lists").select("*").eq("lane", lane).maybeSingle();
  if (listError) {
    await ctx.log("skipped", `${destination} Delivered: emailing isn't set up yet (migration 151).`);
    return false;
  }
  const to = parseList(listRow?.to_emails);
  const cc = parseList(listRow?.cc_emails);
  const bcc = parseList(listRow?.bcc_emails);
  if (to.length + cc.length + bcc.length === 0) {
    await ctx.log("skipped", `${destination} Delivered: no recipients are set - use Recipients on its Delivered page.`);
    if (ctx.force) ctx.notes.push(`${destination}: no recipients set.`);
    return false;
  }

  // Someone already emailed this lane by hand today.
  const lastSent = listRow?.last_sent_at as string | null | undefined;
  if (testTo.length === 0 && lastSent && isoDateOf(lastSent) === today) {
    await markDone(`already sent by ${(listRow?.last_sent_by as string | null) ?? "someone"}`);
    await ctx.log("skipped", `${destination} Delivered: already emailed today by ${(listRow?.last_sent_by as string | null) ?? "someone"}, so the agent left it.`);
    return false;
  }

  const { data: messageRow } = await db.from("delivered_price_messages").select("message").eq("lane", lane).maybeSingle();
  const message = (messageRow?.message as string | null | undefined) ?? DEFAULT_DELIVERED_MESSAGE;

  let options;
  if (lane === "east-coast") {
    const { data: rates, error } = await db.from("fob_freight_rates").select("*").in("lane", EAST_COAST_LANES);
    if (error) throw new Error(error.message);
    const byLane: Record<string, FobFreightRate> = {};
    for (const r of (rates ?? []) as FobFreightRate[]) byLane[r.lane.toUpperCase()] = r;
    const missing = EAST_COAST_LANES.filter((l) => !byLane[l]);
    if (missing.length > 0) {
      await ctx.log("skipped", `East Coast Delivered: no freight rate for ${missing.join(", ")} on the FOB Pharr Freight Rates table.`);
      return false;
    }
    options = eastCoastSheet(items, byLane, message);
  } else {
    const { data: rate, error } = await db.from("fob_freight_rates").select("*").ilike("lane", lane).maybeSingle();
    if (error) throw new Error(error.message);
    if (!rate) {
      await ctx.log("skipped", `${destination} Delivered: no "${lane}" freight rate on the FOB Pharr Freight Rates table.`);
      return false;
    }
    options = houstonDallasSheet(lane, items, rate as FobFreightRate, message);
  }

  if (options.blocks.length === 0) {
    await ctx.log("skipped", `${destination} Delivered: no priced items on the sheet yet.`);
    return false;
  }

  const image = await renderDeliveredSheetImage(options);
  if (image.data.length < 1000) throw new Error("The price sheet picture came out empty.");

  const [y, m, d] = today.split("-").map(Number);
  const baseSubject = `${m}/${d}/${y} ${destination} DELIVERED PRICE SHEET`;
  const testing = testTo.length > 0;
  const subject = testing ? `[TEST] ${baseSubject}` : baseSubject;
  await sendEmail({
    to: testing ? testTo : to,
    cc: testing ? [] : cc,
    bcc: testing ? [] : bcc,
    replyTo: [REPLY_TO],
    subject,
    body: "",
    html: `<img src="cid:pricesheet" alt="${baseSubject}" style="max-width:100%;height:auto;" />`,
    attachments: [
      {
        name: `${lane}-delivered-price-sheet.${image.contentType === "image/jpeg" ? "jpg" : "png"}`,
        contentType: image.contentType,
        data: new Uint8Array(image.data),
        contentId: "pricesheet",
      },
    ],
  });

  // The email is out - never let the bookkeeping turn that into a failure.
  const total = to.length + cc.length + bcc.length;
  try {
    if (testing) {
      await markDone(`test sent ${new Date().toISOString()}`, true);
    } else {
      await markDone(`sent ${new Date().toISOString()}`);
      await db.from("delivered_email_lists").update({ last_sent_at: new Date().toISOString(), last_sent_by: "HOPS agent" }).eq("lane", lane);
    }
    await ctx.log("sent", testing ? `${subject} sent to the test address only (${testTo.join(", ")}).` : `${subject} sent to ${total} recipient${total === 1 ? "" : "s"} (${to.length} To, ${cc.length} Cc, ${bcc.length} Bcc).`);
  } catch {
    // intentionally swallowed
  }
  return true;
}
