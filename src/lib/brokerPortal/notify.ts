import { graphConfigured, sendEmail } from "@/lib/agents/graph";
import { sendPushToTokens } from "@/lib/push";
import { SUPREME_EMAIL } from "@/lib/roles";
import { adminClient } from "@/lib/supabase/admin";

// Tells the owner something from a carrier needs a look (a POD to review, a charge to approve):
// a push notification to their phone and an email. Never throws - an alert failing must not undo
// what the carrier just did.
export async function notifyStaff(title: string, body: string): Promise<void> {
  try {
    const db = adminClient();
    const { data: owner } = await db.from("profiles").select("id").eq("email", SUPREME_EMAIL).maybeSingle();
    if (owner) {
      const { data: tokens } = await db.from("push_tokens").select("token").eq("user_id", owner.id);
      await sendPushToTokens((tokens ?? []).map((t) => t.token as string), title, body, { pagePath: "/logistics/board" });
    }
  } catch {
    // push is a bonus
  }
  try {
    if (graphConfigured()) {
      await sendEmail({ to: [SUPREME_EMAIL], subject: `HOPS: ${title}`, body: `${body}\n\nReview it in HOPS under Logistics > List (Broker submissions).` });
    }
  } catch {
    // email is a bonus too
  }
}
