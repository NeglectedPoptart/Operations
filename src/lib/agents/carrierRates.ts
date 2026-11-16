import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_TIMEZONE, currentWeekStart, todayISO } from "../dates";
import { renderRateBanner } from "../carrierRates/banner";
import { buildRateEmail, rateWeekLabel } from "../carrierRates/email";
import { appBaseUrl, makeRateToken } from "../carrierRates/token";
import { sendEmail } from "./graph";
import type { Agent } from "./types";

// The Weekly Rate Requests agent: every Monday from the start time (7:00 AM Central by default) it emails each
// active OTR carrier asking them to log in and update their lane rates - with a button to the rate portal and an
// "I've submitted my rates" button. A carrier who hasn't updated gets the email again every hour (until the end
// of the window, 5:00 PM by default). It stops for a carrier as soon as they have entered rates this week or
// tapped the done button; at the end of the window it tells you who is still missing.

export interface CarrierRatesContext {
  // Run now from the Agents page: send the round immediately, whatever day and time it is.
  force: boolean;
  log: (kind: string, message: string) => Promise<void>;
  notify: (title: string, body: string) => Promise<void>;
  notes: string[];
}

const MAX_PER_RUN = 12;
const MAX_PER_FORCED_RUN = 40;

function splitEmails(value: string | null | undefined): string[] {
  return [...new Set((value ?? "").split(/[;,\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
}

function minutesOf(hhmm: string | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

function centralNow(now: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

interface Carrier {
  id: string;
  name: string;
  emails: string[];
}

// Which of these carriers have entered at least one rate for this week (paged: Supabase returns 1,000 rows at most).
async function carriersWithRates(db: SupabaseClient, weekStart: string, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  if (ids.length === 0) return found;
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await db
      .from("broker_rate_entries")
      .select("broker_id")
      .eq("week_start_date", weekStart)
      .not("rate", "is", null)
      .in("broker_id", ids)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) found.add(r.broker_id as string);
    if ((data ?? []).length < 1000) break;
  }
  return found;
}

export async function runCarrierRates(db: SupabaseClient, agent: Agent, ctx: CarrierRatesContext): Promise<number> {
  const now = new Date();
  const { weekday, minutes } = centralNow(now);
  const startMin = minutesOf(agent.config.window_start, 7 * 60);
  const endMin = minutesOf(agent.config.window_end, 17 * 60);
  const repeatMs = Math.max(15, agent.config.repeat_minutes ?? 60) * 60_000;
  const weekStart = currentWeekStart();
  const today = todayISO();
  const testTo = (agent.config.test_to ?? []).filter((e) => e.includes("@"));

  const isMonday = weekday === "Mon";
  if (!ctx.force && !isMonday) return 0;
  const pastWindow = isMonday && minutes > endMin;
  if (!ctx.force && minutes < startMin) return 0;

  const { data: brokers, error: brokerError } = await db.from("brokers").select("id, name, followup_email").eq("active", true).eq("category", "otr").order("name");
  if (brokerError) throw new Error(brokerError.message);
  const carriers: Carrier[] = (brokers ?? [])
    .map((b) => ({ id: b.id as string, name: b.name as string, emails: splitEmails(b.followup_email as string | null) }))
    .filter((c) => c.emails.length > 0);
  if (carriers.length === 0) {
    const why = "No active carrier has a follow-up email yet - add them under Carrier emails on this page.";
    await ctx.log("skipped", why);
    if (ctx.force) ctx.notes.push(why);
    return 0;
  }

  const portalUrl = `${appBaseUrl()}/logistics/broker-rate-entry`;
  const banner = { name: "weekly-rate-update.png", contentType: "image/png", data: new Uint8Array(renderRateBanner(rateWeekLabel(weekStart))), contentId: "ratebanner" };

  // ---- test mode: one sample email to the test address, once a day ----
  if (testTo.length > 0) {
    const key = `carrier_rates:${weekStart}:test:${today}`;
    const { data: done } = await db.from("agent_state").select("key").eq("key", key).maybeSingle();
    if (done && !ctx.force) return 0;
    const sample = carriers[0];
    const email = buildRateEmail({
      carrier: sample.name,
      weekStart,
      portalUrl,
      doneUrl: `${appBaseUrl()}/api/carrier-rates/done?t=${encodeURIComponent(makeRateToken("test", weekStart))}`,
      reminder: 0,
      test: true,
    });
    await sendEmail({ to: testTo, subject: email.subject, body: "", html: email.html, attachments: [banner] });
    await db.from("agent_state").upsert({ key, value: new Date().toISOString(), updated_at: new Date().toISOString() });
    await ctx.log("sent", `Test rate request (as ${sample.name}) sent to ${testTo.join(", ")} - no carrier was emailed.`);
    return 1;
  }

  // ---- where each carrier stands this week ----
  const { data: rows, error: rowError } = await db.from("broker_rate_requests").select("*").eq("week_start", weekStart);
  if (rowError) {
    const why = "Weekly rate requests aren't set up yet (run migration 168).";
    await ctx.log("skipped", why);
    if (ctx.force) ctx.notes.push(why);
    return 0;
  }
  const byBroker = new Map((rows ?? []).map((r) => [r.broker_id as string, r]));
  const haveRates = await carriersWithRates(db, weekStart, carriers.map((c) => c.id));

  const due: { carrier: Carrier; sends: number; last: number }[] = [];
  const stillMissing: Carrier[] = [];
  for (const c of carriers) {
    const row = byBroker.get(c.id);
    if (row?.completed_at) continue;
    if (haveRates.has(c.id)) {
      await db.from("broker_rate_requests").upsert({ broker_id: c.id, week_start: weekStart, completed_at: now.toISOString(), completed_via: "rates", sends: row?.sends ?? 0 }, { onConflict: "broker_id,week_start" });
      await ctx.log("info", `${c.name} has entered rates for the week - no more reminders.`);
      continue;
    }
    stillMissing.push(c);
    const last = row?.last_sent_at ? new Date(row.last_sent_at as string).getTime() : 0;
    if (!ctx.force && (pastWindow || now.getTime() - last < repeatMs)) continue;
    due.push({ carrier: c, sends: (row?.sends as number | undefined) ?? 0, last });
  }

  // The window is over: say who never updated, once.
  if (pastWindow && !ctx.force) {
    const key = `carrier_rates:${weekStart}:summary`;
    const { data: told } = await db.from("agent_state").select("key").eq("key", key).maybeSingle();
    if (!told) {
      await db.from("agent_state").upsert({ key, value: now.toISOString(), updated_at: now.toISOString() });
      const body = stillMissing.length === 0 ? `All ${carriers.length} carriers have updated their rates for the week.` : `${stillMissing.length} of ${carriers.length} carriers still haven't updated their rates: ${stillMissing.map((c) => c.name).join(", ")}.`;
      await ctx.log("info", body);
      await ctx.notify("Weekly rates", body);
    }
    return 0;
  }

  due.sort((a, b) => a.last - b.last);
  let sent = 0;
  for (const d of due.slice(0, ctx.force ? MAX_PER_FORCED_RUN : MAX_PER_RUN)) {
    const { carrier } = d;
    try {
      const email = buildRateEmail({
        carrier: carrier.name,
        weekStart,
        portalUrl,
        doneUrl: `${appBaseUrl()}/api/carrier-rates/done?t=${encodeURIComponent(makeRateToken(carrier.id, weekStart))}`,
        reminder: d.sends,
      });
      await sendEmail({ to: carrier.emails, subject: email.subject, body: "", html: email.html, attachments: [banner] });
      const stamp = new Date().toISOString();
      await db.from("broker_rate_requests").upsert(
        { broker_id: carrier.id, week_start: weekStart, sends: d.sends + 1, first_sent_at: (byBroker.get(carrier.id)?.first_sent_at as string | null) ?? stamp, last_sent_at: stamp },
        { onConflict: "broker_id,week_start" },
      );
      sent++;
      await ctx.log("sent", d.sends === 0 ? `Rate request sent to ${carrier.name} (${carrier.emails.join(", ")}).` : `Reminder ${d.sends} sent to ${carrier.name} - still no rates.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.log("error", `Rate request to ${carrier.name} failed: ${message}`);
      if (ctx.force) ctx.notes.push(`${carrier.name}: ${message}`);
    }
  }
  return sent;
}
