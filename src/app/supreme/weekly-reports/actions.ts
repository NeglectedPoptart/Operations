"use server";

import { revalidatePath } from "next/cache";
import { graphConfigured, sendEmail } from "@/lib/agents/graph";
import { isSupremeUser, SUPREME_EMAIL } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { buildReports, rangeLabel, reportsEmailHtml, defaultRange } from "@/lib/weeklyReports/reports";

// Supreme-only: middleware already locks /supreme to the owner account, checked again here since
// these actions send email to upper management.
async function supremeClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isSupremeUser(user?.email ?? null)) throw new Error("Not allowed.");
  return { supabase, email: user!.email as string };
}

function splitEmails(value: string): string[] {
  return [...new Set(value.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
}

export async function saveReportRecipients(recipients: string): Promise<void> {
  const { supabase } = await supremeClient();
  await supabase.from("app_settings").upsert({ key: "weekly_report_recipients", value: { emails: splitEmails(recipients) }, updated_at: new Date().toISOString() });
}

// Builds the chosen reports again on the server (the page's preview is never trusted) and emails
// them as one message. The sender gets a blind copy; replies go to the sender.
export async function emailWeeklyReports(input: { end: string; ids: string[]; to: string }): Promise<{ sent: string } | { error: string }> {
  const { supabase, email } = await supremeClient();
  if (!graphConfigured()) return { error: "Outlook isn't connected, so HOPS can't send email." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.end)) return { error: "That end date isn't valid." };
  const to = splitEmails(input.to);
  if (to.length === 0) return { error: "Add at least one email address to send to." };
  if (to.length > 30) return { error: "That is too many recipients (30 at most)." };
  if (input.ids.length === 0) return { error: "Tick at least one report." };

  const range = defaultRange(input.end);
  const reports = await buildReports(supabase, range, input.ids);
  if (reports.length === 0) return { error: "None of those reports exist." };

  try {
    await sendEmail({
      to,
      bcc: to.includes(email.toLowerCase()) ? undefined : [email],
      replyTo: [SUPREME_EMAIL],
      subject: `Harvest Best Weekly Report - ${rangeLabel(range)}`,
      body: `Harvest Best weekly report, ${rangeLabel(range)}: ${reports.map((r) => `${r.title} (${r.summary})`).join("; ")}. Open this email in an HTML-capable client to see the tables.`,
      html: reportsEmailHtml(reports, range),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The email could not be sent." };
  }

  await supabase.from("app_settings").upsert({ key: "weekly_report_recipients", value: { emails: to }, updated_at: new Date().toISOString() });
  await supabase.from("report_sends").insert({ sent_by: email, to_emails: to, reports: reports.map((r) => r.id), range_start: range.start, range_end: range.end });
  revalidatePath("/supreme/upper-management-activity");
  return { sent: `Sent ${reports.length} report${reports.length === 1 ? "" : "s"} to ${to.join(", ")}.` };
}
