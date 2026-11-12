"use server";

import { createClient } from "@/lib/supabase/server";
import { canOpenPage } from "@/lib/pageAccess";
import { personName } from "@/lib/displayName";
import { todayISO } from "@/lib/dates";
import { graphConfigured, sendEmail } from "@/lib/agents/graph";

// The Delivered price sheets go out from the HOPS mailbox; replies land with Sales.
const REPLY_TO = "sales@harvestbestinc.com";

// Where the browser parks the price sheet picture for the moment it takes to send.
const SHEET_BUCKET = "company-documents";
const SHEET_FOLDER = "price-sheet-emails/";

const DESTINATIONS: Record<string, string> = {
  houston: "HOUSTON",
  dallas: "DALLAS",
  "east-coast": "EAST COAST",
};

export interface DeliveredEmailList {
  to: string[];
  cc: string[];
  bcc: string[];
  lastSentAt: string | null;
  lastSentBy: string | null;
}

// Pulls addresses out of whatever was pasted (Outlook's "Name" <a@b.com>; lists, one per line, commas...).
function parseEmails(text: string): string[] {
  const found = text.match(/[^\s<>;,"']+@[^\s<>;,"']+\.[^\s<>;,"']+/g) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

async function allowed(lane: string) {
  if (!DESTINATIONS[lane]) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await canOpenPage(supabase, user, `/sales/delivered/${lane}`))) return null;
  return { supabase, user: user! };
}

export async function getDeliveredEmailList(lane: string): Promise<DeliveredEmailList | { error: string }> {
  const ctx = await allowed(lane);
  if (!ctx) return { error: "Not allowed." };
  const { data, error } = await ctx.supabase.from("delivered_email_lists").select("*").eq("lane", lane).maybeSingle();
  if (error) {
    return { error: /delivered_email_lists/.test(error.message) ? "Emailing isn't set up yet - ask the admin to run migration 151." : error.message };
  }
  return {
    to: (data?.to_emails as string[] | undefined) ?? [],
    cc: (data?.cc_emails as string[] | undefined) ?? [],
    bcc: (data?.bcc_emails as string[] | undefined) ?? [],
    lastSentAt: (data?.last_sent_at as string | null | undefined) ?? null,
    lastSentBy: (data?.last_sent_by as string | null | undefined) ?? null,
  };
}

export async function saveDeliveredEmailList(
  lane: string,
  input: { to: string; cc: string; bcc: string },
): Promise<DeliveredEmailList | { error: string }> {
  const ctx = await allowed(lane);
  if (!ctx) return { error: "Not allowed." };
  const { error } = await ctx.supabase.from("delivered_email_lists").upsert({
    lane,
    to_emails: parseEmails(input.to),
    cc_emails: parseEmails(input.cc),
    bcc_emails: parseEmails(input.bcc),
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return getDeliveredEmailList(lane);
}

// Subject is always "M/D/YYYY DESTINATION DELIVERED PRICE SHEET"; the body is just the sheet's image.
// Anything that goes wrong comes back as a readable message: an uncaught error in a server action reaches the
// browser as a generic "error occurred in the Server Components render" with the real reason hidden.
export async function sendDeliveredSheet(
  lane: string,
  imagePath: string,
  contentType: "image/png" | "image/jpeg" = "image/png",
): Promise<{ ok: true; to: number; cc: number; bcc: number; subject: string } | { error: string }> {
  try {
    return await sendDeliveredSheetNow(lane, imagePath, contentType);
  } catch (e) {
    console.error("sendDeliveredSheet failed", e);
    return { error: `The price sheet could not be sent: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function sendDeliveredSheetNow(
  lane: string,
  imagePath: string,
  contentType: "image/png" | "image/jpeg" = "image/png",
): Promise<{ ok: true; to: number; cc: number; bcc: number; subject: string } | { error: string }> {
  const ctx = await allowed(lane);
  if (!ctx) return { error: "Not allowed." };
  if (!graphConfigured()) return { error: "Email isn't connected yet." };

  const list = await getDeliveredEmailList(lane);
  if ("error" in list) return list;
  if (list.to.length + list.cc.length + list.bcc.length === 0) return { error: "Add recipients first (Recipients button)." };

  const [y, m, d] = todayISO().split("-").map(Number);
  const subject = `${m}/${d}/${y} ${DESTINATIONS[lane]} DELIVERED PRICE SHEET`;
  // The browser put the image in storage itself (a server action's request body is capped far below a tall
  // price sheet's size); only its path comes here.
  if (!imagePath.startsWith(SHEET_FOLDER) || imagePath.includes("..")) return { error: "That price sheet image isn't valid - try again." };
  const { data: blob, error: downloadError } = await ctx.supabase.storage.from(SHEET_BUCKET).download(imagePath);
  if (downloadError || !blob) return { error: `Couldn't read the price sheet image: ${downloadError?.message ?? "not found"}` };
  const data = Buffer.from(await blob.arrayBuffer());
  if (data.length < 1000) return { error: "The price sheet image came out empty - try again." };

  try {
    await sendEmail({
      to: list.to,
      cc: list.cc,
      bcc: list.bcc,
      replyTo: [REPLY_TO],
      subject,
      body: "",
      html: `<img src="cid:pricesheet" alt="${subject}" style="max-width:100%;height:auto;" />`,
      attachments: [{ name: `${lane}-delivered-price-sheet.${contentType === "image/jpeg" ? "jpg" : "png"}`, contentType, data: new Uint8Array(data), contentId: "pricesheet" }],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The email could not be sent." };
  } finally {
    // The picture only needs to live until the email is out.
    await ctx.supabase.storage.from(SHEET_BUCKET).remove([imagePath]).catch(() => {});
  }

  // The email is already out - never let the "last sent" note turn that into an error.
  try {
    const who = await personName(ctx.supabase, ctx.user);
    await ctx.supabase.from("delivered_email_lists").update({ last_sent_at: new Date().toISOString(), last_sent_by: who }).eq("lane", lane);
  } catch {
    // intentionally swallowed
  }
  return { ok: true, to: list.to.length, cc: list.cc.length, bcc: list.bcc.length, subject };
}
